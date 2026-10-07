import re
from pathlib import Path

from app.core.errors import AppError

CONTROL_CHARACTERS = re.compile(r"[\x00-\x1f\x7f]")


def validate_original_filename(filename: str | None) -> tuple[str, str]:
    if not filename or CONTROL_CHARACTERS.search(filename):
        raise AppError(422, "invalid_filename", "The upload filename is invalid.")
    safe_name = Path(filename.replace("\\", "/")).name
    extension = Path(safe_name).suffix.lower()
    if extension not in {".csv", ".xlsx"}:
        raise AppError(415, "unsupported_file_type", "Only CSV and XLSX files are accepted.")
    return safe_name, extension[1:]


def contained_path(root: Path, stored_filename: str) -> Path:
    if Path(stored_filename).name != stored_filename:
        raise AppError(500, "unsafe_storage_path", "Stored dataset path is invalid.")
    resolved_root = root.resolve()
    candidate = (resolved_root / stored_filename).resolve()
    if candidate.parent != resolved_root:
        raise AppError(500, "unsafe_storage_path", "Stored dataset path is invalid.")
    return candidate
