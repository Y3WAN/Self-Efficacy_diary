from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
from app.db.session import get_db
from app.db.models import DailyAnalysis, EloHistory
from app.core.deps import get_current_user
from app.db.models import User
from app.services.elo_service import BASE_RATING, LEVEL_RATINGS, expected_success, target_level
from app.services.analysis_service import INITIAL_REASONING
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
    start_rating: int
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
        # 그래프 첫 점: 첫 미션 결과 반영 전 점수
        start_rating=rows[0].rating_before if rows else rating,
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


# EMA 평활 계수: 클수록 최근 하루의 영향이 커진다 (0.3 ≈ 최근 약 6일 가중)
EMA_ALPHA = 0.3


class DailyScore(BaseModel):
    date: str
    score: float
    ema: float
    confidence: float


@router.get("/daily", response_model=list[DailyScore])
async def daily(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """일별 종합 점수와 EMA 추세선. 하루 하나의 분석(가장 최근 것)만 사용한다."""
    result = await db.execute(
        select(DailyAnalysis)
        .where(
            DailyAnalysis.user_id == current_user.id,
            DailyAnalysis.is_reflected == True,
            DailyAnalysis.composite_score.is_not(None),
        )
        .order_by(DailyAnalysis.diary_date, DailyAnalysis.created_at)
    )
    by_date: dict[date, DailyAnalysis] = {}
    for a in result.scalars().all():
        by_date[a.diary_date] = a  # 같은 날짜면 나중 것이 덮어씀

    out: list[DailyScore] = []
    ema: Optional[float] = None
    for d in sorted(by_date):
        a = by_date[d]
        score = float(a.composite_score)
        ema = score if ema is None else EMA_ALPHA * score + (1 - EMA_ALPHA) * ema
        out.append(DailyScore(
            date=d.isoformat(),
            score=round(score, 3),
            ema=round(ema, 3),
            confidence=float(a.confidence),
        ))
    return out


class AnalysisDetail(BaseModel):
    date: str
    score_m: float
    score_v: float
    score_p: float
    score_a: float
    composite_score: Optional[float]
    confidence: float
    is_reflected: bool
    is_initial: bool
    evidence_m: Optional[str]
    evidence_v: Optional[str]
    evidence_p: Optional[str]
    evidence_a: Optional[str]
    reasoning: Optional[str]


@router.get("/analyses", response_model=list[AnalysisDetail])
async def analyses(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """AI가 매긴 점수의 근거와 확신도를 날짜별로 보여 주기 위한 목록 (최신순)."""
    limit = max(1, min(limit, 100))
    result = await db.execute(
        select(DailyAnalysis)
        .where(DailyAnalysis.user_id == current_user.id)
        .order_by(DailyAnalysis.diary_date.desc(), DailyAnalysis.created_at.desc())
        .limit(limit)
    )
    return [
        AnalysisDetail(
            date=a.diary_date.isoformat(),
            score_m=float(a.score_m),
            score_v=float(a.score_v),
            score_p=float(a.score_p),
            score_a=float(a.score_a),
            composite_score=float(a.composite_score) if a.composite_score is not None else None,
            confidence=float(a.confidence),
            is_reflected=a.is_reflected,
            is_initial=a.reasoning == INITIAL_REASONING,
            evidence_m=a.evidence_m,
            evidence_v=a.evidence_v,
            evidence_p=a.evidence_p,
            evidence_a=a.evidence_a,
            reasoning=a.reasoning,
        )
        for a in result.scalars().all()
    ]
