from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
from app.db.session import get_db
from app.db.models import DailyAnalysis, EloHistory
from app.core.deps import get_current_user
from app.db.models import User
from app.services.elo_service import BASE_RATING, LEVEL_RATINGS, expected_success, target_level
from pydantic import BaseModel
from typing import Optional
from datetime import date, datetime


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
            # timestamptz → UTC 변환 시 하루 밀리지 않도록 date로 캐스팅
            cast(func.date_trunc("week", DailyAnalysis.diary_date), Date).label("week"),
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
        .order_by(DailyAnalysis.diary_date.desc(), DailyAnalysis.created_at.desc())
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


class EloPoint(BaseModel):
    at: datetime
    rating: int
    result: int
    expected: float
    difficulty: int


class EloSummary(BaseModel):
    rating: int
    next_level: int
    next_expected: float
    games: int
    avg_expected: Optional[float]
    actual_rate: Optional[float]
    history: list[EloPoint]


@router.get("/elo", response_model=EloSummary)
async def elo(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(EloHistory)
        .where(EloHistory.user_id == current_user.id)
        .order_by(EloHistory.created_at)
    )
    rows = result.scalars().all()

    rating = current_user.elo if current_user.elo is not None else BASE_RATING
    next_level = target_level(rating)
    games = len(rows)
    return EloSummary(
        rating=rating,
        next_level=next_level,
        next_expected=round(expected_success(rating, LEVEL_RATINGS[next_level]), 3),
        games=games,
        # 예측 성공률 평균과 실제 성공률이 가까울수록 난이도 추정이 잘 맞는다는 뜻
        avg_expected=round(sum(float(r.expected) for r in rows) / games, 3) if games else None,
        actual_rate=round(sum(r.result for r in rows) / games, 3) if games else None,
        history=[
            EloPoint(
                at=r.created_at,
                rating=r.rating_after,
                result=r.result,
                expected=float(r.expected),
                difficulty=r.difficulty,
            )
            for r in rows
        ],
    )
