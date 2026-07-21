"""Reference harness: expose `sa-redteam` as a `red_team` tool for an LLM tool-use agent.

Flow when the agent calls the `red_team` tool:
  agent tool_use(input) ->
    build_request()      # merge agent input + harness context (project root, user prompt,
                         #   optional upstream coding_flow / security_hints)
    run `sa-redteam run` as a subprocess (isolated from the agent process)
    format_tool_result() # compact, actionable summary returned as the tool_result

The scanner's deterministic file:line locations are authoritative; the LLM inside
sa-redteam is advisory on severity/fix. Porting to TypeScript / the Claude Agent SDK only
changes the subprocess call and the tool-result formatting.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass


@dataclass
class RedTeamConfig:
    binary: str = os.environ.get("SA_REDTEAM_BIN", "./build/sa-redteam")
    project_root: str = "."
    backend: str = "fake"        # "fake" for the fast dev loop; "direct" for the real audit
    model: str = "claude-opus-4-8"
    api_key_env: str = "SA_LLM_API_KEY"   # read by sa-redteam itself, never passed inline
    max_findings: int = 40
    timeout_s: int = 300


def build_request(tool_input: dict, cfg: RedTeamConfig, *, user_prompt: str = "",
                  coding_flow: dict | None = None,
                  security_hints: list | None = None) -> dict:
    """Assemble the sa-redteam request from agent input + harness-managed context."""
    signals: dict = {
        "user_prompt": user_prompt,
        "goals": tool_input.get("goals", []),
        "model_output": tool_input.get("model_output", ""),
    }
    # Upstream summarize/merge LLM stages fill these when available; omitted otherwise
    # (sa-redteam falls back to its own lightweight inference).
    if coding_flow is not None:
        signals["coding_flow"] = coding_flow
    if security_hints:
        signals["security_hints"] = security_hints

    backend: dict = {"kind": cfg.backend}
    if cfg.backend == "direct":
        backend["direct"] = {
            "provider": "anthropic",
            "model": cfg.model,
            "api_key_env": cfg.api_key_env,
        }

    return {
        "schema_version": "1.0",
        "signals": signals,
        "project": {
            "root": cfg.project_root,
            "include": ["**/*"],
            "exclude": ["build/**", "node_modules/**", ".git/**"],
            "changed_files": tool_input.get("changed_files", []),
        },
        "backend": backend,
        "limits": {"max_findings": cfg.max_findings},
    }


def run_red_team(tool_input: dict, cfg: RedTeamConfig | None = None, **ctx) -> dict:
    """Run sa-redteam as a subprocess and return the parsed report (or an error)."""
    cfg = cfg or RedTeamConfig()
    request = build_request(tool_input, cfg, **ctx)
    try:
        proc = subprocess.run(
            [cfg.binary, "run", "--backend", cfg.backend, "--compact"],
            input=json.dumps(request),
            capture_output=True, text=True, timeout=cfg.timeout_s,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired) as e:
        return {"ok": False, "error": f"could not run sa-redteam: {e}"}
    if proc.returncode != 0:
        return {"ok": False, "error": proc.stderr.strip() or f"exit code {proc.returncode}"}
    return {"ok": True, "report": json.loads(proc.stdout)}


_SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def format_tool_result(result: dict, top: int | None = 12) -> str:
    """Render a compact tool_result string for the agent to act on."""
    if not result.get("ok"):
        return f"red_team failed: {result.get('error')}"
    findings = result["report"]["findings"]
    if not findings:
        return ("red_team: no findings. The deterministic filter and probes found no "
                "issues in the scanned regions.")
    ranked = sorted(findings, key=lambda f: (_SEV_ORDER.get(f["severity"], 9),
                                             -f.get("confidence", 0.0)))
    shown = ranked[:top] if top else ranked
    lines = [f"red_team: {len(findings)} finding(s). Fix the high/critical ones, then call "
             f"red_team again on the changed files to confirm."]
    for f in shown:
        loc = f["location"]
        fn = loc.get("function", "")
        lines.append(
            f"- [{f['severity'].upper()}] {f['category']} @ {loc['file']}:{loc['start_line']}"
            f"{(' (' + fn + ')') if fn else ''}\n"
            f"    {f.get('title', '')}\n"
            f"    fix: {f.get('suggested_fix', '')}")
    if top and len(ranked) > top:
        lines.append(f"...and {len(ranked) - top} more (see the full report).")
    return "\n".join(lines)


if __name__ == "__main__":
    # Smoke test against the bundled vulnerable fixture (run from the repo root).
    cfg = RedTeamConfig(project_root="tests/fixtures/projects/vuln_sample")
    res = run_red_team(
        {"goals": ["shell command execution", "file upload"],
         "changed_files": ["app.py"],
         "model_output": "added os.system and child_process.exec handlers"},
        cfg,
        user_prompt="add a ping endpoint and file download that run shell commands",
    )
    print(format_tool_result(res))
