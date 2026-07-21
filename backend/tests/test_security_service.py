"""Exercises the real sa-redteam binary against the bundled vulnerable fixture.

LLM adjudication is disabled here (use_llm=False) so the test is deterministic and
needs no network or API key. Skipped when the binary has not been built.

The fixture lives outside WORKSPACE_ROOT, so these tests build an *unconfined*
SecurityService on purpose. The confinement guard itself is covered separately.
"""

from pathlib import Path

import pytest

from app.config import Settings, get_settings
from app.deps import get_security_service
from app.errors import BadRequestError
from app.services.security_service import SecurityService

_REPO_ROOT = Path(__file__).resolve().parents[2]
_FIXTURE = _REPO_ROOT / "redteam" / "tests" / "fixtures" / "projects" / "vuln_sample"

pytestmark = pytest.mark.skipif(
    not (get_settings().sa_redteam_bin_path.is_file() and _FIXTURE.is_dir()),
    reason="sa-redteam binary or vuln_sample fixture not available",
)


def _unconfined() -> SecurityService:
    """SecurityService with no WORKSPACE_ROOT, so any absolute project_root is allowed."""
    base = get_settings()
    return SecurityService(
        base.model_copy(update={"workspace_root": "", "openai_api_key": ""})
    )


async def test_scan_detects_command_injection():
    result = await _unconfined().scan(
        project_root=str(_FIXTURE),
        changed_files=["app.py"],
        goals=["shell command execution"],
        model_output="added os.system handler",
        user_prompt="add a ping endpoint that runs shell commands",
        use_llm=False,
    )

    assert result["backend"] == "fake"
    assert result["llm"] is None
    assert result["stats"]["files"] >= 1

    findings = result["findings"]
    assert findings, "expected heuristic findings on the vulnerable fixture"

    app_py = [
        f for f in findings
        if f["category"] == "command-injection" and f["file"] == "app.py"
    ]
    assert app_py, "expected command-injection in app.py"

    f = app_py[0]
    assert f["severity"] == "critical"
    assert f["startLine"] > 0
    assert "CWE-78" in f["cwe"]
    assert f["source"] == "heuristic"
    assert f["codeSlice"] and f["suggestedFix"]

    # high/critical, non-dismissed findings feed the dashboard "예방한 보안 이슈" stat.
    assert result["preventedCount"] >= 1


async def test_scan_requires_root_when_no_workspace_configured():
    with pytest.raises(BadRequestError):
        await _unconfined().scan(project_root=None, changed_files=["app.py"], use_llm=False)


async def test_scan_confined_to_workspace_root(tmp_path):
    """With WORKSPACE_ROOT set, a project_root outside it is rejected."""
    ws = tmp_path / "ws"
    ws.mkdir()
    service = SecurityService(
        get_settings().model_copy(update={"workspace_root": str(ws)})
    )
    with pytest.raises(BadRequestError, match="inside WORKSPACE_ROOT"):
        await service.scan(
            project_root=str(_FIXTURE), changed_files=["app.py"], use_llm=False
        )


async def test_scan_endpoint_maps_findings(app, client):
    # The endpoint uses the configured (confined) service; override it for the fixture.
    # One shared instance, so the POST and the follow-up GET see the same runId cache.
    service = _unconfined()
    app.dependency_overrides[get_security_service] = lambda: service
    try:
        resp = await client.post(
            "/api/scan",
            json={
                "project_root": str(_FIXTURE),
                "changed_files": ["app.py"],
                "goals": ["shell command execution"],
                "use_llm": False,
            },
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["preventedCount"] >= 1
        assert any(f["category"] == "command-injection" for f in body["findings"])

        run_id = body["runId"]
        cached = await client.get(f"/api/scan/{run_id}")
        assert cached.status_code == 200
        assert cached.json()["runId"] == run_id
    finally:
        app.dependency_overrides.clear()


def test_relative_project_root_resolves_against_workspace(tmp_path):
    """A relative project_root must resolve against WORKSPACE_ROOT, not the process CWD."""
    ws = tmp_path / "ws"
    (ws / "pkg").mkdir(parents=True)
    service = SecurityService(
        get_settings().model_copy(update={"workspace_root": str(ws)})
    )
    assert service._resolve_root("pkg") == (ws / "pkg").resolve()


def test_scan_request_excludes_generated_files(tmp_path):
    """Lockfiles and vendored trees must stay out of the scan.

    npm integrity hashes (`sha512-…`) are high-entropy, so the secret scanner flags
    every one of them — a single package-lock.json produced 100 false positives that
    buried the real findings and burned LLM probes.
    """
    service = SecurityService(get_settings().model_copy(update={"workspace_root": str(tmp_path)}))
    req = service._build_request(
        root=tmp_path, changed_files=[], goals=[], model_output="", user_prompt=""
    )
    excludes = req["project"]["exclude"]
    for pattern in (
        "**/node_modules/**",
        "**/package-lock.json",
        "**/yarn.lock",
        "**/dist/**",
        "**/*.min.js",
    ):
        assert pattern in excludes, f"{pattern} must be excluded from scans"
    # Nested vendor dirs must match too, not just top-level ones.
    assert all(p.startswith("**/") for p in excludes if p.endswith("/**"))


def test_settings_workspace_root_path_is_absolute():
    s = Settings(WORKSPACE_ROOT="../workspace", _env_file=None)
    assert s.workspace_root_path is not None
    assert s.workspace_root_path.is_absolute()
