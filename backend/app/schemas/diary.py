import json
from pydantic import BaseModel, field_validator
from datetime import date, datetime
from typing import Optional


class DiaryCreate(BaseModel):
    content: str
    diary_date: Optional[date] = None


class DiaryUpdate(BaseModel):
    content: str


class ReflectionOut(BaseModel):
    achievements: list[str]
    message: str = ""


class DiaryResponse(BaseModel):
    id: int
    diary_date: date
    content: str
    is_locked: bool
    created_at: datetime
    updated_at: datetime
    reflection: Optional[ReflectionOut] = None

    model_config = {"from_attributes": True}

    @field_validator("reflection", mode="before")
    @classmethod
    def _from_orm_reflection(cls, value):
        # DiaryReflection ORM 객체는 achievements를 JSON 문자열로 저장한다
        if value is None or isinstance(value, (dict, ReflectionOut)):
            return value
        try:
            achievements = json.loads(value.achievements)
        except (TypeError, ValueError):
            achievements = []
        return {"achievements": achievements, "message": value.message or ""}


class MonthDiariesResponse(BaseModel):
    dates: list[str]
