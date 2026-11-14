"""Model provider abstraction with graceful degradation + hard budgets.

Providers:
  * none  — no model configured. `available` is False; callers fall back to
            deterministic rule-based logic.
  * openai-compatible — any Chat Completions compatible endpoint (base_url+model).
  * anthropic — the Anthropic Messages API.

The API key is read from the environment at call time and NEVER stored on an
object, logged, or echoed. All calls go through the environment's HTTPS proxy
with its CA bundle, enforce a timeout, and request JSON only.
"""
from __future__ import annotations

import json
import os
import ssl
import urllib.request
from dataclasses import dataclass, field

from ..config import get_config
from .structured import extract_json, validate, SchemaError


@dataclass
class AIResult:
    available: bool
    data: dict | None = None
    provider: str = "none"
    model: str = ""
    fallback: bool = False
    error: str = ""
    meta: dict = field(default_factory=dict)


def _ssl_ctx() -> ssl.SSLContext:
    ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
    try:
        return ssl.create_default_context(cafile=ca if os.path.exists(ca) else None)
    except Exception:
        return ssl.create_default_context()


class Provider:
    name = "none"

    @property
    def available(self) -> bool:
        return False

    def generate_structured(self, system: str, user: str, schema: dict,
                            *, max_tokens: int | None = None) -> AIResult:
        return AIResult(available=False, provider=self.name, fallback=True,
                        error="no AI provider configured")

    def raw_complete(self, system: str, user: str, *, max_tokens: int | None = None) -> AIResult:
        """Free-form completion (used only by the AI red-team connector)."""
        return AIResult(available=False, provider=self.name, fallback=True,
                        error="no AI provider configured")


class _HTTPProvider(Provider):
    def __init__(self):
        self.cfg = get_config().ai
        self.limits = get_config().limits

    @property
    def available(self) -> bool:
        return self.cfg.available

    def _post(self, url: str, headers: dict, payload: dict) -> dict:
        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=self.limits.ai_timeout_seconds,
                                    context=_ssl_ctx()) as resp:
            return json.loads(resp.read().decode("utf-8"))


class OpenAICompatibleProvider(_HTTPProvider):
    name = "openai-compatible"

    def generate_structured(self, system, user, schema, *, max_tokens=None):
        key = os.environ.get("FSL_AI_API_KEY", "")
        if not key or not self.cfg.model:
            return AIResult(available=False, provider=self.name, fallback=True,
                            error="missing key/model")
        base = self.cfg.base_url.rstrip("/") or "https://api.openai.com/v1"
        url = f"{base}/chat/completions"
        payload = {
            "model": self.cfg.model, "temperature": 0,
            "max_tokens": max_tokens or self.cfg.max_tokens,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
        }
        try:
            data = self._post(url, {"Authorization": f"Bearer {key}",
                                    "Content-Type": "application/json"}, payload)
            text = data["choices"][0]["message"]["content"]
            obj = validate(extract_json(text), schema)
            return AIResult(available=True, data=obj, provider=self.name,
                            model=self.cfg.model,
                            meta={"usage": data.get("usage", {})})
        except SchemaError as e:
            return AIResult(available=True, provider=self.name, model=self.cfg.model,
                            fallback=True, error=f"schema: {e}")
        except Exception as e:
            return AIResult(available=False, provider=self.name, fallback=True,
                            error=str(e)[:200])

    def raw_complete(self, system, user, *, max_tokens=None):
        key = os.environ.get("FSL_AI_API_KEY", "")
        if not key or not self.cfg.model:
            return AIResult(available=False, provider=self.name, fallback=True, error="missing key/model")
        base = self.cfg.base_url.rstrip("/") or "https://api.openai.com/v1"
        payload = {"model": self.cfg.model, "temperature": 0,
                   "max_tokens": max_tokens or 512,
                   "messages": [{"role": "system", "content": system},
                                {"role": "user", "content": user}]}
        try:
            data = self._post(f"{base}/chat/completions",
                              {"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                              payload)
            text = data["choices"][0]["message"]["content"]
            return AIResult(available=True, data={"text": text}, provider=self.name,
                            model=self.cfg.model, meta={"usage": data.get("usage", {})})
        except Exception as e:
            return AIResult(available=False, provider=self.name, fallback=True, error=str(e)[:200])


class AnthropicProvider(_HTTPProvider):
    name = "anthropic"

    def generate_structured(self, system, user, schema, *, max_tokens=None):
        key = os.environ.get("FSL_AI_API_KEY", "")
        if not key or not self.cfg.model:
            return AIResult(available=False, provider=self.name, fallback=True,
                            error="missing key/model")
        base = self.cfg.base_url.rstrip("/") or "https://api.anthropic.com"
        url = f"{base}/v1/messages"
        payload = {
            "model": self.cfg.model, "max_tokens": max_tokens or self.cfg.max_tokens,
            "temperature": 0, "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        try:
            data = self._post(url, {"x-api-key": key, "anthropic-version": "2023-06-01",
                                    "Content-Type": "application/json"}, payload)
            text = "".join(b.get("text", "") for b in data.get("content", []))
            obj = validate(extract_json(text), schema)
            return AIResult(available=True, data=obj, provider=self.name,
                            model=self.cfg.model, meta={"usage": data.get("usage", {})})
        except SchemaError as e:
            return AIResult(available=True, provider=self.name, model=self.cfg.model,
                            fallback=True, error=f"schema: {e}")
        except Exception as e:
            return AIResult(available=False, provider=self.name, fallback=True,
                            error=str(e)[:200])

    def raw_complete(self, system, user, *, max_tokens=None):
        key = os.environ.get("FSL_AI_API_KEY", "")
        if not key or not self.cfg.model:
            return AIResult(available=False, provider=self.name, fallback=True, error="missing key/model")
        base = self.cfg.base_url.rstrip("/") or "https://api.anthropic.com"
        payload = {"model": self.cfg.model, "max_tokens": max_tokens or 512, "temperature": 0,
                   "system": system, "messages": [{"role": "user", "content": user}]}
        try:
            data = self._post(f"{base}/v1/messages",
                              {"x-api-key": key, "anthropic-version": "2023-06-01",
                               "Content-Type": "application/json"}, payload)
            text = "".join(b.get("text", "") for b in data.get("content", []))
            return AIResult(available=True, data={"text": text}, provider=self.name,
                            model=self.cfg.model, meta={"usage": data.get("usage", {})})
        except Exception as e:
            return AIResult(available=False, provider=self.name, fallback=True, error=str(e)[:200])


def get_provider() -> Provider:
    cfg = get_config().ai
    if cfg.provider == "openai-compatible":
        return OpenAICompatibleProvider()
    if cfg.provider == "anthropic":
        return AnthropicProvider()
    return Provider()
