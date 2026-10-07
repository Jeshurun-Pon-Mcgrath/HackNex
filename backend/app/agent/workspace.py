"""A workspace is a directory of uploaded files: tables (CSV/XLSX sheets) and documents."""

import hashlib
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from uuid import uuid4

import pandas as pd
from fastapi import UploadFile
from openpyxl import load_workbook

from app.core.errors import AppError
from app.core.security import contained_path, validate_original_filename, workspace_dir
from app.validation import validate_csv_bytes, validate_xlsx_container

CHUNK_SIZE = 64 * 1024
DOC_CHAR_LIMIT = 6000


@dataclass
class Table:
    name: str  # display/reference name, e.g. "orders.csv" or "customers.xlsx[Targets]"
    file: str
    sheet: str | None
    load: str  # exact pandas snippet scripts must use
    raw: pd.DataFrame  # every cell as the original string, "" for empty
    dtypes: dict[str, str]  # what pandas infers with default read options


@dataclass
class Workspace:
    id: str
    path: Path
    tables: list[Table]
    documents: dict[str, str]
    hashes: dict[str, str]


def create(data_dir: Path) -> str:
    workspace_id = uuid4().hex
    (data_dir / "workspaces" / workspace_id / "runs").mkdir(parents=True)
    return workspace_id


def data_files(path: Path) -> list[Path]:
    return sorted(p for p in path.iterdir() if p.is_file() and not p.name.startswith("."))


async def save_upload(path: Path, upload: UploadFile, max_bytes: int) -> str:
    name, file_type = validate_original_filename(upload.filename)
    destination = contained_path(path, name)
    temporary = contained_path(path, f".upload-{uuid4().hex}")
    size = 0
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        with os.fdopen(os.open(temporary, flags, 0o600), "wb") as output:
            while chunk := await upload.read(CHUNK_SIZE):
                size += len(chunk)
                if size > max_bytes:
                    raise AppError(413, "upload_too_large", "The upload exceeds the size limit.")
                output.write(chunk)
        if size == 0:
            raise AppError(422, "empty_file", "The uploaded file is empty.")
        if file_type == "csv":
            validate_csv_bytes(temporary)
        elif file_type == "xlsx":
            validate_xlsx_container(temporary)
        temporary.replace(
            destination
        )  # same name re-upload replaces the file (and breaks old proofs)
        return name
    finally:
        temporary.unlink(missing_ok=True)
        await upload.close()


def copy_files(source: Path, destination: Path) -> None:
    for file in data_files(source):
        shutil.copy2(file, destination / file.name)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _visible_sheets(path: Path) -> list[str]:
    workbook = load_workbook(path, read_only=True, keep_links=False)
    try:
        return [ws.title for ws in workbook.worksheets if ws.sheet_state == "visible"]
    finally:
        workbook.close()


def _raw(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.fillna("").astype(str)


def load(data_dir: Path, workspace_id: str) -> Workspace:
    path = workspace_dir(data_dir, workspace_id)
    tables: list[Table] = []
    documents: dict[str, str] = {}
    hashes: dict[str, str] = {}
    for file in data_files(path):
        hashes[file.name] = sha256(file)
        suffix = file.suffix.lower()
        try:
            if suffix == ".csv":
                typed = pd.read_csv(file)
                raw = pd.read_csv(file, dtype=str, keep_default_na=False)
                tables.append(
                    Table(
                        file.name,
                        file.name,
                        None,
                        f'pd.read_csv("{file.name}")',
                        _raw(raw),
                        {str(c): str(t) for c, t in typed.dtypes.items()},
                    )
                )
            elif suffix == ".xlsx":
                for sheet in _visible_sheets(file):
                    typed = pd.read_excel(file, sheet_name=sheet)
                    tables.append(
                        Table(
                            f"{file.name}[{sheet}]",
                            file.name,
                            sheet,
                            f'pd.read_excel("{file.name}", sheet_name="{sheet}")',
                            _raw(pd.read_excel(file, sheet_name=sheet, dtype=str)),
                            {str(c): str(t) for c, t in typed.dtypes.items()},
                        )
                    )
            elif suffix == ".pdf":
                from pypdf import PdfReader

                text = "\n".join(page.extract_text() or "" for page in PdfReader(file).pages)
                documents[file.name] = text[:DOC_CHAR_LIMIT]
            else:
                documents[file.name] = file.read_text(encoding="utf-8", errors="replace")[
                    :DOC_CHAR_LIMIT
                ]
        except AppError:
            raise
        except Exception as exc:
            raise AppError(
                422, "unreadable_file", f"{file.name} could not be read as {suffix[1:]}."
            ) from exc
    return Workspace(workspace_id, path, tables, documents, hashes)
