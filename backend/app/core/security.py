import re
from pathlib import Path

from app.core.errors import AppError

ALLOWED_EXTENSIONS = {".csv", ".xlsx", ".txt", ".md", ".pdf"}
# Proof scripts reference files by name, so names must be plain and quote-safe.
SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 _.-]{0,99}$")
WORKSPACE_ID = re.compile(r"^[0-9a-f]{32}$")


def validate_original_filename(filename: str | None) -> tuple[str, str]:
    if not filename:
        raise AppError(422, "invalid_filename", "The upload filename is invalid.")
    safe_name = Path(filename.replace("\\", "/")).name
    if not SAFE_NAME.fullmatch(safe_name) or ".." in safe_name:
        raise AppError(
            422,
            "invalid_filename",
            "Filenames may contain only letters, digits, spaces, '_', '-' and '.'.",
        )
    extension = Path(safe_name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise AppError(
            415, "unsupported_file_type", "Only CSV, XLSX, TXT, MD and PDF files are accepted."
        )
    return safe_name, extension[1:]


def contained_path(root: Path, name: str) -> Path:
    if Path(name).name != name:
        raise AppError(500, "unsafe_storage_path", "Stored path is invalid.")
    resolved_root = root.resolve()
    candidate = (resolved_root / name).resolve()
    if candidate.parent != resolved_root:
        raise AppError(500, "unsafe_storage_path", "Stored path is invalid.")
    return candidate


def workspace_dir(data_dir: Path, workspace_id: str) -> Path:
    if not WORKSPACE_ID.fullmatch(workspace_id):
        raise AppError(404, "workspace_not_found", "The workspace was not found.")
    path = contained_path(data_dir / "workspaces", workspace_id)
    if not path.is_dir():
        raise AppError(404, "workspace_not_found", "The workspace was not found.")
    return path
