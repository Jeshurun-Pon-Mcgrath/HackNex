from app.analysis.models import ClarificationItem, PlanReason, PlanRequest, PlanResponse
from app.analysis.proof_contract import build_proof_contract
from app.analysis.validator import required_columns, validate_specification
from app.core.errors import AppError
from app.datasets.models import DatasetStatus
from app.datasets.service import DatasetService


class AnalysisService:
    def __init__(self, datasets: DatasetService) -> None:
        self.datasets = datasets

    def plan(self, request: PlanRequest) -> PlanResponse:
        dataset = self.datasets.get(request.dataset_id)
        if dataset.status != DatasetStatus.READY:
            raise AppError(409, "dataset_not_ready", "The dataset is not ready for planning.")
        if dataset.revision != request.dataset_revision:
            raise AppError(
                409,
                "dataset_revision_conflict",
                "The dataset revision has changed; rebuild the specification.",
            )
        specification = request.manual_specification
        if specification.dataset_id != dataset.dataset_id:
            schema, quality = self.datasets.profiles(dataset.dataset_id)
            contract = build_proof_contract(dataset, specification, schema, quality)
            contract.requirements[0].state = "blocking"
            return PlanResponse(
                state="unanswerable",
                message="The specification references a different dataset.",
                reasons=[
                    PlanReason(
                        code="dataset_mismatch",
                        message=(
                            "The specification dataset identifier does not match the "
                            "registered dataset."
                        ),
                        evidence_reference="manual_specification.datasetId",
                    )
                ],
                proof_contract=contract,
            )
        if specification.question.strip() != request.question.strip():
            raise AppError(
                422,
                "question_mismatch",
                "The request and specification questions must match.",
                [{"field": "question", "message": "Does not match manual_specification.question."}],
            )
        schema, quality = self.datasets.profiles(dataset.dataset_id)
        contract = build_proof_contract(dataset, specification, schema, quality)
        columns = {column.column_id: column for column in schema.columns}
        needed = required_columns(specification)
        absent = sorted(needed - columns.keys())
        if absent:
            return PlanResponse(
                state="unanswerable",
                message="Required columns are not present in this dataset.",
                reasons=[
                    PlanReason(
                        code="missing_columns",
                        message="One or more required column identifiers do not exist.",
                        evidence_reference="schema:columns",
                        required_information=absent,
                    )
                ],
                proof_contract=contract,
            )
        structural = validate_specification(specification, schema)
        if structural:
            raise AppError(
                422,
                "invalid_analysis_specification",
                "The Analysis Specification is not valid for this dataset.",
                [{"field": field, "message": message} for field, message in structural],
            )
        metric_columns: set[str]
        if specification.metric.kind == "column":
            metric_columns = {specification.metric.column}
        elif specification.metric.kind == "derived":
            metric_columns = {specification.metric.left_column, specification.metric.right_column}
        else:
            metric_columns = set()
        unusable = [column for column in metric_columns if columns[column].non_missing_count == 0]
        if unusable:
            return PlanResponse(
                state="unanswerable",
                message="The selected metric has no usable values.",
                reasons=[
                    PlanReason(
                        code="no_usable_metric_values",
                        message="A metric column contains no non-missing values.",
                        evidence_reference="schema:columns",
                        required_information=unusable,
                    )
                ],
                proof_contract=contract,
            )

        clarifications: list[ClarificationItem] = []
        states = {item.requirement_id: item for item in contract.requirements}
        mapping = {
            "missing_values": (
                "missing_value_policy",
                "How should rows with missing selected values be handled?",
            ),
            "duplicate_rows": (
                "duplicate_row_policy",
                "How should exact duplicate rows be handled?",
            ),
            "currency": ("currency_policy", "How should multiple currencies be handled?"),
            "date_interpretation": (
                "date_interpretation",
                "How should ambiguous dates be interpreted?",
            ),
            "division_by_zero": ("division_by_zero", "How should division by zero be handled?"),
        }
        for requirement_id, (category, question) in mapping.items():
            item = states[requirement_id]
            if item.state == "requires_user_clarification":
                clarifications.append(
                    ClarificationItem(
                        clarification_id=requirement_id,
                        category=category,
                        question=question,
                        options=item.resolution_options,
                    )
                )
        if clarifications:
            return PlanResponse(
                state="needs_clarification",
                message="Bounded decisions are required before future execution.",
                clarifications=clarifications,
                proof_contract=contract,
            )
        return PlanResponse(
            state="ready",
            message="The specification is valid for future execution; no analysis was run.",
            proof_contract=contract,
        )
