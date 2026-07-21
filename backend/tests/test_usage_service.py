"""Usage reporting: provider API when an Admin key exists, local tally otherwise."""

import httpx
import pytest

from app.errors import ProviderError
from app.services.usage_service import UsageService, format_tokens


def test_format_tokens():
    assert format_tokens(0) == "0"
    assert format_tokens(999) == "999"
    assert format_tokens(12400) == "12.4k"
    assert format_tokens(22100) == "22.1k"
    assert format_tokens(2_000_000) == "2M"


def test_local_tally_accumulates_per_model():
    usage = UsageService()
    usage.record("openai", "gpt-4o", input_tokens=100, output_tokens=50)
    usage.record("openai", "gpt-4o", input_tokens=10, output_tokens=5)
    usage.record("openai", "gpt-4o-mini", input_tokens=7, output_tokens=3)

    report = usage.local_usage("openai")
    assert report["source"] == "local"
    assert report["totalTokens"] == 175
    assert report["tokens"] == "175"
    assert report["requests"] == 3
    # most-used model first
    assert report["byModel"][0]["model"] == "gpt-4o"
    assert report["byModel"][0]["totalTokens"] == 165


def test_local_usage_for_unknown_provider_is_empty():
    report = UsageService().local_usage("openai")
    assert report["totalTokens"] == 0 and report["byModel"] == []


def _mock_transport(handler):
    return httpx.MockTransport(handler)


async def test_fetch_openai_aggregates_buckets(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if "usage/completions" in str(request.url):
            return httpx.Response(200, json={
                "data": [
                    {"results": [
                        {"model": "gpt-4o", "input_tokens": 1000, "output_tokens": 200,
                         "num_model_requests": 4},
                        {"model": "gpt-4o-mini", "input_tokens": 50, "output_tokens": 10,
                         "num_model_requests": 1},
                    ]},
                    {"results": [
                        {"model": "gpt-4o", "input_tokens": 500, "output_tokens": 100,
                         "num_model_requests": 2},
                    ]},
                ],
                "next_page": None,
            })
        return httpx.Response(200, json={"data": [
            {"results": [{"amount": {"value": 0.13, "currency": "usd"}}]},
            {"results": [{"amount": {"value": 0.07, "currency": "usd"}}]},
        ]})

    _patch_client(monkeypatch, handler)
    report = await UsageService().fetch_openai("sk-admin-test")

    assert report["source"] == "openai"
    assert report["totalTokens"] == 1000 + 200 + 50 + 10 + 500 + 100
    assert report["requests"] == 7
    assert report["byModel"][0]["model"] == "gpt-4o"
    assert report["byModel"][0]["totalTokens"] == 1800
    assert report["cost"] == {"value": 0.2, "currency": "usd"}


@pytest.mark.parametrize("status", [401, 403])
async def test_fetch_openai_rejects_project_key_with_clear_message(monkeypatch, status):
    """Explain the Admin-key requirement in plain terms.

    A project key is authenticated but not authorised for organization endpoints, so
    OpenAI answers **403** (verified against the live API); 401 only means a bad key.
    Both must surface the same guidance instead of a raw HTTP error.
    """
    _patch_client(monkeypatch, lambda req: httpx.Response(status, json={"error": "no"}))

    with pytest.raises(ProviderError, match="Admin"):
        await UsageService().fetch_openai("sk-proj-not-an-admin-key")


async def test_fetch_openai_follows_pagination(monkeypatch):
    pages = {
        None: {"data": [{"results": [{"model": "gpt-4o", "input_tokens": 10,
                                      "output_tokens": 0, "num_model_requests": 1}]}],
               "next_page": "cursor-2"},
        "cursor-2": {"data": [{"results": [{"model": "gpt-4o", "input_tokens": 5,
                                            "output_tokens": 0, "num_model_requests": 1}]}],
                     "next_page": None},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        if "usage/completions" not in str(request.url):
            return httpx.Response(200, json={"data": []})
        page = dict(request.url.params).get("page")
        return httpx.Response(200, json=pages[page])

    _patch_client(monkeypatch, handler)
    report = await UsageService().fetch_openai("sk-admin-test")
    assert report["totalTokens"] == 15


async def test_cost_failure_does_not_fail_the_whole_report(monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        if "usage/completions" in str(request.url):
            return httpx.Response(200, json={"data": [], "next_page": None})
        return httpx.Response(500, json={"error": "boom"})

    _patch_client(monkeypatch, handler)
    report = await UsageService().fetch_openai("sk-admin-test")
    assert report["cost"] is None
    assert report["totalTokens"] == 0


def _patch_client(monkeypatch, handler):
    """Route httpx.AsyncClient through a mock transport (no network)."""
    original = httpx.AsyncClient

    def factory(*args, **kwargs):
        kwargs["transport"] = _mock_transport(handler)
        return original(*args, **kwargs)

    monkeypatch.setattr("app.services.usage_service.httpx.AsyncClient", factory)


def test_claude_usage_is_not_tallied_here_anymore():
    """Claude/Codex 사용량은 백엔드가 세지 않는다.

    하네스가 사용자 PC 로 옮겨갔고, 두 CLI 는 자기 사용량을 `~/.claude` · `~/.codex` 에
    직접 기록한다. 로컬 수집기가 그 파일을 읽으므로 여기서 또 세면 이중 집계가 된다.
    백엔드의 로컬 집계는 사용자 키로 도는 직접 채팅(openai)만 담당한다.
    """
    usage = UsageService()
    usage.record("openai", "gpt-4o", input_tokens=10, output_tokens=5)

    assert usage.local_usage("openai")["totalTokens"] == 15
    assert usage.local_usage("claude_code")["totalTokens"] == 0
    assert usage.local_usage("codex")["totalTokens"] == 0
