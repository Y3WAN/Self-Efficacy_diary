import hashlib
import secrets
from uuid import uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import User
from app.db.tester_models import TesterMission, TesterParticipant
from app.services.elo_service import BASE_RATING, target_level
from app.services.mission_service import generate_mission_draft

COMMON_MISSION_ID = "english-presentation-v1"
COMMON_MISSION_LOCK = 1739115301
COMMON_SAMPLE_DIARY = (
    "오늘 영어 발표를 준비했다. 처음에는 긴장해서 첫 문장도 잘 읽지 못했다. "
    "친구가 문장 사이에 잠깐 쉬면서 말하는 걸 보고 나도 따라 해봤다. "
    "두 번 연습하니 첫 문단을 끝까지 읽을 수 있었다. "
    "친구가 목소리가 또렷했다고 말해줘서 안심됐다. "
    "다음에는 두 번째 문단도 연습해보고 싶다."
)


def hash_invite(token: str) -> str:
    return hashlib.sha256(token.encode("ascii")).hexdigest()


async def prepare_common_mission(db: AsyncSession) -> TesterMission:
    existing = await db.get(TesterMission, COMMON_MISSION_ID)
    if existing is not None:
        return existing
    if db.get_bind().dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": COMMON_MISSION_LOCK})
        existing = await db.get(TesterMission, COMMON_MISSION_ID)
        if existing is not None:
            return existing

    # 발표할 때의 긴장이 예시 일기에서 드러난 막힘이므로 A 원천을 사용한다.
    content, reason, helper = await generate_mission_draft(
        "A", target_level(BASE_RATING), COMMON_SAMPLE_DIARY, []
    )
    if not content.strip():
        raise ValueError("AI가 미션 내용을 반환하지 않았습니다.")
    mission = TesterMission(
        id=COMMON_MISSION_ID, sample_diary=COMMON_SAMPLE_DIARY,
        content=content, reason=reason or None, helper=helper or None,
    )
    db.add(mission)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.get(TesterMission, COMMON_MISSION_ID)
        if existing is None:
            raise
        return existing
    return mission


async def create_tester_invites(
    db: AsyncSession, count: int, app_user_id: int | None = None,
) -> list[tuple[str, str]]:
    if await db.get(TesterMission, COMMON_MISSION_ID) is None:
        raise ValueError("먼저 prepare 명령으로 공통 미션을 생성하세요.")
    if app_user_id is not None and await db.get(User, app_user_id) is None:
        raise ValueError("연결할 앱 사용자가 없습니다.")

    invites = []
    for _ in range(count):
        participant_id = uuid4()
        token = secrets.token_urlsafe(32)
        db.add(TesterParticipant(
            id=participant_id, mission_id=COMMON_MISSION_ID,
            invite_hash=hash_invite(token), app_user_id=app_user_id,
        ))
        invites.append((str(participant_id), token))
    await db.commit()
    return invites
