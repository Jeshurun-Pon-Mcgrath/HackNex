from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.core.errors import AppError
from app.core.security import contained_path, validate_original_filename, workspace_dir


def test_configuration_rejects_wildcard_origin(tmp_path: Path) -> None:
    with pytest.raises(ValidationError):
        Settings(data_dir=tmp_path / "data", allowed_origins=["*"])


def test_safe_path_and_filename(tmp_path: Path) -> None:
    assert contained_path(tmp_path, "orders.csv").parent == tmp_path.resolve()
    assert validate_original_filename("../sales.CSV") == ("sales.CSV", "csv")
    assert validate_original_filename("policy.md") == ("policy.md", "md")
    for bad in ("bad\x00.csv", "it's.csv", "run.exe", ""):
        with pytest.raises(AppError):
            validate_original_filename(bad)
    with pytest.raises(AppError):
        contained_path(tmp_path, "../outside.csv")
    with pytest.raises(AppError):
        workspace_dir(tmp_path, "../../etc")
