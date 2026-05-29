from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, datetime
from pydantic import BaseModel
from app.db.session import get_db
from app.db.models import FailureLog, User
from app.core.deps import get_current_user


class FailureLogOut(BaseModel):
    id: int
    diary_date: date
    failure_summary: str
    created_at: datetime

    model_config = {"from_attributes": True}


router = APIRouter(prefix="/api/failure-logs", tags=["failure-logs"])


@router.get("", response_model=list[FailureLogOut])
async def list_failure_logs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FailureLog)
        .where(FailureLog.user_id == current_user.id)
        .order_by(FailureLog.created_at.desc())
    )
    return result.scalars().all()
