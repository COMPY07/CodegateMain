"""Project file tree, read from the user's own disk.

Moved off the server: these are the user's files, so only their machine can list them.
The shape matches what LeftSidebar already renders, so the component did not change.

Depth and entry budgets are hard caps, not tuning knobs — a symlink loop or a stray
`node_modules` would otherwise walk forever and hang the studio.
"""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from pathlib import PurePosixPath

_SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".vite", "__pycache__", ".venv"}
_MAX_DEPTH = 8
_MAX_ENTRIES = 2000
_MAX_TEXT_BYTES = 2 * 1024 * 1024
_MAX_MEDIA_BYTES = 8 * 1024 * 1024

_ICONS = {
    ".jsx": "⚛", ".tsx": "⚛", ".js": "⚛", ".ts": "⚛",
    ".css": "🎨", ".scss": "🎨",
    ".json": "📦",
    ".md": "📄",
    ".html": "🌐",
    ".py": "🐍",
    ".c": "🔧", ".cpp": "🔧", ".h": "🔧",
}

_LANGUAGES = {
    ".jsx": "jsx", ".tsx": "tsx", ".js": "javascript", ".ts": "typescript",
    ".css": "css", ".scss": "css", ".html": "html", ".xml": "xml",
    ".json": "json", ".md": "markdown", ".markdown": "markdown",
    ".sh": "bash", ".bash": "bash", ".py": "python", ".java": "java",
    ".rs": "rust", ".go": "go", ".c": "c", ".cpp": "cpp",
    ".h": "c", ".hpp": "cpp", ".txt": "text",
}
_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif", ".ico"}


def icon_for(name: str) -> str:
    return _ICONS.get(Path(name).suffix.lower(), "📄")


def _walk(directory: Path, depth: int, budget: list[int]) -> list[dict]:
    if depth > _MAX_DEPTH or budget[0] <= 0:
        return []
    try:
        entries = sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
    except OSError:
        return []

    out: list[dict] = []
    for entry in entries:
        if budget[0] <= 0:
            break
        name = entry.name
        # AppleDouble sidecars appear on non-APFS volumes (this repo lives on one).
        if name.startswith("._") or name in _SKIP_DIRS:
            continue
        if entry.is_symlink():
            continue  # a link out of the project is not the project's content
        if entry.is_dir():
            children = _walk(entry, depth + 1, budget)
            budget[0] -= 1
            out.append({"name": name, "type": "folder", "open": depth == 0,
                        "children": children})
        elif entry.is_file():
            if name.startswith("."):
                continue
            budget[0] -= 1
            out.append({"name": name, "type": "file", "icon": icon_for(name)})
    return out


def build(project_dir: Path) -> list[dict]:
    """One root node named after the project, matching the studio's tree shape."""
    if not project_dir.is_dir():
        return []
    budget = [_MAX_ENTRIES]
    return [
        {
            "name": project_dir.name,
            "type": "folder",
            "open": True,
            "children": _walk(project_dir, 0, budget),
        }
    ]


def read(project_dir: Path, requested_path: str) -> dict:
    """Read one file from a project without allowing path or symlink escapes."""
    root = project_dir.resolve()
    raw = PurePosixPath((requested_path or "").replace("\\", "/"))
    parts = list(raw.parts)
    if parts and parts[0] == root.name:
        parts = parts[1:]
    if raw.is_absolute() or not parts or any(part in {"", ".", ".."} for part in parts):
        raise ValueError("올바른 프로젝트 파일 경로가 아닙니다.")

    target = root.joinpath(*parts).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise ValueError("프로젝트 폴더 밖의 파일은 읽을 수 없습니다.") from exc
    if not target.is_file():
        raise ValueError("선택한 파일을 찾을 수 없습니다.")

    suffix = target.suffix.lower()
    is_media = suffix in _IMAGE_SUFFIXES or suffix == ".pdf"
    limit = _MAX_MEDIA_BYTES if is_media else _MAX_TEXT_BYTES
    if target.stat().st_size > limit:
        return {"type": "binary", "name": target.name, "reason": "too_large"}

    payload = target.read_bytes()
    if is_media:
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        encoded = base64.b64encode(payload).decode("ascii")
        return {
            "type": "pdf" if suffix == ".pdf" else "image",
            "name": target.name,
            "mime": mime,
            "url": f"data:{mime};base64,{encoded}",
        }
    if b"\x00" in payload:
        return {"type": "binary", "name": target.name}
    try:
        code = payload.decode("utf-8")
    except UnicodeDecodeError:
        return {"type": "binary", "name": target.name}
    return {
        "type": "text",
        "name": target.name,
        "language": _LANGUAGES.get(suffix, "text"),
        "code": code,
    }
