"""Project file tree, read from the user's own disk.

Moved off the server: these are the user's files, so only their machine can list them.
The shape matches what LeftSidebar already renders, so the component did not change.

Depth and entry budgets are hard caps, not tuning knobs — a symlink loop or a stray
`node_modules` would otherwise walk forever and hang the studio.
"""

from __future__ import annotations

from pathlib import Path

_SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".vite", "__pycache__", ".venv"}
_MAX_DEPTH = 8
_MAX_ENTRIES = 2000

_ICONS = {
    ".jsx": "⚛", ".tsx": "⚛", ".js": "⚛", ".ts": "⚛",
    ".css": "🎨", ".scss": "🎨",
    ".json": "📦",
    ".md": "📄",
    ".html": "🌐",
    ".py": "🐍",
    ".c": "🔧", ".cpp": "🔧", ".h": "🔧",
}


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
