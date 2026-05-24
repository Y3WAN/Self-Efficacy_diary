from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.db.models import User, PersonaHistory, Mission
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse, MeResponse
from app.core.security import hash_password, verify_password, create_access_token
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

GRADE_TO_PERSONA = {
    "상": "당차미",
    "중상": "당차미",
    "중": "헤맹이",
    "중하": "멍하미",
    "하": "지치미",
}


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    persona = GRADE_TO_PERSONA[body.initial_grade]
    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        initial_grade=body.initial_grade,
        current_persona=persona,
    )
    db.add(user)
    await db.flush()

    history = PersonaHistory(
        user_id=user.id,
        persona=persona,
        source="initial_grade",
        diary_count_at=0,
    )
    db.add(history)
    await db.commit()

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return TokenResponse(access_token=create_access_token(user.id))


@router.get("/me", response_model=MeResponse)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(func.count()).where(Mission.user_id == current_user.id, Mission.status == "done")
    )
    completed_count = result.scalar() or 0

    return MeResponse(
        id=current_user.id,
        username=current_user.username,
        initial_grade=current_user.initial_grade,
        current_persona=current_user.current_persona,
        diary_count=current_user.diary_count,
        completed_missions_count=completed_count,
        created_at=current_user.created_at,
    )
