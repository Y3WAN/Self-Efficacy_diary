from datetime import datetime
from pydantic import BaseModel
from typing import Literal

GradeType = Literal["상", "중상", "중", "중하", "하"]


class SignupRequest(BaseModel):
    username: str
    password: str
    initial_grade: GradeType


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    username: str
    initial_grade: str
    diary_count: int
    completed_missions_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
