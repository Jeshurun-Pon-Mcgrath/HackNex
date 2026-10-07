from app.analysis.models import AnalysisSpecification, DerivedMetric
from app.datasets.models import QualityProfile, SchemaProfile

NUMERIC = {"Integer", "Decimal"}
VALUELESS = {"is_missing", "is_not_missing", "is_true", "is_false"}
FILTERS = {
    "numeric": {
        "equals",
        "not_equals",
        "greater_than",
        "greater_or_equal",
        "less_than",
        "less_or_equal",
        "between",
        "is_missing",
        "is_not_missing",
    },
    "date": {"on", "before", "after", "between", "is_missing", "is_not_missing"},
    "boolean": {"is_true", "is_false", "is_missing", "is_not_missing"},
    "text": {"equals", "not_equals", "contains", "starts_with", "is_missing", "is_not_missing"},
}


def required_columns(specification: AnalysisSpecification) -> set[str]:
    required = set(specification.required_columns)
    metric = specification.metric
    if metric.kind == "column":
        required.add(metric.column)
    elif isinstance(metric, DerivedMetric):
        required.update((metric.left_column, metric.right_column))
    required.update(specification.group_by)
    required.update(item.column for item in specification.filters)
    if specification.sort.target.startswith("group:"):
        required.add(specification.sort.target[6:])
    return required


def validate_specification(
    spec: AnalysisSpecification, schema: SchemaProfile
) -> list[tuple[str, str]]:
    errors: list[tuple[str, str]] = []
    columns = {column.column_id: column for column in schema.columns}
    if len(set(spec.group_by)) != len(spec.group_by):
        errors.append(("manual_specification.groupBy", "Group-by columns must be distinct."))
    metric = spec.metric
    if metric.kind == "row_count":
        allowed = {"count"}
    elif metric.kind == "derived":
        allowed = {"sum", "average", "count", "minimum", "maximum"}
        for field, column_id in (
            ("leftColumn", metric.left_column),
            ("rightColumn", metric.right_column),
        ):
            if column_id in columns and columns[column_id].inferred_type not in NUMERIC:
                errors.append(
                    (
                        f"manual_specification.metric.{field}",
                        "Derived metrics require numeric columns.",
                    )
                )
    else:
        kind = columns.get(metric.column)
        if kind and kind.inferred_type in NUMERIC:
            allowed = {"sum", "average", "count", "count_distinct", "minimum", "maximum"}
        elif kind and kind.inferred_type == "Date":
            allowed = {"count", "count_distinct", "minimum", "maximum"}
        else:
            allowed = {"count", "count_distinct"}
    if spec.aggregation not in allowed:
        errors.append(
            ("manual_specification.aggregation", "Aggregation is incompatible with the metric.")
        )
    for index, item in enumerate(spec.filters):
        column = columns.get(item.column)
        if not column:
            continue
        category = "numeric" if column.inferred_type in NUMERIC else column.inferred_type.lower()
        if category == "mixed" and item.interpret_mixed_as_text:
            category = "text"
        allowed_filters = FILTERS.get(category, {"is_missing", "is_not_missing"})
        if item.operator not in allowed_filters:
            errors.append(
                (
                    f"manual_specification.filters.{index}.operator",
                    "Filter operator is incompatible with the column type.",
                )
            )
        if item.operator not in VALUELESS and not (item.value or "").strip():
            errors.append(
                (f"manual_specification.filters.{index}.value", "This filter requires a value.")
            )
        if item.operator == "between" and not (item.second_value or "").strip():
            errors.append(
                (
                    f"manual_specification.filters.{index}.secondValue",
                    "Between requires an upper value.",
                )
            )
    sort_targets = {"metric", *(f"group:{column}" for column in spec.group_by)}
    if spec.sort.target not in sort_targets:
        errors.append(
            ("manual_specification.sort.target", "Sort target is not in the expected output.")
        )
    return errors


def findings_for_columns(quality: QualityProfile, columns: set[str], check: str) -> list[object]:
    return [
        item
        for item in quality.findings
        if item.check_type == check
        and (item.column_id is None or item.column_id in columns)
        and item.affected_count > 0
    ]
