import logging
from calendar import monthrange
from datetime import date, datetime, time, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.db.models import Diary, Mission, User, Respect
from app.core.deps import get_current_user
from app.core.timeutil import KST
from app.api.auth import TRIAL_PREFIX
from app.services.elo_service import (
    BASE_RATING, LEVEL_RATINGS, apply_result, level_for_rating,
)
from app.services.mission_service import generate_mission_draft
from pydantic import BaseModel, StringConstraints

logger = logging.getLogger(__name__)


class MissionResponse(BaseModel):
    id: int
    content: str
    target_var: str
    status: str
    difficulty: Optional[int] = None
    level: Optional[int] = None
    reason: Optional[str] = None
    helper: Optional[str] = None
    diary_id: Optional[int] = None
    reflection: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def of(cls, mission: Mission) -> "MissionResponse":
        res = cls.model_validate(mission)
        if mission.difficulty is not None:
            res.level = level_for_rating(mission.difficulty)
        return res


class MissionFeedback(BaseModel):
    """완료·포기할 때 남기는 한 줄 회고 (선택). 다음 분석·미션에 반영된다."""
    reflection: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]] = None


def _apply_feedback(mission: Mission, body: "MissionFeedback | None") -> None:
    if body and body.reflection:
        mission.reflection = body.reflection


class MissionResultResponse(MissionResponse):
    elo_before: int
    elo_after: int


class CommunityFeedItem(BaseModel):
    id: int
    display_name: str
    content: str
    completed_at: datetime
    respect_count: int
    has_respected: bool
    is_own: bool


router = APIRouter(prefix="/api/missions", tags=["missions"])


@router.get("", response_model=list[MissionResponse])
async def list_missions(
    include_history: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Mission)
        .where(Mission.user_id == current_user.id, Mission.status == "active")
        .order_by(Mission.created_at)
    )
    missions = list(result.scalars().all())
    if include_history:
        history = await db.execute(
            select(Mission)
            .where(Mission.user_id == current_user.id, Mission.status != "active")
            .order_by(Mission.created_at.desc(), Mission.id.desc())
            .limit(20)
        )
        missions.extend(history.scalars().all())
    return [MissionResponse.of(m) for m in missions]


@router.get("/history", response_model=list[MissionResponse])
async def list_mission_history(
    month: Annotated[str, Query(pattern=r"^[1-9][0-9]{3}-(0[1-9]|1[0-2])$")],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    first_day = date.fromisoformat(f"{month}-01")
    last_day = first_day.replace(day=monthrange(first_day.year, first_day.month)[1])
    result = await db.execute(
        select(Mission)
        .where(
            Mission.user_id == current_user.id,
            Mission.status != "active",
            Mission.created_at.between(
                datetime.combine(first_day, time.min, KST),
                datetime.combine(last_day, time.max, KST),
            ),
        )
        .order_by(Mission.created_at.desc(), Mission.id.desc())
    )
    return [MissionResponse.of(mission) for mission in result.scalars()]


def _mask_username(username: str) -> str:
    if len(username) <= 2:
        return "□" * len(username)
    prefix_length = 2 if len(username) >= 4 else 1
    return f"{username[:prefix_length]}{'□' * (len(username) - prefix_length - 1)}{username[-1]}"


@router.get("/community/feed", response_model=list[CommunityFeedItem])
async def community_feed(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Mission.id,
            User.username,
            Mission.content,
            Mission.completed_at,
            func.count(Respect.id).label("respect_count"),
            func.bool_or(Respect.from_user_id == current_user.id).label("has_respected"),
            (Mission.user_id == current_user.id).label("is_own"),
        )
        .join(User, Mission.user_id == User.id)
        .outerjoin(Respect, Respect.mission_id == Mission.id)
        .where(Mission.status == "done", Mission.completed_at.isnot(None))
        .group_by(Mission.id, User.username, Mission.content, Mission.completed_at)
        .order_by(Mission.completed_at.desc())
        .limit(50)
    )
    rows = result.all()
    return [
        CommunityFeedItem(
            id=row.id,
            display_name=_mask_username(row.username),
            content=row.content,
            completed_at=row.completed_at,
            respect_count=row.respect_count or 0,
            has_respected=bool(row.has_respected),
            is_own=bool(row.is_own),
        )
        for row in rows
    ]


async def _get_active_mission(mission_id: int, user: User, db: AsyncSession) -> Mission:
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.user_id == user.id)
    )
    mission = result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.status != "active":
        raise HTTPException(status_code=409, detail="Mission is not active")
    return mission


def _result_response(mission: Mission, elo_before: int, elo_after: int) -> MissionResultResponse:
    return MissionResultResponse(
        **MissionResponse.of(mission).model_dump(), elo_before=elo_before, elo_after=elo_after
    )


@router.post("/{mission_id}/complete", response_model=MissionResultResponse)
async def complete_mission(
    mission_id: int,
    body: Optional[MissionFeedback] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mission = await _get_active_mission(mission_id, current_user, db)

    mission.status = "done"
    mission.completed_at = datetime.now(timezone.utc)
    _apply_feedback(mission, body)
    current_user.points = (current_user.points or 0) + 100
    before, after = apply_result(current_user, mission, won=True, db=db)
    await db.commit()
    await db.refresh(mission)
    return _result_response(mission, before, after)


@router.post("/{mission_id}/skip", response_model=MissionResultResponse)
async def skip_mission(
    mission_id: int,
    body: Optional[MissionFeedback] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """'너무 어려워요' — ELO 패배로 반영해 다음 미션 난이도를 낮춘다."""
    mission = await _get_active_mission(mission_id, current_user, db)

    mission.status = "skipped"
    mission.completed_at = datetime.now(timezone.utc)
    _apply_feedback(mission, body)
    before, after = apply_result(current_user, mission, won=False, db=db)
    await db.commit()
    await db.refresh(mission)
    return _result_response(mission, before, after)


class RetargetRequest(BaseModel):
    harder: bool


@router.post("/{mission_id}/retarget", response_model=MissionResponse)
async def retarget_mission(
    mission_id: int,
    body: RetargetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """부스 체험 전용: 같은 일기·같은 원천으로 한 단계 어렵거나 쉬운 미션으로 바꾼다.

    '할 수 있겠어요/어려울 것 같아요'는 미션을 실제로 해 본 결과가 아니므로
    완료·실패 처리나 ELO 갱신을 하지 않고, 진행 중인 미션의 내용과 난이도만 바꾼다.
    """
    if not current_user.username.startswith(TRIAL_PREFIX):
        raise HTTPException(status_code=403, detail="Trial accounts only")
    mission = await _get_active_mission(mission_id, current_user, db)

    level = level_for_rating(mission.difficulty if mission.difficulty is not None else BASE_RATING)
    new_level = max(1, min(5, level + (1 if body.harder else -1)))
    if new_level == level:
        raise HTTPException(status_code=409, detail="이미 가장 어려운 단계예요" if body.harder else "이미 가장 쉬운 단계예요")

    diary_text = ""
    if mission.diary_id is not None:
        diary = await db.get(Diary, mission.diary_id)
        diary_text = diary.content if diary else ""

    content, reason, helper = await generate_mission_draft(
        mission.target_var, new_level, diary_text, [mission.content]
    )
    if not content:
        raise HTTPException(status_code=502, detail="AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.")

    mission.content = content
    mission.reason = reason or None
    mission.helper = helper or None
    mission.difficulty = LEVEL_RATINGS[new_level]
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


@router.post("/community/{mission_id}/respect")
async def respect_mission(
    mission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mission_result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.status == "done")
    )
    mission = mission_result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot respect own mission")

    respect = Respect(from_user_id=current_user.id, mission_id=mission_id)
    db.add(respect)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Already respected")

    owner_result = await db.execute(select(User).where(User.id == mission.user_id))
    owner = owner_result.scalar_one()
    owner.points = (owner.points or 0) + 5

    await db.commit()

    count_result = await db.execute(
        select(func.count(Respect.id)).where(Respect.mission_id == mission_id)
    )
    total = count_result.scalar() or 0
    return {"respect_count": total}
