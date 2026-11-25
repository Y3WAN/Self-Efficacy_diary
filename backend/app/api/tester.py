import asyncio
import logging
import re
from datetime import timedelta
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User, now_utc
from app.db.session import get_db
from app.db.tester_models import TesterEvaluation, TesterMission, TesterParticipant
from app.services.analysis_service import analyze_diary_text
from app.services.elo_service import BASE_RATING
from app.services.scoring import parse_source_scores
from app.services.tester_service import COMMON_MISSION_ID, hash_invite, prepare_common_mission

router = APIRouter(prefix="/api/tester", tags=["tester"])
logger = logging.getLogger(__name__)
invite_bearer = HTTPBearer(auto_error=False)
INVITE_PATTERN = re.compile(r"[A-Za-z0-9_-]{43}")
ANALYSIS_TIMEOUT_SECONDS = 50
ANALYSIS_RETRY_SECONDS = 60
ANALYSIS_RATE_LOCK = 1739115302
ANALYSES_PER_MINUTE = 20

Db = Annotated[AsyncSession, Depends(get_db)]
Rating = Annotated[int, Field(strict=True, ge=1, le=5)]


class DiaryInput(BaseModel):
    diary: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=3000)]


class EvaluationInput(BaseModel):
    relevance: Rating
    clarity: Rating
    feasibility: Rating
    comment: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] = ""


async def invited_participant(
    response: Response,
    auth: Annotated[HTTPAuthorizationCredentials | None, Depends(invite_bearer)],
    db: Db,
) -> TesterParticipant:
    if auth and INVITE_PATTERN.fullmatch(auth.credentials):
        participant = await db.scalar(select(TesterParticipant).where(
            TesterParticipant.invite_hash == hash_invite(auth.credentials)
        ))
        if participant is not None:
            response.headers["Cache-Control"] = "no-store"
            return participant
    raise HTTPException(401, "유효한 테스터 초대 링크가 필요합니다.")


Participant = Annotated[TesterParticipant, Depends(invited_participant)]


async def current_elo(db: AsyncSession, participant: TesterParticipant) -> int:
    if participant.app_user_id is not None:
        rating = await db.scalar(select(User.elo).where(User.id == participant.app_user_id))
        if rating is not None:
            return rating
    return BASE_RATING


@router.get("/session")
async def get_session(participant: Participant, db: Db):
    return {
        "participant_id": participant.id,
        "completed": await db.get(TesterEvaluation, participant.id) is not None,
    }


@router.post("/session")
async def start_session(
    response: Response,
    auth: Annotated[HTTPAuthorizationCredentials | None, Depends(invite_bearer)],
    db: Db,
):
    if not auth or not INVITE_PATTERN.fullmatch(auth.credentials):
        raise HTTPException(400, "참가 세션을 시작하려면 페이지를 다시 열어 주세요.")

    token_hash = hash_invite(auth.credentials)
    lookup = select(TesterParticipant).where(TesterParticipant.invite_hash == token_hash)
    participant = await db.scalar(lookup)
    if participant is None:
        try:
            async with asyncio.timeout(45):
                await prepare_common_mission(db)
        except Exception as error:
            logger.warning("Common tester mission unavailable (%s)", type(error).__name__)
            raise HTTPException(503, "공통 미션을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None
        participant = TesterParticipant(id=uuid4(), mission_id=COMMON_MISSION_ID, invite_hash=token_hash)
        db.add(participant)
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            participant = await db.scalar(lookup)
            if participant is None:
                raise
    response.headers["Cache-Control"] = "no-store"
    return await get_session(participant, db)


@router.post("/analysis")
async def analyze(payload: DiaryInput, participant: Participant, db: Db):
    participant_id = participant.id
    if await db.get(TesterEvaluation, participant_id) is not None:
        raise HTTPException(409, "이미 평가를 제출했습니다. 페이지를 새로고침해 주세요.")

    started_at = now_utc()
    if db.get_bind().dialect.name == "postgresql":
        # 여러 워커에서 동시에 요청을 받아도 공유 AI 호출 한도가 일관되게 적용된다.
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ANALYSIS_RATE_LOCK})
    recent_count = await db.scalar(select(func.count()).select_from(TesterParticipant).where(
        TesterParticipant.analysis_started_at >= started_at - timedelta(minutes=1),
    ))
    if recent_count >= ANALYSES_PER_MINUTE:
        raise HTTPException(429, "분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.")
    claimed = await db.execute(update(TesterParticipant).where(
        TesterParticipant.id == participant_id,
        or_(
            TesterParticipant.analysis_started_at.is_(None),
            TesterParticipant.analysis_started_at < started_at - timedelta(seconds=ANALYSIS_RETRY_SECONDS),
        ),
    ).values(analysis_started_at=started_at).execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        raise HTTPException(429, "최근에 분석을 요청했습니다. 잠시 후 다시 시도해 주세요.")
    await db.commit()

    try:
        async with asyncio.timeout(ANALYSIS_TIMEOUT_SECONDS):
            data = await analyze_diary_text(payload.diary, quote_evidence=True)
    except Exception as error:
        logger.warning("Tester analysis failed (%s)", type(error).__name__)
        await db.execute(update(TesterParticipant).where(
            TesterParticipant.id == participant_id,
            TesterParticipant.analysis_started_at == started_at,
        ).values(analysis_started_at=None).execution_options(synchronize_session=False))
        await db.commit()
        raise HTTPException(503, "일기를 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.") from None

    sources = {}
    for code, score in parse_source_scores(data).items():
        excerpt = data.get(f"evidence_{code.lower()}")
        excerpt = excerpt.strip() if isinstance(excerpt, str) else ""
        sources[code] = excerpt if score is not None and excerpt and excerpt in payload.diary else None

    # 일기와 발췌문은 응답에만 사용하고 DB에는 분석 완료 시각만 기록한다.
    participant.analyzed_at = now_utc()
    rating = await current_elo(db, participant)
    await db.commit()
    return {"sources": sources, "elo": rating}


@router.get("/mission")
async def get_mission(participant: Participant, db: Db):
    if participant.analyzed_at is None:
        raise HTTPException(409, "먼저 일기를 제출해 분석을 확인해 주세요.")
    mission = await db.get(TesterMission, participant.mission_id)
    return {
        "id": mission.id,
        "sample_diary": mission.sample_diary,
        "content": mission.content,
        "reason": mission.reason,
        "helper": mission.helper,
    }


@router.post("/evaluation")
async def submit_evaluation(payload: EvaluationInput, participant: Participant, db: Db):
    if participant.analyzed_at is None:
        raise HTTPException(409, "먼저 일기를 제출해 분석을 확인해 주세요.")
    participant_id = participant.id
    if await db.get(TesterEvaluation, participant_id) is None:
        db.add(TesterEvaluation(
            participant_id=participant_id,
            mission_id=participant.mission_id,
            relevance=payload.relevance,
            clarity=payload.clarity,
            feasibility=payload.feasibility,
            comment=payload.comment or None,
        ))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
            if await db.get(TesterEvaluation, participant_id) is None:
                raise
    return {"completed": True}
