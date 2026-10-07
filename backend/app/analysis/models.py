from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

type RequirementState = Literal[
    "satisfied", "requires_backend_decision", "requires_user_clarification", "blocking"
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class ColumnMetric(StrictModel):
    kind: Literal["column"]
    column: str = Field(min_length=1)


class RowCountMetric(StrictModel):
    kind: Literal["row_count"]


class DerivedMetric(StrictModel):
    kind: Literal["derived"]
    left_column: str = Field(alias="leftColumn", min_length=1)
    operator: Literal["add", "subtract", "multiply", "divide"]
    right_column: str = Field(alias="rightColumn", min_length=1)
    display_name: str = Field(alias="displayName", min_length=1, max_length=80)


Metric = Annotated[ColumnMetric | RowCountMetric | DerivedMetric, Field(discriminator="kind")]


class AnalysisFilter(StrictModel):
    column: str = Field(min_length=1)
    operator: str = Field(min_length=1)
    value: str | None = None
    second_value: str | None = Field(default=None, alias="secondValue")
    interpret_mixed_as_text: bool = Field(default=False, alias="interpretMixedAsText")


class Sort(StrictModel):
    target: str = Field(min_length=1)
    direction: Literal["ascending", "descending"]


class AnalysisSpecification(StrictModel):
    version: Literal["1.0"]
    dataset_id: str = Field(alias="datasetId", min_length=1)
    question: str = Field(min_length=1, max_length=1000)
    metric: Metric
    aggregation: Literal["sum", "average", "count", "count_distinct", "minimum", "maximum"]
    group_by: list[str] = Field(alias="groupBy", max_length=2)
    filters: list[AnalysisFilter]
    sort: Sort
    limit: Literal[1, 5, 10, 25, 50, 100]
    required_columns: list[str] = Field(alias="requiredColumns")
    assumptions: list[str]
    created_at: datetime = Field(alias="createdAt")


class PlanRequest(StrictModel):
    dataset_id: str
    dataset_revision: int = Field(ge=1)
    question: str = Field(min_length=1, max_length=1000)
    manual_specification: AnalysisSpecification


class ClarificationItem(BaseModel):
    clarification_id: str
    category: str
    question: str
    options: list[str]


class PlanReason(BaseModel):
    code: str
    message: str
    evidence_reference: str | None = None
    required_information: list[str] = Field(default_factory=list)


class ProofRequirement(BaseModel):
    requirement_id: str
    category: str
    description: str
    state: RequirementState
    evidence_reference: str | None = None
    resolution_options: list[str] = Field(default_factory=list)


class ProofContract(BaseModel):
    dataset_id: str
    dataset_revision: int
    requirements: list[ProofRequirement]


class PlanResponse(BaseModel):
    state: Literal["ready", "needs_clarification", "unanswerable", "error"]
    message: str
    clarifications: list[ClarificationItem] = Field(default_factory=list)
    reasons: list[PlanReason] = Field(default_factory=list)
    proof_contract: ProofContract
