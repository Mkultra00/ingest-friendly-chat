"""Chat client with two interchangeable backends.

Both are OpenAI-compatible /chat/completions endpoints, so switching is a
config change, not a code change:

    LLM_PROVIDER=lovable     -> https://ai.gateway.lovable.dev/v1  (LOVABLE_API_KEY)
    LLM_PROVIDER=openrouter  -> https://openrouter.ai/api/v1       (OPENROUTER_API_KEY)

Default: openrouter when OPENROUTER_API_KEY is present (which is the case
inside the grading sandbox, whose egress allowlist permits openrouter.ai and
nothing else), otherwise lovable.

No client-side timeout is armed on the request: an aborted generation still
completes and still bills upstream. A generous socket read timeout only
exists so a dead connection cannot hang the whole run.
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any

LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1"
OPENROUTER_BASE = "https://openrouter.ai/api/v1"

# Extraction is a high-volume, low-reasoning job: cheap and fast wins.
DEFAULT_MODELS = {
    "openrouter": os.environ.get("LLM_MODEL", "google/gemini-2.5-flash"),
    "lovable": os.environ.get("LLM_MODEL", "google/gemini-2.5-flash"),
}
VISION_MODELS = {
    "openrouter": os.environ.get("LLM_VISION_MODEL", "google/gemini-2.5-flash"),
    "lovable": os.environ.get("LLM_VISION_MODEL", "google/gemini-2.5-flash"),
}

READ_TIMEOUT = float(os.environ.get("LLM_READ_TIMEOUT", "600"))
MAX_ATTEMPTS = int(os.environ.get("LLM_MAX_ATTEMPTS", "4"))


class LLMError(RuntimeError):
    pass


class TerminalLLMError(LLMError):
    """400/401/402/403 — re-sending the same request returns the same error."""


def _provider() -> str:
    explicit = os.environ.get("LLM_PROVIDER", "").strip().lower()
    if explicit in ("lovable", "openrouter"):
        return explicit
    if os.environ.get("OPENROUTER_API_KEY"):
        return "openrouter"
    if os.environ.get("LOVABLE_API_KEY"):
        return "lovable"
    return "openrouter"


class Chat:
    def __init__(self, provider: str | None = None) -> None:
        self.provider = provider or _provider()
        if self.provider == "lovable":
            self.base = LOVABLE_BASE
            self.key = os.environ.get("LOVABLE_API_KEY", "")
        else:
            self.base = OPENROUTER_BASE
            self.key = os.environ.get("OPENROUTER_API_KEY", "")
        self.model = DEFAULT_MODELS[self.provider]
        self.vision_model = VISION_MODELS[self.provider]
        self._lock = threading.Lock()
        self.calls = 0
        self.failures = 0
        self.blocked = False  # set on a terminal 402/403; stops further calls

    # -- public ------------------------------------------------------------

    def json_call(
        self,
        system: str,
        user: str,
        image_png: bytes | None = None,
        model: str | None = None,
    ) -> dict[str, Any]:
        """One call that must return a JSON object. Returns {} on failure."""
        if self.blocked:
            return {}
        content: Any = user
        if image_png is not None:
            import base64

            b64 = base64.b64encode(image_png).decode()
            content = [
                {"type": "text", "text": user},
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/png;base64,{b64}"},
                },
            ]
            model = model or self.vision_model

        body = {
            "model": model or self.model,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": content},
            ],
            "response_format": {"type": "json_object"},
        }

        try:
            text = self._post(body)
        except TerminalLLMError as exc:
            print(f"[llm] terminal error, stopping model calls: {exc}")
            self.blocked = True
            return {}
        except LLMError as exc:
            print(f"[llm] giving up on this page: {exc}")
            with self._lock:
                self.failures += 1
            return {}
        return _parse_json_object(text)

    # -- internals ---------------------------------------------------------

    def _post(self, body: dict[str, Any]) -> str:
        if not self.key:
            raise TerminalLLMError(
                f"no API key for provider {self.provider}; set "
                f"{'LOVABLE_API_KEY' if self.provider == 'lovable' else 'OPENROUTER_API_KEY'}"
            )
        payload = json.dumps(body).encode()
        headers = {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        if self.provider == "openrouter":
            headers["HTTP-Referer"] = "https://hackathon.acelabusa.com"
            headers["X-Title"] = "aec-error-finder"

        delay = 2.0
        last: Exception | None = None
        for attempt in range(1, MAX_ATTEMPTS + 1):
            req = urllib.request.Request(
                f"{self.base}/chat/completions", data=payload, headers=headers
            )
            try:
                with urllib.request.urlopen(req, timeout=READ_TIMEOUT) as resp:
                    data = json.loads(resp.read())
                with self._lock:
                    self.calls += 1
                return data["choices"][0]["message"]["content"] or ""
            except urllib.error.HTTPError as exc:
                detail = ""
                try:
                    detail = exc.read().decode()[:400]
                except Exception:
                    pass
                status = exc.code
                if status in (400, 401, 402, 403):
                    raise TerminalLLMError(f"HTTP {status}: {detail}") from exc
                last = LLMError(f"HTTP {status}: {detail}")
                retry_after = exc.headers.get("Retry-After") if exc.headers else None
                wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
            except Exception as exc:  # noqa: BLE001 network/JSON shape
                last = exc
                wait = delay
            if attempt < MAX_ATTEMPTS:
                time.sleep(wait)
                delay = min(delay * 2, 30)
        raise LLMError(str(last))


def _parse_json_object(text: str) -> dict[str, Any]:
    if not text:
        return {}
    t = text.strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"```\s*$", "", t).strip()
    try:
        obj = json.loads(t)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        pass
    # Salvage the outermost object.
    start = t.find("{")
    if start < 0:
        return {}
    depth = 0
    for i in range(start, len(t)):
        if t[i] == "{":
            depth += 1
        elif t[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    obj = json.loads(t[start : i + 1])
                    return obj if isinstance(obj, dict) else {}
                except json.JSONDecodeError:
                    break
    # Last resort: trailing-comma / truncation repair.
    candidate = t[start:]
    candidate = re.sub(r",\s*([}\]])", r"\1", candidate)
    candidate += "}" * max(0, candidate.count("{") - candidate.count("}"))
    candidate += "]" * max(0, candidate.count("[") - candidate.count("]"))
    try:
        obj = json.loads(candidate)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        return {}
