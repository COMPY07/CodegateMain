"""LLM provider abstraction.

A provider streams a chat completion as a sequence of StreamEvent objects. The chat
router turns these into SSE events for the frontend. The same interface powers the
agent orchestration loop in a later increment.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Literal, Protocol, runtime_checkable


@dataclass
class ChatMessage:
    role: Literal["user", "assistant", "system"]
    content: str


@dataclass
class StreamStart:
    type: Literal["start"] = "start"


@dataclass
class StreamDelta:
    text: str
    type: Literal["delta"] = "delta"


@dataclass
class StreamDone:
    text: str
    usage: dict = field(default_factory=dict)
    finish_reason: str = "stop"
    type: Literal["done"] = "done"


@dataclass
class StreamError:
    code: str
    message: str
    type: Literal["error"] = "error"


StreamEvent = StreamStart | StreamDelta | StreamDone | StreamError


@runtime_checkable
class LlmProvider(Protocol):
    name: str

    def available(self) -> bool:
        """True when the provider has server-side credentials configured."""
        ...

    def stream_chat(
        self,
        *,
        messages: list[ChatMessage],
        model: str,
        system: str | None = None,
        max_tokens: int = 4096,
    ) -> AsyncIterator[StreamEvent]:
        """Yield StreamStart, then StreamDelta*, then StreamDone (or StreamError)."""
        ...
