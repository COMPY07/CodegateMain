"""`/api/models` must stay byte-compatible with the frontend mock, and `registered`
must mean "this signed-in user can use this model".

The distinction that matters: `OPENAI_API_KEY` in .env is the operator's **red-team**
credential. It must never make `gpt` appear as a model the user has connected.
"""


from app.config import Settings
from app.services.credentials import CredentialStore
from app.services.llm.registry import ProviderRegistry

# 카탈로그는 실제로 쓸 수 있는 모델만 담는다: Claude(로컬 로그인) + GPT(사용자 키).
MOCK_IDS = ["claude", "gpt"]


def _registry(tmp_path, **settings_over) -> ProviderRegistry:
    base = {"ANTHROPIC_API_KEY": "", "OPENAI_API_KEY": "", "_env_file": None}
    base.update(settings_over)
    return ProviderRegistry(Settings(**base), CredentialStore(tmp_path))


async def test_models_shape_matches_frontend(client):
    resp = await client.get("/api/models")
    assert resp.status_code == 200
    models = resp.json()
    assert [m["id"] for m in models] == MOCK_IDS
    for m in models:
        assert {"id", "name", "vendor", "tile", "registered"}.issubset(m.keys())
        assert isinstance(m["registered"], bool)


async def test_registered_matches_health(client):
    user = (await client.get("/api/health")).json()["user"]
    models = {m["id"]: m for m in (await client.get("/api/models")).json()}
    assert models["claude"]["registered"] is user["claudeCode"]
    # `gpt` is registered by either route: Codex login (primary) or a personal key.
    assert models["gpt"]["registered"] is user["openai"]
    assert user["openai"] == (user["codex"] or user["openaiKey"])


async def test_catalog_only_lists_usable_models(client):
    """빈 껍데기 모델을 목록에 두면 '되는 줄 알았는데 안 되는' 경험이 된다."""
    models = (await client.get("/api/models")).json()
    assert {m["id"] for m in models} == {"claude", "gpt"}


def test_redteam_key_does_not_register_gpt_for_the_user(tmp_path, monkeypatch):
    """The operator's red-team key is not a user login.

    Codex is forced absent so this asserts the credential rule itself, not whatever
    happens to be installed on the machine running the tests.
    """
    monkeypatch.setattr("app.services.llm.registry.codex_available", lambda: False)
    registry = _registry(tmp_path, OPENAI_API_KEY="sk-redteam-operator-key")

    assert registry.is_registered("gpt") is False
    models = {m["id"]: m for m in registry.models_payload()}
    assert models["gpt"]["registered"] is False
    # ...but it is still reported as available for security adjudication.
    assert registry.provider_status()["openaiRedteam"] is True
    assert registry.provider_status()["openaiUser"] is False


def test_codex_login_registers_gpt(tmp_path, monkeypatch):
    """`gpt` rides the Codex CLI login, exactly as `claude` rides Claude Code."""
    monkeypatch.setattr("app.services.llm.registry.codex_available", lambda: True)
    registry = _registry(tmp_path)          # 사용자 키 없음
    assert registry.is_registered("gpt") is True
    assert registry.models_payload()[1]["registered"] is True
    # Codex 로그인은 사용자 키가 아니다 — 키 기반 상태는 그대로 거짓이어야 한다.
    assert registry.provider_status()["openaiUser"] is False


def test_user_key_registers_gpt(tmp_path, monkeypatch):
    """Without Codex, a personal key is still a valid (chat-only) route to `gpt`."""
    monkeypatch.setattr("app.services.llm.registry.codex_available", lambda: False)
    store = CredentialStore(tmp_path)
    registry = ProviderRegistry(Settings(_env_file=None), store)
    assert registry.is_registered("gpt") is False

    store.set("openai", api_key="sk-proj-user-key")
    assert registry.is_registered("gpt") is True, "a stored user key takes effect immediately"
    models = {m["id"]: m for m in registry.models_payload()}
    assert models["gpt"]["registered"] is True
    assert models["gpt"]["usage"] == 0 and models["gpt"]["tokens"] == "0"


def test_claude_is_backed_by_local_claude_code_login(tmp_path):
    """`claude` needs no API key — it rides the user's Claude Code login."""
    registry = _registry(tmp_path)
    from app.services.llm.registry import claude_code_available

    assert registry.is_registered("claude") is claude_code_available()


def test_models_payload_merges_usage(tmp_path):
    store = CredentialStore(tmp_path)
    store.set("openai", api_key="sk-proj-user-key")
    registry = ProviderRegistry(Settings(_env_file=None), store)

    models = {
        m["id"]: m
        for m in registry.models_payload({"gpt": {"usage": 73, "tokens": "22.1k", "source": "openai"}})
    }
    assert models["gpt"]["usage"] == 73
    assert models["gpt"]["tokens"] == "22.1k"
    assert models["gpt"]["usageSource"] == "openai"


def test_unregistered_models_carry_no_usage_fields(tmp_path, monkeypatch):
    """미등록 모델에 0 을 채워 넣으면 '안 썼다' 로 잘못 읽힌다."""
    monkeypatch.setattr("app.services.llm.registry.codex_available", lambda: False)
    models = {m["id"]: m for m in _registry(tmp_path).models_payload()}
    assert models["gpt"]["registered"] is False
    assert "usage" not in models["gpt"]
    assert "tokens" not in models["gpt"]
