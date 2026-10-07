from datetime import UTC, datetime, timedelta

from app.analysis.models import AnalysisSpecification
from app.analysis.proof_contract import build_proof_contract
from app.analysis.validator import validate_specification
from app.datasets.csv_parser import ParsedTable
from app.datasets.models import DatasetRecord, DatasetStatus
from app.datasets.profiler import profile_table
from app.datasets.quality import quality_profile


def test_proof_contract_is_deterministic_and_requires_decisions() -> None:
    table = ParsedTable(
        headers=["value", "cost"],
        rows=[["10", "0"], ["", "2"], ["10", "0"]],
        warnings=[],
        formula_columns=set(),
    )
    schema = profile_table("dataset", 1, table)
    quality = quality_profile("dataset", 1, table, schema)
    now = datetime.now(UTC)
    dataset = DatasetRecord(
        dataset_id="dataset",
        original_filename="data.csv",
        stored_filename="opaque.csv",
        file_type="csv",
        size_bytes=10,
        sha256="0" * 64,
        status=DatasetStatus.READY,
        available_sheets=[],
        row_count=3,
        column_count=2,
        revision=1,
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(hours=1),
    )
    specification = AnalysisSpecification.model_validate(
        {
            "version": "1.0",
            "datasetId": "dataset",
            "question": "Ratio?",
            "metric": {
                "kind": "derived",
                "leftColumn": "value",
                "operator": "divide",
                "rightColumn": "cost",
                "displayName": "ratio",
            },
            "aggregation": "average",
            "groupBy": [],
            "filters": [],
            "sort": {"target": "metric", "direction": "descending"},
            "limit": 1,
            "requiredColumns": ["value", "cost"],
            "assumptions": [],
            "createdAt": "2026-10-07T00:00:00Z",
        }
    )
    first = build_proof_contract(dataset, specification, schema, quality)
    second = build_proof_contract(dataset, specification, schema, quality)
    assert first == second
    states = {item.requirement_id: item.state for item in first.requirements}
    assert states["missing_values"] == "requires_user_clarification"
    assert states["duplicate_rows"] == "requires_user_clarification"
    assert states["division_by_zero"] == "requires_user_clarification"
    assert states["independent_agreement"] == "requires_backend_decision"
    assert validate_specification(specification, schema) == []
