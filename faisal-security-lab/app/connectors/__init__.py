"""Security-tool connectors.

Each connector wraps one external tool (or one stdlib network check) behind a
uniform contract. Connectors never build shell strings, never execute scanned
input as code, and always run under bounded resources via `run_tool`.
"""
from .registry import get_connector, all_connectors, connector_names, sync_registry

__all__ = ["get_connector", "all_connectors", "connector_names", "sync_registry"]
