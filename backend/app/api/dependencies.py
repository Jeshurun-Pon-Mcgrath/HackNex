from typing import cast

from fastapi import Request

from app.analysis.service import AnalysisService
from app.datasets.service import DatasetService


def dataset_service(request: Request) -> DatasetService:
    return cast(DatasetService, request.app.state.dataset_service)


def analysis_service(request: Request) -> AnalysisService:
    return cast(AnalysisService, request.app.state.analysis_service)
