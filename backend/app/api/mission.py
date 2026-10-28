from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.db.models import Mission, User, Respect
from app.core.deps import get_current_user
from app.services.elo_service import apply_result, level_for_rating
from pydantic import BaseModel
from typing import Optional


class MissionResponse(BaseModel):
    id: int
    content: str
    target_var: str
    status: str
    difficulty: Optional[int] = None
    level: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @classmethod
    def of(cls, mission: Mission) -> "MissionResponse":
        res = cls.model_validate(mission)
        if mission.difficulty is not None:
            res.level = level_for_rating(mission.difficulty)
        return res


class MissionResultResponse(MissionResponse):
    elo_before: int
    elo_after: int


class CommunityFeedItem(BaseModel):
    id: int
    username: str
    content: str
    target_var: str
    completed_at: datetime
    respect_count: int
    has_respected: bool
    is_own: bool


router = APIRouter(prefix="/api/missions", tags=["missions"])


@router.get("", response_model=list[MissionResponse])
async def list_missions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Mission)
        .where(Mission.user_id == current_user.id, Mission.status == "active")
        .order_by(Mission.created_at)
    )
    return [MissionResponse.of(m) for m in result.scalars().all()]


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
            Mission.target_var,
            Mission.completed_at,
            func.count(Respect.id).label("respect_count"),
            func.bool_or(Respect.from_user_id == current_user.id).label("has_respected"),
            (Mission.user_id == current_user.id).label("is_own"),
        )
        .join(User, Mission.user_id == User.id)
        .outerjoin(Respect, Respect.mission_id == Mission.id)
        .where(Mission.status == "done", Mission.completed_at.isnot(None))
        .group_by(Mission.id, User.username, Mission.content, Mission.target_var, Mission.completed_at)
        .order_by(Mission.completed_at.desc())
        .limit(50)
    )
    rows = result.all()
    return [
        CommunityFeedItem(
            id=row.id,
            username=row.username,
            content=row.content,
            target_var=row.target_var,
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
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mission = await _get_active_mission(mission_id, current_user, db)

    mission.status = "done"
    mission.completed_at = datetime.now(timezone.utc)
    current_user.points = (current_user.points or 0) + 100
    before, after = apply_result(current_user, mission, won=True, db=db)
    await db.commit()
    await db.refresh(mission)
    return _result_response(mission, before, after)


@router.post("/{mission_id}/skip", response_model=MissionResultResponse)
async def skip_mission(
    mission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """'너무 어려워요' — ELO 패배로 반영해 다음 미션 난이도를 낮춘다."""
    mission = await _get_active_mission(mission_id, current_user, db)

    mission.status = "skipped"
    before, after = apply_result(current_user, mission, won=False, db=db)
    await db.commit()
    await db.refresh(mission)
    return _result_response(mission, before, after)


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
