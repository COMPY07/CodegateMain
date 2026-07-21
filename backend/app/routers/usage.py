"""Usage reporting for the signed-in user's model accounts."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Query

from ..deps import get_credential_store, get_usage_service
from ..errors import AppError, BadRequestError
from ..services.credentials import SUPPORTED_PROVIDERS, CredentialStore
from ..services.usage_service import UsageService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["usage"])


@router.get("/usage/{provider}")
async def provider_usage(
    provider: str,
    days: int = Query(default=30, ge=1, le=90),
    store: CredentialStore = Depends(get_credential_store),
    usage: UsageService = Depends(get_usage_service),
) -> dict:
    if provider not in SUPPORTED_PROVIDERS:
        raise BadRequestError(f"'{provider}' 사용량은 아직 지원하지 않습니다.")

    admin_key = store.admin_key(provider)
    if admin_key:
        try:
            return await usage.fetch_openai(admin_key, days=days)
        except AppError as e:
            # Fall back rather than fail: the local tally is still useful.
            logger.warning("provider usage lookup failed, using local tally: %s", e.message)
            local = usage.local_usage(provider)
            local["warning"] = e.message
            return local

    local = usage.local_usage(provider)
    if store.has(provider):
        local["warning"] = (
            "실제 사용량을 보려면 Admin 키(sk-admin-…)가 필요합니다. "
            "지금은 Vibe Studio 에서 사용한 양만 집계합니다."
        )
    return local
