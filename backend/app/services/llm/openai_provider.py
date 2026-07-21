"""OpenAI (GPT) provider — wraps the official async SDK's streaming chat completions."""

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


class OpenAIProvider:
    name = "openai"

    def __init__(self, api_key: str, default_model: str):
        self._api_key = api_key
        self._default_model = default_model
        self._client = None

    def available(self) -> bool:
        return bool(self._api_key)

    def _get_client(self):
        if self._client is None:
            import openai

            self._client = openai.AsyncOpenAI(api_key=self._api_key)
        return self._client

    async def stream_chat(
        self,
        *,
        messages: list[ChatMessage],
        model: str,
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncIterator[StreamEvent]:
        import openai

        client = self._get_client()
        model_name = model or self._default_model
        # OpenAI carries the system prompt as the first message.
        api_messages: list[dict] = []
        if system:
            api_messages.append({"role": "system", "content": system})
        api_messages += [{"role": m.role, "content": m.content} for m in messages]

        yield StreamStart()
        parts: list[str] = []
        finish_reason = "stop"
        usage: dict = {}
        try:
            stream = await client.chat.completions.create(
                model=model_name,
                messages=api_messages,
                max_tokens=max_tokens,
                stream=True,
                # Without this a streamed response reports no token counts at all,
                # so the usage tally would sit at zero forever.
                stream_options={"include_usage": True},
            )
            async for chunk in stream:
                # The usage chunk arrives last and carries no choices.
                if chunk.usage is not None:
                    usage = {
                        "input_tokens": chunk.usage.prompt_tokens or 0,
                        "output_tokens": chunk.usage.completion_tokens or 0,
                    }
                if not chunk.choices:
                    continue
                choice = chunk.choices[0]
                delta = choice.delta.content or ""
                if delta:
                    parts.append(delta)
                    yield StreamDelta(text=delta)
                if choice.finish_reason:
                    finish_reason = choice.finish_reason
            yield StreamDone(text="".join(parts), usage=usage, finish_reason=finish_reason)
        except openai.RateLimitError as e:
            raise RateLimitError("OpenAI rate limit reached.", detail=str(e)) from e
        except openai.APITimeoutError as e:
            raise UpstreamTimeoutError("OpenAI request timed out.", detail=str(e)) from e
        except openai.APIError as e:
            raise ProviderError("OpenAI API error.", detail=str(e)) from e
