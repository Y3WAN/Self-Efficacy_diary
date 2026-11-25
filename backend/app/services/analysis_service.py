import logging
from datetime import date, datetime, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import Diary, DailyAnalysis, FailureLog, Mission, User
from app.core.timeutil import KST
from app.services.groq_client import chat_json
from app.services.scoring import NEUTRAL, composite_score, evidence_string, parse_source_scores

logger = logging.getLogger(__name__)

# 회원가입 설문으로 만든 DailyAnalysis 식별용
INITIAL_REASONING = "초기 자기효능감 설문 결과"


def _score(data: dict, key: str) -> float:
    try:
        value = float(data.get(key, 0.5))
    except (TypeError, ValueError):
        value = 0.5
    return max(0.0, min(1.0, value))

ANALYSIS_SYSTEM = """당신은 Bandura의 자기효능감 이론 전문가입니다.
일기를 분석하여 4원천 자기효능감 점수를 평가하고 JSON만 반환하세요.

4원천:
- M (성취경험/대처): 직접적인 성취, 어려움 극복, 학습 성공 경험
- V (대리경험/관계): 타인 관찰, 사회적 비교, 롤모델 관계
- P (사회적 설득/지지): 타인에게 받은 격려, 칭찬, 구체적 지지
- A (정서·신체 상태): 감정 상태, 스트레스 수준, 신체적 에너지

평가 규칙:
- 일기에 근거가 없는 원천은 점수를 null로, evidence를 빈 문자열로 (근거 없음 ≠ 보통. 절대 0.5로 채우지 말 것)
- 슬픔이나 힘듦 자체는 낮은 효능감이 아님 (대처 의지·노력이 핵심)
- confidence: 일기 내용이 충분할수록 높게 (짧은 일기 = 낮은 confidence)
- 모든 evidence와 reasoning은 반드시 한국어로 작성
- failure_detected: 일기에서 실패·포기·좌절·목표 미달성·후회가 명확히 드러나면 true, 그렇지 않으면 false
- failure_summary: failure_detected가 true일 때만 한국어로 1~2문장 요약, false이면 ""
- JSON만 반환, 다른 텍스트 없이"""

ANALYSIS_USER = """일기:
{diary_text}

아래 JSON 형식으로만 반환:
{{
  "score_m": 0.0~1.0 또는 null,
  "score_v": 0.0~1.0 또는 null,
  "score_p": 0.0~1.0 또는 null,
  "score_a": 0.0~1.0 또는 null,
  "confidence": 0.0~1.0,
  "evidence_m": "M 점수 근거 (한국어)",
  "evidence_v": "V 점수 근거 (한국어)",
  "evidence_p": "P 점수 근거 (한국어)",
  "evidence_a": "A 점수 근거 (한국어)",
  "reasoning": "종합 분석 (한국어)",
  "failure_detected": true 또는 false,
  "failure_summary": "실패 내용 요약 (한국어, failure_detected=false면 빈 문자열)"
}}"""


async def analyze_diary_text(diary_text: str, *, quote_evidence: bool = False) -> dict:
    system = ANALYSIS_SYSTEM
    if quote_evidence:
        system += (
            "\n- 각 evidence 값은 해당 원천을 보여주는 일기 원문의 연속된 구절을 "
            "한 개 그대로 복사하세요. 요약, 따옴표 추가, 문장 합치기를 하지 마세요. "
            "직접 인용할 근거가 없으면 점수를 null로, evidence를 빈 문자열로 반환하세요."
        )
    data = await chat_json([
        {"role": "system", "content": system},
        {"role": "user", "content": ANALYSIS_USER.format(diary_text=diary_text)},
    ])
    if not isinstance(data, dict):
        raise ValueError("Diary analysis must be a JSON object")
    return data


async def analyze_day(user_id: int, target_date: date, db: AsyncSession) -> bool:
    # idempotency guard (가입 설문 결과는 일기 분석이 아니므로 제외)
    exists = await db.execute(
        select(DailyAnalysis.id).where(
            DailyAnalysis.user_id == user_id,
            DailyAnalysis.diary_date == target_date,
            DailyAnalysis.reasoning.is_distinct_from(INITIAL_REASONING),
        ).limit(1)
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

    # 그날 미션을 하고 남긴 한 줄 회고도 함께 분석한다 (일기 + 실천 기록)
    day_start = datetime.combine(target_date, time.min, tzinfo=KST)
    reflections = await db.execute(
        select(Mission.content, Mission.status, Mission.reflection)
        .where(
            Mission.user_id == user_id,
            Mission.reflection.isnot(None),
            Mission.completed_at >= day_start,
            Mission.completed_at < day_start + timedelta(days=1),
        )
        .order_by(Mission.completed_at)
    )
    reflection_lines = [
        f"- 미션 \"{row.content}\" ({'완료' if row.status == 'done' else '어려웠음'}): {row.reflection}"
        for row in reflections.all()
    ]
    if reflection_lines:
        combined += "\n\n[이날 미션을 하고 남긴 회고]\n" + "\n".join(reflection_lines)

    try:
        data = await analyze_diary_text(combined)
    except Exception as e:
        logger.error(f"Groq analysis failed user={user_id} date={target_date}: {e}")
        return False

    scores = parse_source_scores(data)
    confidence = _score(data, "confidence")
    evidence = evidence_string(scores)

    # 근거가 하나도 없으면(예: "피곤했다" 한 줄) 그래프에 넣지 않는다
    is_reflected = confidence >= 0.3 and bool(evidence)
    composite = composite_score(scores) if is_reflected else None

    analysis = DailyAnalysis(
        user_id=user_id,
        diary_date=target_date,
        score_m=round(scores["M"] if scores["M"] is not None else NEUTRAL, 2),
        score_v=round(scores["V"] if scores["V"] is not None else NEUTRAL, 2),
        score_p=round(scores["P"] if scores["P"] is not None else NEUTRAL, 2),
        score_a=round(scores["A"] if scores["A"] is not None else NEUTRAL, 2),
        evidence_sources=evidence,
        composite_score=composite,
        confidence=round(confidence, 2),
        evidence_m=data.get("evidence_m") or None,
        evidence_v=data.get("evidence_v") or None,
        evidence_p=data.get("evidence_p") or None,
        evidence_a=data.get("evidence_a") or None,
        reasoning=data.get("reasoning"),
        is_reflected=is_reflected,
    )
    db.add(analysis)

    # Handle failure log and points
    raw = data.get("failure_detected", False)
    failure_detected = raw is True or str(raw).lower() == "true"
    failure_summary = str(data.get("failure_summary", "") or "")

    if failure_detected and failure_summary.strip():
        db.add(FailureLog(user_id=user_id, diary_date=target_date, failure_summary=failure_summary))
        user_row = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
        if user_row:
            user_row.points = (user_row.points or 0) + 25
            logger.info(f"Failure logged user={user_id} date={target_date}, +25 points")

    await db.commit()
    logger.info(f"Analysis saved user={user_id} date={target_date} composite={composite}")
    return True
