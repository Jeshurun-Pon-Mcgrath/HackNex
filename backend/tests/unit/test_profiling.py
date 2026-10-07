from app.datasets.csv_parser import ParsedTable
from app.datasets.profiler import profile_table, stable_column_ids
from app.datasets.quality import quality_profile


def test_column_ids_types_and_quality_checks() -> None:
    table = ParsedTable(
        headers=[" Amount ", "amount", "date", "currency"],
        rows=[
            ["1", "1", "01/02/2024", "$1"],
            ["2", "oops", "02-03-2024", "EUR 2"],
            ["100", "", "13/02/2024", "$3"],
            ["1", "1", "01/02/2024", "$1"],
        ],
        warnings=[],
        formula_columns=set(),
    )
    assert stable_column_ids(table.headers) == ["amount", "amount__2", "date", "currency"]
    schema = profile_table("dataset", 1, table)
    quality = quality_profile("dataset", 1, table, schema)
    checks = {item.check_type for item in quality.findings if item.affected_count}
    assert {
        "header_whitespace",
        "case_collision",
        "missing_values",
        "exact_duplicate_rows",
    } <= checks
    assert "ambiguous_date" in checks
    assert "mixed_currencies" in checks
    assert "numeric_outliers" in {item.check_type for item in quality.findings}
