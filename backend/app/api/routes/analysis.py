from typing import Annotated

from fastapi import APIRouter, Depends

from app.analysis.models import PlanRequest, PlanResponse
from app.analysis.service import AnalysisService
from app.api.dependencies import analysis_service

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.post("/plan", response_model=PlanResponse)
def plan_analysis(
    body: PlanRequest, service: Annotated[AnalysisService, Depends(analysis_service)]
) -> PlanResponse:
    return service.plan(body)
