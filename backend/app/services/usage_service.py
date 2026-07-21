"""Provider usage reporting (feeds ModelPicker and, later, the dashboard).

Two sources, in order of authority:

1. **The provider's own usage API** — the real numbers for the logged-in user.
   OpenAI exposes this at `/v1/organization/usage/completions`, but it requires an
   **Admin key** (`sk-admin-…`); a normal project key cannot read organization usage.
2. **Local tally** — tokens this app itself spent. Always available, but only covers
   what went through Vibe Studio. Reported with `source: "local"` so the UI can say so.
"""

from __future__ import annotations

import logging
import time
from collections import defaultdict
from typing import Any

import httpx

from ..errors import ProviderError

logger = logging.getLogger(__name__)

_OPENAI_USAGE_URL = "https://api.openai.com/v1/organization/usage/completions"
_OPENAI_COSTS_URL = "https://api.openai.com/v1/organization/costs"
_TIMEOUT_S = 30
_MAX_PAGES = 20


def format_tokens(n: int) -> str:
    """12400 -> '12.4k' — matches the frontend's existing `tokens` strings."""
    if n < 1000:
        return str(n)
    if n < 1_000_000:
        return f"{n / 1000:.1f}k".replace(".0k", "k")
    return f"{n / 1_000_000:.1f}M".replace(".0M", "M")


class UsageService:
    def __init__(self) -> None:
        # provider -> model -> {"input_tokens", "output_tokens", "requests"}
        self._local: dict[str, dict[str, dict[str, int]]] = defaultdict(
            lambda: defaultdict(lambda: {"input_tokens": 0, "output_tokens": 0, "requests": 0})
        )

    # ---- local tally ----------------------------------------------------------

    def record(
        self, provider: str, model: str, *, input_tokens: int = 0, output_tokens: int = 0
    ) -> None:
        entry = self._local[provider][model or "default"]
        entry["input_tokens"] += max(0, int(input_tokens or 0))
        entry["output_tokens"] += max(0, int(output_tokens or 0))
        entry["requests"] += 1

    def local_usage(self, provider: str) -> dict[str, Any]:
        models = self._local.get(provider, {})
        by_model = [
            {
                "model": model,
                "inputTokens": v["input_tokens"],
                "outputTokens": v["output_tokens"],
                "totalTokens": v["input_tokens"] + v["output_tokens"],
                "requests": v["requests"],
            }
            for model, v in models.items()
        ]
        by_model.sort(key=lambda m: -m["totalTokens"])
        total = sum(m["totalTokens"] for m in by_model)
        return {
            "provider": provider,
            "source": "local",
            "totalTokens": total,
            "tokens": format_tokens(total),
            "requests": sum(m["requests"] for m in by_model),
            "cost": None,
            "byModel": by_model,
        }

    # ---- provider usage API ---------------------------------------------------

    async def fetch_openai(self, admin_key: str, *, days: int = 30) -> dict[str, Any]:
        """Real organization usage. Requires an Admin key — a project key returns 401."""
        start_time = int(time.time()) - days * 86400
        headers = {"Authorization": f"Bearer {admin_key}"}

        totals: dict[str, dict[str, int]] = defaultdict(
            lambda: {"input_tokens": 0, "output_tokens": 0, "requests": 0}
        )
        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
                page: str | None = None
                for _ in range(_MAX_PAGES):
                    params: dict[str, Any] = {
                        "start_time": start_time,
                        "bucket_width": "1d",
                        "group_by": ["model"],
                        "limit": 31,
                    }
                    if page:
                        params["page"] = page
                    resp = await client.get(_OPENAI_USAGE_URL, headers=headers, params=params)
                    # A project key is *authenticated* but not *authorised* for org
                    # endpoints, so OpenAI answers 403 (401 only for a bad key).
                    # Both mean the same thing to the user: this needs an Admin key.
                    if resp.status_code in (401, 403):
                        raise ProviderError(
                            "OpenAI 사용량 조회에는 Admin 키(sk-admin-…)가 필요합니다. "
                            "일반 프로젝트 키로는 조직 사용량을 읽을 수 없습니다.",
                            http_status=400,
                        )
                    resp.raise_for_status()
                    body = resp.json()
                    for bucket in body.get("data", []):
                        for result in bucket.get("results", []):
                            model = result.get("model") or "unknown"
                            t = totals[model]
                            t["input_tokens"] += int(result.get("input_tokens") or 0)
                            t["output_tokens"] += int(result.get("output_tokens") or 0)
                            t["requests"] += int(result.get("num_model_requests") or 0)
                    page = body.get("next_page")
                    if not page:
                        break

                cost = await self._fetch_openai_cost(client, headers, start_time)
        except ProviderError:
            raise
        except httpx.HTTPError as e:
            raise ProviderError(f"OpenAI 사용량 조회에 실패했습니다: {e}") from e

        by_model = [
            {
                "model": model,
                "inputTokens": v["input_tokens"],
                "outputTokens": v["output_tokens"],
                "totalTokens": v["input_tokens"] + v["output_tokens"],
                "requests": v["requests"],
            }
            for model, v in totals.items()
        ]
        by_model.sort(key=lambda m: -m["totalTokens"])
        total = sum(m["totalTokens"] for m in by_model)
        return {
            "provider": "openai",
            "source": "openai",
            "periodDays": days,
            "totalTokens": total,
            "tokens": format_tokens(total),
            "requests": sum(m["requests"] for m in by_model),
            "cost": cost,
            "byModel": by_model,
        }

    @staticmethod
    async def _fetch_openai_cost(
        client: httpx.AsyncClient, headers: dict[str, str], start_time: int
    ) -> dict[str, Any] | None:
        """Costs are a separate endpoint and only support 1d buckets."""
        try:
            resp = await client.get(
                _OPENAI_COSTS_URL,
                headers=headers,
                params={"start_time": start_time, "bucket_width": "1d", "limit": 31},
            )
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.warning("openai cost lookup failed: %s", e)
            return None

        total = 0.0
        currency = "usd"
        for bucket in resp.json().get("data", []):
            for result in bucket.get("results", []):
                amount = result.get("amount") or {}
                total += float(amount.get("value") or 0)
                currency = amount.get("currency") or currency
        return {"value": round(total, 4), "currency": currency}
