"""GET /api/models — catalog with per-user `registered` flags and real usage."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query

from ..deps import get_credential_store, get_registry, get_usage_service
from ..errors import AppError
from ..services.credentials import CredentialStore
from ..services.llm.registry import ProviderRegistry
from ..services.usage_service import UsageService, format_tokens

logger = logging.getLogger(__name__)

router = APIRouter(tags=["models"])

# Every model the user can actually run reports usage; the registry owns the mapping.
_USAGE_MODELS = ("gpt", "claude")


async def _usage_by_model_id(
    registry: ProviderRegistry, store: CredentialStore, usage: UsageService
) -> dict[str, dict]:
    """Total tokens per frontend model id, preferring the provider's own figures."""
    totals: dict[str, dict] = {}
    for model_id in _USAGE_MODELS:
        if not registry.is_registered(model_id):
            continue
        provider = registry.usage_provider(model_id)
        # Only OpenAI publishes a usage API, and only to Admin keys. Claude Code has
        # no such endpoint, so its figures are always this app's own tally.
        admin_key = store.admin_key(provider) if provider == "openai" else ""
        report = None
        if admin_key:
            try:
                report = await usage.fetch_openai(admin_key)
            except AppError as e:
                logger.warning("usage lookup for %s failed: %s", provider, e.message)
        if report is None:
            report = usage.local_usage(provider)
        totals[model_id] = {
            "total": report["totalTokens"],
            "tokens": report["tokens"],
            "source": report["source"],
        }

    # `usage` is a percentage bar in the UI: this model's share of the user's tokens.
    grand_total = sum(v["total"] for v in totals.values())
    return {
        model_id: {
            "usage": round(v["total"] / grand_total * 100) if grand_total else 0,
            "tokens": v["tokens"],
            "source": v["source"],
        }
        for model_id, v in totals.items()
    }


@router.get("/models")
async def list_models(
    with_usage: bool = Query(default=False, alias="withUsage"),
    registry: ProviderRegistry = Depends(get_registry),
    store: CredentialStore = Depends(get_credential_store),
    usage: UsageService = Depends(get_usage_service),
) -> list[dict]:
    # Usage is opt-in because the provider lookup is a network call.
    by_id = await _usage_by_model_id(registry, store, usage) if with_usage else {}
    return registry.models_payload(by_id)


__all__ = ["router", "format_tokens"]
