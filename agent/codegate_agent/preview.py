"""Supervise a project's hot-reload development server on the user's machine.

The HTTP server handles each request on a different thread. A previous implementation
created an asyncio subprocess inside ``asyncio.run()`` for one request and then tried to
stop it from another event loop. The output task was cancelled as soon as the start
request returned, leaving stale status and orphaned dev servers. This service therefore
uses a normal subprocess plus a long-lived output thread.
"""

from __future__ import annotations

import contextlib
import json
import logging
import os
import re
import shutil
import signal
import subprocess
import threading
from collections import deque
from pathlib import Path

logger = logging.getLogger(__name__)

_ANSI_RE = re.compile(r"\x1b\[[0-9;]*[a-zA-Z]")
_URL_RE = re.compile(
    r"(https?)://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d+)/?", re.I
)

# These defaults remain fixed argv. A package manager is selected only from lock files
# already inside the chosen project; no browser input reaches a shell.
_DEV_ARGV = ["npm", "run", "dev"]
_INSTALL_ARGV = ["npm", "install", "--no-audit", "--no-fund"]
_MAX_LOG_LINES = 200
_START_TIMEOUT_S = 90
_INSTALL_TIMEOUT_S = 600


def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text)


def _commands(project: Path) -> tuple[list[str], list[str]]:
    """Pick the project's package manager without executing package.json content."""
    if (project / "pnpm-lock.yaml").is_file() and shutil.which("pnpm"):
        return ["pnpm", "run", "dev"], ["pnpm", "install", "--frozen-lockfile=false"]
    if (project / "yarn.lock").is_file() and shutil.which("yarn"):
        return ["yarn", "dev"], ["yarn", "install"]
    if ((project / "bun.lock").is_file() or (project / "bun.lockb").is_file()) and shutil.which(
        "bun"
    ):
        return ["bun", "run", "dev"], ["bun", "install"]
    return list(_DEV_ARGV), list(_INSTALL_ARGV)


class PreviewService:
    def __init__(self, project_dir: Path | None = None):
        self._project_dir = project_dir.resolve() if project_dir is not None else None
        self._proc: subprocess.Popen[str] | None = None
        self._url: str | None = None
        self._logs: deque[str] = deque(maxlen=_MAX_LOG_LINES)
        self._ready = threading.Event()
        self._pump_thread: threading.Thread | None = None
        self._lock = threading.RLock()

    @property
    def project_dir(self) -> Path | None:
        return self._project_dir

    def use_project(self, project_dir: Path) -> None:
        """Atomically stop the old server and point the service at a new project."""
        target = project_dir.resolve()
        with self._lock:
            if self._project_dir == target:
                return
            self._stop_unlocked()
            self._project_dir = target
            self._logs.clear()

    def _workspace(self) -> Path:
        ws = self._project_dir
        if ws is None or not ws.is_dir():
            raise RuntimeError("실행할 프로젝트가 지정되지 않았습니다.")
        package_file = ws / "package.json"
        if not package_file.is_file():
            raise RuntimeError(
                f"'{ws.name}' 에 package.json 이 없어 dev server 를 띄울 수 없습니다."
            )
        try:
            package = json.loads(package_file.read_text("utf-8"))
        except (OSError, ValueError, TypeError) as exc:
            raise RuntimeError(f"'{ws.name}' 의 package.json 을 읽을 수 없습니다: {exc}") from exc
        if not isinstance(package.get("scripts"), dict) or not package["scripts"].get("dev"):
            raise RuntimeError(f"'{ws.name}' 의 package.json 에 dev 스크립트가 없습니다.")
        return ws

    def is_running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def status(self) -> dict:
        running = self.is_running()
        return {
            "running": running,
            "url": self._url if running else None,
            "pid": self._proc.pid if running and self._proc is not None else None,
            "logs": list(self._logs),
            "projectPath": str(self._project_dir) if self._project_dir is not None else None,
        }

    def _pump_output(self) -> None:
        proc = self._proc
        if proc is None or proc.stdout is None:
            self._ready.set()
            return
        try:
            for raw in proc.stdout:
                line = _strip_ansi(raw).rstrip()
                if line:
                    self._logs.append(line)
                if self._url is None:
                    match = _URL_RE.search(line)
                    if match:
                        # Keep the address the server actually advertised. Collapsing
                        # 127.0.0.1 and ::1 into `localhost` can route the iframe to a
                        # different stale process when both address families are in use.
                        host = "127.0.0.1" if match.group(2) == "0.0.0.0" else match.group(2)
                        self._url = f"{match.group(1)}://{host}:{match.group(3)}"
                        self._ready.set()
        except Exception as exc:  # noqa: BLE001
            logger.warning("preview log pump stopped: %s", exc)
        finally:
            self._ready.set()

    def start(self) -> dict:
        with self._lock:
            if self.is_running():
                return self.status()

            ws = self._workspace()
            dev_argv, install_argv = _commands(ws)
            if not (ws / "node_modules").is_dir():
                self._install(ws, install_argv)

            self._url = None
            self._logs.clear()
            self._ready = threading.Event()
            try:
                self._proc = subprocess.Popen(
                    dev_argv,
                    cwd=str(ws),
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    stdin=subprocess.DEVNULL,
                    start_new_session=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    bufsize=1,
                )
            except OSError as exc:
                raise RuntimeError(f"dev server 를 시작하지 못했습니다: {exc}") from exc

            self._pump_thread = threading.Thread(target=self._pump_output, daemon=True)
            self._pump_thread.start()
            if not self._ready.wait(timeout=_START_TIMEOUT_S):
                self._stop_unlocked()
                raise RuntimeError(
                    f"{_START_TIMEOUT_S}초 안에 dev server 주소가 나오지 않았습니다.\n"
                    + "\n".join(list(self._logs)[-20:])
                )
            if self._url is None or not self.is_running():
                detail = "\n".join(list(self._logs)[-20:])
                self._stop_unlocked()
                raise RuntimeError("dev server 가 서비스 전에 종료되었습니다.\n" + detail)
            logger.info("preview dev server ready at %s", self._url)
            return self.status()

    def _install(self, ws: Path, argv: list[str]) -> None:
        self._logs.append(f"[codegate] {ws.name}: 의존성을 설치하는 중… (처음 한 번만)")
        logger.info("installing dependencies for %s", ws)
        try:
            proc = subprocess.Popen(
                argv,
                cwd=str(ws),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                start_new_session=True,
            )
            output, _ = proc.communicate(timeout=_INSTALL_TIMEOUT_S)
        except subprocess.TimeoutExpired as exc:
            with contextlib.suppress(ProcessLookupError, PermissionError):
                os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
            with contextlib.suppress(subprocess.TimeoutExpired):
                proc.communicate(timeout=3)
            raise RuntimeError(
                f"의존성 설치가 {_INSTALL_TIMEOUT_S}초를 넘겨 중단했습니다."
            ) from exc
        except OSError as exc:
            raise RuntimeError(f"패키지 관리자를 실행할 수 없습니다: {exc}") from exc

        for line in _strip_ansi(output or "").splitlines()[-30:]:
            if line.strip():
                self._logs.append(line)
        if proc.returncode != 0:
            tail = "\n".join(list(self._logs)[-15:])
            raise RuntimeError(f"의존성 설치에 실패했습니다.\n{tail}")
        self._logs.append("[codegate] 설치 완료. dev server 를 시작합니다.")

    def _stop_unlocked(self) -> dict:
        proc = self._proc
        if proc is not None and proc.poll() is None:
            try:
                os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
            except (ProcessLookupError, PermissionError):
                with contextlib.suppress(ProcessLookupError):
                    proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                with contextlib.suppress(ProcessLookupError, PermissionError):
                    os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
                with contextlib.suppress(subprocess.TimeoutExpired):
                    proc.wait(timeout=3)

        thread = self._pump_thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=2)
        self._pump_thread = None
        self._proc = None
        self._url = None
        return self.status()

    def stop(self) -> dict:
        with self._lock:
            return self._stop_unlocked()
