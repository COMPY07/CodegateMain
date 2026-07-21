async def test_health_ok(client):
    resp = await client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"

    # The user's own logins (what they can chat with)...
    assert set(body["user"]) == {"claudeCode", "codex", "openai", "openaiKey"}
    assert all(isinstance(v, bool) for v in body["user"].values())
    # `openai` is the roll-up: Codex login (primary) or a personal key (fallback).
    assert body["user"]["openai"] == (body["user"]["codex"] or body["user"]["openaiKey"])

    # ...kept separate from the operator's security-scanning credential.
    assert "bin" in body["redteam"]
    assert isinstance(body["redteam"]["available"], bool)


async def test_health_never_leaks_key_material(client):
    """Only booleans and paths — no key strings anywhere in the payload."""
    body = (await client.get("/api/health")).text
    assert "sk-" not in body
