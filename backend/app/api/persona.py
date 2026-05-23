from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.session import get_db
from app.db.models import User, PersonaHistory
from app.core.deps import get_current_user
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class HistoryItem(BaseModel):
    id: int
    persona: str
    source: str
    reasoning: Optional[str]
    diary_count_at: Optional[int]
    created_at: datetime


class PersonaResponse(BaseModel):
    current_persona: str
    history: list[HistoryItem]


router = APIRouter(prefix="/api/persona", tags=["persona"])


@router.get("", response_model=PersonaResponse)
async def get_persona(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PersonaHistory)
        .where(PersonaHistory.user_id == current_user.id)
        .order_by(PersonaHistory.created_at.desc())
    )
    history = result.scalars().all()
    return PersonaResponse(
        current_persona=current_user.current_persona,
        history=[
            HistoryItem(
                id=h.id,
                persona=h.persona,
                source=h.source,
                reasoning=h.reasoning,
                diary_count_at=h.diary_count_at,
                created_at=h.created_at,
            )
            for h in history
        ],
    )
