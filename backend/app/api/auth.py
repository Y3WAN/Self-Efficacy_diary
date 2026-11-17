import secrets
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.db.models import User, Mission, DailyAnalysis
from app.schemas.auth import SignupRequest, LoginRequest, TokenResponse, MeResponse
from app.core.security import hash_password, verify_password, create_access_token
from app.core.deps import get_current_user
from app.core.timeutil import today_kst
from app.services.analysis_service import INITIAL_REASONING

router = APIRouter(prefix="/api/auth", tags=["auth"])

SCORE_MAP = {1: 0.3, 2: 0.4, 3: 0.5, 4: 0.6, 5: 0.7}
TRIAL_PREFIX = "guest_"  # 부스 체험용 임시 계정


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    if body.username.startswith(TRIAL_PREFIX):
        # 체험 계정 이름은 행사 후 일괄 삭제 대상이라 일반 가입에 쓰지 않는다
        raise HTTPException(status_code=409, detail="Username already exists")
    result = await db.execute(select(User).where(User.username == body.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username already exists")

    user = User(
        username=body.username,
        password_hash=hash_password(body.password),
        initial_grade="-",
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username already exists")

    _add_initial_analysis(db, user.id, body.answer_m, body.answer_v, body.answer_p, body.answer_a)
    await db.commit()

    return TokenResponse(access_token=create_access_token(user.id))


@router.post("/trial", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def trial(db: AsyncSession = Depends(get_db)):
    """부스 체험용 임시 계정. 관람객마다 새로 만들어 기록·ELO가 섞이지 않게 한다.
    행사 후 scripts/delete_trial_users.py 로 일괄 삭제한다."""
    for _ in range(5):
        user = User(
            username=TRIAL_PREFIX + secrets.token_hex(4),
            password_hash=hash_password(secrets.token_urlsafe(16)),
            initial_grade="-",
        )
        db.add(user)
        try:
            await db.flush()
            break
        except IntegrityError:
            await db.rollback()
    else:
        raise HTTPException(status_code=503, detail="Could not create trial user")

    # 설문 없이 시작하므로 네 원천 모두 중간값(3점)
    _add_initial_analysis(db, user.id, 3, 3, 3, 3)
    await db.commit()

    return TokenResponse(access_token=create_access_token(user.id))


def _add_initial_analysis(db: AsyncSession, user_id: int, answer_m: int, answer_v: int, answer_p: int, answer_a: int):
    m = SCORE_MAP[answer_m]
    v = SCORE_MAP[answer_v]
    p = SCORE_MAP[answer_p]
    a = SCORE_MAP[answer_a]
    composite = round(m * 0.4 + v * 0.2 + p * 0.2 + a * 0.2, 2)

    # 가입 당일 일기 분석과 날짜가 겹치지 않도록 전날로 기록
    initial_analysis = DailyAnalysis(
        user_id=user_id,
        diary_date=today_kst() - timedelta(days=1),
        score_m=round(m, 2),
        score_v=round(v, 2),
        score_p=round(p, 2),
        score_a=round(a, 2),
        composite_score=composite,
        evidence_sources="MVPA",  # 설문은 네 원천 모두 직접 응답
        confidence=0.8,
        is_reflected=True,
        reasoning=INITIAL_REASONING,
    )
    db.add(initial_analysis)


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
