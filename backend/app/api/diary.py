from datetime import date, datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.db.models import Diary, User
from app.schemas.diary import DiaryCreate, DiaryUpdate, DiaryResponse, MonthDiariesResponse
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/diaries", tags=["diaries"])


def today_local() -> date:
    return datetime.now(timezone.utc).date()


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
    diary_date = body.diary_date or today_local()
    diary = Diary(
        user_id=current_user.id,
        diary_date=diary_date,
        content=body.content,
        is_locked=False,
    )
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
    if diary.is_locked:
        raise HTTPException(status_code=409, detail="Diary is locked")

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
    if diary.diary_date != today_local():
        raise HTTPException(status_code=403, detail="Can only delete today's diary")
    if diary.is_locked:
        raise HTTPException(status_code=409, detail="Diary is locked")

    await db.delete(diary)
    current_user.diary_count = max(0, current_user.diary_count - 1)
    await db.commit()
