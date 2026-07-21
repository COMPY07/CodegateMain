"""Claude Code harness (BE-004/BE-005) built on the Claude Agent SDK.

This is the "Harness Core" from the product plan: the agent plans, edits real files
in the workspace, and a PostToolUse hook runs the security gate on every Write/Edit.
Findings are fed back to the agent via `additionalContext` so it fixes vulnerabilities
in the same loop — the "생성 루프 중간에 보안 게이트 삽입" design.

Auth comes from the installed `claude` CLI login; no ANTHROPIC_API_KEY is required.
Which is exactly why this runs on the **user's machine** and not the server: the login
that authorises the work has to be the user's own.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookMatcher,
    ResultMessage,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
    create_sdk_mcp_server,
    tool,
)

from .run_state import AgentRunState
from .scan import LocalScanner

logger = logging.getLogger(__name__)

# Tools the agent may use without a human in the loop. Bash is deliberately excluded:
# the server has no interactive approver, and editing a React app never needs a shell.
ALLOWED_TOOLS = [
    "Read",
    "Write",
    "Edit",
    "NotebookEdit",
    "Glob",
    "Grep",
    "TodoWrite",
    "mcp__codegate__red_team_scan",
]

_SEVERITY_BLOCKING = ("high", "critical")

VIBE_STUDIO_APPEND = """
You are the coding agent inside Vibe Studio. The user drives you from a visual studio UI,
not a terminal, and may attach on-screen element selections ("chips") to their request.

- Work in this project only. Keep changes scoped to what was asked.
- Answer in Korean, concisely. The user reads your text in a chat panel.
- Every file you write is automatically security-scanned. If the scan reports
  high/critical findings, fix them immediately in the same turn, then continue.
- Do not hardcode secrets, interpolate untrusted input into shell/SQL/paths, or use eval.
"""


class AgentRun:
    """Per-request run state plus a queue hooks use to push events into the stream."""

    def __init__(self, run_id: int, title: str):
        self.state = AgentRunState(run_id, title)
        self.queue: asyncio.Queue[dict] = asyncio.Queue()
        self.rescans: dict[str, int] = {}
        self.findings: list[dict] = []
        self.prevented = 0

    def push(self, event: str, data: Any) -> None:
        self.queue.put_nowait({"event": event, "data": data})

    def push_run_update(self) -> None:
        self.push("run_update", self.state.snapshot())

    def drain(self) -> list[dict]:
        out = []
        while not self.queue.empty():
            out.append(self.queue.get_nowait())
        return out


class ClaudeHarness:
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
        self._clients: dict[int, ClaudeSDKClient] = {}
        self._runs: dict[int, AgentRun] = {}
        self._run_seq = 100

    # ---- availability ---------------------------------------------------------

    def workspace(self) -> Path:
        if not self._workspace.is_dir():
            raise RuntimeError(f"작업 폴더를 찾을 수 없습니다: {self._workspace}")
        return self._workspace

    # ---- security gate --------------------------------------------------------

    def _relative_to_workspace(self, file_path: str) -> str | None:
        if not file_path:
            return None
        try:
            ws = self.workspace()
            p = Path(file_path)
            p = p if p.is_absolute() else (ws / p)
            return str(p.resolve().relative_to(ws))
        except (ValueError, RuntimeError):
            return None  # outside the workspace — not our concern

    async def _run_security_gate(self, session_id: int, input_data: dict) -> dict:
        """PostToolUse hook: scan what was just written and push findings back."""
        run = self._runs.get(session_id)
        if run is None:
            return {}
        tool_input = input_data.get("tool_input") or {}
        rel = self._relative_to_workspace(
            tool_input.get("file_path") or tool_input.get("notebook_path") or ""
        )
        if not rel:
            return {}

        seen = run.rescans.get(rel, 0)
        if seen >= self._max_rescans:
            # AGENT_INTEGRATION.md: cap rescans per file so the fix/scan loop terminates.
            run.state.gate_skipped(rel, f"재스캔 상한({seen}회) 도달")
            run.push_run_update()
            return {}
        run.rescans[rel] = seen + 1

        run.state.gate_start(rel)
        run.push_run_update()

        try:
            result = await self._scanner.scan(
                [rel],
                user_prompt=run.state.title,
                model_output=f"agent wrote {rel}",
                use_llm=True,
            )
        except Exception as e:  # noqa: BLE001 — a scanner failure must not kill the agent
            logger.warning("security gate failed for %s: %s", rel, e)
            run.state.gate_skipped(rel, "스캔 실패")
            run.push_run_update()
            return {}

        findings = result.get("findings", [])
        dismissed = sum(1 for f in findings if f.get("status") == "dismissed")
        run.state.gate_result(rel, findings, dismissed)
        run.findings = findings
        run.prevented = result.get("preventedCount", 0)
        run.push_run_update()
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

        blocking = [
            f
            for f in findings
            if f.get("severity") in _SEVERITY_BLOCKING and f.get("status") != "dismissed"
        ]
        if not blocking:
            return {}

        lines = [
            f"[보안 게이트] {rel} 에서 수정이 필요한 취약점 {len(blocking)}건이 발견되었습니다. "
            "지금 바로 고친 뒤 작업을 계속하세요."
        ]
        for f in blocking[:8]:
            lines.append(
                f"- [{str(f.get('severity')).upper()}] {f.get('category')} "
                f"@ {f.get('file')}:{f.get('startLine')}\n"
                f"    {f.get('title')}\n"
                f"    수정 방안: {f.get('suggestedFix')}"
            )
        return {
            "hookSpecificOutput": {
                "hookEventName": "PostToolUse",
                "additionalContext": "\n".join(lines),
            }
        }

    # ---- red_team tool exposed to the agent ------------------------------------

    def _build_mcp_server(self):
        service = self

        @tool(
            "red_team_scan",
            "Audit code you just wrote or changed for security vulnerabilities. "
            "Call this after creating or modifying source files, especially anything "
            "handling untrusted input: web request data, file paths, shell commands, "
            "SQL, deserialization, authentication, or cryptography. Fix every "
            "high/critical finding, then call this again to confirm.",
            {"changed_files": list, "goals": list, "model_output": str},
        )
        async def red_team_scan(args: dict[str, Any]) -> dict[str, Any]:
            requested = args.get("changed_files") or []
            changed = [
                r for r in (service._relative_to_workspace(f) for f in requested) if r
            ]
            if not changed:
                return {"content": [{"type": "text", "text": "changed_files 가 비어 있습니다."}]}
            try:
                result = await service._scanner.scan(
                    changed,
                    model_output=args.get("model_output") or "",
                    use_llm=True,
                )
            except Exception as e:  # noqa: BLE001
                return {"content": [{"type": "text", "text": f"스캔 실패: {e}"}]}

            findings = result.get("findings", [])
            active = [f for f in findings if f.get("status") != "dismissed"]
            if not active:
                clean = "red_team: 발견된 취약점이 없습니다."
                return {"content": [{"type": "text", "text": clean}]}
            lines = [f"red_team: {len(active)}건. high/critical 부터 수정하세요."]
            for f in active[:12]:
                lines.append(
                    f"- [{str(f.get('severity')).upper()}] {f.get('category')} "
                    f"@ {f.get('file')}:{f.get('startLine')}\n    {f.get('title')}\n"
                    f"    fix: {f.get('suggestedFix')}"
                )
            return {"content": [{"type": "text", "text": "\n".join(lines)}]}

        return create_sdk_mcp_server(name="codegate", version="0.1.0", tools=[red_team_scan])

    # ---- client lifecycle -----------------------------------------------------

    def _build_options(self, session_id: int) -> ClaudeAgentOptions:
        async def gate(input_data, tool_use_id, context):  # noqa: ANN001
            return await self._run_security_gate(session_id, input_data)

        async def enforce_allowlist(input_data, tool_use_id, context):  # noqa: ANN001
            # The server has no human approver, so anything outside the allowlist is
            # denied instead of hanging on a permission prompt. This runs as a
            # PreToolUse hook rather than `can_use_tool` because an `allowed_tools`
            # entry auto-approves before that callback is ever consulted.
            name = input_data.get("tool_name", "")
            if name in ALLOWED_TOOLS:
                return {}
            return {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": (
                        f"'{name}' 도구는 Vibe Studio 에서 허용되지 않습니다. "
                        "파일 편집 도구만 사용하세요."
                    ),
                }
            }

        return ClaudeAgentOptions(
            cwd=str(self.workspace()),
            system_prompt={
                "type": "preset",
                "preset": "claude_code",
                "append": VIBE_STUDIO_APPEND,
            },
            permission_mode="acceptEdits",
            setting_sources=["project"],
            allowed_tools=ALLOWED_TOOLS,
            mcp_servers={"codegate": self._build_mcp_server()},
            hooks={
                "PreToolUse": [HookMatcher(hooks=[enforce_allowlist])],
                "PostToolUse": [
                    HookMatcher(matcher="Write|Edit|NotebookEdit", hooks=[gate])
                ],
            },
        )

    async def _get_client(self, session_id: int) -> ClaudeSDKClient:
        client = self._clients.get(session_id)
        if client is None:
            client = ClaudeSDKClient(options=self._build_options(session_id))
            await client.connect()
            self._clients[session_id] = client
        return client

    async def interrupt(self, session_id: int) -> bool:
        client = self._clients.get(session_id)
        if client is None:
            return False
        await client.interrupt()
        return True

    async def close(self, session_id: int | None = None) -> None:
        ids = [session_id] if session_id is not None else list(self._clients)
        for sid in ids:
            client = self._clients.pop(sid, None)
            if client is not None:
                with contextlib.suppress(Exception):
                    await client.disconnect()

    # ---- streaming ------------------------------------------------------------

    @staticmethod
    def _compose_prompt(prompt: str, chips: list[dict] | None) -> str:
        if not chips:
            return prompt
        lines = [
            f'- "{c.get("label")}" (selector: {c.get("selector")})' for c in chips
        ]
        return (
            f"{prompt}\n\n[사용자가 화면에서 선택한 요소]\n" + "\n".join(lines)
        )

    async def stream(
        self, *, session_id: int, prompt: str, chips: list[dict] | None = None
    ) -> AsyncIterator[dict]:
        """Yield {'event','data'}: message_start, delta, run_update, findings, message_done."""
        self._run_seq += 1
        run = AgentRun(self._run_seq, prompt.strip()[:80] or "작업")
        self._runs[session_id] = run

        client = await self._get_client(session_id)

        yield {
            "event": "message_start",
            "data": {"session_id": session_id, "runId": run.state.run_id},
        }
        yield {"event": "run_update", "data": run.state.snapshot()}

        text_parts: list[str] = []
        try:
            await client.query(self._compose_prompt(prompt, chips))
            async for message in client.receive_response():
                for ev in run.drain():
                    yield ev
                for ev in self._translate(message, run, text_parts):
                    yield ev
                for ev in run.drain():
                    yield ev
        except Exception as e:  # noqa: BLE001
            logger.exception("agent stream failed")
            run.state.finish("failed")
            yield {"event": "run_update", "data": run.state.snapshot()}
            yield {"event": "error", "data": {"code": "agent_error", "message": str(e)}}
            return

        run.state.finish("done")
        for ev in run.drain():
            yield ev
        yield {"event": "run_update", "data": run.state.snapshot()}
        yield {
            "event": "message_done",
            "data": {"text": "".join(text_parts), "runId": run.state.run_id},
        }

    def _record_usage(self, message: ResultMessage) -> None:
        """Claude Code writes this run to ~/.claude; the collector reads it from there,
        so nothing needs tallying twice."""
        raw = getattr(message, "usage", None)
        if isinstance(raw, dict):
            logger.debug("claude turn usage: %s", raw)

    def _translate(self, message: Any, run: AgentRun, text_parts: list[str]) -> list[dict]:
        """Map one SDK message to zero or more SSE events. Unknown types are ignored."""
        events: list[dict] = []
        if isinstance(message, AssistantMessage):
            for block in message.content or []:
                if isinstance(block, TextBlock):
                    if block.text:
                        text_parts.append(block.text)
                        run.state.append_text(block.text)
                        events.append({"event": "delta", "data": {"text": block.text}})
                elif isinstance(block, ToolUseBlock):
                    run.state.start_tool(block.id, block.name, block.input or {})
                    events.append({"event": "run_update", "data": run.state.snapshot()})
        elif isinstance(message, UserMessage):
            for block in message.content or []:
                if isinstance(block, ToolResultBlock):
                    # A denied or failed tool must show as failed on the board, not
                    # linger as an in-progress step.
                    run.state.finish_tool(
                        block.tool_use_id, is_error=bool(getattr(block, "is_error", False))
                    )
                    events.append({"event": "run_update", "data": run.state.snapshot()})
        elif isinstance(message, ResultMessage):
            # Claude Code has no usage API to query, so the run's own report is the
            # only figure we will ever have for this model.
            self._record_usage(message)
            if getattr(message, "subtype", "") not in ("success", ""):
                events.append(
                    {
                        "event": "error",
                        "data": {"code": "agent_result", "message": str(message.subtype)},
                    }
                )
        return events
