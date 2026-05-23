import logging
import re
from datetime import date, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.db.models import Diary, DailyAnalysis, Mission
from app.services.groq_client import chat_json

logger = logging.getLogger(__name__)

MISSION_SYSTEM = """당신은 ZPD(근접발달영역) 기반 학습 미션 전문가입니다.
학생의 일기와 가장 낮은 자기효능감 원천을 바탕으로 오늘 실천 가능한 미션 1개를 만드세요.

원천:
- M (성취경험): 직접 성취와 극복 경험
- V (대리경험): 타인 관찰과 사회적 관계
- P (사회적 설득): 지지받기와 도움 요청
- A (정서·신체): 감정 조절과 신체 관리

미션 조건:
- 오늘 실행 가능한 구체적 행동
- 약간 도전적이지만 달성 가능한 수준 (ZPD)
- 20자 이상 50자 이하
- 아래 [기존 미션 목록]과 내용·맥락이 겹치지 않는 새로운 미션
- 말투: 반드시 '~해 보세요' 또는 '~받아 보세요'로 끝내세요

올바른 예시:
- "오늘 풀다 막힌 문제 1개만 다시 시도해 보세요."
- "친구에게 오늘 배운 것을 짧게 설명해 보세요."
- "자기 전 오늘 기분을 세 단어로 적어 보세요."

잘못된 예시 (사용 금지):
- "문제 1개만 풀어보기" (명사형 종결)
- "친구한테 물어보자" (반말)
- "스트레칭하기" (명사형 종결)

JSON만 반환: {"content": "미션 내용"}"""


def _fix_tone(content: str) -> str:
    """반말·명사형 종결을 '~해 보세요' 존댓말로 교정."""
    content = content.rstrip(".")
    content = re.sub(r'([어아])보기$', r'\1 보세요', content)
    content = re.sub(r'해보기$', '해 보세요', content)
    content = re.sub(r'([가-힣])하기$', r'\1해 보세요', content)
    content = re.sub(r'([가-힣])보자$', r'\1 보세요', content)
    content = re.sub(r'([가-힣])하자$', r'\1해 보세요', content)
    return content


async def _get_recent_diary_text(user_id: int, db: AsyncSession) -> str:
    """어제 일기가 없으면 가장 최근 일기로 fallback."""
    yesterday = date.today() - timedelta(days=1)
    result = await db.execute(
        select(Diary.content)
        .where(Diary.user_id == user_id, Diary.diary_date == yesterday)
        .order_by(Diary.created_at)
    )
    contents = result.scalars().all()
    if contents:
        return "\n---\n".join(contents)

    # fallback: 가장 최근 날짜의 일기
    fallback = await db.execute(
        select(Diary.content)
        .where(Diary.user_id == user_id)
        .order_by(Diary.diary_date.desc(), Diary.created_at.desc())
        .limit(3)
    )
    recent = fallback.scalars().all()
    return "\n---\n".join(recent) if recent else "최근 일기 없음"


async def generate_missions(user_id: int, db: AsyncSession) -> int:
    # 기존 active 미션 (원천 + 내용)
    existing_result = await db.execute(
        select(Mission.target_var, Mission.content)
        .where(Mission.user_id == user_id, Mission.status == "active")
    )
    existing_rows = existing_result.all()
    used_vars = {row.target_var for row in existing_rows}
    existing_contents = [row.content for row in existing_rows]

    if len(existing_rows) >= 3:
        return 0

    # 분석 결과로 원천별 점수 산출 (없으면 기본 순서)
    analysis_result = await db.execute(
        select(DailyAnalysis)
        .where(DailyAnalysis.user_id == user_id, DailyAnalysis.is_reflected == True)
        .order_by(DailyAnalysis.diary_date.desc())
        .limit(1)
    )
    analysis = analysis_result.scalar_one_or_none()

    if analysis:
        scores = {
            "M": float(analysis.score_m),
            "V": float(analysis.score_v),
            "P": float(analysis.score_p),
            "A": float(analysis.score_a),
        }
        # 0.5 미만인 부족한 원천만, 낮은 순으로 정렬
        weak_vars = sorted([v for v, s in scores.items() if s < 0.5], key=lambda v: scores[v])
    else:
        # 분석 없으면 M 하나만 기본 생성
        weak_vars = ["M"]

    available_vars = [v for v in weak_vars if v not in used_vars]

    if not available_vars:
        return 0

    diary_text = await _get_recent_diary_text(user_id, db)
    generated = 0
    generated_contents = list(existing_contents)

    slots_left = 3 - len(existing_rows)
    for i in range(min(slots_left, len(available_vars))):
        target_var = available_vars[i]
        current_block = "\n".join(f"- {c}" for c in generated_contents) if generated_contents else "없음"
        user_prompt = (
            f"타겟 원천: {target_var}\n"
            f"일기:\n{diary_text}\n\n"
            f"[기존 미션 목록]\n{current_block}"
        )
        try:
            data = await chat_json([
                {"role": "system", "content": MISSION_SYSTEM},
                {"role": "user", "content": user_prompt},
            ])
            content = _fix_tone(data.get("content", "").strip())
            if not content:
                continue
            mission = Mission(
                user_id=user_id,
                content=content,
                target_var=target_var,
                status="active",
            )
            db.add(mission)
            generated_contents.append(content)
            generated += 1
        except Exception as e:
            logger.error(f"Mission generation failed user={user_id}: {e}")

    if generated:
        await db.commit()
        logger.info(f"Generated {generated} missions for user={user_id}, vars={available_vars[:slots_left]}")
    return generated
