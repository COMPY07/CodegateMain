"""The loopback server is the sensitive surface: a local port a web page can reach.

Each test here pins one control. If any of them regress, some website the user
happens to visit could read what they are working on.
"""

import json
import threading
import urllib.error
import urllib.request
from pathlib import Path

import pytest

from codegate_agent.server import DEFAULT_ORIGINS, serve

TOKEN = "test-token-abc"
STUDIO = DEFAULT_ORIGINS[0]


@pytest.fixture
def agent():
    httpd = serve(port=0, origins=DEFAULT_ORIGINS, token=TOKEN)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    yield port
    httpd.shutdown()
    httpd.server_close()


def _get(port, path, *, origin=None, token=None, host=None):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}")
    if origin:
        req.add_header("Origin", origin)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    if host:
        req.add_header("Host", host)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, dict(resp.headers), json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b"{}")


def _post(port, path, body, *, origin=STUDIO, token=TOKEN):
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}{path}",
        data=json.dumps(body).encode(),
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    if origin:
        req.add_header("Origin", origin)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, dict(resp.headers), json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b"{}")


def test_binds_loopback_only(agent):
    """0.0.0.0 would publish the user's activity to their whole network."""
    import socket

    with socket.socket() as s:
        s.settimeout(1)
        local_ip = socket.gethostbyname(socket.gethostname())
        if local_ip.startswith("127."):
            pytest.skip("이 머신에는 비루프백 주소가 없습니다")
        assert s.connect_ex((local_ip, agent)) != 0, "루프백 밖에서 접속되면 안 된다"


def test_status_requires_a_token(agent):
    status, _, body = _get(agent, "/local/projects", origin=STUDIO)
    assert status == 401
    assert "tools" not in body


def test_wrong_token_is_rejected(agent):
    status, _, _ = _get(agent, "/local/projects", origin=STUDIO, token="guessed")
    assert status == 401


def test_valid_token_returns_data(agent):
    status, headers, body = _get(agent, "/local/projects", origin=STUDIO, token=TOKEN)
    assert status == 200
    assert "projects" in body
    assert headers.get("Access-Control-Allow-Origin") == STUDIO


def test_unknown_origin_is_refused_even_with_a_valid_token(agent):
    status, headers, _ = _get(
        agent, "/local/projects", origin="https://evil.example", token=TOKEN
    )
    assert status == 403
    assert "Access-Control-Allow-Origin" not in headers


def test_never_answers_with_a_wildcard_origin(agent):
    _, headers, _ = _get(agent, "/local/projects", origin=STUDIO, token=TOKEN)
    assert headers.get("Access-Control-Allow-Origin") != "*"


def test_rebinding_host_header_is_rejected(agent):
    """DNS rebinding: attacker.com resolves to 127.0.0.1 so their page looks local."""
    status, _, _ = _get(
        agent, "/local/projects", origin=STUDIO, token=TOKEN, host="attacker.example"
    )
    assert status == 403


def test_ping_is_open_but_carries_nothing_sensitive(agent):
    status, _, body = _get(agent, "/local/ping", origin=STUDIO)
    assert status == 200
    assert set(body) <= {"app", "ready"}
    assert "tools" not in body


def test_unknown_path_is_404_not_a_file_read(agent):
    status, _, _ = _get(agent, "/../../etc/passwd", origin=STUDIO, token=TOKEN)
    assert status in (403, 404)


def test_payload_carries_no_conversation_content(agent):
    _, _, body = _get(agent, "/local/projects", origin=STUDIO, token=TOKEN)
    serialized = json.dumps(body)
    for leak in ("content", "text", "prompt", "message"):
        assert f'"{leak}"' not in serialized, f"대화 내용 키 '{leak}' 가 응답에 있으면 안 된다"


def test_config_dir_is_never_the_working_directory(monkeypatch, tmp_path):
    """`Path("") or fallback` yields Path(".") — an empty Path is truthy.

    That bug wrote the pairing token into whatever directory the agent was started
    from, which on this project is a repo on an exFAT volume that ignores chmod.
    """
    from codegate_agent import server

    monkeypatch.delenv("CODEGATE_CONFIG_DIR", raising=False)
    default = server._config_dir()
    assert default.is_absolute()
    assert default != Path(".").resolve()
    assert default == Path.home() / ".config" / "codegate"

    monkeypatch.setenv("CODEGATE_CONFIG_DIR", "   ")
    assert server._config_dir() == Path.home() / ".config" / "codegate", "공백만 있으면 무시"

    monkeypatch.setenv("CODEGATE_CONFIG_DIR", str(tmp_path / "cfg"))
    assert server._config_dir() == tmp_path / "cfg"


def test_preflight_advertises_method_and_caches(agent):
    """The studio polls often and Authorization makes every poll preflighted."""
    req = urllib.request.Request(f"http://127.0.0.1:{agent}/local/projects", method="OPTIONS")
    req.add_header("Origin", STUDIO)
    req.add_header("Access-Control-Request-Method", "GET")
    req.add_header("Access-Control-Request-Headers", "authorization")
    with urllib.request.urlopen(req, timeout=5) as resp:
        assert resp.status == 204
        assert "GET" in resp.headers["Access-Control-Allow-Methods"]
        assert int(resp.headers["Access-Control-Max-Age"]) > 0


def test_native_folder_picker_registers_an_existing_project(monkeypatch, tmp_path):
    from codegate_agent import server

    managed = tmp_path / "managed"
    managed.mkdir()
    existing = tmp_path / "elsewhere" / "shop"
    existing.mkdir(parents=True)
    (existing / "package.json").write_text('{"scripts":{"dev":"vite"}}')
    monkeypatch.setattr(server, "choose_project_folder", lambda: existing)
    httpd = serve(
        port=0,
        origins=DEFAULT_ORIGINS,
        token=TOKEN,
        projects_dir=managed,
    )
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    try:
        status, _, opened = _post(port, "/local/projects/open", {})
        assert status == 200
        assert opened["id"].startswith("opened:")
        status, _, listed = _get(port, "/local/projects", origin=STUDIO, token=TOKEN)
        assert status == 200
        assert [item["id"] for item in listed["projects"]] == [opened["id"]]
    finally:
        httpd.shutdown()
        httpd.server_close()
