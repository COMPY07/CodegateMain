"""Agent run state — folds harness events into the studio's `agentRun` shape.

Moved from the backend: the harnesses now run on the user's machine, so everything
they depend on lives here too.

ORIGINAL DOC:
Folds Claude Agent SDK messages into the exact `agentRun` shape the frontend renders.

The frontend's AgentProgress component (frontend/mvp/src/components/AgentProgress.jsx)
expects a fixed object. Field requirements discovered from that component:
  - `subs[].id` must be stable across updates (used as the React key)
  - `subs[].name` must be a non-empty string (`.charAt(0)` is used as the avatar)
  - `subs[].files` must be an array (never undefined — `.length`/`.join` are called)
  - `subs[].progress` must be a number 0..100 (used as a CSS width)
  - step `state` vocabulary is done|active|pending|failed|cancelled
    (different from the status vocabulary done|running|queued|failed|cancelled)
"""

from __future__ import annotations

from typing import Any

MAIN_NAME = "오케스트레이터"
MAIN_ROLE = "Main Agent"
REVIEWER_ID = "review"
ANALYSIS_ID = "analysis"

# Tool name -> (step head, how to summarise the input as `thought`)
_TOOL_LABELS: dict[str, str] = {
    "Write": "파일 작성",
    "Edit": "파일 수정",
    "NotebookEdit": "노트북 수정",
    "Read": "파일 읽기",
    "Bash": "명령 실행",
    "Glob": "파일 탐색",
    "Grep": "코드 검색",
    "WebFetch": "웹 조회",
    "WebSearch": "웹 검색",
    "Task": "서브에이전트 실행",
    "TodoWrite": "작업 목록 정리",
}


def _basename(path: str) -> str:
    return path.rsplit("/", 1)[-1] if path else ""


def describe_tool(name: str, tool_input: dict[str, Any]) -> tuple[str, str, str]:
    """Return (head, thought, tool_label) for a tool call."""
    head = _TOOL_LABELS.get(name, name)
    ti = tool_input or {}
    if name in ("Write", "Edit", "NotebookEdit", "Read"):
        path = ti.get("file_path") or ti.get("notebook_path") or ""
        return head, path or name, f"{name} {_basename(path)}".strip()
    if name == "Bash":
        cmd = (ti.get("command") or "").strip()
        return head, cmd[:200], f"bash: {cmd[:60]}"
    if name in ("Glob", "Grep"):
        pat = ti.get("pattern") or ""
        return head, str(pat)[:200], f"{name} {pat}"[:70]
    if name == "Task":
        desc = ti.get("description") or ti.get("prompt") or ""
        return head, str(desc)[:200], "Task"
    # Unknown / MCP tools: show the name and a compact arg preview.
    preview = ", ".join(f"{k}={str(v)[:40]}" for k, v in list(ti.items())[:3])
    return head, preview[:200], name


class AgentRunState:
    """Mutable run state; `snapshot()` yields the frontend-shaped dict."""

    def __init__(self, run_id: int | str, title: str):
        self.run_id = run_id
        self.title = title
        self.main_status = "running"
        self.main_steps: list[dict] = []
        self._steps_by_tool_id: dict[str, dict] = {}
        self._subs: dict[str, dict] = {}
        self._next_order = 1
        self._text_step: dict | None = None

    # ---- main agent -----------------------------------------------------------

    def start_tool(self, tool_use_id: str, name: str, tool_input: dict) -> None:
        head, thought, label = describe_tool(name, tool_input)
        step = {"state": "active", "head": head, "thought": thought, "tool": label}
        self.main_steps.append(step)
        if tool_use_id:
            self._steps_by_tool_id[tool_use_id] = step
        # A new tool call ends the current text step.
        self._finish_text_step()

    def finish_tool(self, tool_use_id: str, *, is_error: bool = False) -> None:
        step = self._steps_by_tool_id.pop(tool_use_id, None)
        if step is not None:
            step["state"] = "failed" if is_error else "done"

    def append_text(self, text: str) -> None:
        """Accumulate assistant prose as a single '응답 작성' step."""
        if not text.strip():
            return
        if self._text_step is None:
            self._text_step = {
                "state": "active",
                "head": "응답 작성",
                "thought": "",
                "tool": None,
            }
            self.main_steps.append(self._text_step)
        self._text_step["thought"] = (self._text_step["thought"] + text)[-400:]

    def _finish_text_step(self) -> None:
        if self._text_step is not None:
            self._text_step["state"] = "done"
            self._text_step = None

    def finish(self, status: str = "done") -> None:
        self._finish_text_step()
        self.main_status = status
        for step in self.main_steps:
            if step["state"] == "active":
                step["state"] = "done" if status == "done" else status
        for sub in self._subs.values():
            if sub["status"] == "running":
                sub["status"] = "done" if status == "done" else status
                sub["progress"] = 100

    # ---- sub agents -----------------------------------------------------------

    def _ensure_sub(self, sub_id: str, name: str, role: str) -> dict:
        sub = self._subs.get(sub_id)
        if sub is None:
            sub = {
                "id": sub_id,
                "name": name or sub_id,
                "role": role,
                "status": "running",
                "order": self._next_order,
                "progress": 0,
                "files": [],
                "current": "",
                "steps": [],
            }
            self._next_order += 1
            self._subs[sub_id] = sub
        return sub

    def subagent_start(self, sub_id: str, name: str, role: str = "Subagent") -> None:
        sub = self._ensure_sub(sub_id, name, role)
        sub["status"] = "running"
        sub["current"] = "작업 중"
        sub["progress"] = 10

    def subagent_stop(self, sub_id: str, *, status: str = "done") -> None:
        sub = self._subs.get(sub_id)
        if sub is None:
            return
        sub["status"] = status
        sub["progress"] = 100
        sub["current"] = "완료" if status == "done" else status

    # ---- security gate (rendered as the "검수기" sub-agent) --------------------

    def gate_start(self, rel_path: str) -> None:
        sub = self._ensure_sub(REVIEWER_ID, "검수기", "Reviewer")
        sub["status"] = "running"
        sub["progress"] = 40
        sub["current"] = f"{_basename(rel_path)} 검수 중"
        if rel_path and rel_path not in sub["files"]:
            sub["files"].append(rel_path)
        sub["steps"].append(
            {
                "state": "active",
                "head": "변경 diff 검수",
                "thought": f"{rel_path} 보안 스캔 실행",
                "tool": "sa-redteam + gpt-4o",
            }
        )

    def gate_result(self, rel_path: str, findings: list[dict], dismissed: int) -> None:
        sub = self._ensure_sub(REVIEWER_ID, "검수기", "Reviewer")
        active = [f for f in findings if f.get("status") != "dismissed"]
        blocking = [f for f in active if f.get("severity") in ("high", "critical")]
        for step in reversed(sub["steps"]):
            if step["state"] == "active":
                step["state"] = "failed" if blocking else "done"
                step["thought"] = (
                    f"{rel_path}: {len(active)}건 탐지"
                    + (f" (오탐 {dismissed}건 제외)" if dismissed else "")
                    + (f" · high/critical {len(blocking)}건 → 수정 요청" if blocking else " · 통과")
                )
                break
        sub["progress"] = 100
        sub["status"] = "failed" if blocking else "done"
        sub["current"] = (
            f"{len(blocking)}건 수정 필요" if blocking else f"통과 ({len(active)}건 경고)"
        )

    def gate_skipped(self, rel_path: str, reason: str) -> None:
        sub = self._ensure_sub(REVIEWER_ID, "검수기", "Reviewer")
        for step in reversed(sub["steps"]):
            if step["state"] == "active":
                step["state"] = "cancelled"
                step["thought"] = f"{rel_path}: {reason}"
                break
        sub["progress"] = 100
        sub["status"] = "done"
        sub["current"] = reason

    # ---- completion analysis -------------------------------------------------

    def analysis_start(self, files: list[str] | None = None) -> None:
        """Show the evidence engine as a distinct completion-time audit agent."""
        sub = self._ensure_sub(ANALYSIS_ID, "증거 분석기", "Analysis Agent")
        sub["status"] = "running"
        sub["progress"] = 20
        sub["current"] = "typed Proof 구성 중"
        for rel_path in files or []:
            if rel_path and rel_path not in sub["files"]:
                sub["files"].append(rel_path)
        sub["steps"].append(
            {
                "state": "active",
                "head": "완료 시 증거 감사",
                "thought": "index → inventory → typed Proof → prove/evidence/slice",
                "tool": "VibeGate MCP",
            }
        )

    def analysis_result(self, result: dict[str, Any]) -> None:
        sub = self._ensure_sub(ANALYSIS_ID, "증거 분석기", "Analysis Agent")
        verdict = str(result.get("overallVerdict") or "INCONCLUSIVE")
        proofs = result.get("proofs") or []
        counts = {
            name: sum(p.get("verdict") == name for p in proofs)
            for name in ("SUPPORTED", "REFUTED", "INCONCLUSIVE")
        }
        protocol = result.get("protocol") or {}
        scan_findings = (result.get("scan") or {}).get("findings") or []
        unsafe = verdict != "REFUTED" or not protocol.get("complete", False)
        for step in reversed(sub["steps"]):
            if step["state"] == "active":
                step["state"] = "failed" if unsafe else "done"
                step["thought"] = (
                    f"{verdict} · Proof {len(proofs)}건 "
                    f"(SUPPORTED {counts['SUPPORTED']}, REFUTED {counts['REFUTED']}, "
                    f"INCONCLUSIVE {counts['INCONCLUSIVE']})"
                    + (f" · 보조 scan {len(scan_findings)}건" if scan_findings else "")
                )
                break
        sub["progress"] = 100
        sub["status"] = "failed" if unsafe else "done"
        sub["current"] = (
            f"{verdict} · 확인 필요" if unsafe else "REFUTED · 경로 보호 증명"
        )

    def analysis_failed(self, reason: str) -> None:
        sub = self._ensure_sub(ANALYSIS_ID, "증거 분석기", "Analysis Agent")
        for step in reversed(sub["steps"]):
            if step["state"] == "active":
                step["state"] = "failed"
                step["thought"] = f"분석 실행 실패: {reason}"
                break
        sub["progress"] = 100
        sub["status"] = "failed"
        sub["current"] = "분석 실행 실패"

    # ---- output ---------------------------------------------------------------

    def snapshot(self) -> dict:
        return {
            "title": self.title,
            "runId": self.run_id,
            "main": {
                "name": MAIN_NAME,
                "role": MAIN_ROLE,
                "status": self.main_status,
                "steps": [dict(s) for s in self.main_steps],
            },
            "subs": [
                dict(s, steps=[dict(x) for x in s["steps"]], files=list(s["files"]))
                for s in sorted(self._subs.values(), key=lambda s: s["order"])
            ],
        }
