"""Loopback runtime for projects, dev servers, Claude Code, and Codex.

This process can read and edit the user's project files, so the browser-facing surface
is the sensitive part of the design. Four independent controls apply, because a local
server reachable from a web page is exactly the shape that gets abused:

1. **Loopback bind.** 127.0.0.1 only — never 0.0.0.0, which would publish the
   user's activity to their whole network.
2. **Host allowlist.** Blocks DNS rebinding, where an attacker's domain resolves
   to 127.0.0.1 so their page can talk to this port as same-origin.
3. **Origin allowlist.** CORS headers are echoed only for configured origins, so
   an arbitrary site cannot read a response.
4. **Bearer token.** The integrated launcher creates an ephemeral token and injects it
   only into the same-origin proxy. Standalone execution falls back to a 0600 token.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import secrets
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from . import filetree
from .harness.runner import HarnessRunner
from .preview import PreviewService
from .projects import ProjectError, ProjectStore, choose_project_folder

logger = logging.getLogger(__name__)

DEFAULT_PORT = 45455
DEFAULT_ORIGINS = ("http://localhost:5180", "http://127.0.0.1:5180")
def _config_dir() -> Path:
    """Where the token and cache live — never the working directory.

    Tested rather than inlined because `Path("") or fallback` silently yields
    `Path(".")`: an empty Path is truthy, so the fallback never runs and secrets
    land wherever the agent happened to be started from.
    """
    override = os.environ.get("CODEGATE_CONFIG_DIR", "").strip()
    if override:
        return Path(override).expanduser()
    return Path.home() / ".config" / "codegate"


CONFIG_DIR = _config_dir()
TOKEN_FILE = CONFIG_DIR / "agent-token"
PROJECTS_FILE = CONFIG_DIR / "projects.json"


def load_or_create_token() -> str:
    """Use the integrated launcher's ephemeral token, or a standalone fallback."""
    supplied = os.environ.get("CODEGATE_RUNTIME_TOKEN", "").strip()
    if supplied:
        return supplied
    try:
        existing = TOKEN_FILE.read_text("utf-8").strip()
        if existing:
            return existing
    except OSError:
        pass

    token = secrets.token_urlsafe(24)
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(token)
    os.chmod(TOKEN_FILE, 0o600)
    return token


class Handler(BaseHTTPRequestHandler):
    server_version = "codegate-agent"
    runner: Any
    projects: Any
    preview: Any
    token: str
    origins: tuple[str, ...]
    port: int

    # ---- security checks ------------------------------------------------------

    def _host_ok(self) -> bool:
        host = (self.headers.get("Host") or "").strip()
        allowed = {
            f"127.0.0.1:{self.port}",
            f"localhost:{self.port}",
            f"[::1]:{self.port}",
        }
        return host in allowed

    def _origin(self) -> str | None:
        """The request Origin, if it is one we are willing to answer."""
        origin = self.headers.get("Origin")
        if origin is None:
            return None  # same-origin / curl — no CORS headers needed
        return origin if origin in self.origins else "__denied__"

    def _authorised(self) -> bool:
        header = self.headers.get("Authorization") or ""
        if header.startswith("Bearer "):
            return secrets.compare_digest(header[7:].strip(), self.token)
        return False

    # ---- responses ------------------------------------------------------------

    def _send(self, status: int, body: Any, origin: str | None) -> None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        # Only ever echo an origin we recognise; never "*".
        if origin and origin != "__denied__":
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            # The studio polls every few seconds and the Authorization header makes
            # each poll preflighted; without this every poll would cost two requests.
            self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()
        self.wfile.write(payload)

    def do_OPTIONS(self) -> None:  # noqa: N802 — BaseHTTPRequestHandler naming
        origin = self._origin()
        if not self._host_ok() or origin == "__denied__":
            self._send(403, {"error": "forbidden"}, None)
            return
        self._send(204, {}, origin)

    def do_GET(self) -> None:  # noqa: N802
        origin = self._origin()
        if not self._host_ok():
            self._send(403, {"error": "host_not_allowed"}, None)
            return
        if origin == "__denied__":
            self._send(403, {"error": "origin_not_allowed"}, None)
            return

        path = urlparse(self.path).path
        if path == "/local/ping":
            # Deliberately unauthenticated and contentless: it only lets the studio
            # discover that an agent is here so it can prompt for pairing.
            self._send(200, {"app": "vibe-studio", "ready": True}, origin)
            return

        if not self._authorised():
            self._send(401, {"error": "unauthorized", "hint": "Bearer 토큰이 필요합니다."}, origin)
            return

        if path == "/local/agent/status":
            # What this machine can actually run — the studio greys out the rest.
            self._send(200, self.runner.status(), origin)
            return
        if path == "/local/projects":
            self._send(
                200,
                {"root": str(self.projects.root), "projects": self.projects.list()},
                origin,
            )
            return
        if path == "/local/fs/tree":
            try:
                target = self._project_dir(urlparse(self.path).query)
            except ProjectError as e:
                self._send(400, {"error": "bad_project", "message": str(e)}, origin)
                return
            self._send(200, filetree.build(target), origin)
            return
        if path == "/local/fs/file":
            query = urlparse(self.path).query
            try:
                target = self._project_dir(query)
                requested_path = (parse_qs(query).get("path") or [""])[0]
                result = filetree.read(target, requested_path)
            except (ProjectError, ValueError, OSError) as e:
                self._send(400, {"error": "bad_file", "message": str(e)}, origin)
                return
            self._send(200, result, origin)
            return
        if path == "/local/preview/status":
            self._send(200, self.preview.status(), origin)
            return
        self._send(404, {"error": "not_found"}, origin)

    # ---- projects -------------------------------------------------------------

    def _project_dir(self, query: str) -> Path:
        """Resolve ?project=NAME, falling back to the folder the agent was started in."""
        name = (parse_qs(query or "").get("project") or [""])[0]
        if not name:
            return self.runner.status_workspace()
        return self.projects.resolve(name)

    def do_POST(self) -> None:  # noqa: N802
        origin = self._origin()
        if not self._host_ok():
            self._send(403, {"error": "host_not_allowed"}, None)
            return
        if origin == "__denied__":
            self._send(403, {"error": "origin_not_allowed"}, None)
            return
        if not self._authorised():
            self._send(401, {"error": "unauthorized", "hint": "Bearer 토큰이 필요합니다."}, origin)
            return

        path = urlparse(self.path).path
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"error": "bad_request"}, origin)
            return

        if path == "/local/agent/stream":
            self._stream_agent(body, origin)
            return
        if path == "/local/agent/interrupt":
            ok = asyncio.run(self.runner.interrupt(int(body.get("session_id") or 0)))
            self._send(200, {"ok": ok}, origin)
            return
        if path == "/local/projects":
            try:
                created = self.projects.create(
                    str(body.get("name") or "").strip(),
                    template=str(body.get("template") or "react"),
                )
            except ProjectError as e:
                self._send(400, {"error": "bad_project", "message": str(e)}, origin)
                return
            self._send(201, created, origin)
            return
        if path == "/local/projects/open":
            try:
                selected = choose_project_folder()
                opened = self.projects.open(selected) if selected is not None else None
            except ProjectError as e:
                self._send(400, {"error": "bad_project", "message": str(e)}, origin)
                return
            self._send(200, opened or {"cancelled": True}, origin)
            return
        if path in ("/local/preview/start", "/local/preview/stop"):
            self._preview(path, body, origin)
            return
        self._send(404, {"error": "not_found"}, origin)

    def _preview(self, path: str, body: dict, origin: str | None) -> None:
        try:
            if path.endswith("/stop"):
                self._send(200, self.preview.stop(), origin)
                return
            name = str(body.get("project") or "")
            target = self.projects.resolve(name) if name else self.runner.status_workspace()
            # A different project means the old dev server is serving the wrong tree.
            self.preview.use_project(target)
            self._send(200, self.preview.start(), origin)
        except (ProjectError, RuntimeError) as e:
            self._send(400, {"error": "preview_failed", "message": str(e)}, origin)

    # ---- SSE ------------------------------------------------------------------

    def _sse_headers(self, origin: str | None) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        if origin and origin != "__denied__":
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()

    def _write_event(self, event: str, data: Any) -> None:
        chunk = f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
        self.wfile.write(chunk.encode("utf-8"))
        self.wfile.flush()

    def _stream_agent(self, body: dict, origin: str | None) -> None:
        """Run a harness on this machine and stream its events to the studio.

        Each request is already on its own thread, so a private event loop here is
        safe and keeps the harnesses' async code unchanged.
        """
        self._sse_headers(origin)

        async def pump() -> None:
            try:
                name = str(body.get("project") or "")
                stream = self.runner.stream(
                    model=str(body.get("model") or "claude"),
                    session_id=int(body.get("session_id") or 0),
                    prompt=str(body.get("prompt") or ""),
                    chips=body.get("chips") or [],
                    project_dir=self.projects.resolve(name) if name else None,
                )
                async for ev in stream:
                    self._write_event(ev["event"], ev["data"])
            except Exception as e:  # noqa: BLE001 — deliver failures on the stream
                logger.warning("agent stream failed: %s", e)
                self._write_event("error", {"code": "agent_failed", "message": str(e)})

        try:
            asyncio.run(pump())
        except (BrokenPipeError, ConnectionResetError):
            logger.debug("studio disconnected mid-stream")

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.debug("%s - %s", self.address_string(), fmt % args)


def serve(
    *,
    port: int,
    origins: tuple[str, ...],
    token: str,
    workspace: Path | None = None,
    backend_url: str = "",
    projects_dir: Path | None = None,
    projects_registry: Path | None = None,
) -> ThreadingHTTPServer:
    ws = workspace or Path.cwd()
    runner = HarnessRunner(workspace=ws, backend_url=backend_url)
    projects = ProjectStore(projects_dir or ws.parent, registry_file=projects_registry)
    preview = PreviewService(ws)

    handler = type(
        "BoundHandler",
        (Handler,),
        {"runner": runner, "projects": projects,
         "preview": preview, "token": token, "origins": origins, "port": port},
    )
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    httpd.runner = runner  # type: ignore[attr-defined]
    httpd.projects = projects  # type: ignore[attr-defined]
    httpd.preview = preview  # type: ignore[attr-defined]
    # Port 0 means "pick one for me", so the Host allowlist has to learn the port
    # that was actually bound — otherwise the server rejects every request to itself.
    handler.port = httpd.server_address[1]
    return httpd
