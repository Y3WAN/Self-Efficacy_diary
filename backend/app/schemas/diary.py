from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional


class DiaryCreate(BaseModel):
    content: str
    diary_date: Optional[date] = None


class DiaryUpdate(BaseModel):
    content: str


class DiaryResponse(BaseModel):
    id: int
    diary_date: date
    content: str
    is_locked: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MonthDiariesResponse(BaseModel):
    dates: list[str]
