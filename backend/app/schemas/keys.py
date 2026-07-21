"""Request schema for connecting a model account (BE-009)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class KeyRequest(BaseModel):
    provider: str = "openai"
    api_key: str = Field(min_length=1)
    # Optional. OpenAI's usage/costs endpoints reject project keys, so real usage
    # figures require an Admin key (sk-admin-…). Without it we report local tallies.
    admin_key: str | None = None
