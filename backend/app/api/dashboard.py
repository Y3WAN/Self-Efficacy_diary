from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, cast, Date
from app.db.session import get_db
from app.db.models import DailyAnalysis, Diary, EloHistory
from app.core.deps import get_current_user
from app.db.models import User
from app.services.elo_service import BASE_RATING, LEVEL_RATINGS, expected_success, target_level
from app.services.analysis_service import INITIAL_REASONING
from app.services.mission_service import load_source_profile
from app.services.scoring import (
    SOURCES, composite_score, ema_step, evidence_string, known_scores, source_contributions,
)
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


class RadarResponse(RadarScore):
    # 최근 7일 동안 근거가 있었던 날 수 (0이면 그 원천은 출발점 값 그대로)
    days_m: int = 0
    days_v: int = 0
    days_p: int = 0
    days_a: int = 0


@router.get("/radar", response_model=Optional[RadarResponse])
async def radar(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """원천별 최근 7일 추세 (근거 있는 날만, 확신도 가중 EMA). 미션 대상 선택과 같은 값."""
    prof = await load_source_profile(current_user.id, db)
    if all(p["score"] is None for p in prof.values()):
        return None
    out = {}
    for s, p in prof.items():
        out[f"score_{s.lower()}"] = p["score"] if p["score"] is not None else 0.5
        out[f"days_{s.lower()}"] = p["days"]
    return RadarResponse(**out)


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


class DailyScore(BaseModel):
    date: str
    score: Optional[float]
    ema: Optional[float]
    confidence: Optional[float]
    ema_contributions: dict[str, float]
    evidence_sources: str
    is_initial: bool
    has_diary: bool = False


@router.get("/daily", response_model=list[DailyScore])
async def daily(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    diary_since: Optional[date] = None,
    through: Optional[date] = None,
):
    """분석 추세와, 요청한 구간에서 분석을 기다리는 일기 날짜를 반환한다."""
    analysis_query = select(DailyAnalysis).where(DailyAnalysis.user_id == current_user.id)
    if through is not None:
        analysis_query = analysis_query.where(DailyAnalysis.diary_date <= through)
    result = await db.execute(
        analysis_query.order_by(DailyAnalysis.diary_date, DailyAnalysis.created_at, DailyAnalysis.id)
    )
    latest_by_date: dict[date, DailyAnalysis] = {}
    reflected_by_date: dict[date, DailyAnalysis] = {}
    for analysis in result.scalars().all():
        latest_by_date[analysis.diary_date] = analysis
        if analysis.is_reflected and analysis.composite_score is not None:
            reflected_by_date[analysis.diary_date] = analysis

    diary_dates: set[date] = set()
    if diary_since is not None:
        diary_query = select(Diary.diary_date).where(
            Diary.user_id == current_user.id, Diary.diary_date >= diary_since,
        )
        if through is not None:
            diary_query = diary_query.where(Diary.diary_date <= through)
        diary_dates = set(await db.scalars(diary_query.distinct()))

    out: list[DailyScore] = []
    ema: Optional[float] = None
    ema_contributions = dict.fromkeys(SOURCES, 0.0)
    for day in sorted(latest_by_date.keys() | diary_dates):
        latest = latest_by_date.get(day)
        reflected = reflected_by_date.get(day)
        analysis = reflected or latest
        confidence = float(analysis.confidence) if analysis is not None else None
        is_initial = reflected is not None and reflected.reasoning == INITIAL_REASONING
        score = None

        if reflected is not None:
            scores = known_scores(reflected)
            if is_initial and reflected.evidence_sources is None:
                scores = {source: float(getattr(reflected, f"score_{source.lower()}")) for source in SOURCES}
            score = composite_score(scores)
            if score is None and reflected.evidence_sources is None:
                # 예전 기록에서 원천 근거를 복원할 수 없어도 저장된 종합 점수는 표시한다.
                score = float(reflected.composite_score)
            if score is not None:
                if any(value is not None for value in scores.values()):
                    contributions = source_contributions(scores, score)
                    ema_contributions = {
                        source: ema_step(None if ema is None else ema_contributions[source], value, confidence)
                        for source, value in contributions.items()
                    }
                ema = ema_step(ema, score, confidence)

        evidence_analysis = latest if is_initial else analysis
        evidence = (
            "" if evidence_analysis is None or evidence_analysis.reasoning == INITIAL_REASONING
            else evidence_string(known_scores(evidence_analysis))
        )
        out.append(DailyScore(
            date=day.isoformat(),
            score=score,
            ema=round(ema, 3) if ema is not None else None,
            confidence=confidence,
            ema_contributions=ema_contributions,
            evidence_sources=evidence,
            is_initial=is_initial,
            has_diary=day in diary_dates,
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
    evidence_sources: str  # 근거가 있었던 원천 ("MPA" 등)


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
            evidence_sources="".join(k for k, v in known_scores(a).items() if v is not None),
        )
        for a in result.scalars().all()
    ]
