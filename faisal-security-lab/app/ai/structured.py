"""Minimal JSON-schema validator + strict JSON extraction.

The validator is deliberately small and *allowlist* oriented: an object may only
contain declared properties (additionalProperties is rejected), enums are
enforced, and strings are length-bounded. This is what makes a model response a
safe, typed command rather than free text.
"""
from __future__ import annotations

import json
import re

from ..errors import ValidationError


class SchemaError(ValidationError):
    code = "ai_schema_error"


def extract_json(text: str) -> dict:
    """Pull the first JSON object out of a model response, tolerating code
    fences and leading prose. Never executes anything."""
    if not text:
        raise SchemaError("empty model response")
    text = text.strip()
    # Strip ```json fences.
    fence = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
    if fence:
        text = fence.group(1)
    # Find the outermost object.
    start = text.find("{")
    if start == -1:
        raise SchemaError("no JSON object in model response")
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except ValueError as e:
                    raise SchemaError(f"invalid JSON: {e}")
    raise SchemaError("unterminated JSON object")


def validate(obj, schema: dict, path: str = "$"):
    """Validate obj against a tiny JSON-schema subset. Returns obj or raises."""
    t = schema.get("type")
    if t == "object":
        if not isinstance(obj, dict):
            raise SchemaError(f"{path}: expected object")
        props = schema.get("properties", {})
        if schema.get("additionalProperties", False) is False:
            for k in obj:
                if k not in props:
                    raise SchemaError(f"{path}.{k}: property not allowed")
        for req in schema.get("required", []):
            if req not in obj:
                raise SchemaError(f"{path}.{req}: required")
        for k, sub in props.items():
            if k in obj:
                validate(obj[k], sub, f"{path}.{k}")
    elif t == "array":
        if not isinstance(obj, list):
            raise SchemaError(f"{path}: expected array")
        if "maxItems" in schema and len(obj) > schema["maxItems"]:
            raise SchemaError(f"{path}: too many items")
        item_schema = schema.get("items")
        if item_schema:
            for i, v in enumerate(obj):
                validate(v, item_schema, f"{path}[{i}]")
    elif t == "string":
        if not isinstance(obj, str):
            raise SchemaError(f"{path}: expected string")
        if "maxLength" in schema and len(obj) > schema["maxLength"]:
            raise SchemaError(f"{path}: string too long")
        if "enum" in schema and obj not in schema["enum"]:
            raise SchemaError(f"{path}: '{obj}' not in enum {schema['enum']}")
    elif t == "integer":
        if not isinstance(obj, int) or isinstance(obj, bool):
            raise SchemaError(f"{path}: expected integer")
        if "minimum" in schema and obj < schema["minimum"]:
            raise SchemaError(f"{path}: below minimum")
        if "maximum" in schema and obj > schema["maximum"]:
            raise SchemaError(f"{path}: above maximum")
    elif t == "number":
        if not isinstance(obj, (int, float)) or isinstance(obj, bool):
            raise SchemaError(f"{path}: expected number")
    elif t == "boolean":
        if not isinstance(obj, bool):
            raise SchemaError(f"{path}: expected boolean")
    return obj
