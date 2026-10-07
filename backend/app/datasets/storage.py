import hashlib
import os
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.errors import AppError
from app.core.security import contained_path

CHUNK_SIZE = 64 * 1024


async def store_upload(
    upload: UploadFile, data_dir: Path, extension: str, max_bytes: int
) -> tuple[str, int, str]:
    data_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid4().hex}.{extension}"
    destination = contained_path(data_dir, stored_name)
    digest = hashlib.sha256()
    size = 0
    try:
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
        if hasattr(os, "O_NOFOLLOW"):
            flags |= os.O_NOFOLLOW
        descriptor = os.open(destination, flags, 0o600)
        with os.fdopen(descriptor, "wb") as output:
            while chunk := await upload.read(CHUNK_SIZE):
                size += len(chunk)
                if size > max_bytes:
                    raise AppError(
                        413, "upload_too_large", "The upload exceeds the configured limit."
                    )
                digest.update(chunk)
                output.write(chunk)
        if size == 0:
            raise AppError(422, "empty_file", "The uploaded file is empty.")
        return stored_name, size, digest.hexdigest()
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


def delete_stored_file(data_dir: Path, stored_filename: str) -> None:
    path = contained_path(data_dir, stored_filename)
    if path.is_symlink():
        raise AppError(500, "unsafe_storage_path", "Refusing to follow a symbolic link.")
    path.unlink(missing_ok=True)
