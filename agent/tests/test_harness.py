"""Harness selection and the split scan.

The point of this module is *where* things run: the CLIs are authenticated by the
user's own login, so they must execute on this machine, and the operator's red-team
key must stay on the server.
"""

import json

import pytest

from codegate_agent.harness.analysis import AnalysisAgent, public_analysis_result
from codegate_agent.harness.run_state import AgentRunState
from codegate_agent.harness.runner import HarnessRunner
from codegate_agent.harness.scan import LocalScanner

# ---- harness selection -------------------------------------------------------


def test_status_reports_this_machine_not_a_server(tmp_path):
    status = HarnessRunner(workspace=tmp_path).status()

    assert status["workspace"] == str(tmp_path)
    assert status["workspaceExists"] is True
    assert set(status["models"]) == {"claude", "gpt"}
    assert all(isinstance(v, bool) for v in status["models"].values())


def test_missing_workspace_is_reported_not_hidden(tmp_path):
    status = HarnessRunner(workspace=tmp_path / "nope").status()
    assert status["workspaceExists"] is False


def test_status_exposes_manual_red_team_and_completion_analysis(tmp_path):
    status = HarnessRunner(workspace=tmp_path).status()

    assert status["redTeam"]["trigger"] == "개발 중 수동 호출"
    assert status["analysis"]["trigger"] == "message_done 직전"
    assert status["analysis"]["verdicts"] == ["SUPPORTED", "REFUTED", "INCONCLUSIVE"]


def test_gpt_requires_a_local_codex_login(tmp_path, monkeypatch):
    monkeypatch.setattr("codegate_agent.harness.runner.codex_available", lambda: False)
    runner = HarnessRunner(workspace=tmp_path)

    with pytest.raises(RuntimeError, match="codex login"):
        runner.stream(model="gpt", session_id=1, prompt="안녕")


def test_claude_requires_a_local_claude_login(tmp_path, monkeypatch):
    monkeypatch.setattr("codegate_agent.harness.runner.claude_available", lambda: False)
    runner = HarnessRunner(workspace=tmp_path)

    with pytest.raises(RuntimeError, match="claude"):
        runner.stream(model="claude", session_id=1, prompt="안녕")


def test_unknown_model_falls_back_to_claude(tmp_path, monkeypatch):
    monkeypatch.setattr("codegate_agent.harness.runner.claude_available", lambda: False)
    runner = HarnessRunner(workspace=tmp_path)
    # 오탈자든 새 모델이든 Codex 로 새면 안 된다 — 기본은 Claude.
    with pytest.raises(RuntimeError, match="claude"):
        runner.stream(model="gtp", session_id=1, prompt="안녕")


# ---- the scan split ----------------------------------------------------------


def _pretend_installed(scanner, tmp_path):
    """`available` is a property, so point it at a real (dummy) file instead."""
    fake = tmp_path / "sa-redteam"
    fake.write_text("#!/bin/sh\nexit 0\n")
    scanner._bin = str(fake)


def _report(findings):
    return {"findings": findings, "run": {"stats": {}}}


def _finding(file="src/a.js", category="command-injection"):
    return {
        "id": "RT-0001",
        "severity": "high",
        "category": category,
        "confidence": 0.8,
        "location": {"file": file, "start_line": 3, "end_line": 5, "function": "f"},
        "evidence": {"code_slice": "exec(x)", "matched_pattern": "sink:exec"},
    }


def test_findings_are_filtered_to_the_scanned_file(tmp_path):
    """sa-redteam reports project-wide; a per-file gate must filter itself.

    Not doing this made another file's vulnerability look like this file's, which is
    exactly how a clean file gets reported as vulnerable (and vice versa).
    """
    scanner = LocalScanner(workspace=tmp_path)
    mapped = scanner._map(_report([_finding("src/a.js"), _finding("src/other.js")]), ["src/a.js"])

    assert [f["file"] for f in mapped] == ["src/a.js"]


def test_mapping_keeps_the_code_slice_for_server_side_judgment(tmp_path):
    """The server never reads the user's files, so the slice has to travel with it."""
    mapped = LocalScanner(workspace=tmp_path)._map(_report([_finding()]), ["src/a.js"])
    assert mapped[0]["codeSlice"] == "exec(x)"
    assert mapped[0]["source"] == "heuristic"
    assert mapped[0]["status"] == "suspected"


async def test_scan_without_the_binary_says_so(tmp_path):
    scanner = LocalScanner(workspace=tmp_path, redteam_bin="/definitely/not/here")
    scanner._bin = ""  # simulate "not found anywhere"

    result = await scanner.scan(["src/a.js"])
    assert result["findings"] == []
    assert "sa-redteam" in result["note"]


async def test_unreachable_backend_keeps_the_deterministic_result(tmp_path, monkeypatch):
    """A server outage must not silently downgrade the gate to 'all clear'."""
    scanner = LocalScanner(workspace=tmp_path, backend_url="http://127.0.0.1:1")
    _pretend_installed(scanner, tmp_path)
    monkeypatch.setattr(
        scanner, "_run_binary", lambda payload: _report([_finding()]), raising=False
    )
    monkeypatch.setattr(scanner, "_post_adjudicate", lambda findings: None, raising=False)

    result = await scanner.scan(["src/a.js"])
    assert len(result["findings"]) == 1, "판정 실패가 취약점을 지워서는 안 된다"
    assert result["preventedCount"] == 1
    assert result["llm"] is None
    assert "판정" in result["note"]


async def test_server_verdicts_replace_the_heuristic_ones(tmp_path, monkeypatch):
    scanner = LocalScanner(workspace=tmp_path, backend_url="http://server")
    judged = dict(_finding())
    judged.update({"status": "dismissed", "source": "both", "file": "src/a.js"})

    _pretend_installed(scanner, tmp_path)
    monkeypatch.setattr(
        scanner, "_run_binary", lambda payload: _report([_finding()]), raising=False
    )
    monkeypatch.setattr(
        scanner, "_post_adjudicate",
        lambda findings: {"findings": [judged], "llm": "gpt-4o"},
        raising=False,
    )

    result = await scanner.scan(["src/a.js"])
    assert result["llm"] == "gpt-4o"
    assert result["findings"][0]["status"] == "dismissed"
    # dismissed 는 막을 것이 없다는 뜻이다.
    assert result["preventedCount"] == 0


def test_scan_request_uses_an_absolute_root(tmp_path):
    """A relative root makes sa-redteam silently return nothing."""
    payload = LocalScanner(workspace=tmp_path)._request(["src/a.js"], "prompt", "out")
    root = payload["project"]["root"]

    assert root == str(tmp_path.resolve())
    assert "**/node_modules/**" in payload["project"]["exclude"]
    assert payload["backend"]["kind"] == "fake", "결정론 스캔은 네트워크를 타지 않는다"


def test_scan_request_is_json_serialisable(tmp_path):
    payload = LocalScanner(workspace=tmp_path)._request(["a.js"], "p", "o")
    json.dumps(payload)  # must not raise


# ---- completion evidence analysis ------------------------------------------


def _proof_input(resource="Invoice"):
    return {
        "proof": {
            "template": "EFFECT_REQUIRES_RELATION",
            "targetEffect": {"kind": "DB_DELETE", "resource": resource},
            "entrypoint": {"nodeId": "entry:1"},
        }
    }


def test_analysis_uses_engine_verdict_not_agent_prose(tmp_path):
    analyzer = AnalysisAgent(workspace=tmp_path)
    proof = _proof_input()
    results = [
        ("security_index", {}, {"effectCount": 1}),
        ("security_inventory", {}, {"effects": [{"effectKind": "DB_DELETE"}]}),
        (
            "security_prove",
            proof,
            {"result": {"verdict": "SUPPORTED", "witnessPath": {"steps": []}}},
        ),
        ("security_evidence", proof, {"verdict": "SUPPORTED"}),
        ("security_slice", proof, {"slices": []}),
        ("security_scan", {}, {"findings": []}),
    ]

    result = analyzer._compile_agent_result(
        results,
        {"summary": "모델은 안전하다고 생각함", "hypotheses": []},
    )

    assert result["overallVerdict"] == "SUPPORTED"
    assert result["protocol"]["complete"] is True
    assert public_analysis_result(result)["supported"] == 1


def test_analysis_is_inconclusive_when_required_evidence_is_missing(tmp_path):
    analyzer = AnalysisAgent(workspace=tmp_path)
    proof = _proof_input()
    result = analyzer._compile_agent_result(
        [
            ("security_index", {}, {"effectCount": 1}),
            ("security_inventory", {}, {"effects": [{"effectKind": "DB_DELETE"}]}),
            ("security_prove", proof, {"result": {"verdict": "SUPPORTED"}}),
            ("security_scan", {}, {"findings": []}),
        ],
        {},
    )

    assert result["overallVerdict"] == "INCONCLUSIVE"
    assert result["protocol"]["complete"] is False


async def test_analysis_skips_audit_model_when_inventory_has_no_effects(
    tmp_path, monkeypatch
):
    analysis_root = tmp_path / "analysis"
    server = analysis_root / "packages/mcp-server/dist/server.js"
    server.parent.mkdir(parents=True)
    server.write_text("// test entry")
    analyzer = AnalysisAgent(workspace=tmp_path, analysis_root=analysis_root)
    bridge = {
        "index": {"effectCount": 0},
        "inventory": {"effects": []},
        "audit": {"findings": []},
        "scan": {"findings": []},
    }

    async def fake_bridge():
        return bridge

    async def must_not_run(*_args, **_kwargs):
        raise AssertionError("effect 없는 프로젝트에서 감사 모델을 호출하면 안 됨")

    monkeypatch.setattr(analyzer, "_run_bridge", fake_bridge)
    monkeypatch.setattr(analyzer, "_run_claude_audit", must_not_run)

    result = await analyzer.audit(task="완료")
    assert result["mode"] == "deterministic-no-effects"
    assert result["overallVerdict"] == "INCONCLUSIVE"
    assert result["protocol"]["complete"] is True


def test_run_state_marks_inconclusive_analysis_as_needing_review():
    state = AgentRunState(1, "개발")
    state.analysis_start(["src/api.ts"])
    state.analysis_result(
        {
            "overallVerdict": "INCONCLUSIVE",
            "proofs": [{"verdict": "INCONCLUSIVE"}],
            "scan": {"findings": []},
            "protocol": {"complete": True},
        }
    )

    analysis = state.snapshot()["subs"][0]
    assert analysis["name"] == "증거 분석기"
    assert analysis["status"] == "failed"
    assert "확인 필요" in analysis["current"]
