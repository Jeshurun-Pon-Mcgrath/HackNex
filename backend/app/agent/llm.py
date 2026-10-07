"""Minimal Ollama chat client with JSON-schema constrained output."""

import json
from typing import Any

import httpx

from app.core.errors import AppError


class LLM:
    def __init__(self, url: str, model: str, timeout: float) -> None:
        self.url = url.rstrip("/")
        self.model = model
        self.timeout = timeout

    def json(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "format": schema,
            "stream": False,
            "think": False,
            "options": {"temperature": 0, "seed": 7, "num_ctx": 12288},
        }
        try:
            response = httpx.post(f"{self.url}/api/chat", json=body, timeout=self.timeout)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise AppError(
                503, "llm_unavailable", f"Ollama is not reachable or failed ({exc})."
            ) from exc
        content = response.json()["message"]["content"]
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AppError(502, "llm_bad_output", "The model returned invalid JSON.") from exc
        if not isinstance(parsed, dict):
            raise AppError(502, "llm_bad_output", "The model returned non-object JSON.")
        return parsed
