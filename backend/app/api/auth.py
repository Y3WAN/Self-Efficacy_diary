from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.session import get_db
from app.db.models import User, Mission, DailyAnalysis
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse, MeResponse
from app.core.security import hash_password, verify_password, create_access_token
from app.core.deps import get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

SCORE_MAP = {1: 0.3, 2: 0.4, 3: 0.5, 4: 0.6, 5: 0.7}


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        initial_grade="-",
    )
    db.add(user)
    await db.flush()

    m = SCORE_MAP[body.answer_m]
    v = SCORE_MAP[body.answer_v]
    p = SCORE_MAP[body.answer_p]
    a = SCORE_MAP[body.answer_a]
    composite = round(m * 0.4 + v * 0.2 + p * 0.2 + a * 0.2, 2)

    initial_analysis = DailyAnalysis(
        user_id=user.id,
        diary_date=date.today(),
        score_m=round(m, 2),
        score_v=round(v, 2),
        score_p=round(p, 2),
        score_a=round(a, 2),
        composite_score=composite,
        confidence=0.8,
        is_reflected=True,
        reasoning="초기 자기효능감 설문 결과",
    )
    db.add(initial_analysis)
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
        diary_count=current_user.diary_count,
        completed_missions_count=completed_count,
        points=current_user.points or 0,
        created_at=current_user.created_at,
    )
