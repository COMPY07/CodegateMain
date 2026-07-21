"""Anthropic (Claude) provider — wraps the official async SDK's streaming helper."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from ...errors import ProviderError, RateLimitError, UpstreamTimeoutError
from .base import (
    ChatMessage,
    StreamDelta,
    StreamDone,
    StreamEvent,
    StreamStart,
)

logger = logging.getLogger(__name__)


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, default_model: str):
        self._api_key = api_key
        self._default_model = default_model
        self._client = None  # lazily constructed so an unset key doesn't error at import

    def available(self) -> bool:
        return bool(self._api_key)

    def _get_client(self):
        if self._client is None:
            import anthropic

            self._client = anthropic.AsyncAnthropic(api_key=self._api_key)
        return self._client

    async def stream_chat(
        self,
        *,
        messages: list[ChatMessage],
        model: str,
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncIterator[StreamEvent]:
        import anthropic

        client = self._get_client()
        model_name = model or self._default_model
        # Anthropic keeps the system prompt out of the messages array.
        api_messages = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]

        yield StreamStart()
        parts: list[str] = []
        try:
            kwargs: dict = {"model": model_name, "max_tokens": max_tokens, "messages": api_messages}
            if system:
                kwargs["system"] = system
            async with client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    parts.append(text)
                    yield StreamDelta(text=text)
                final = await stream.get_final_message()
            usage = {
                "input_tokens": getattr(final.usage, "input_tokens", 0),
                "output_tokens": getattr(final.usage, "output_tokens", 0),
            }
            yield StreamDone(
                text="".join(parts),
                usage=usage,
                finish_reason=final.stop_reason or "stop",
            )
        except anthropic.RateLimitError as e:
            raise RateLimitError("Anthropic rate limit reached.", detail=str(e)) from e
        except anthropic.APITimeoutError as e:
            raise UpstreamTimeoutError("Anthropic request timed out.", detail=str(e)) from e
        except anthropic.APIError as e:
            raise ProviderError("Anthropic API error.", detail=str(e)) from e
