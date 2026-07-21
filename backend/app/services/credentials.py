"""Per-user provider credentials (BE-009).

Distinct from the server-side credentials in .env:
  - `OPENAI_API_KEY` in .env is the **red-team** credential the operator supplies for
    security adjudication. It is never offered to the user as a chat model.
  - Keys stored here are the **user's own**, entered through the studio UI, and decide
    which chat models they may use.

Storage: a 0600 JSON file under the user's config dir (`~/.config/codegate/` by
default, override with `CODEGATE_CONFIG_DIR`). Deliberately *not* inside the repo —
this checkout can live on an exFAT volume, where POSIX permissions are not enforced
and every file reads as 0700. Keys are never returned to the browser; responses carry
only `registered` flags and masked hints.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_STORE_NAME = "credentials.json"
SUPPORTED_PROVIDERS = ("openai",)


def mask(secret: str) -> str:
    """`sk-proj-abcd…wxyz` — enough to recognise, never enough to use."""
    if not secret:
        return ""
    if len(secret) <= 12:
        return secret[:3] + "…"
    return f"{secret[:7]}…{secret[-4:]}"


def default_config_dir() -> Path:
    """Where user credentials live — never the repo checkout."""
    override = os.environ.get("CODEGATE_CONFIG_DIR")
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "codegate"


class CredentialStore:
    def __init__(self, directory: Path):
        self._path = directory / _STORE_NAME

    @property
    def path(self) -> Path:
        return self._path

    # ---- persistence ----------------------------------------------------------

    def _read(self) -> dict[str, Any]:
        if not self._path.is_file():
            return {}
        try:
            return json.loads(self._path.read_text("utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            logger.warning("credential store unreadable (%s); starting empty", e)
            return {}

    def _write(self, data: dict[str, Any]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        # Create with owner-only permissions *before* writing the secret.
        fd = os.open(self._path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        os.chmod(self._path, 0o600)

    # ---- API ------------------------------------------------------------------

    def set(self, provider: str, *, api_key: str, admin_key: str = "") -> None:
        data = self._read()
        entry = {"api_key": api_key}
        if admin_key:
            entry["admin_key"] = admin_key
        data[provider] = entry
        self._write(data)

    def get(self, provider: str) -> dict[str, str]:
        return self._read().get(provider, {})

    def api_key(self, provider: str) -> str:
        return self.get(provider).get("api_key", "")

    def admin_key(self, provider: str) -> str:
        return self.get(provider).get("admin_key", "")

    def has(self, provider: str) -> bool:
        return bool(self.api_key(provider))

    def delete(self, provider: str) -> bool:
        data = self._read()
        if provider not in data:
            return False
        del data[provider]
        self._write(data)
        return True

    def describe(self, provider: str) -> dict[str, Any]:
        """Safe-to-serialise view — never includes key material."""
        entry = self.get(provider)
        return {
            "provider": provider,
            "registered": bool(entry.get("api_key")),
            "keyHint": mask(entry.get("api_key", "")),
            "hasAdminKey": bool(entry.get("admin_key")),
        }

    def describe_all(self) -> list[dict[str, Any]]:
        return [self.describe(p) for p in SUPPORTED_PROVIDERS]
