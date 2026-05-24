from datetime import datetime
from pydantic import BaseModel, Field
from typing import Literal


class SignupRequest(BaseModel):
    username: str
    password: str
    answer_m: int = Field(..., ge=1, le=5)
    answer_v: int = Field(..., ge=1, le=5)
    answer_p: int = Field(..., ge=1, le=5)
    answer_a: int = Field(..., ge=1, le=5)


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: int
    username: str
    diary_count: int
    completed_missions_count: int
    created_at: datetime

    model_config = {"from_attributes": True}
