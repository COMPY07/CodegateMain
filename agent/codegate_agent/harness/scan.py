"""Security scan, split across the two machines it has to live on.

The deterministic half runs here: `sa-redteam` reads the user's files, so it can only
run where those files are. The adversarial half needs the operator's gpt-4o key, which
must never leave the server, so the findings — file/line/category plus the code slice
already extracted — are POSTed to the backend for judgment.

If the backend is unreachable the heuristic findings still stand on their own, and the
caller is told the judgment was skipped rather than being shown a quietly weaker result.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

_SCAN_EXCLUDES = [
    "**/node_modules/**",
    "**/.git/**",
    "**/dist/**",
    "**/build/**",
    "**/.vite/**",
    "**/__pycache__/**",
    "**/package-lock.json",
    "**/yarn.lock",
    "**/pnpm-lock.yaml",
    "**/*.lock",
    "**/*.min.js",
    "**/*.map",
]

_SEVERITY_BY_CONFIDENCE = (
    (0.85, "critical"),
    (0.7, "high"),
    (0.45, "medium"),
    (0.0, "low"),
)

_SCAN_TIMEOUT_S = 120
_ADJUDICATE_TIMEOUT_S = 90


def find_redteam_bin(explicit: str = "") -> str:
    """Locate sa-redteam: explicit path, env, PATH, then the in-repo build."""
    for candidate in (explicit, os.environ.get("SA_REDTEAM_BIN", "")):
        if candidate and Path(candidate).is_file():
            return candidate
    found = shutil.which("sa-redteam")
    if found:
        return found
    here = Path(__file__).resolve()
    for parent in here.parents:
        guess = parent / "redteam" / "build" / "sa-redteam"
        if guess.is_file():
            return str(guess)
    return ""


class LocalScanner:
    def __init__(self, *, workspace: Path, redteam_bin: str = "", backend_url: str = ""):
        self._workspace = workspace
        self._bin = find_redteam_bin(redteam_bin)
        self._backend = backend_url.rstrip("/")

    @property
    def available(self) -> bool:
        return bool(self._bin) and Path(self._bin).is_file()

    # ---- deterministic half (this machine) ------------------------------------

    def _request(self, changed_files: list[str], user_prompt: str, model_output: str) -> dict:
        return {
            "schema_version": "1.0",
            "signals": {
                "user_prompt": user_prompt,
                "goals": [],
                "model_output": model_output,
            },
            "project": {
                # sa-redteam silently finds nothing when the root is relative.
                "root": str(self._workspace.resolve()),
                "include": ["**/*"],
                "exclude": list(_SCAN_EXCLUDES),
                "changed_files": changed_files,
            },
            "backend": {"kind": "fake"},
            "limits": {"max_findings": 100},
        }

    def _run_binary(self, payload: dict) -> dict:
        proc = subprocess.run(
            [self._bin, "run", "--backend", "fake", "--compact"],
            input=json.dumps(payload),
            capture_output=True,
            text=True,
            timeout=_SCAN_TIMEOUT_S,
            cwd=str(self._workspace),
        )
        if proc.returncode != 0:
            raise RuntimeError(f"sa-redteam exited {proc.returncode}: {proc.stderr[-300:]}")
        return json.loads(proc.stdout or "{}")

    @staticmethod
    def _severity(confidence: float) -> str:
        for floor, name in _SEVERITY_BY_CONFIDENCE:
            if confidence >= floor:
                return name
        return "low"

    def _map(self, raw: dict, only: list[str]) -> list[dict]:
        """Report shape -> the studio's finding shape, restricted to `only`."""
        wanted = set(only)
        out: list[dict] = []
        for f in raw.get("findings") or []:
            loc = f.get("location") or {}
            file = loc.get("file")
            # sa-redteam reports project-wide; a per-file gate must filter itself.
            if wanted and file not in wanted:
                continue
            ev = f.get("evidence") or {}
            confidence = float(f.get("confidence") or 0.0)
            out.append(
                {
                    "id": f.get("id"),
                    "severity": f.get("severity") or self._severity(confidence),
                    "category": str(f.get("category") or "other"),
                    "file": file,
                    "function": loc.get("function"),
                    "startLine": loc.get("start_line"),
                    "endLine": loc.get("end_line"),
                    "confidence": confidence,
                    "codeSlice": ev.get("code_slice"),
                    "matchedPattern": ev.get("matched_pattern"),
                    "signals": ev.get("signals") or [],
                    "cwe": f.get("cwe") or [],
                    "title": f.get("title") or f.get("category"),
                    "suggestedFix": f.get("suggested_fix") or f.get("fix_hint"),
                    "rationale": f.get("rationale"),
                    "status": "suspected",
                    "source": "heuristic",
                }
            )
        return out

    # ---- adversarial half (the server holds the key) ---------------------------

    def _post_adjudicate(self, findings: list[dict]) -> dict | None:
        if not self._backend or not findings:
            return None
        body = json.dumps({"findings": findings}).encode("utf-8")
        req = urllib.request.Request(
            f"{self._backend}/api/adjudicate",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=_ADJUDICATE_TIMEOUT_S) as resp:
                return json.loads(resp.read() or b"{}")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
            logger.warning("adjudication unavailable: %s", e)
            return None

    # ---- public ---------------------------------------------------------------

    async def scan(
        self,
        changed_files: list[str],
        *,
        user_prompt: str = "",
        model_output: str = "",
        use_llm: bool = True,
    ) -> dict[str, Any]:
        if not self.available:
            return {
                "findings": [],
                "preventedCount": 0,
                "llm": None,
                "note": "sa-redteam 실행 파일을 찾을 수 없어 검사를 건너뛰었습니다.",
            }

        payload = self._request(changed_files, user_prompt, model_output)
        try:
            raw = await asyncio.to_thread(self._run_binary, payload)
        except (OSError, ValueError, RuntimeError, subprocess.SubprocessError) as e:
            logger.warning("local scan failed: %s", e)
            return {"findings": [], "preventedCount": 0, "llm": None, "note": f"검사 실패: {e}"}

        findings = self._map(raw, changed_files)
        llm = None
        note = ""
        if use_llm and findings:
            verdicts = await asyncio.to_thread(self._post_adjudicate, findings)
            if verdicts is None:
                note = "서버 판정을 사용할 수 없어 결정론 결과만 표시합니다."
            else:
                findings = verdicts.get("findings") or findings
                llm = verdicts.get("llm")

        prevented = sum(
            1
            for f in findings
            if f.get("severity") in ("high", "critical") and f.get("status") != "dismissed"
        )
        return {
            "findings": findings,
            "preventedCount": prevented,
            "llm": llm,
            "note": note,
            "stats": raw.get("run", {}).get("stats", {}),
        }
