from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="APP_", env_file=".env", extra="ignore")

    env: str = "development"
    host: str = "127.0.0.1"
    port: int = Field(8000, ge=1, le=65535)
    log_level: str = "INFO"
    data_dir: Path = Path("data")
    database_path: Path = Path("data/prooflens.sqlite3")
    max_upload_bytes: int = Field(20 * 1024 * 1024, ge=1)
    allowed_origins: list[str] = ["http://localhost:5173"]
    dataset_ttl_hours: int = Field(24, ge=1)

    @field_validator("log_level")
    @classmethod
    def valid_log_level(cls, value: str) -> str:
        value = value.upper()
        if value not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("unsupported log level")
        return value

    @field_validator("allowed_origins")
    @classmethod
    def valid_origins(cls, value: list[str]) -> list[str]:
        if not value or "*" in value:
            raise ValueError("explicit CORS origins are required")
        if any(not item.startswith(("http://", "https://")) for item in value):
            raise ValueError("origins must use http or https")
        return value

    @model_validator(mode="after")
    def safe_paths(self) -> "Settings":
        data = self.data_dir.expanduser().resolve()
        database = self.database_path.expanduser().resolve()
        if data == Path(data.anchor):
            raise ValueError("data directory cannot be a filesystem root")
        if database == data or database.suffix == "":
            raise ValueError("database path must name a file")
        self.data_dir = data
        self.database_path = database
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
