"""Projects on the user's machine: list, create, resolve.

Everything here is deliberately client-side. A project is a real folder the user owns,
the agent edits it in place, and its dev server runs on their machine — none of which
the server can do for them.

Names are treated as untrusted: they arrive from a browser, so a name is validated
against a strict pattern *and* the resolved path is re-checked against the projects
root. Either check alone can be defeated; both together mean a request cannot reach
outside the folder the user pointed us at.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Letters/digits/dash/underscore/dot, no leading dot, 1-64 chars.
_NAME_RE = re.compile(r"^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]{0,63}$")
_SKIP = {"node_modules", ".git", "dist", "build", ".vite", "__pycache__", ".venv"}


class ProjectError(Exception):
    """User-facing problem with a project request."""


def valid_name(name: str) -> bool:
    return bool(_NAME_RE.match(name or "")) and ".." not in name


class ProjectStore:
    def __init__(self, root: Path, *, registry_file: Path | None = None):
        self._root = root.resolve()
        self._registry_file = registry_file
        self._opened: dict[str, Path] = {}
        self._load_registry()

    @property
    def root(self) -> Path:
        return self._root

    # ---- resolution -----------------------------------------------------------

    def resolve(self, name: str) -> Path:
        """Resolve a managed child name or an explicitly opened opaque project id."""
        opened = self._opened.get(name)
        if opened is not None:
            if not opened.is_dir():
                raise ProjectError("선택한 프로젝트 폴더를 더 이상 찾을 수 없습니다.")
            return opened
        if not valid_name(name):
            raise ProjectError(
                "프로젝트 이름은 한글·영문·숫자와 . _ - 만 쓸 수 있습니다."
            )
        target = (self._root / name).resolve()
        root = self._root.resolve()
        if target.parent != root:
            # Belt and braces: the name passed the pattern but still escaped.
            raise ProjectError("허용된 프로젝트 폴더 밖입니다.")
        return target

    def exists(self, name: str) -> bool:
        try:
            return self.resolve(name).is_dir()
        except ProjectError:
            return False

    # ---- listing --------------------------------------------------------------

    def list(self) -> list[dict[str, Any]]:
        out: list[dict[str, Any]] = []
        seen: set[Path] = set()
        if self._root.is_dir():
            for entry in sorted(self._root.iterdir(), key=lambda p: p.name.lower()):
                if (
                    not entry.is_dir()
                    or entry.is_symlink()
                    or entry.name.startswith(".")
                    or entry.name in _SKIP
                ):
                    continue
                resolved = entry.resolve()
                seen.add(resolved)
                out.append(self.describe(resolved, project_id=entry.name))
        for project_id, path in sorted(
            self._opened.items(), key=lambda item: (item[1].name.lower(), str(item[1]))
        ):
            if not path.is_dir() or path in seen:
                continue
            out.append(self.describe(path, project_id=project_id, opened=True))
        return out

    @staticmethod
    def describe(
        path: Path, *, project_id: str | None = None, opened: bool = False
    ) -> dict[str, Any]:
        try:
            mtime = path.stat().st_mtime
        except OSError:
            mtime = 0.0
        has_pkg = (path / "package.json").is_file()
        runnable = False
        if has_pkg:
            try:
                package = json.loads((path / "package.json").read_text("utf-8"))
                runnable = bool(
                    isinstance(package.get("scripts"), dict) and package["scripts"].get("dev")
                )
            except (OSError, ValueError, TypeError):
                runnable = False
        return {
            "id": project_id or path.name,
            "name": path.name,
            "path": str(path),
            "kind": "node" if has_pkg else "folder",
            # The studio only offers ▶ preview when there is something to run.
            "runnable": runnable,
            "updatedAt": datetime.fromtimestamp(mtime, timezone.utc).isoformat(
                timespec="seconds"
            )
            if mtime
            else None,
            "opened": opened,
        }

    # ---- opening existing folders --------------------------------------------

    @staticmethod
    def _opened_id(path: Path) -> str:
        digest = hashlib.sha256(str(path).encode("utf-8")).hexdigest()[:16]
        # ':' is intentionally outside valid managed folder names, so an opened id
        # can never collide with a direct child of the projects root.
        return f"opened:{digest}"

    def open(self, path: Path) -> dict[str, Any]:
        """Register a folder the user explicitly chose in the native picker.

        The browser receives an opaque id and sends that id back for tree/agent/preview
        calls. Arbitrary paths are never accepted by those endpoints.
        """
        target = path.expanduser().resolve()
        if not target.is_dir():
            raise ProjectError("선택한 프로젝트 폴더를 찾을 수 없습니다.")
        if target in (Path(target.anchor), Path.home().resolve(), self._root):
            raise ProjectError("홈 또는 디스크 전체는 프로젝트로 열 수 없습니다.")

        # A direct child is already managed by its ordinary folder name.
        if target.parent == self._root:
            return self.describe(target, project_id=target.name)

        project_id = self._opened_id(target)
        self._opened[project_id] = target
        self._save_registry()
        return self.describe(target, project_id=project_id, opened=True)

    def _load_registry(self) -> None:
        if self._registry_file is None:
            return
        try:
            payload = json.loads(self._registry_file.read_text("utf-8"))
        except (OSError, ValueError, TypeError):
            return
        paths = payload.get("projects", []) if isinstance(payload, dict) else []
        for raw in paths:
            try:
                path = Path(str(raw)).expanduser().resolve()
            except (OSError, RuntimeError):
                continue
            if (
                path.is_dir()
                and path != Path(path.anchor)
                and path != Path.home().resolve()
                and path != self._root
            ):
                self._opened[self._opened_id(path)] = path

    def _save_registry(self) -> None:
        if self._registry_file is None:
            return
        payload = json.dumps(
            {"projects": [str(p) for p in self._opened.values()]},
            ensure_ascii=False,
            indent=2,
        )
        try:
            self._registry_file.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(
                self._registry_file,
                os.O_WRONLY | os.O_CREAT | os.O_TRUNC,
                0o600,
            )
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(payload)
            os.chmod(self._registry_file, 0o600)
        except OSError as exc:
            logger.warning("project registry could not be saved: %s", exc)

    # ---- creation -------------------------------------------------------------

    def create(self, name: str, *, template: str = "react") -> dict[str, Any]:
        target = self.resolve(name)
        if target.exists():
            raise ProjectError(f"'{name}' 프로젝트가 이미 있습니다.")
        self._root.mkdir(parents=True, exist_ok=True)
        target.mkdir()
        try:
            if template == "empty":
                (target / "README.md").write_text(f"# {name}\n", encoding="utf-8")
            else:
                _scaffold_react(target, name)
        except OSError as e:
            # Never leave a half-written project behind for the user to clean up.
            shutil.rmtree(target, ignore_errors=True)
            raise ProjectError(f"프로젝트를 만들지 못했습니다: {e}") from e
        return self.describe(target, project_id=name)

    def delete(self, name: str) -> bool:
        if name in self._opened:
            del self._opened[name]
            self._save_registry()
            return True
        target = self.resolve(name)
        if not target.is_dir():
            return False
        shutil.rmtree(target)
        return True


def choose_project_folder() -> Path | None:
    """Open the operating system's folder picker using fixed, non-shell argv.

    A web page cannot reveal the absolute path from ``showDirectoryPicker``. The
    loopback agent needs that path to run Claude/Codex and the dev server, so the
    trusted local process owns this native picker instead.
    """
    if sys.platform == "darwin":
        argv = [
            "osascript",
            "-e",
            'POSIX path of (choose folder with prompt "Vibe Studio에서 열 프로젝트를 선택하세요")',
        ]
    elif sys.platform.startswith("linux") and shutil.which("zenity"):
        argv = [
            "zenity",
            "--file-selection",
            "--directory",
            "--title=Vibe Studio에서 열 프로젝트를 선택하세요",
        ]
    elif sys.platform == "win32":
        script = (
            "Add-Type -AssemblyName System.Windows.Forms; "
            "$d=New-Object System.Windows.Forms.FolderBrowserDialog; "
            "$d.Description='Vibe Studio에서 열 프로젝트를 선택하세요'; "
            "if($d.ShowDialog() -eq 'OK'){Write-Output $d.SelectedPath}"
        )
        argv = ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script]
    else:
        raise ProjectError("이 운영체제에서 폴더 선택 창을 열 수 없습니다.")

    try:
        result = subprocess.run(
            argv,
            check=False,
            capture_output=True,
            text=True,
            timeout=300,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise ProjectError(f"폴더 선택 창을 열지 못했습니다: {exc}") from exc

    selected = result.stdout.strip()
    # macOS/zenity cancel with a non-zero code; Windows prints nothing on cancel.
    if result.returncode != 0 or not selected:
        return None
    return Path(selected)


# ---- templates ---------------------------------------------------------------

_PKG = """{{
  "name": "{slug}",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {{
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }},
  "dependencies": {{
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  }},
  "devDependencies": {{
    "@vitejs/plugin-react": "^4.3.4",
    "vite": "^5.4.11"
  }}
}}
"""

_VITE_CONFIG = """import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 스튜디오의 질문 모드(요소 클릭 → 칩)를 위한 브리지. dev 서버에서만 주입되고
// 프로덕션 빌드에는 들어가지 않는다.
const previewBridge = () => ({
  name: 'vibe-preview-bridge',
  apply: 'serve',
  transformIndexHtml: (html) =>
    html.replace('</body>', '<script src="/vibe-preview-bridge.js"></script></body>'),
})

export default defineConfig({
  plugins: [react(), previewBridge()],
  server: { host: '127.0.0.1' },
})
"""

_INDEX_HTML = """<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
"""

_MAIN_JSX = """import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
"""

_APP_JSX = """export default function App() {{
  return (
    <div className="app">
      <header>
        <span className="logo">◆ {name}</span>
      </header>
      <main>
        <h1>{name}</h1>
        <p className="sub">채팅으로 이 화면을 바꿔보세요.</p>
      </main>
    </div>
  )
}}
"""

_STYLES = """* { box-sizing: border-box; margin: 0; }

body {
  font-family: -apple-system, "Apple SD Gothic Neo", sans-serif;
  background: linear-gradient(180deg, #faf9ff, #f2effb);
  color: #2a2340;
}

header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 14px 28px;
  background: #fff;
  border-bottom: 1px solid #eee;
}

.logo { font-weight: 800; color: #7c3aed; font-size: 18px; }
main { padding: 44px 48px; }
h1 { font-size: 30px; margin-bottom: 8px; color: #1a1530; }
.sub { color: #6b6485; }
"""

_CLAUDE_MD = """# {name}

Vibe Studio 에이전트가 편집하는 React 18 + Vite 프로젝트다.

## 작업 규약
- React 함수형 컴포넌트와 hooks 스타일을 유지한다.
- 새 컴포넌트는 `src/` 아래 파일 하나로 만들고 `App.jsx` 에서 조합한다.
- 스타일은 `src/styles.css` 에 추가한다. CSS 프레임워크를 새로 도입하지 않는다.
- 요청 범위 밖의 파일은 수정하지 않는다.
- UI 텍스트는 한국어, 버튼에는 접근 가능한 이름을 제공한다.

## 보안 규약 (중요)
변경분은 저장 직후 자동 보안 검수를 거친다. 처음부터 다음을 지킨다.
- 사용자 입력을 셸 명령·SQL·파일 경로에 직접 이어붙이지 않는다.
- `eval` 및 동적 코드 실행을 쓰지 않는다.
- API 키·비밀번호 등 비밀값을 소스에 하드코딩하지 않는다.
- 외부 입력은 사용 지점에서 검증한다.
"""

_BRIDGE = """// Vibe Studio 프리뷰 브리지 — dev 서버에서만 주입된다.
(function () {
  if (window.top === window) return
  var parentOrigin = null

  function describe(el) {
    var label = (el.getAttribute('aria-label') || el.textContent || el.tagName).trim()
    var selector = el.tagName.toLowerCase()
    if (el.id) selector += '#' + el.id
    else if (el.className && typeof el.className === 'string')
      selector += '.' + el.className.trim().split(/\\s+/).join('.')
    return { label: label.slice(0, 40), selector: selector }
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent) return
    var d = e.data
    if (!d || d.source !== 'vibe-studio') return
    parentOrigin = e.origin
    if (d.type === 'ready') {
      window.parent.postMessage({ source: 'vibe-preview', type: 'ready' }, parentOrigin)
    }
  })

  document.addEventListener('click', function (ev) {
    if (!parentOrigin) return
    var info = describe(ev.target)
    window.parent.postMessage(
      { source: 'vibe-preview', type: 'pick', label: info.label, selector: info.selector },
      parentOrigin,
    )
  }, true)
})()
"""


def _scaffold_react(target: Path, name: str) -> None:
    slug = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-") or "app"
    (target / "src").mkdir()
    (target / "public").mkdir()
    (target / "package.json").write_text(_PKG.format(slug=slug), encoding="utf-8")
    (target / "vite.config.js").write_text(_VITE_CONFIG, encoding="utf-8")
    (target / "index.html").write_text(_INDEX_HTML.format(name=name), encoding="utf-8")
    (target / "CLAUDE.md").write_text(_CLAUDE_MD.format(name=name), encoding="utf-8")
    (target / "src" / "main.jsx").write_text(_MAIN_JSX, encoding="utf-8")
    (target / "src" / "App.jsx").write_text(_APP_JSX.format(name=name), encoding="utf-8")
    (target / "src" / "styles.css").write_text(_STYLES, encoding="utf-8")
    (target / "public" / "vibe-preview-bridge.js").write_text(_BRIDGE, encoding="utf-8")
