import zipfile
from pathlib import Path

from app.core.errors import AppError

MAX_XLSX_ENTRIES = 10_000
MAX_XLSX_EXPANDED_BYTES = 200 * 1024 * 1024


def validate_csv_bytes(path: Path) -> None:
    prefix = path.read_bytes()[:4]
    if not prefix:
        raise AppError(422, "empty_file", "The uploaded file is empty.")
    if prefix.startswith((b"PK\x03\x04", b"MZ")):
        raise AppError(422, "content_mismatch", "The file content does not match CSV.")
    try:
        path.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError as exc:
        raise AppError(422, "unsupported_encoding", "CSV must use UTF-8 encoding.") from exc


def validate_xlsx_container(path: Path) -> None:
    try:
        with zipfile.ZipFile(path) as archive:
            infos = archive.infolist()
            names = {item.filename for item in infos}
            if len(infos) > MAX_XLSX_ENTRIES:
                raise AppError(422, "unsafe_workbook", "Workbook contains too many entries.")
            if sum(item.file_size for item in infos) > MAX_XLSX_EXPANDED_BYTES:
                raise AppError(422, "unsafe_workbook", "Workbook expanded size is too large.")
            required = {"[Content_Types].xml", "xl/workbook.xml"}
            if not required.issubset(names):
                raise AppError(422, "malformed_workbook", "The XLSX structure is invalid.")
            if any(name.lower().endswith("vbaproject.bin") for name in names):
                raise AppError(422, "workbook_macros", "Macro-enabled workbooks are not accepted.")
            if any(name.startswith("xl/embeddings/") for name in names):
                raise AppError(
                    422, "embedded_objects", "Embedded workbook objects are not accepted."
                )
            if "EncryptedPackage" in names or "EncryptionInfo" in names:
                raise AppError(
                    422, "encrypted_workbook", "Password-protected workbooks are not accepted."
                )
    except zipfile.BadZipFile as exc:
        raise AppError(422, "malformed_workbook", "The XLSX file is not a valid workbook.") from exc
