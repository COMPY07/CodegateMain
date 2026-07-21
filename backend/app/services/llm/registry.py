"""Model registry: maps the frontend's model ids to what this user can actually run.

`registered` means "this signed-in user can use this model", which is deliberately
NOT the same as "the server has some key for that vendor":

  - `claude`  -> backed by the local **Claude Code login** (the agent harness). No
                 ANTHROPIC_API_KEY needed.
  - `gpt`     -> backed by the local **Codex CLI login** (ChatGPT 구독), same idea as
                 Claude. A user-supplied OpenAI key is only a fallback for plain chat.
                 The `OPENAI_API_KEY` in .env is the operator's *red-team* credential
                 and is never offered to the user as a chat model.

The catalog mirrors `frontend/mvp/src/data/mockData.js` so `/api/models` stays
byte-compatible with what ModelPicker already renders.
"""

from __future__ import annotations

import shutil

from ...config import Settings
from ...errors import NotConfiguredError
from ..credentials import CredentialStore
from .anthropic_provider import AnthropicProvider
from .base import LlmProvider
from .fake_provider import FakeProvider
from .openai_provider import OpenAIProvider

_CATALOG: list[dict] = [
    {"id": "claude", "name": "Claude", "vendor": "Anthropic", "tile": "#D97757"},
    {"id": "gpt", "name": "GPT", "vendor": "OpenAI", "tile": "#0f9d78"},
]

# frontend model id -> the credential that backs it
_ROUTING: dict[str, str] = {
    "claude": "claude_code",   # local Claude Code login
    "gpt": "openai",           # the user's own OpenAI key
}

# Usage is tallied per credential, so it shares `_ROUTING`'s keys. Only OpenAI
# publishes a usage API; `claude_code` is local-tally only.
USAGE_PROVIDERS: tuple[str, ...] = ("openai", "claude_code")


def usage_provider(frontend_id: str) -> str:
    """Which usage bucket a model's tokens belong to."""
    return _ROUTING.get(frontend_id, frontend_id)


def codex_available() -> bool:
    """Reported for information only.

    The `gpt` harness runs on the *user's* machine (that is where their Codex login
    is), so what matters for actually running it is the local agent's report — not
    whatever happens to be installed next to this server.
    """
    return shutil.which("codex") is not None


def claude_code_available() -> bool:
    """The agent harness (and therefore the `claude` model) needs the SDK installed.

    Actual authentication is the user's `claude` CLI login, which the SDK resolves.
    """
    try:
        import claude_agent_sdk  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


class ProviderRegistry:
    def __init__(self, settings: Settings, credentials: CredentialStore):
        self._settings = settings
        self._credentials = credentials
        self._fake = FakeProvider()

    # ---- availability ---------------------------------------------------------

    def _user_openai_key(self) -> str:
        return self._credentials.api_key("openai")

    def provider_status(self) -> dict[str, bool]:
        """Reported by /api/health. Note the explicit user-vs-redteam split."""
        return {
            "claudeCode": claude_code_available(),
            "codex": codex_available(),
            "openaiUser": bool(self._user_openai_key()),
            # Operator-supplied, security-adjudication only — not a user chat model.
            "openaiRedteam": bool(self._settings.openai_api_key),
        }

    def is_registered(self, frontend_id: str) -> bool:
        backing = _ROUTING.get(frontend_id)
        if backing == "claude_code":
            return claude_code_available()
        if backing == "openai":
            # Codex login is the primary path; a user key still works for plain chat.
            return codex_available() or bool(self._user_openai_key())
        return False

    # ---- resolution -----------------------------------------------------------

    def _build_provider(self, backing: str) -> LlmProvider | None:
        if backing == "openai":
            key = self._user_openai_key()
            if not key:
                return None
            # Built per call so a key added at runtime takes effect immediately.
            return OpenAIProvider(key, self._settings.openai_model)
        if backing == "claude_code":
            # Direct-API Claude is only used by the non-agent chat fallback.
            if self._settings.anthropic_api_key:
                return AnthropicProvider(
                    self._settings.anthropic_api_key, self._settings.anthropic_model
                )
            return None
        return None

    def _model_name(self, backing: str) -> str:
        return (
            self._settings.openai_model if backing == "openai" else self._settings.anthropic_model
        )

    def resolve(self, frontend_id: str) -> tuple[LlmProvider, str]:
        """(provider, model_name), falling back to the deterministic fake provider.

        The fallback keeps the chat path working offline / before the user logs in.
        """
        backing = _ROUTING.get(frontend_id)
        if backing is None:
            return self._fake, frontend_id
        provider = self._build_provider(backing)
        if provider is None:
            return self._fake, frontend_id
        return provider, self._model_name(backing)

    def resolve_strict(self, frontend_id: str) -> tuple[LlmProvider, str]:
        """Like resolve() but raises instead of silently falling back."""
        backing = _ROUTING.get(frontend_id)
        if backing is None:
            raise NotConfiguredError(f"Unknown model id '{frontend_id}'.")
        provider = self._build_provider(backing)
        if provider is None:
            raise NotConfiguredError(
                f"'{frontend_id}' 모델을 쓰려면 먼저 계정을 연결해야 합니다."
            )
        return provider, self._model_name(backing)

    # ---- catalog --------------------------------------------------------------

    @staticmethod
    def usage_provider(frontend_id: str) -> str:
        return usage_provider(frontend_id)

    def models_payload(self, usage_by_id: dict[str, dict] | None = None) -> list[dict]:
        """Byte-compatible with mockData.models; `registered` reflects this user."""
        usage_by_id = usage_by_id or {}
        out: list[dict] = []
        for entry in _CATALOG:
            item = dict(entry)
            registered = self.is_registered(entry["id"])
            item["registered"] = registered
            if registered:
                u = usage_by_id.get(entry["id"]) or {}
                item["usage"] = int(u.get("usage", 0))
                item["tokens"] = str(u.get("tokens", "0"))
                if u.get("source"):
                    item["usageSource"] = u["source"]
            out.append(item)
        return out
