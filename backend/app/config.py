"""Application settings, loaded from environment / .env via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=_BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM providers — keys stay server-side and are never returned to the browser.
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    anthropic_model: str = Field(default="claude-opus-4-8", alias="ANTHROPIC_MODEL")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o", alias="OPENAI_MODEL")
    # 비워두면 Codex CLI 가 구독에 맞는 기본 모델을 고른다.
    codex_model: str = Field(default="", alias="CODEX_MODEL")

    # sa-redteam security engine (Increment 2).
    # The C++ scanner runs in its deterministic "fake" mode (no network) for
    # authoritative file:line locations and signals; the adversarial LLM red-team
    # step runs here in the backend against OpenAI (redteam_model), so no libcurl
    # build and no SA_LLM_API_KEY are required.
    sa_redteam_bin: str = Field(default="../redteam/build/sa-redteam", alias="SA_REDTEAM_BIN")
    sa_redteam_timeout_s: int = Field(default=300, alias="SA_REDTEAM_TIMEOUT_S")
    redteam_model: str = Field(default="gpt-4o", alias="REDTEAM_MODEL")
    security_max_llm_probes: int = Field(default=12, alias="SECURITY_MAX_LLM_PROBES")

    # Filesystem guard + the Claude Code agent's working directory (Increment 3).
    workspace_root: str = Field(default="", alias="WORKSPACE_ROOT")
    agent_max_rescans_per_file: int = Field(default=3, alias="AGENT_MAX_RESCANS_PER_FILE")

    # Server.
    port: int = Field(default=8000, alias="PORT")
    cors_origins: str = Field(
        default="http://localhost:5180,http://127.0.0.1:5180", alias="CORS_ORIGINS"
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sa_redteam_bin_path(self) -> Path:
        """Absolute path to the sa-redteam binary, resolved relative to the backend dir."""
        p = Path(self.sa_redteam_bin)
        return p if p.is_absolute() else (_BACKEND_DIR / p).resolve()

    @property
    def workspace_root_path(self) -> Path | None:
        """Absolute workspace root, resolved relative to the backend dir. None when unset."""
        if not self.workspace_root:
            return None
        p = Path(self.workspace_root).expanduser()
        return p if p.is_absolute() else (_BACKEND_DIR / p).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()
