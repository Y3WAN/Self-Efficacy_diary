import json
import logging
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.db.models import Diary, Mission, User, Respect
from app.core.deps import get_current_user
from app.core.timeutil import KST, today_kst
from app.api.auth import TRIAL_PREFIX
from app.services.elo_service import (
    BASE_RATING, LEVEL_RATINGS, apply_result, level_for_rating,
)
from app.services.mission_service import generate_mission_draft
from app.services.helper_service import MAX_HELP_TURNS, ask_helper, load_chat, remaining_turns
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
    help_remaining: int = MAX_HELP_TURNS
    help_messages: list[dict] = []
    can_postpone: bool = True
    postponed_until: Optional[date] = None

    model_config = {"from_attributes": True}

    @classmethod
    def of(cls, mission: Mission) -> "MissionResponse":
        res = cls.model_validate(mission)
        if mission.difficulty is not None:
            res.level = level_for_rating(mission.difficulty)
        res.help_remaining = remaining_turns(mission)
        res.help_messages = load_chat(mission)
        res.can_postpone = mission.postponed_until is None
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
    today = today_kst()
    # 미룬 미션은 미룬 날이 되기 전까지 오늘의 미션에서 뺀다.
    missions = [m for m in result.scalars().all() if m.postponed_until is None or m.postponed_until <= today]
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


class StackBook(BaseModel):
    id: int
    content: str
    status: str  # done / skipped
    was_postponed: bool
    respect_count: int
    finished_at: datetime


class MissionStackResponse(BaseModel):
    """미션 쌓기: 끝난 미션을 결과별 책으로 쌓아 보여 준다. 나만 보는 탑."""
    books: list[StackBook]  # 오래된 것부터 (아래부터 쌓임)
    done_count: int
    skipped_count: int
    postponed_count: int  # 미뤘던 적이 있는 끝난 미션
    waiting_count: int  # 지금 미뤄 둔 미션 (아직 책이 아님)
    everyone_done_count: int  # 모두가 해낸 미션 수 (함께 해낸 미션과 연동)


STACK_LIMIT = 200


@router.get("/stack", response_model=MissionStackResponse)
async def mission_stack(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    finished_at = func.coalesce(Mission.completed_at, Mission.created_at)
    result = await db.execute(
        select(
            Mission.id, Mission.content, Mission.status,
            (Mission.postponed_until.isnot(None)).label("was_postponed"),
            func.count(Respect.id).label("respect_count"),
            finished_at.label("finished_at"),
        )
        .outerjoin(Respect, Respect.mission_id == Mission.id)
        .where(Mission.user_id == current_user.id, Mission.status.in_(("done", "skipped")))
        .group_by(Mission.id)
        .order_by(finished_at.desc(), Mission.id.desc())
        .limit(STACK_LIMIT)
    )
    books = [StackBook(**row._mapping) for row in result.all()][::-1]

    counts = dict((await db.execute(
        select(Mission.status, func.count())
        .where(Mission.user_id == current_user.id, Mission.status.in_(("done", "skipped")))
        .group_by(Mission.status)
    )).all())
    postponed = await db.scalar(
        select(func.count()).select_from(Mission).where(
            Mission.user_id == current_user.id,
            Mission.status.in_(("done", "skipped")),
            Mission.postponed_until.isnot(None),
        )
    )
    waiting = await db.scalar(
        select(func.count()).select_from(Mission).where(
            Mission.user_id == current_user.id,
            Mission.status == "active",
            Mission.postponed_until > today_kst(),
        )
    )
    everyone = await db.scalar(select(func.count()).select_from(Mission).where(Mission.status == "done"))
    return MissionStackResponse(
        books=books,
        done_count=counts.get("done", 0),
        skipped_count=counts.get("skipped", 0),
        postponed_count=postponed or 0,
        waiting_count=waiting or 0,
        everyone_done_count=everyone or 0,
    )


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


class HelpRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


@router.post("/{mission_id}/help", response_model=MissionResponse)
async def ask_mission_helper(
    mission_id: int,
    body: HelpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """'어려워요' → AI 조력자 상담. 미션 하나당 MAX_HELP_TURNS번까지."""
    mission = await _get_active_mission(mission_id, current_user, db)
    if remaining_turns(mission) <= 0:
        raise HTTPException(status_code=409, detail="상담 기회를 모두 썼어요")

    reply = await ask_helper(mission, body.message)
    if not reply:
        raise HTTPException(status_code=502, detail="AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.")

    chat = load_chat(mission)
    chat += [{"role": "user", "content": body.message}, {"role": "assistant", "content": reply}]
    mission.help_chat = json.dumps(chat, ensure_ascii=False)
    mission.help_count = (mission.help_count or 0) + 1
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


@router.post("/{mission_id}/postpone", response_model=MissionResponse)
async def postpone_mission(
    mission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내일로 미루기. 실패로 세지 않는다(ELO 그대로). 미션당 1번."""
    mission = await _get_active_mission(mission_id, current_user, db)
    if mission.postponed_until is not None:
        raise HTTPException(status_code=409, detail="이미 한 번 미룬 미션이에요")
    mission.postponed_until = today_kst() + timedelta(days=1)
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


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
        mission.target_var, new_level, diary_text, [mission.content],
        everyday=bool(mission.is_everyday),
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
