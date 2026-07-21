"""GET /api/health — liveness plus credential/engine readiness."""

from __future__ import annotations

import os

from fastapi import APIRouter, Depends

from .. import __version__
from ..config import Settings
from ..deps import get_app_settings, get_registry
from ..services.llm.registry import ProviderRegistry

router = APIRouter(tags=["health"])


@router.get("/health")
def health(
    settings: Settings = Depends(get_app_settings),
    registry: ProviderRegistry = Depends(get_registry),
) -> dict:
    bin_path = settings.sa_redteam_bin_path
    status = registry.provider_status()
    return {
        "status": "ok",
        "version": __version__,
        # Deliberately split: what the *user* signed into vs what the *operator*
        # supplied for security scanning.
        "user": {
            "claudeCode": status["claudeCode"],
            # `gpt` is driven by the Codex login, mirroring Claude Code; a personal
            # OpenAI key is only a fallback for plain (non-editing) chat.
            "codex": status["codex"],
            "openai": status["codex"] or status["openaiUser"],
            "openaiKey": status["openaiUser"],
        },
        "redteam": {
            "available": bin_path.is_file() and os.access(bin_path, os.X_OK),
            "bin": str(bin_path),
            # Operator-supplied OpenAI credential, used only for LLM adjudication.
            "llm": settings.redteam_model if status["openaiRedteam"] else None,
        },
    }
