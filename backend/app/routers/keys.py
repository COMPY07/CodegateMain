"""Model account connection (BE-009).

The user "logs in" to a provider by supplying their own key, which is verified with a
real API call before it is stored. Keys are never returned to the browser — responses
carry only `registered`, a masked hint, and whether an admin key is present.
"""

from __future__ import annotations

import logging

import httpx
from fastapi import APIRouter, Depends

from ..deps import get_credential_store
from ..errors import BadRequestError, ProviderError
from ..schemas.keys import KeyRequest
from ..services.credentials import SUPPORTED_PROVIDERS, CredentialStore

logger = logging.getLogger(__name__)

router = APIRouter(tags=["keys"])

_VERIFY_TIMEOUT_S = 20


async def _verify_openai(api_key: str) -> None:
    """A cheap authenticated call — proves the key works before we store it."""
    try:
        async with httpx.AsyncClient(timeout=_VERIFY_TIMEOUT_S) as client:
            resp = await client.get(
                "https://api.openai.com/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
    except httpx.HTTPError as e:
        raise ProviderError(f"OpenAI 연결에 실패했습니다: {e}") from e
    if resp.status_code == 401:
        raise BadRequestError("OpenAI 키가 유효하지 않습니다.")
    if resp.status_code >= 400:
        raise ProviderError(f"OpenAI 키 검증 실패 ({resp.status_code}).")


def _require_supported(provider: str) -> None:
    if provider not in SUPPORTED_PROVIDERS:
        raise BadRequestError(
            f"'{provider}' 는 아직 지원하지 않습니다. 지원: {', '.join(SUPPORTED_PROVIDERS)}"
        )


@router.get("/keys")
def list_keys(store: CredentialStore = Depends(get_credential_store)) -> list[dict]:
    return store.describe_all()


@router.post("/keys")
async def save_key(
    req: KeyRequest,
    store: CredentialStore = Depends(get_credential_store),
) -> dict:
    _require_supported(req.provider)
    api_key = req.api_key.strip()
    if not api_key:
        raise BadRequestError("API 키를 입력해 주세요.")

    await _verify_openai(api_key)

    admin_key = (req.admin_key or "").strip()
    store.set(req.provider, api_key=api_key, admin_key=admin_key)
    logger.info("stored user credential for %s (admin key: %s)", req.provider, bool(admin_key))
    return store.describe(req.provider)


@router.post("/keys/{provider}/test")
async def test_key(
    provider: str,
    store: CredentialStore = Depends(get_credential_store),
) -> dict:
    _require_supported(provider)
    api_key = store.api_key(provider)
    if not api_key:
        raise BadRequestError("연결된 키가 없습니다.")
    await _verify_openai(api_key)
    return {"ok": True, **store.describe(provider)}


@router.delete("/keys/{provider}")
def delete_key(
    provider: str,
    store: CredentialStore = Depends(get_credential_store),
) -> dict:
    _require_supported(provider)
    store.delete(provider)
    return store.describe(provider)
