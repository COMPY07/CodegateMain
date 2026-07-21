"""Local code review endpoint (BE-006).

Runs the same security engine as /api/scan and adds a compact, severity-ranked
summary suitable for feeding straight back into the code-fix loop.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..deps import get_security_service
from ..schemas.security import ReviewRequest
from ..services.security_service import SecurityService

router = APIRouter(tags=["security"])

_SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


def _summarize(findings: list[dict]) -> str:
    active = [f for f in findings if f["status"] != "dismissed"]
    if not active:
        return "검수 결과: 지적된 보안 이슈가 없습니다."
    ranked = sorted(
        active, key=lambda f: (_SEV_ORDER.get(f["severity"], 9), -f["confidence"])
    )
    lines = [f"검수 결과: {len(active)}건. high/critical 부터 수정하세요."]
    for f in ranked[:12]:
        fn = f" ({f['function']})" if f.get("function") else ""
        lines.append(
            f"- [{f['severity'].upper()}] {f['category']} @ "
            f"{f['file']}:{f['startLine']}{fn}\n    {f['title']}\n    fix: {f['suggestedFix']}"
        )
    if len(ranked) > 12:
        lines.append(f"...외 {len(ranked) - 12}건")
    return "\n".join(lines)


@router.post("/review")
async def review(
    req: ReviewRequest,
    service: SecurityService = Depends(get_security_service),
) -> dict:
    result = await service.scan(
        project_root=req.project_root,
        changed_files=req.changed_files,
        goals=req.goals,
        model_output=req.model_output,
        user_prompt=req.user_prompt,
        use_llm=req.use_llm,
    )
    dismissed = sum(1 for f in result["findings"] if f["status"] == "dismissed")
    return {
        "sessionId": req.session_id,
        "runId": result["runId"],
        "llm": result["llm"],
        "findings": result["findings"],
        "preventedCount": result["preventedCount"],
        "dismissedCount": dismissed,
        "summary": _summarize(result["findings"]),
    }
