from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.db.models import Diary, User
from app.schemas.diary import DiaryCreate, DiaryUpdate, DiaryResponse, MonthDiariesResponse, ReflectionOut
from app.core.deps import get_current_user
from app.core.timeutil import today_kst
from app.api.mission import MissionResponse
from app.services.reflection_service import reflect_diary
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/diaries", tags=["diaries"])


class ReflectResponse(BaseModel):
    reflection: ReflectionOut
    mission: Optional[MissionResponse] = None


@router.get("", response_model=MonthDiariesResponse)
async def list_month_diaries(
    month: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        year, mon = map(int, month.split("-"))
    except ValueError:
        raise HTTPException(status_code=422, detail="month must be YYYY-MM")

    result = await db.execute(
        select(func.distinct(Diary.diary_date))
        .where(
            Diary.user_id == current_user.id,
            func.extract("year", Diary.diary_date) == year,
            func.extract("month", Diary.diary_date) == mon,
        )
        .order_by(Diary.diary_date)
    )
    dates = [str(row) for row in result.scalars().all()]
    return MonthDiariesResponse(dates=dates)


@router.get("/recent", response_model=list[DiaryResponse])
async def list_recent_diaries(
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Diary)
        .where(Diary.user_id == current_user.id)
        .order_by(Diary.diary_date.desc(), Diary.created_at.desc(), Diary.id.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{diary_date}", response_model=list[DiaryResponse])
async def get_diaries_by_date(
    diary_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Diary)
        .where(Diary.user_id == current_user.id, Diary.diary_date == diary_date)
        .order_by(Diary.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=DiaryResponse, status_code=201)
async def create_diary(
    body: DiaryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    diary_date = today_kst()
    if body.diary_date is not None and body.diary_date != diary_date:
        raise HTTPException(status_code=403, detail="Can only write today's diary")
    diary = Diary(
        user_id=current_user.id,
        diary_date=diary_date,
        content=body.content,
        is_locked=False,
    )
    diary.reflection = None  # 새 일기는 반응 없음 (관계를 '로드됨'으로 표시)
    db.add(diary)
    current_user.diary_count += 1
    await db.commit()
    await db.refresh(diary)
    return diary


@router.patch("/{diary_id}", response_model=DiaryResponse)
async def update_diary(
    diary_id: int,
    body: DiaryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Diary).where(Diary.id == diary_id, Diary.user_id == current_user.id)
    )
    diary = result.scalar_one_or_none()
    if not diary:
        raise HTTPException(status_code=404, detail="Diary not found")
    if diary.diary_date != today_kst():
        raise HTTPException(status_code=403, detail="Can only edit today's diary")
    if diary.is_locked:
        raise HTTPException(status_code=409, detail="Diary is locked")

    if diary.content != body.content:
        diary.reflection = None  # 내용이 바뀌면 이전 반응은 지우고 다시 받는다
    diary.content = body.content
    diary.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(diary)
    return diary


@router.delete("/{diary_id}", status_code=204)
async def delete_diary(
    diary_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Diary).where(Diary.id == diary_id, Diary.user_id == current_user.id)
    )
    diary = result.scalar_one_or_none()
    if not diary:
        raise HTTPException(status_code=404, detail="Diary not found")
    if diary.diary_date != today_kst():
        raise HTTPException(status_code=403, detail="Can only delete today's diary")
    if diary.is_locked:
        raise HTTPException(status_code=409, detail="Diary is locked")

    await db.delete(diary)
    current_user.diary_count = max(0, current_user.diary_count - 1)
    await db.commit()


@router.post("/{diary_id}/reflect", response_model=ReflectResponse)
async def reflect(
    diary_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """일기 저장 직후 호출: AI가 '오늘 해낸 것'을 찾고, 오늘 첫 반응이면 이어지는 미션 1개를 만든다."""
    result = await db.execute(
        select(Diary).where(Diary.id == diary_id, Diary.user_id == current_user.id)
    )
    diary = result.scalar_one_or_none()
    if not diary:
        raise HTTPException(status_code=404, detail="Diary not found")
    if diary.diary_date != today_kst():
        raise HTTPException(status_code=403, detail="Can only reflect today's diary")
    try:
        reflection, mission = await reflect_diary(diary, current_user, db)
    except Exception:
        raise HTTPException(status_code=502, detail="AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.")
    return ReflectResponse(
        reflection=reflection,
        mission=MissionResponse.of(mission) if mission else None,
    )
