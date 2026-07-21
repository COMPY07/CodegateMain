"""Picks a harness for the requested model and reports what this machine can run.

`claude` and `gpt` are both driven by a CLI the *user* logged into, so availability is
a property of this machine, not of the server. The studio asks here.
"""

from __future__ import annotations

import logging
import shutil
import subprocess
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from .scan import LocalScanner

logger = logging.getLogger(__name__)


def claude_sdk_available() -> bool:
    try:
        import claude_agent_sdk  # noqa: F401
    except Exception:  # noqa: BLE001
        return False
    return True


def _logged_in(argv: list[str], marker: str) -> bool:
    try:
        result = subprocess.run(
            argv,
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0 and marker in (result.stdout + result.stderr)


def claude_available() -> bool:
    """The Python SDK plus the user's existing Claude Code login are both required."""
    if not claude_sdk_available():
        return False
    # The SDK bundles a CLI, but a system CLI is the only stable, non-invasive way to
    # preflight the shared login. If it is absent, let the bundled CLI attempt auth.
    if shutil.which("claude") is None:
        return True
    return _logged_in(["claude", "auth", "status"], '"loggedIn": true')


def codex_available() -> bool:
    return shutil.which("codex") is not None and _logged_in(
        ["codex", "login", "status"], "Logged in"
    )


class HarnessRunner:
    """Runs a harness against whichever project the studio names.

    Harnesses are rebuilt when the project changes: each one holds a workspace and a
    scanner bound to that folder, and reusing a stale one would edit the wrong project.
    """

    def __init__(self, *, workspace: Path, backend_url: str = "", models: dict | None = None):
        self._workspace = workspace
        self._backend_url = backend_url
        self._scanner = LocalScanner(workspace=workspace, backend_url=backend_url)
        self._models = models or {}
        self._claude: Any = None
        self._codex: Any = None

    def status_workspace(self) -> Path:
        """The folder the agent was started in — used when no project is named."""
        return self._workspace

    def use_project(self, project_dir: Path) -> None:
        if project_dir == self._workspace:
            return
        self._workspace = project_dir
        self._scanner = LocalScanner(workspace=project_dir, backend_url=self._backend_url)
        self._claude = None
        self._codex = None

    # ---- capability report ----------------------------------------------------

    def status(self) -> dict:
        claude_sdk = claude_sdk_available()
        claude_cli = shutil.which("claude") is not None
        claude_ready = claude_available()
        codex_cli = shutil.which("codex") is not None
        codex_ready = codex_available()
        return {
            "workspace": str(self._workspace),
            "workspaceExists": self._workspace.is_dir(),
            "scanner": self._scanner.available,
            "models": {
                "claude": claude_ready,
                "gpt": codex_ready,
            },
            "modelDetails": {
                "claude": {
                    "ready": claude_ready,
                    "cliInstalled": claude_cli,
                    "sdkInstalled": claude_sdk,
                    "hint": (
                        "사용 가능"
                        if claude_ready
                        else "agent 의 claude-agent-sdk 설치와 Claude Code 로그인을 확인하세요."
                    ),
                },
                "gpt": {
                    "ready": codex_ready,
                    "cliInstalled": codex_cli,
                    "hint": (
                        "사용 가능"
                        if codex_ready
                        else "Codex CLI 설치 후 `codex login` 으로 로그인하세요."
                    ),
                },
            },
        }

    # ---- harnesses ------------------------------------------------------------

    def _get_claude(self):
        if self._claude is None:
            from .claude import ClaudeHarness

            self._claude = ClaudeHarness(
                workspace=self._workspace,
                scanner=self._scanner,
                model=self._models.get("claude", ""),
            )
        return self._claude

    def _get_codex(self):
        if self._codex is None:
            from .codex import CodexHarness

            self._codex = CodexHarness(
                workspace=self._workspace,
                scanner=self._scanner,
                model=self._models.get("gpt", ""),
            )
        return self._codex

    def stream(
        self,
        *,
        model: str,
        session_id: int,
        prompt: str,
        chips: list[dict] | None = None,
        project_dir: Path | None = None,
    ) -> AsyncIterator[dict]:
        if project_dir is not None:
            self.use_project(project_dir)
        if model == "gpt":
            if not codex_available():
                raise RuntimeError(
                    "이 컴퓨터에 Codex CLI 가 없습니다. 설치 후 `codex login` 으로 로그인해 주세요."
                )
            harness = self._get_codex()
        else:
            if not claude_available():
                raise RuntimeError(
                    "이 컴퓨터에서 Claude Code 를 찾을 수 없습니다. "
                    "`claude` 로그인을 확인해 주세요."
                )
            harness = self._get_claude()
        return harness.stream(session_id=session_id, prompt=prompt, chips=chips or [])

    async def interrupt(self, session_id: int) -> bool:
        stopped = False
        for harness in (self._claude, self._codex):
            if harness is not None:
                stopped = await harness.interrupt(session_id) or stopped
        return stopped
