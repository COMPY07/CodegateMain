"""Vulnerability scan endpoints (BE-007) backed by sa-redteam + OpenAI adjudication."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_security_service
from ..errors import AppError
from ..schemas.security import ScanRequest
from ..services.security_service import SecurityService

router = APIRouter(tags=["security"])


@router.post("/scan")
async def scan(
    req: ScanRequest,
    service: SecurityService = Depends(get_security_service),
) -> dict:
    return await service.scan(
        project_root=req.project_root,
        changed_files=req.changed_files,
        goals=req.goals,
        model_output=req.model_output,
        user_prompt=req.user_prompt,
        use_llm=req.use_llm,
    )


@router.get("/scan/{run_id}")
async def get_scan(
    run_id: str,
    service: SecurityService = Depends(get_security_service),
) -> dict:
    cached = service.get_cached(run_id)
    if cached is None:
        raise AppError(f"No cached scan for runId '{run_id}'.", http_status=404)
    return cached
