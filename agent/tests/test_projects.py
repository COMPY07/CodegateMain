"""Project store: names come from a browser, so treat every one as hostile."""

import json
import sys

import pytest

from codegate_agent import filetree
from codegate_agent.projects import ProjectError, ProjectStore, valid_name


@pytest.fixture
def store(tmp_path):
    root = tmp_path / "projects"
    root.mkdir()
    return ProjectStore(root)


# ---- name handling -----------------------------------------------------------


@pytest.mark.parametrize(
    "name",
    ["../evil", "..", "a/b", "/etc/passwd", "", ".hidden", "x" * 65, "a\x00b", "a b/../c"],
)
def test_hostile_names_are_refused(store, name):
    assert valid_name(name) is False
    with pytest.raises(ProjectError):
        store.resolve(name)


@pytest.mark.parametrize("name", ["app", "my-app", "my_app.v2", "한글프로젝트", "A1"])
def test_reasonable_names_are_accepted(store, name):
    assert valid_name(name) is True
    assert store.resolve(name).parent == store.root.resolve()


def test_resolution_stays_directly_under_the_root(store):
    """Even a name that passes the pattern must land in the root, not below it."""
    resolved = store.resolve("app")
    assert resolved.parent == store.root.resolve()
    assert resolved.name == "app"


# ---- creation ----------------------------------------------------------------


def test_created_project_runs_and_is_scaffolded(store):
    info = store.create("demo")

    assert info["name"] == "demo"
    assert info["runnable"] is True, "package.json 이 있어야 프리뷰를 띄울 수 있다"

    root = store.resolve("demo")
    for expected in ("package.json", "index.html", "vite.config.js", "CLAUDE.md",
                     "src/App.jsx", "src/main.jsx", "src/styles.css",
                     "public/vibe-preview-bridge.js"):
        assert (root / expected).is_file(), f"{expected} 누락"

    pkg = json.loads((root / "package.json").read_text())
    assert pkg["scripts"]["dev"] == "vite"


def test_package_name_is_slugified(store):
    """npm names must be lowercase and url-safe; folder names need not be."""
    store.create("My-App")
    assert json.loads((store.resolve("My-App") / "package.json").read_text())["name"] == "my-app"

    # 전부 비-ASCII 인 이름도 npm 이 받는 값으로 떨어져야 한다.
    store.create("한글프로젝트")
    pkg = json.loads((store.resolve("한글프로젝트") / "package.json").read_text())
    assert pkg["name"] and pkg["name"].isascii()


def test_creating_twice_is_refused(store):
    store.create("demo")
    with pytest.raises(ProjectError, match="이미 있습니다"):
        store.create("demo")


def test_empty_template_makes_a_plain_folder(store):
    info = store.create("notes", template="empty")
    assert info["runnable"] is False
    assert (store.resolve("notes") / "README.md").is_file()


def test_failed_creation_leaves_nothing_behind(store, monkeypatch):
    """A half-written project would be the user's problem to clean up."""
    monkeypatch.setattr(
        "codegate_agent.projects._scaffold_react",
        lambda target, name: (_ for _ in ()).throw(OSError("디스크 가득")),
    )
    with pytest.raises(ProjectError):
        store.create("doomed")
    assert not (store.root / "doomed").exists()


# ---- listing -----------------------------------------------------------------


def test_listing_skips_noise(store):
    store.create("real")
    (store.root / "node_modules").mkdir()
    (store.root / ".cache").mkdir()
    (store.root / "loose.txt").write_text("x")

    assert [p["name"] for p in store.list()] == ["real"]


def test_listing_a_missing_root_is_empty(tmp_path):
    assert ProjectStore(tmp_path / "nope").list() == []


def test_runnable_reflects_package_json(store):
    store.create("web")
    store.create("plain", template="empty")
    by_name = {p["name"]: p for p in store.list()}

    assert by_name["web"]["runnable"] is True
    assert by_name["plain"]["runnable"] is False

    no_dev = store.root / "no-dev"
    no_dev.mkdir()
    (no_dev / "package.json").write_text('{"scripts":{"build":"vite build"}}')
    assert ProjectStore.describe(no_dev)["runnable"] is False


def test_opened_folder_gets_an_opaque_id_and_resolves(tmp_path):
    root = tmp_path / "managed"
    root.mkdir()
    external = tmp_path / "somewhere" / "existing-app"
    external.mkdir(parents=True)
    (external / "package.json").write_text('{"scripts":{"dev":"vite"}}')
    registry = tmp_path / "config" / "projects.json"

    store = ProjectStore(root, registry_file=registry)
    opened = store.open(external)

    assert opened["id"].startswith("opened:")
    assert opened["id"] != str(external), "브라우저는 경로 대신 opaque id 로 다시 요청한다"
    assert store.resolve(opened["id"]) == external.resolve()
    assert opened["opened"] is True

    restored = ProjectStore(root, registry_file=registry)
    assert restored.resolve(opened["id"]) == external.resolve()


def test_opened_project_name_collision_is_safe(tmp_path):
    root = tmp_path / "managed"
    root.mkdir()
    first = tmp_path / "a" / "web"
    second = tmp_path / "b" / "web"
    first.mkdir(parents=True)
    second.mkdir(parents=True)
    store = ProjectStore(root)

    a = store.open(first)
    b = store.open(second)
    assert a["id"] != b["id"]
    assert store.resolve(a["id"]) == first.resolve()
    assert store.resolve(b["id"]) == second.resolve()


# ---- file tree ---------------------------------------------------------------


def test_tree_shape_matches_the_studio(store):
    store.create("demo")
    tree = filetree.build(store.resolve("demo"))

    assert len(tree) == 1
    root = tree[0]
    assert root["name"] == "demo" and root["type"] == "folder" and root["open"] is True
    names = {c["name"] for c in root["children"]}
    assert {"src", "public", "package.json"} <= names
    for child in root["children"]:
        assert child["type"] in ("folder", "file")
        if child["type"] == "file":
            assert child["icon"]


def test_tree_hides_heavy_and_hidden_entries(store):
    store.create("demo")
    root = store.resolve("demo")
    (root / "node_modules").mkdir()
    (root / ".env").write_text("SECRET=1")
    (root / "._AppleDouble").write_text("")

    names = {c["name"] for c in filetree.build(root)[0]["children"]}
    assert "node_modules" not in names
    assert ".env" not in names, "점 파일은 비밀을 담기 쉬워 노출하지 않는다"
    assert "._AppleDouble" not in names


def test_tree_does_not_follow_symlinks_out(store, tmp_path):
    store.create("demo")
    root = store.resolve("demo")
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("x")
    (root / "link").symlink_to(outside)

    names = {c["name"] for c in filetree.build(root)[0]["children"]}
    assert "link" not in names


def test_tree_of_a_missing_project_is_empty(tmp_path):
    assert filetree.build(tmp_path / "nope") == []


# ---- preview -----------------------------------------------------------------


def test_preview_refuses_a_project_it_cannot_run(tmp_path):
    """package.json 없는 폴더에 ▶ 를 눌러도 npm 을 띄우지 않는다."""
    from codegate_agent.preview import PreviewService

    plain = tmp_path / "notes"
    plain.mkdir()
    with pytest.raises(RuntimeError, match="package.json"):
        PreviewService(plain)._workspace()


def test_preview_without_a_project_says_so():
    from codegate_agent.preview import PreviewService

    with pytest.raises(RuntimeError, match="프로젝트가 지정되지"):
        PreviewService(None)._workspace()


def test_preview_argv_never_reaches_a_shell():
    """Fixed argv: a project name can never be interpreted as a command."""
    from codegate_agent.preview import _DEV_ARGV, _INSTALL_ARGV

    assert _DEV_ARGV == ["npm", "run", "dev"]
    assert _INSTALL_ARGV[:2] == ["npm", "install"]
    for argv in (_DEV_ARGV, _INSTALL_ARGV):
        assert all(isinstance(a, str) for a in argv)
        assert not any(c in " ".join(argv) for c in ";|&$`")


def test_preview_process_stays_alive_after_start_returns(tmp_path, monkeypatch):
    """Regression: asyncio.run() used to cancel the log pump at request completion."""
    from codegate_agent import preview

    project = tmp_path / "web"
    project.mkdir()
    (project / "node_modules").mkdir()
    (project / "package.json").write_text('{"scripts":{"dev":"fake"}}')
    command = [
        sys.executable,
        "-u",
        "-c",
        "import time; print('Local: http://localhost:54321', flush=True); time.sleep(60)",
    ]
    monkeypatch.setattr(preview, "_commands", lambda _path: (command, ["unused"]))
    service = preview.PreviewService(project)

    try:
        started = service.start()
        assert started["running"] is True
        assert started["url"] == "http://localhost:54321"
        assert started["projectPath"] == str(project.resolve())
        assert service.status()["running"] is True
    finally:
        stopped = service.stop()
    assert stopped["running"] is False
