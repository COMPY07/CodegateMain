"""Validates the OpenAI red-team adjudication merge logic with a mocked client.

Proves the gpt-4o path (confirm / dismiss / severity promotion) works without needing
a real API key or network. The deterministic file:line stays authoritative throughout.
"""

import json
from types import SimpleNamespace

from app.config import get_settings
from app.services.security_service import SecurityService

_VERDICTS = {
    "confirm.py": {
        "vulnerable": True,
        "severity": "critical",
        "confidence": 0.92,
        "rationale": "사용자 입력이 셸로 직접 전달되어 실제 악용이 가능합니다.",
        "suggested_fix": "shell=False 로 고정 argv 를 전달하세요.",
    },
    "dismiss.py": {
        "vulnerable": False,
        "confidence": 0.85,
        "rationale": "상수 문자열만 사용해 외부 입력이 닿지 않습니다.",
    },
}


class _FakeCompletions:
    async def create(self, **kwargs):
        prompt = kwargs["messages"][1]["content"]
        key = "confirm.py" if "confirm.py" in prompt else "dismiss.py"
        content = json.dumps(_VERDICTS[key], ensure_ascii=False)
        return SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )


def _service_with_fake_llm() -> SecurityService:
    settings = get_settings().model_copy(
        update={"openai_api_key": "test-key", "redteam_model": "gpt-4o"}
    )
    service = SecurityService(settings)
    service._openai_client = SimpleNamespace(
        chat=SimpleNamespace(completions=_FakeCompletions())
    )
    return service


def _finding(file: str, severity: str = "medium", confidence: float = 0.5) -> dict:
    return {
        "id": f"RT-{file}",
        "severity": severity,
        "category": "command-injection",
        "cwe": ["CWE-78"],
        "file": file,
        "startLine": 15,
        "endLine": 15,
        "function": "ping",
        "title": "Possible command injection",
        "rationale": "heuristic",
        "suggestedFix": "heuristic fix",
        "confidence": confidence,
        "source": "heuristic",
        "status": "suspected",
        "codeSlice": 'os.system("ping " + host)',
        "matchedPattern": "sink:system",
        "signals": ["sink:os_system"],
    }


async def test_llm_confirms_and_promotes():
    service = _service_with_fake_llm()
    f = _finding("confirm.py")
    await service._llm_pass([f])

    assert f["source"] == "both"           # heuristic + llm agreed
    assert f["severity"] == "critical"     # LLM promoted severity
    assert f["confidence"] == 0.92
    assert f["status"] == "confirmed"      # >= 0.75
    assert "악용이 가능" in f["rationale"]
    assert "shell=False" in f["suggestedFix"]
    # deterministic location stays authoritative
    assert f["file"] == "confirm.py" and f["startLine"] == 15


async def test_llm_dismisses_false_positive():
    service = _service_with_fake_llm()
    f = _finding("dismiss.py", severity="high", confidence=0.6)
    await service._llm_pass([f])

    assert f["status"] == "dismissed"
    assert f["confidence"] <= 0.6
    assert "오탐 판정" in f["rationale"]
    assert f["file"] == "dismiss.py" and f["startLine"] == 15


async def test_dismissed_findings_excluded_from_prevented_count():
    service = _service_with_fake_llm()
    confirmed = _finding("confirm.py", severity="high")
    dismissed = _finding("dismiss.py", severity="high")
    await service._llm_pass([confirmed, dismissed])

    prevented = [
        f for f in (confirmed, dismissed)
        if f["severity"] in {"high", "critical"} and f["status"] != "dismissed"
    ]
    assert len(prevented) == 1
    assert prevented[0]["file"] == "confirm.py"


async def test_llm_failure_keeps_heuristic_finding():
    """A failing probe must not lose the deterministic finding."""

    class _Boom:
        async def create(self, **kwargs):
            raise RuntimeError("upstream down")

    settings = get_settings().model_copy(update={"openai_api_key": "test-key"})
    service = SecurityService(settings)
    service._openai_client = SimpleNamespace(chat=SimpleNamespace(completions=_Boom()))

    f = _finding("confirm.py")
    await service._llm_pass([f])

    assert f["source"] == "heuristic"
    assert f["status"] == "suspected"
    assert f["severity"] == "medium"
