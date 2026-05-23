import logging
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import Diary, DailyAnalysis
from app.services.groq_client import chat_json

logger = logging.getLogger(__name__)

ANALYSIS_SYSTEM = """당신은 Bandura의 자기효능감 이론 전문가입니다.
일기를 분석하여 4원천 자기효능감 점수를 평가하고 JSON만 반환하세요.

4원천:
- M (성취경험/대처): 직접적인 성취, 어려움 극복, 학습 성공 경험
- V (대리경험/관계): 타인 관찰, 사회적 비교, 롤모델 관계
- P (사회적 설득/지지): 타인에게 받은 격려, 칭찬, 구체적 지지
- A (정서·신체 상태): 감정 상태, 스트레스 수준, 신체적 에너지

평가 규칙:
- 일기에 근거가 없는 원천은 중립값 0.5 사용
- 슬픔이나 힘듦 자체는 낮은 효능감이 아님 (대처 의지·노력이 핵심)
- confidence: 일기 내용이 충분할수록 높게 (짧은 일기 = 낮은 confidence)
- 모든 evidence와 reasoning은 반드시 한국어로 작성
- JSON만 반환, 다른 텍스트 없이"""

ANALYSIS_USER = """일기:
{diary_text}

아래 JSON 형식으로만 반환:
{{
  "score_m": 0.0~1.0,
  "score_v": 0.0~1.0,
  "score_p": 0.0~1.0,
  "score_a": 0.0~1.0,
  "confidence": 0.0~1.0,
  "evidence_m": "M 점수 근거 (한국어)",
  "evidence_v": "V 점수 근거 (한국어)",
  "evidence_p": "P 점수 근거 (한국어)",
  "evidence_a": "A 점수 근거 (한국어)",
  "reasoning": "종합 분석 (한국어)"
}}"""


async def analyze_day(user_id: int, target_date: date, db: AsyncSession) -> bool:
    # idempotency guard
    exists = await db.execute(
        select(DailyAnalysis).where(
            DailyAnalysis.user_id == user_id,
            DailyAnalysis.diary_date == target_date,
        )
    )
    if exists.scalar_one_or_none():
        return False

    result = await db.execute(
        select(Diary.content)
        .where(Diary.user_id == user_id, Diary.diary_date == target_date)
        .order_by(Diary.created_at)
    )
    contents = result.scalars().all()
    if not contents:
        return False

    combined = "\n---\n".join(contents)

    try:
        data = await chat_json([
            {"role": "system", "content": ANALYSIS_SYSTEM},
            {"role": "user", "content": ANALYSIS_USER.format(diary_text=combined)},
        ])
    except Exception as e:
        logger.error(f"Groq analysis failed user={user_id} date={target_date}: {e}")
        return False

    m = max(0.0, min(1.0, float(data.get("score_m", 0.5))))
    v = max(0.0, min(1.0, float(data.get("score_v", 0.5))))
    p = max(0.0, min(1.0, float(data.get("score_p", 0.5))))
    a = max(0.0, min(1.0, float(data.get("score_a", 0.5))))
    confidence = max(0.0, min(1.0, float(data.get("confidence", 0.5))))

    is_reflected = confidence >= 0.3
    composite = round(m * 0.4 + v * 0.2 + p * 0.2 + a * 0.2, 2) if is_reflected else None

    analysis = DailyAnalysis(
        user_id=user_id,
        diary_date=target_date,
        score_m=round(m, 2),
        score_v=round(v, 2),
        score_p=round(p, 2),
        score_a=round(a, 2),
        composite_score=composite,
        confidence=round(confidence, 2),
        evidence_m=data.get("evidence_m"),
        evidence_v=data.get("evidence_v"),
        evidence_p=data.get("evidence_p"),
        evidence_a=data.get("evidence_a"),
        reasoning=data.get("reasoning"),
        is_reflected=is_reflected,
    )
    db.add(analysis)
    await db.commit()
    logger.info(f"Analysis saved user={user_id} date={target_date} composite={composite}")
    return True
