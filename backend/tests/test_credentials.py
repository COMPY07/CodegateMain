"""Credential store (BE-009): keys are stored privately and never surfaced."""

import json
import stat
from pathlib import Path

from app.services.credentials import CredentialStore, default_config_dir, mask


def test_roundtrip_and_delete(tmp_path):
    store = CredentialStore(tmp_path)
    assert store.has("openai") is False

    store.set("openai", api_key="sk-proj-abcdefghijklmnop", admin_key="sk-admin-1234")
    assert store.api_key("openai") == "sk-proj-abcdefghijklmnop"
    assert store.admin_key("openai") == "sk-admin-1234"
    assert store.has("openai") is True

    assert store.delete("openai") is True
    assert store.has("openai") is False
    assert store.delete("openai") is False


def test_store_file_is_owner_only(tmp_path):
    store = CredentialStore(tmp_path)
    store.set("openai", api_key="sk-proj-secret")
    path = tmp_path / "credentials.json"
    mode = stat.S_IMODE(path.stat().st_mode)
    assert mode == 0o600, f"credential file must be owner-only, got {oct(mode)}"


def test_describe_never_includes_the_key(tmp_path):
    store = CredentialStore(tmp_path)
    store.set("openai", api_key="sk-proj-abcdefghijklmnop", admin_key="sk-admin-xyz")
    d = store.describe("openai")

    assert d["registered"] is True
    assert d["hasAdminKey"] is True
    serialized = json.dumps(d)
    assert "sk-proj-abcdefghijklmnop" not in serialized
    assert "sk-admin-xyz" not in serialized
    # the hint is recognisable but unusable
    assert d["keyHint"].startswith("sk-proj") and "…" in d["keyHint"]


def test_admin_key_is_optional(tmp_path):
    store = CredentialStore(tmp_path)
    store.set("openai", api_key="sk-proj-only")
    assert store.admin_key("openai") == ""
    assert store.describe("openai")["hasAdminKey"] is False


def test_corrupt_store_does_not_crash(tmp_path):
    (tmp_path / "credentials.json").write_text("{ not json")
    store = CredentialStore(tmp_path)
    assert store.has("openai") is False
    # and it recovers on the next write
    store.set("openai", api_key="sk-proj-new")
    assert store.api_key("openai") == "sk-proj-new"


def test_mask():
    assert mask("") == ""
    assert mask("sk-proj-abcdefghijklmnop").startswith("sk-proj")
    assert "abcdefghijkl" not in mask("sk-proj-abcdefghijklmnop")
    assert mask("short") == "sho…"


def test_credentials_live_outside_the_repo(monkeypatch, tmp_path):
    """This checkout can sit on exFAT, where chmod is ignored and files read as 0700.

    Storing keys under the user's home config dir keeps real POSIX permissions and
    keeps secrets out of the repository entirely.
    """
    monkeypatch.setenv("CODEGATE_CONFIG_DIR", str(tmp_path / "cfg"))
    assert default_config_dir() == tmp_path / "cfg"

    monkeypatch.delenv("CODEGATE_CONFIG_DIR", raising=False)
    default = default_config_dir()
    assert default.is_absolute()
    repo_root = Path(__file__).resolve().parents[2]
    assert repo_root not in default.parents and default != repo_root
