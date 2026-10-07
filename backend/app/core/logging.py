import json
import logging
from typing import Any


def configure_logging(level: str) -> None:
    logging.basicConfig(level=level, format="%(message)s")


def log_event(event: str, **fields: Any) -> None:
    logging.getLogger("prooflens").info(json.dumps({"event": event, **fields}, default=str))
