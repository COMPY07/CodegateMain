"""Security service (BE-006/BE-007).

Ports redteam/integration/red_team_tool.py, then adds an adversarial LLM red-team
pass on OpenAI (gpt-4o by default). The C++ deterministic core owns file:line
locations and signals (authoritative); the LLM is advisory on severity/fix and acts
as a false-positive adjudicator — mirroring sa-redteam's own design.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from pathlib import Path

from ..config import Settings
from ..errors import BadRequestError, SubprocessError
from .subprocess_runner import run_sa_redteam

logger = logging.getLogger(__name__)

_SEVERITY_RANK = {"info": 0, "low": 1, "medium": 2, "high": 3, "critical": 4}
_HIGH_SEVERITIES = {"high", "critical"}

# Paths that are not the developer's source. Lockfiles matter most: they are full of
# npm integrity hashes (`sha512-…`), which the entropy-based secret scanner flags as
# hardcoded secrets — one lockfile alone produced 100 false positives, burying the
# real findings and wasting LLM probes.
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

_PROBE_SYSTEM = (
    "You are a security red-teamer auditing code an AI coding agent just wrote. "
    "Examine ONLY the code region provided and decide whether it contains a real, "
    "exploitable vulnerability. Be adversarial but precise: do not invent issues."
)

_PROBE_SCHEMA_HINT = (
    'Respond with a JSON object: {"vulnerable": boolean, '
    '"severity": "info|low|medium|high|critical", "confidence": number 0..1, '
    '"rationale": string, "suggested_fix": string}.'
)


class SecurityService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._cache: dict[str, dict] = {}
        self._openai_client = None

    # ---- request assembly (ported from red_team_tool.build_request) --------------

    def _resolve_root(self, project_root: str | None) -> Path:
        ws_root = self._settings.workspace_root_path
        if project_root:
            root = Path(project_root).expanduser()
            # A relative project_root is interpreted against the workspace, never the
            # server process CWD (which varies with how the server was launched).
            if not root.is_absolute() and ws_root is not None:
                root = ws_root / root
        elif ws_root is not None:
            root = ws_root
        else:
            raise BadRequestError(
                "project_root is required (no WORKSPACE_ROOT configured)."
            )
        root = root.resolve()
        if not root.is_dir():
            raise BadRequestError(f"project_root is not a directory: {root}")
        # When a managed workspace is configured, confine scans inside it.
        if ws_root is not None and root != ws_root and ws_root not in root.parents:
            raise BadRequestError("project_root must be inside WORKSPACE_ROOT.")
        return root

    def _build_request(
        self,
        *,
        root: Path,
        changed_files: list[str],
        goals: list[str],
        model_output: str,
        user_prompt: str,
    ) -> dict:
        return {
            "schema_version": "1.0",
            "signals": {
                "user_prompt": user_prompt,
                "goals": goals,
                "model_output": model_output,
            },
            "project": {
                "root": str(root),
                "include": ["**/*"],
                "exclude": list(_SCAN_EXCLUDES),
                "changed_files": changed_files,
            },
            "backend": {"kind": "fake"},
            "limits": {"max_findings": 100},
        }

    # ---- mapping report -> frontend finding shape --------------------------------

    @staticmethod
    def _map_finding(f: dict) -> dict:
        loc = f.get("location", {})
        ev = f.get("evidence", {})
        return {
            "id": f.get("id"),
            "severity": f.get("severity", "info"),
            "category": f.get("category", "other"),
            "cwe": f.get("cwe", []),
            "file": loc.get("file", ""),
            "startLine": loc.get("start_line", 0),
            "endLine": loc.get("end_line", 0),
            "function": loc.get("function", ""),
            "title": f.get("title", ""),
            "rationale": f.get("rationale", ""),
            "suggestedFix": f.get("suggested_fix", ""),
            "confidence": f.get("confidence", 0.0),
            "source": f.get("source", "heuristic"),
            "status": f.get("status", "suspected"),
            "codeSlice": ev.get("code_slice", ""),
            "matchedPattern": ev.get("matched_pattern", ""),
            "signals": ev.get("signals", []),
        }

    # ---- LLM red-team pass (OpenAI gpt-4o) ---------------------------------------

    def _llm_available(self) -> bool:
        return bool(self._settings.openai_api_key)

    def _get_openai(self):
        if self._openai_client is None:
            import openai

            self._openai_client = openai.AsyncOpenAI(api_key=self._settings.openai_api_key)
        return self._openai_client

    async def _probe_one(self, finding: dict) -> None:
        """Run one adversarial probe and fold the verdict into `finding` in place."""
        code = finding.get("codeSlice") or ""
        if not code:
            return
        prompt = (
            f"File: {finding['file']}\n"
            f"Function: {finding.get('function') or '(module)'}\n"
            f"Lines: {finding['startLine']}-{finding['endLine']}\n"
            f"Suspected category: {finding['category']}\n"
            f"Code:\n```\n{code[:4000]}\n```\n\n{_PROBE_SCHEMA_HINT}"
        )
        try:
            client = self._get_openai()
            resp = await client.chat.completions.create(
                model=self._settings.redteam_model,
                messages=[
                    {"role": "system", "content": _PROBE_SYSTEM},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                max_tokens=600,
            )
            verdict = json.loads(resp.choices[0].message.content or "{}")
        except Exception as e:  # noqa: BLE001 — LLM is advisory; keep heuristic on any failure
            logger.warning("llm probe failed for %s: %s", finding.get("id"), e)
            return

        vulnerable = bool(verdict.get("vulnerable"))
        llm_conf = float(verdict.get("confidence", 0.0) or 0.0)
        if vulnerable:
            finding["source"] = "both"
            llm_sev = str(verdict.get("severity", "")).lower()
            if _SEVERITY_RANK.get(llm_sev, -1) >= _SEVERITY_RANK.get(finding["severity"], 0):
                finding["severity"] = llm_sev or finding["severity"]
            finding["confidence"] = max(finding["confidence"], llm_conf)
            if verdict.get("rationale"):
                finding["rationale"] = verdict["rationale"]
            if verdict.get("suggested_fix"):
                finding["suggestedFix"] = verdict["suggested_fix"]
            finding["status"] = "confirmed" if finding["confidence"] >= 0.75 else "suspected"
        else:
            # Adjudicated as a likely false positive.
            finding["status"] = "dismissed"
            finding["confidence"] = min(finding["confidence"], 1.0 - llm_conf)
            if verdict.get("rationale"):
                finding["rationale"] = f"[LLM: 오탐 판정] {verdict['rationale']}"

    def llm_available(self) -> bool:
        """Whether the operator supplied a red-team key."""
        return self._llm_available()

    @property
    def redteam_model(self) -> str:
        return self._settings.redteam_model

    async def adjudicate(self, findings: list[dict]) -> None:
        """Public entry point for findings produced elsewhere (the local agent)."""
        await self._llm_pass(findings)

    async def _llm_pass(self, findings: list[dict]) -> None:
        if not self._llm_available() or not findings:
            return
        # Probe the most severe findings first, bounded to control cost/latency.
        ranked = sorted(
            findings,
            key=lambda f: (-_SEVERITY_RANK.get(f["severity"], 0), -f["confidence"]),
        )
        targets = ranked[: self._settings.security_max_llm_probes]
        sem = asyncio.Semaphore(4)

        async def guarded(f: dict) -> None:
            async with sem:
                await self._probe_one(f)

        await asyncio.gather(*(guarded(f) for f in targets))

    # ---- public API --------------------------------------------------------------

    async def scan(
        self,
        *,
        project_root: str | None,
        changed_files: list[str],
        goals: list[str] | None = None,
        model_output: str = "",
        user_prompt: str = "",
        use_llm: bool = True,
    ) -> dict:
        root = self._resolve_root(project_root)
        request = self._build_request(
            root=root,
            changed_files=changed_files,
            goals=goals or [],
            model_output=model_output,
            user_prompt=user_prompt,
        )
        raw = await run_sa_redteam(
            bin_path=self._settings.sa_redteam_bin_path,
            request_json=json.dumps(request),
            backend="fake",
            timeout_s=self._settings.sa_redteam_timeout_s,
        )
        try:
            report = json.loads(raw)
        except json.JSONDecodeError as e:
            raise SubprocessError("sa-redteam returned invalid JSON", detail=str(e)) from e

        findings = [self._map_finding(f) for f in report.get("findings", [])]
        if use_llm:
            await self._llm_pass(findings)

        prevented = [
            f for f in findings
            if f["severity"] in _HIGH_SEVERITIES and f["status"] != "dismissed"
        ]
        run = report.get("run", {})
        result = {
            "runId": run.get("id", ""),
            "backend": "fake",
            "llm": self._settings.redteam_model if (use_llm and self._llm_available()) else None,
            "stats": run.get("stats", {}),
            "intentProfile": report.get("signal_summary", {}).get("intent_profile", {}),
            "findings": findings,
            "preventedCount": len(prevented),
            "errors": report.get("errors", []),
        }
        if result["runId"]:
            self._cache[result["runId"]] = result
        return result

    def get_cached(self, run_id: str) -> dict | None:
        return self._cache.get(run_id)

    def engine_available(self) -> bool:
        p = self._settings.sa_redteam_bin_path
        return p.is_file() and os.access(p, os.X_OK)
