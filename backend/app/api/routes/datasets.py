from typing import Annotated

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.api.dependencies import dataset_service
from app.core.errors import AppError
from app.datasets.models import DatasetRecord, QualityProfile, SchemaProfile, SelectSheetRequest
from app.datasets.service import DatasetService

router = APIRouter(prefix="/datasets", tags=["datasets"])


@router.post("", response_model=DatasetRecord, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    request: Request,
    file: Annotated[UploadFile, File(description="One UTF-8 CSV or XLSX file")],
    service: Annotated[DatasetService, Depends(dataset_service)],
) -> DatasetRecord:
    form = await request.form()
    uploads = [value for _, value in form.multi_items() if isinstance(value, StarletteUploadFile)]
    if len(uploads) != 1:
        raise AppError(422, "one_file_required", "Upload exactly one dataset file.")
    return await service.upload(file)


@router.get("/{dataset_id}", response_model=DatasetRecord)
def get_dataset(
    dataset_id: str, service: Annotated[DatasetService, Depends(dataset_service)]
) -> DatasetRecord:
    return service.get(dataset_id)


@router.get("/{dataset_id}/schema", response_model=SchemaProfile)
def get_schema(
    dataset_id: str, service: Annotated[DatasetService, Depends(dataset_service)]
) -> SchemaProfile:
    return service.profiles(dataset_id)[0]


@router.get("/{dataset_id}/quality", response_model=QualityProfile)
def get_quality(
    dataset_id: str, service: Annotated[DatasetService, Depends(dataset_service)]
) -> QualityProfile:
    return service.profiles(dataset_id)[1]


@router.post("/{dataset_id}/select-sheet", response_model=DatasetRecord)
def select_sheet(
    dataset_id: str,
    body: SelectSheetRequest,
    service: Annotated[DatasetService, Depends(dataset_service)],
) -> DatasetRecord:
    return service.select_sheet(dataset_id, body.sheet_name)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: str, service: Annotated[DatasetService, Depends(dataset_service)]
) -> Response:
    service.delete(dataset_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
