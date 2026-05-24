from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete
from app.db.session import get_db
from app.db.models import User, DailyAnalysis
from app.core.deps import get_current_user
from app.services.analysis_service import analyze_day
from app.services.mission_service import generate_missions

router = APIRouter(prefix="/api/debug", tags=["debug"])


@router.post("/analyze-today")
async def debug_analyze_today(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await analyze_day(current_user.id, date.today(), db)
    return {"analyzed": result}


@router.post("/analyze-date/{target_date}")
async def debug_analyze_date(
    target_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await analyze_day(current_user.id, target_date, db)
    return {"date": str(target_date), "analyzed": result}


@router.delete("/delete-analysis/{target_date}")
async def debug_delete_analysis(
    target_date: date,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        delete(DailyAnalysis).where(
            DailyAnalysis.user_id == current_user.id,
            DailyAnalysis.diary_date == target_date,
        )
    )
    await db.commit()
    return {"date": str(target_date), "deleted": True}


@router.post("/generate-missions")
async def debug_generate_missions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await generate_missions(current_user.id, db)
    return {"generated": count}
