"""Request schemas for the security endpoints (BE-006 review, BE-007 scan)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class ScanRequest(BaseModel):
    # Absolute or relative path to the project to scan. Falls back to WORKSPACE_ROOT.
    project_root: str | None = None
    changed_files: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    model_output: str = ""
    user_prompt: str = ""
    # Run the OpenAI red-team adjudication pass on top of the deterministic scan.
    use_llm: bool = True


class ReviewRequest(BaseModel):
    session_id: int | None = None
    project_root: str | None = None
    changed_files: list[str] = Field(default_factory=list)
    goals: list[str] = Field(default_factory=list)
    model_output: str = ""
    user_prompt: str = ""
    use_llm: bool = True
