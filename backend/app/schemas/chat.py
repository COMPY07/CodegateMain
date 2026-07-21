"""Request schemas for the streaming chat endpoint (BE-003)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChipIn(BaseModel):
    """A "question mode" selection token from the frontend (Point-to-Prompt)."""

    kind: Literal["element", "region"]
    label: str
    selector: str


class ChatRequest(BaseModel):
    session_id: int | None = None
    model: str = "claude"  # frontend model id
    messages: list[ChatMessageIn] = Field(default_factory=list)
    chips: list[ChipIn] = Field(default_factory=list)
    max_tokens: int = 4096
