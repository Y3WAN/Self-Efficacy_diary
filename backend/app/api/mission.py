from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.db.models import Mission, User, Respect
from app.core.deps import get_current_user
from pydantic import BaseModel


class MissionResponse(BaseModel):
    id: int
    content: str
    target_var: str
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class CommunityFeedItem(BaseModel):
    id: int
    username: str
    content: str
    target_var: str
    completed_at: datetime
    respect_count: int
    has_respected: bool


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
    return result.scalars().all()


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
        )
        for row in rows
    ]


@router.post("/{mission_id}/complete", response_model=MissionResponse)
async def complete_mission(
    mission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.user_id == current_user.id)
    )
    mission = result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.status != "active":
        raise HTTPException(status_code=409, detail="Mission is not active")

    mission.status = "done"
    mission.completed_at = datetime.now(timezone.utc)
    current_user.points = (current_user.points or 0) + 100
    await db.commit()
    await db.refresh(mission)
    return mission


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
