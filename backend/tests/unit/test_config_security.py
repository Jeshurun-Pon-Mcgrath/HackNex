from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import contained_path, validate_original_filename


def test_configuration_rejects_wildcard_origin(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        Settings(
            data_dir=tmp_path / "data", database_path=tmp_path / "db.sqlite3", allowed_origins=["*"]
        )


def test_safe_path_and_filename(tmp_path: Path) -> None:
    assert contained_path(tmp_path, "opaque.csv").parent == tmp_path.resolve()
    assert validate_original_filename("../sales.CSV") == ("sales.CSV", "csv")
    with pytest.raises(AppError):
        contained_path(tmp_path, "../outside.csv")
    with pytest.raises(AppError):
        validate_original_filename("bad\x00.csv")
