"""Deterministic offline provider — lets the whole chat path run without any API key.

Used by tests and for local development before real keys are wired. It echoes a short,
deterministic reply, streamed word by word so the frontend's incremental rendering can
be exercised end to end.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from .base import ChatMessage, StreamDelta, StreamDone, StreamEvent, StreamStart


class FakeProvider:
    name = "fake"

    def available(self) -> bool:
        return True

    async def stream_chat(
        self,
        *,
        messages: list[ChatMessage],
        model: str,
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncIterator[StreamEvent]:
        last_user = next(
            (m.content for m in reversed(messages) if m.role == "user"), ""
        )
        reply = (
            f"[fake:{model or 'default'}] 요청을 확인했습니다. "
            f"에이전트 CoT 탭에서 진행 상황을 확인할 수 있어요. "
            f"(입력 요약: {last_user[:60]})"
        )
        yield StreamStart()
        for token in reply.split(" "):
            yield StreamDelta(text=token + " ")
        yield StreamDone(
            text=reply,
            usage={"input_tokens": len(last_user.split()), "output_tokens": len(reply.split())},
            finish_reason="stop",
        )
