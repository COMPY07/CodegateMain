"""Small helpers for Server-Sent Events built on sse-starlette.

We use sse-starlette's EventSourceResponse for correct multi-line framing, periodic
ping comments (keeps proxies from buffering), and client-disconnect detection — the
latter lets a chat stream cancel its upstream provider call when the browser tab closes.
"""

from __future__ import annotations

import json
from typing import Any


def sse_event(event: str, data: Any) -> dict[str, str]:
    """Build an sse-starlette event payload. `data` is JSON-encoded."""
    return {"event": event, "data": json.dumps(data, ensure_ascii=False)}
