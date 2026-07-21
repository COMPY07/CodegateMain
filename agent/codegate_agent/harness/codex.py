"""Codex CLI harness — the `gpt` model, backed by the user's Codex login.

Runs on the **user's machine**, not the server: `codex` is authenticated by that
user's own login, so executing it anywhere else would spend somebody else's account.

Mirrors `agent_service.AgentService`: same `stream()` contract, same event shapes, so
the frontend does not care which agent answered. The difference is how the two CLIs
are driven and, importantly, how each one is contained:

  Claude Code  in-process SDK; a PreToolUse hook denies Bash outright.
  Codex        subprocess `codex exec --json`; shell commands are *allowed* but run
               under Codex's own sandbox (`workspace-write`), which confines writes
               to the working root and blocks network access.

Blocking Codex's shell entirely is not an option — it is how Codex reads and edits —
so the sandbox is the control. `danger-full-access` is never used.

Auth is the installed `codex` login (`codex login status` → "Logged in using ChatGPT"),
so no OpenAI API key is involved and nothing is billed to the operator's red-team key.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from .run_state import AgentRunState
from .scan import LocalScanner

logger = logging.getLogger(__name__)

_SEVERITY_BLOCKING = ("high", "critical")
# Codex reads a lot of context; a slow turn should not hang the SSE stream forever.
_TURN_TIMEOUT_S = 600

CODEX_APPEND = """
You are the coding agent inside Vibe Studio. The user drives you from a visual studio UI,
not a terminal. Answer in Korean, concisely.

Every file you write is automatically security-scanned. Do not hardcode secrets,
interpolate untrusted input into shell/SQL/paths, or use eval.
"""


def codex_available() -> bool:
    """The `gpt` model needs the Codex CLI on PATH."""
    return shutil.which("codex") is not None


async def codex_logged_in() -> bool:
    """`codex login status` exits non-zero when no login is present."""
    if not codex_available():
        return False
    try:
        proc = await asyncio.create_subprocess_exec(
            "codex", "login", "status",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
            stdin=asyncio.subprocess.DEVNULL,
        )
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=15)
    except (TimeoutError, OSError):
        return False
    return proc.returncode == 0 and b"Logged in" in out


class CodexRun:
    def __init__(self, run_id: int, title: str):
        self.state = AgentRunState(run_id, title)
        self.queue: asyncio.Queue[dict] = asyncio.Queue()
        self.thread_id: str | None = None
        self.changed: list[str] = []
        self.rescans: dict[str, int] = {}
        self.findings: list[dict] = []
        self.prevented = 0

    def push(self, event: str, data: Any) -> None:
        self.queue.put_nowait({"event": event, "data": data})

    def drain(self) -> list[dict]:
        out = []
        while not self.queue.empty():
            out.append(self.queue.get_nowait())
        return out


class CodexHarness:
    def __init__(
        self,
        *,
        workspace: Path,
        scanner: LocalScanner,
        model: str = "",
        max_rescans_per_file: int = 3,
    ):
        self._workspace = workspace
        self._scanner = scanner
        self._model = model
        self._max_rescans = max_rescans_per_file
        self._procs: dict[int, asyncio.subprocess.Process] = {}
        self._runs: dict[int, CodexRun] = {}
        self._run_seq = 500

    # ---- availability ---------------------------------------------------------

    def workspace(self) -> Path:
        if not self._workspace.is_dir():
            raise RuntimeError(
                f"작업 폴더를 찾을 수 없습니다: {self._workspace}"
            )
        return self._workspace

    # ---- process --------------------------------------------------------------

    def _argv(self, prompt: str, cwd: Path, *, resume: str | None = None) -> list[str]:
        if resume:
            # `codex exec resume` rejects both -C and -s (verified against the CLI):
            # the resumed session keeps the sandbox it started under, and the working
            # directory comes from the spawned process instead.
            argv = ["codex", "exec", "resume", resume, "--json", "--skip-git-repo-check"]
        else:
            # workspace-write keeps edits inside cwd and denies network; never full access.
            argv = ["codex", "exec", "--json", "-C", str(cwd),
                    "-s", "workspace-write", "--skip-git-repo-check"]
        if self._model:
            argv += ["-m", self._model]
        argv.append(prompt)
        return argv

    async def _spawn(self, argv: list[str], cwd: Path) -> asyncio.subprocess.Process:
        return await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            # Without this Codex waits on stdin ("Reading additional input from stdin...").
            stdin=asyncio.subprocess.DEVNULL,
            env={**os.environ, "RUST_LOG": "error"},
        )

    # ---- security gate --------------------------------------------------------

    def _relative(self, file_path: str) -> str | None:
        try:
            ws = self.workspace()
            p = Path(file_path)
            p = p if p.is_absolute() else (ws / p)
            return str(p.resolve().relative_to(ws))
        except (ValueError, RuntimeError):
            return None  # outside the workspace — not ours to scan

    async def _run_gate(self, run: CodexRun, rel: str) -> list[dict]:
        """Scan one written file and push results. Returns blocking findings."""
        seen = run.rescans.get(rel, 0)
        if seen >= self._max_rescans:
            run.state.gate_skipped(rel, f"재스캔 상한({seen}회) 도달")
            run.push("run_update", run.state.snapshot())
            return []
        run.rescans[rel] = seen + 1

        run.state.gate_start(rel)
        run.push("run_update", run.state.snapshot())
        try:
            result = await self._scanner.scan(
                [rel],
                user_prompt=run.state.title,
                model_output=f"codex wrote {rel}",
                use_llm=True,
            )
        except Exception as e:  # noqa: BLE001 — a scanner failure must not kill the agent
            logger.warning("codex security gate failed for %s: %s", rel, e)
            run.state.gate_skipped(rel, "스캔 실패")
            run.push("run_update", run.state.snapshot())
            return []

        findings = result.get("findings", [])
        dismissed = sum(1 for f in findings if f.get("status") == "dismissed")
        run.state.gate_result(rel, findings, dismissed)
        run.findings = findings
        run.prevented = result.get("preventedCount", 0)
        run.push("run_update", run.state.snapshot())
        run.push(
            "findings",
            {
                "runId": result.get("runId"),
                "llm": result.get("llm"),
                "stats": result.get("stats", {}),
                "findings": findings,
                "preventedCount": run.prevented,
                "file": rel,
            },
        )
        return [
            f
            for f in findings
            if f.get("severity") in _SEVERITY_BLOCKING and f.get("status") != "dismissed"
        ]

    @staticmethod
    def _fix_prompt(blocking: list[dict]) -> str:
        lines = [
            f"[보안 게이트] 방금 작성한 코드에서 수정이 필요한 취약점 {len(blocking)}건이 "
            "발견되었습니다. 지금 바로 고쳐주세요."
        ]
        for f in blocking[:8]:
            lines.append(
                f"- [{str(f.get('severity')).upper()}] {f.get('category')} "
                f"@ {f.get('file')}:{f.get('startLine')}\n"
                f"    {f.get('title')}\n"
                f"    수정 방안: {f.get('suggestedFix')}"
            )
        return "\n".join(lines)

    # ---- event translation ----------------------------------------------------

    def _translate(self, event: dict, run: CodexRun, text_parts: list[str]) -> list[dict]:
        """Map one Codex JSONL event onto the studio's event shapes."""
        events: list[dict] = []
        etype = event.get("type")

        if etype == "thread.started":
            run.thread_id = event.get("thread_id")
            return events

        if etype == "turn.completed":
            self._record_usage(event.get("usage"))
            return events

        if etype not in ("item.started", "item.completed"):
            return events

        item = event.get("item") or {}
        itype = item.get("type")
        item_id = str(item.get("id") or "")

        if itype == "agent_message":
            text = item.get("text") or ""
            if etype == "item.completed" and text:
                text_parts.append(text)
                events.append({"event": "delta", "data": {"text": text}})
                run.state.append_text(text)
                events.append({"event": "run_update", "data": run.state.snapshot()})

        elif itype == "command_execution":
            command = item.get("command") or ""
            if etype == "item.started":
                run.state.start_tool(item_id, "Shell", {"command": command})
            else:
                run.state.finish_tool(item_id, is_error=bool(item.get("exit_code")))
            events.append({"event": "run_update", "data": run.state.snapshot()})

        elif itype == "file_change":
            changes = item.get("changes") or []
            if etype == "item.started":
                summary = ", ".join(str(c.get("path", "")).split("/")[-1] for c in changes)
                run.state.start_tool(item_id, "Edit", {"file_path": summary})
            else:
                run.state.finish_tool(item_id)
                for change in changes:
                    rel = self._relative(str(change.get("path") or ""))
                    if rel and rel not in run.changed:
                        run.changed.append(rel)
            events.append({"event": "run_update", "data": run.state.snapshot()})

        return events

    def _record_usage(self, usage: Any) -> None:
        """Codex already writes its own usage to ~/.codex; the collector reads it there."""
        if isinstance(usage, dict):
            logger.debug("codex turn usage: %s", usage)

    # ---- main loop ------------------------------------------------------------

    async def _pump(
        self, proc: asyncio.subprocess.Process, run: CodexRun, text_parts: list[str]
    ) -> AsyncIterator[dict]:
        assert proc.stdout is not None
        while True:
            try:
                raw = await asyncio.wait_for(proc.stdout.readline(), timeout=_TURN_TIMEOUT_S)
            except TimeoutError:
                proc.kill()
                yield {
                    "event": "error",
                    "data": {"code": "codex_timeout",
                             "message": "Codex 응답이 지연되어 중단했습니다."},
                }
                return
            if not raw:
                return
            line = raw.decode("utf-8", "replace").strip()
            if not line.startswith("{"):
                continue  # Codex prints human-readable preamble before the JSON stream
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            for out in self._translate(event, run, text_parts):
                yield out
            for queued in run.drain():
                yield queued

    async def stream(
        self, *, session_id: int, prompt: str, chips: list[dict] | None = None
    ) -> AsyncIterator[dict]:
        """Same contract as AgentService.stream — the frontend cannot tell them apart."""
        if not codex_available():
            raise RuntimeError(
                "Codex CLI 를 찾을 수 없습니다. 설치 후 `codex login` 으로 로그인해 주세요."
            )
        cwd = self.workspace()

        self._run_seq += 1
        run = CodexRun(self._run_seq, prompt.strip()[:80] or "작업")
        self._runs[session_id] = run
        text_parts: list[str] = []

        yield {"event": "message_start",
               "data": {"session_id": session_id, "runId": run.state.run_id}}
        yield {"event": "run_update", "data": run.state.snapshot()}

        full_prompt = _compose_prompt(prompt, chips)
        proc = await self._spawn(self._argv(full_prompt, cwd), cwd)
        self._procs[session_id] = proc
        try:
            async for ev in self._pump(proc, run, text_parts):
                yield ev
            await proc.wait()

            if proc.returncode not in (0, None):
                stderr = (await proc.stderr.read()).decode("utf-8", "replace")[-400:]
                yield {
                    "event": "error",
                    "data": {"code": "codex_failed",
                             "message": stderr or "Codex 실행에 실패했습니다."},
                }

            # The gate runs after the turn: unlike Claude Code there is no hook to
            # intercept a write mid-turn, so findings are fed back as a follow-up turn.
            blocking: list[dict] = []
            for rel in list(run.changed):
                blocking += await self._run_gate(run, rel)
                for queued in run.drain():
                    yield queued

            if blocking and run.thread_id:
                async for ev in self._self_fix(run, cwd, blocking, text_parts, session_id):
                    yield ev
        finally:
            self._procs.pop(session_id, None)
            if proc.returncode is None:
                proc.kill()

        run.state.finish()
        yield {"event": "run_update", "data": run.state.snapshot()}
        yield {
            "event": "message_done",
            "data": {"text": "".join(text_parts), "runId": run.state.run_id},
        }

    async def _self_fix(
        self,
        run: CodexRun,
        cwd: Path,
        blocking: list[dict],
        text_parts: list[str],
        session_id: int,
    ) -> AsyncIterator[dict]:
        """Resume the same Codex thread so it fixes what the gate found."""
        run.state.subagent_start("fixer", "자가 수정", "Fixer")
        yield {"event": "run_update", "data": run.state.snapshot()}

        argv = self._argv(self._fix_prompt(blocking), cwd, resume=run.thread_id)
        proc = await self._spawn(argv, cwd)
        self._procs[session_id] = proc
        try:
            async for ev in self._pump(proc, run, text_parts):
                yield ev
            await proc.wait()
        finally:
            if proc.returncode is None:
                proc.kill()

        # A failed fix must not read as a successful one: the vulnerability is still
        # there, and silently showing "완료" is worse than showing nothing.
        if proc.returncode not in (0, None):
            stderr = (await proc.stderr.read()).decode("utf-8", "replace")[-400:]
            logger.warning("codex self-fix failed (rc=%s): %s", proc.returncode, stderr)
            run.state.subagent_stop("fixer", status="failed")
            yield {"event": "run_update", "data": run.state.snapshot()}
            yield {
                "event": "error",
                "data": {
                    "code": "codex_selffix_failed",
                    "message": "자가 수정을 실행하지 못했습니다. 취약점이 남아 있습니다: "
                    + (stderr.strip().splitlines()[0] if stderr.strip() else "원인 불명"),
                },
            }
            return

        run.state.subagent_stop("fixer")
        yield {"event": "run_update", "data": run.state.snapshot()}

        # Re-scan what the fix touched (the per-file cap stops this from looping).
        for rel in list(run.changed):
            await self._run_gate(run, rel)
            for queued in run.drain():
                yield queued

    async def interrupt(self, session_id: int) -> bool:
        proc = self._procs.get(session_id)
        if proc is None or proc.returncode is not None:
            return False
        proc.kill()
        return True


def _compose_prompt(prompt: str, chips: list[dict] | None) -> str:
    parts = [CODEX_APPEND.strip(), "", prompt.strip()]
    if chips:
        picked = ", ".join(str(c.get("label") or c.get("selector") or "") for c in chips)
        if picked.strip(", "):
            parts.append(f"\n사용자가 화면에서 선택한 요소: {picked}")
    return "\n".join(parts)
