from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.db.models import User
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/user", tags=["user"])


class PromptBody(BaseModel):
    custom_prompt: str | None


@router.get("/prompt")
async def get_prompt(current_user: User = Depends(get_current_user)):
    return {"custom_prompt": current_user.custom_prompt or ""}


@router.put("/prompt")
async def update_prompt(
    body: PromptBody,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    current_user.custom_prompt = body.custom_prompt or None
    await db.commit()
    return {"custom_prompt": current_user.custom_prompt or ""}
