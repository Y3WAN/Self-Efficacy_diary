import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import User, Diary, PersonaHistory
from app.services.groq_client import chat_json

logger = logging.getLogger(__name__)

VALID_PERSONAS = {"당차미", "헤맹이", "멍하미", "지치미"}

PERSONA_SYSTEM = """당신은 학생의 자기효능감과 학습 패턴을 분류하는 전문가입니다.
최근 일기를 읽고 아래 4가지 페르소나 중 하나로 분류하세요.

페르소나:
- 당차미: 자존감 높은 수재형. 도전을 즐기고 성취감이 높으며 학습이 효율적
- 헤맹이: 노력 대비 저효율형. 열심히 하지만 방향성 부족하거나 성과로 이어지지 않음
- 멍하미: 학습 무기력형. 동기 부족, 무기력감, 학습에 대한 의지 저하
- 지치미: 번아웃 위험형. 과부하, 지침, 쉬고 싶은 욕구 강함

JSON만 반환:
{"persona": "당차미|헤맹이|멍하미|지치미 중 하나", "reasoning": "분류 근거 (한국어)"}"""


async def reclassify(user_id: int, db: AsyncSession) -> None:
    result = await db.execute(
        select(Diary.content)
        .where(Diary.user_id == user_id)
        .order_by(Diary.created_at.desc())
        .limit(15)
    )
    contents = result.scalars().all()
    if not contents:
        return

    combined = "\n---\n".join(reversed(contents))

    try:
        data = await chat_json([
            {"role": "system", "content": PERSONA_SYSTEM},
            {"role": "user", "content": f"일기:\n{combined}"},
        ])
    except Exception as e:
        logger.error(f"Persona reclassify failed user={user_id}: {e}")
        return

    new_persona = data.get("persona", "").strip()
    if new_persona not in VALID_PERSONAS:
        logger.warning(f"Invalid persona returned: {new_persona}")
        return

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        return

    user.current_persona = new_persona
    history = PersonaHistory(
        user_id=user_id,
        persona=new_persona,
        source="ai_reclassify",
        reasoning=data.get("reasoning"),
        diary_count_at=user.diary_count,
    )
    db.add(history)
    await db.commit()
    logger.info(f"Persona reclassified user={user_id} -> {new_persona}")
