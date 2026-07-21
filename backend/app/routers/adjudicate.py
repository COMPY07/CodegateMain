"""POST /api/adjudicate — gpt-4o red-team judgment on findings found elsewhere.

The deterministic scan runs on the *user's* machine (that is where their files and
their CLI logins are), but the red-team model is the operator's credential and must
never leave the server. So the local agent ships findings here — file/line/category
plus the code slice already extracted — and gets back the adjudicated verdicts.

No file paths are read here and nothing is written: the request carries everything
the probe needs.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from ..deps import get_security_service
from ..services.security_service import SecurityService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["security"])


class AdjudicateRequest(BaseModel):
    findings: list[dict] = Field(default_factory=list)


@router.post("/adjudicate")
async def adjudicate(
    req: AdjudicateRequest,
    security: SecurityService = Depends(get_security_service),
) -> dict:
    findings = [dict(f) for f in req.findings]
    if not findings:
        return {"findings": [], "llm": None, "adjudicated": 0}

    available = security.llm_available()
    if available:
        # Mutates in place: severity/confidence/status/rationale.
        await security.adjudicate(findings)

    return {
        "findings": findings,
        "llm": security.redteam_model if available else None,
        "adjudicated": len(findings) if available else 0,
        "preventedCount": sum(
            1
            for f in findings
            if f.get("severity") in ("high", "critical") and f.get("status") != "dismissed"
        ),
    }
