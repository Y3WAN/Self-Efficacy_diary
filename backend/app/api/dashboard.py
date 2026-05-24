from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.db.models import DailyAnalysis
from app.core.deps import get_current_user
from app.db.models import User
from pydantic import BaseModel
from typing import Optional
from datetime import date


class WeekScore(BaseModel):
    week: str
    avg_score: float


class RadarScore(BaseModel):
    score_m: float
    score_v: float
    score_p: float
    score_a: float


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/growth", response_model=list[WeekScore])
async def growth(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            func.date_trunc("week", DailyAnalysis.diary_date).label("week"),
            func.avg(DailyAnalysis.composite_score).label("avg_score"),
        )
        .where(
            DailyAnalysis.user_id == current_user.id,
            DailyAnalysis.is_reflected == True,
        )
        .group_by("week")
        .order_by("week")
    )
    rows = result.all()
    return [
        WeekScore(
            week=r.week.strftime("%Y-%m-%d") if hasattr(r.week, "strftime") else str(r.week)[:10],
            avg_score=round(float(r.avg_score), 3),
        )
        for r in rows
        if r.avg_score is not None
    ]


@router.get("/radar", response_model=Optional[RadarScore])
async def radar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DailyAnalysis)
        .where(
            DailyAnalysis.user_id == current_user.id,
            DailyAnalysis.is_reflected == True,
        )
        .order_by(DailyAnalysis.diary_date.desc())
        .limit(1)
    )
    a = result.scalar_one_or_none()
    if not a:
        return None
    return RadarScore(
        score_m=float(a.score_m),
        score_v=float(a.score_v),
        score_p=float(a.score_p),
        score_a=float(a.score_a),
    )
