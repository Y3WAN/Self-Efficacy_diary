from datetime import date
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db.models import User
from app.core.deps import get_current_user
from app.services.analysis_service import analyze_day
from app.services.persona_service import reclassify
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


@router.post("/reclassify")
async def debug_reclassify(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await reclassify(current_user.id, db)
    await db.refresh(current_user)
    return {"persona": current_user.current_persona}


@router.post("/generate-missions")
async def debug_generate_missions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    count = await generate_missions(current_user.id, db)
    return {"generated": count}
