from app.analysis.models import (
    AnalysisSpecification,
    ProofContract,
    ProofRequirement,
    RequirementState,
)
from app.analysis.validator import required_columns
from app.datasets.models import DatasetRecord, QualityProfile, SchemaProfile


def build_proof_contract(
    dataset: DatasetRecord,
    specification: AnalysisSpecification,
    schema: SchemaProfile,
    quality: QualityProfile,
) -> ProofContract:
    needed = required_columns(specification)
    known = {column.column_id for column in schema.columns}
    assumptions = set(specification.assumptions)
    normalized_assumptions = {item.strip().lower() for item in assumptions}
    checks = {
        (item.check_type, item.column_id): item for item in quality.findings if item.affected_count
    }
    missing_data = any(key == "missing_values" and column in needed for key, column in checks)
    duplicates = any(key == "exact_duplicate_rows" for key, _ in checks)
    currencies = any(key == "mixed_currencies" and column in needed for key, column in checks)
    dates = any(key == "ambiguous_date" and column in needed for key, column in checks)
    division = specification.metric.kind == "derived" and specification.metric.operator == "divide"
    currency_resolved = any(
        "currency" in item and ("separate" in item or "conversion" in item)
        for item in normalized_assumptions
    )

    def requirement(
        identifier: str,
        category: str,
        description: str,
        state: RequirementState,
        evidence: str | None = None,
        options: list[str] | None = None,
    ) -> ProofRequirement:
        return ProofRequirement(
            requirement_id=identifier,
            category=category,
            description=description,
            state=state,
            evidence_reference=evidence,
            resolution_options=options or [],
        )

    requirements = [
        requirement(
            "dataset",
            "dataset",
            "Dataset must be available at the requested revision.",
            "satisfied",
            f"dataset:{dataset.dataset_id}:revision:{dataset.revision}",
        ),
        requirement(
            "columns",
            "schema",
            "All required columns must exist in this dataset.",
            "satisfied" if needed <= known else "blocking",
            "schema:columns",
        ),
        requirement(
            "types",
            "schema",
            "Metric and filter operations must be type-compatible.",
            "satisfied",
            "schema:types",
        ),
        requirement(
            "missing_values",
            "quality",
            "Missing-value handling must be explicit when relevant.",
            "satisfied"
            if not missing_data
            or "Exclude rows with missing values in selected columns." in assumptions
            else "requires_user_clarification",
            "quality:missing_values",
            ["exclude_rows", "include_as_null"] if missing_data else [],
        ),
        requirement(
            "duplicate_rows",
            "quality",
            "Exact duplicate-row handling must be explicit when duplicates exist.",
            "satisfied"
            if not duplicates or "Keep exact duplicate rows in the analysis input." in assumptions
            else "requires_user_clarification",
            "quality:exact_duplicate_rows",
            ["keep", "exclude_beyond_first"] if duplicates else [],
        ),
        requirement(
            "currency",
            "quality",
            "Multiple currencies require an explicit normalization policy.",
            "requires_user_clarification" if currencies and not currency_resolved else "satisfied",
            "quality:mixed_currencies",
            ["analyze_separately", "provide_conversion_policy"] if currencies else [],
        ),
        requirement(
            "date_interpretation",
            "quality",
            "Ambiguous dates require an explicit interpretation.",
            "satisfied"
            if not dates or any("Interpret ambiguous dates" in item for item in assumptions)
            else "requires_user_clarification",
            "quality:ambiguous_date",
            ["day_first", "month_first"] if dates else [],
        ),
        requirement(
            "division_by_zero",
            "calculation",
            "Division-by-zero handling must be explicit.",
            "satisfied"
            if not division or any("divisor is zero" in item for item in assumptions)
            else "requires_user_clarification",
            "specification:metric",
            ["exclude", "null"] if division else [],
        ),
        requirement(
            "independent_agreement",
            "verification",
            "Future SQL and Polars results must agree before release.",
            "requires_backend_decision",
            None,
            ["implemented_in_phase_5"],
        ),
    ]
    return ProofContract(
        dataset_id=dataset.dataset_id, dataset_revision=dataset.revision, requirements=requirements
    )
