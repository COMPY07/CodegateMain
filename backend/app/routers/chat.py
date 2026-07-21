"""POST /api/chat/stream — streaming LLM chat over Server-Sent Events (BE-003).

Emits: message_start -> delta* -> message_done, or an `error` event on failure.
The frontend consumes these to replace the setTimeout mock in App.jsx `send()`.
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Request
from sse_starlette.sse import EventSourceResponse

from ..deps import get_registry, get_usage_service
from ..errors import AppError
from ..schemas.chat import ChatRequest
from ..services.llm.base import (
    ChatMessage,
    StreamDelta,
    StreamDone,
    StreamError,
    StreamStart,
)
from ..services.llm.registry import ProviderRegistry
from ..services.usage_service import UsageService
from ..sse import sse_event

logger = logging.getLogger(__name__)

router = APIRouter(tags=["chat"])

_SYSTEM_BASE = (
    "You are the coding agent inside Vibe Studio, an AI development studio for "
    '"vibe coders". Respond helpfully and concisely in the user\'s language '
    "(Korean unless they write otherwise)."
)


def _build_system_prompt(req: ChatRequest) -> str:
    if not req.chips:
        return _SYSTEM_BASE
    # Chip context: the user clicked on-screen elements ("question mode"). The human
    # label is what they see; the selector is the precise anchor a later edit step
    # (BE-004) will act on. Surface both so the model targets the right element.
    lines = [
        f'- "{c.label}" (selector: {c.selector})' for c in req.chips
    ]
    return (
        _SYSTEM_BASE
        + "\n\nThe user selected these on-screen elements to act on:\n"
        + "\n".join(lines)
    )


async def _event_stream(
    req: ChatRequest, registry: ProviderRegistry, usage: UsageService
) -> AsyncIterator[dict]:
    provider, model_name = registry.resolve(req.model)
    messages = [ChatMessage(role=m.role, content=m.content) for m in req.messages]
    system = _build_system_prompt(req)
    message_id = "m_" + uuid.uuid4().hex[:12]

    try:
        async for ev in provider.stream_chat(
            messages=messages,
            model=model_name,
            system=system,
            max_tokens=req.max_tokens,
        ):
            if isinstance(ev, StreamStart):
                yield sse_event(
                    "message_start",
                    {"session_id": req.session_id, "model": req.model, "message_id": message_id},
                )
            elif isinstance(ev, StreamDelta):
                yield sse_event("delta", {"text": ev.text})
            elif isinstance(ev, StreamDone):
                # Feeds the local tally, which is all we can show without an Admin key.
                usage.record(
                    registry.usage_provider(req.model),
                    model_name,
                    input_tokens=ev.usage.get("input_tokens", 0),
                    output_tokens=ev.usage.get("output_tokens", 0),
                )
                yield sse_event(
                    "message_done",
                    {"text": ev.text, "usage": ev.usage, "finish_reason": ev.finish_reason},
                )
            elif isinstance(ev, StreamError):
                yield sse_event("error", {"code": ev.code, "message": ev.message})
    except AppError as e:
        yield sse_event("error", e.to_dict())
    except Exception as e:  # noqa: BLE001 — deliver any failure to the client, don't 500 mid-stream
        logger.exception("chat stream failed")
        yield sse_event("error", {"code": "internal_error", "message": str(e)})


@router.post("/chat/stream")
async def chat_stream(
    req: ChatRequest,
    request: Request,
    registry: ProviderRegistry = Depends(get_registry),
    usage: UsageService = Depends(get_usage_service),
) -> EventSourceResponse:
    return EventSourceResponse(_event_stream(req, registry, usage))
