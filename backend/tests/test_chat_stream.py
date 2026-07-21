"""The chat stream falls back to the deterministic fake provider when no key is set,
so this exercises the full SSE path (message_start -> delta* -> message_done) offline.
"""

import json


def _parse_sse(text: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    event_name = None
    for line in text.splitlines():
        if line.startswith("event:"):
            event_name = line[len("event:"):].strip()
        elif line.startswith("data:") and event_name is not None:
            payload = line[len("data:"):].strip()
            events.append((event_name, json.loads(payload)))
            event_name = None
    return events


async def test_chat_stream_orders_events(client):
    resp = await client.post(
        "/api/chat/stream",
        json={
            "model": "claude",
            "session_id": 1,
            "messages": [{"role": "user", "content": "안녕"}],
            "chips": [{"kind": "element", "label": "URL 입력 필드", "selector": "header input.url"}],
        },
    )
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    names = [name for name, _ in events]

    assert names[0] == "message_start"
    assert names[-1] == "message_done"
    assert "delta" in names

    start = events[0][1]
    assert start["session_id"] == 1
    assert start["model"] == "claude"
    assert start["message_id"].startswith("m_")

    done = events[-1][1]
    reconstructed = "".join(d["text"] for n, d in events if n == "delta")
    assert done["text"].strip() == reconstructed.strip()
