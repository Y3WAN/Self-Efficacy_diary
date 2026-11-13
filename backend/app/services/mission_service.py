import logging
import re
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import Diary, DailyAnalysis, Mission, User
from app.core.timeutil import today_kst
from app.services.groq_client import chat_json
from app.services.elo_service import BASE_RATING, LEVEL_GUIDES, LEVEL_RATINGS, apply_result, target_level

logger = logging.getLogger(__name__)

MISSION_EXPIRE_DAYS = 3

MISSION_SYSTEM = """당신은 ZPD(근접발달영역) 기반 자기계발 미션 전문가입니다.
학생의 일기와 가장 낮은 자기효능감 원천을 바탕으로 오늘 실천 가능한 미션 1개를 만드세요.

원천:
- M (성취경험): 직접 도전하고 완수하는 경험 → 작게 시작해서 실제로 해내는 것
- V (대리경험): 비슷한 처지의 사람이 해낸 사례를 능동적으로 찾아보기
- P (사회적 설득): 주변 사람에게 조언·피드백 구하기, 실제 연락하기
- A (정서·신체): 지금 당장 기분이나 몸 상태를 바꾸는 행동

가장 중요한 규칙 — 일기와 연결:
- 일기에 나온 구체적인 상황·과목·사람·감정을 미션에 그대로 이어받으세요.
  (일기: "수학 첫 문제에서 막혀서 덮었다" → 미션: "막혔던 수학 첫 문제의 풀이 첫 줄만 써 보세요.")
- 일기 내용과 무관한 일반적인 미션(아무에게나 줄 수 있는 미션)은 만들지 마세요.
- 일기에 구체적인 상황이 없을 때만 일반적인 미션을 만드세요.
- [최근 미션 회고]가 있으면 참고하세요. 어려웠다는 미션과 비슷한 건 더 작게, 좋았다는 방식은 이어가세요.

미션 조건:
- 오늘 30분 안에 실행 가능한 구체적 행동
- [목표 난이도]에 적힌 수준에 정확히 맞출 것 (더 쉽거나 어렵게 만들지 마세요)
- 실제로 도움이 되는 현실적인 행동 (수동적 시청·암기 반복 금지)
- 20자 이상 50자 이하
- 아래 [기존 미션 목록]과 내용·맥락이 겹치지 않는 새로운 미션
- 말투: 반드시 '~해 보세요' 또는 '~받아 보세요'로 끝내세요

reason (왜 이 미션인지):
- 사용자가 읽을 한 문장, 60자 이하, 존댓말
- 일기의 어떤 내용 때문에 이 미션을 골랐는지 짚어 주세요
- 예: "수학을 포기했다고 해서, 아주 작게 다시 시작해 보는 미션이에요."
- 원천 기호(M·V·P·A)나 점수, 난이도 숫자는 쓰지 마세요

올바른 예시:
- 일기 "영어 단어 시험 망쳤다" → M: "오늘 틀린 영어 단어 중 3개만 골라 예문을 써 보세요."
- 일기 "발표 때 목소리가 떨렸다" → V: "발표 긴장을 극복한 사람의 경험담을 하나 찾아 읽어 보세요."
- 일기 "진로 때문에 머리가 복잡하다" → P: "진로 고민 하나를 담임 선생님께 짧게 여쭤 보세요."
- 일기 "하루 종일 기운이 없었다" → A: "지금 하던 걸 멈추고 밖에 나가 10분만 걸어 보세요."

잘못된 예시 (절대 사용 금지):
- "수학 문제 푸는 영상 10분 보기" → 수동적이고 효과 불분명
- "문제 1개만 풀어보기" → 명사형 종결
- "친구한테 물어보자" → 반말
- "성공한 사람의 인터뷰를 읽어 보세요" → 일기와 무관한 일반 미션

JSON만 반환: {"content": "미션 내용", "reason": "왜 이 미션인지"}"""


def _fix_tone(content: str) -> str:
    """반말·명사형 종결을 '~해 보세요' 존댓말로 교정."""
    content = content.rstrip(".")
    content = re.sub(r'([어아]) ?보기$', r'\1 보세요', content)
    content = re.sub(r'해 ?보기$', '해 보세요', content)
    content = re.sub(r'([가-힣])하기$', r'\1해 보세요', content)
    content = re.sub(r'([가-힣])보자$', r'\1 보세요', content)
    content = re.sub(r'([가-힣])하자$', r'\1해 보세요', content)
    return content


def rank_mission_sources(scores: dict[str, float]) -> list[str]:
    weak_vars = sorted((source for source, score in scores.items() if score < 0.5), key=scores.get)
    return weak_vars or [min(scores, key=scores.get)]


async def generate_mission_draft(
    target_var: str,
    level: int,
    diary_text: str,
    existing_contents: list[str],
    custom_prompt: str = "",
    recent_reflections: str = "",
) -> tuple[str, str]:
    """미션 내용과 '왜 이 미션인지'를 함께 만든다. 실패하면 ("", "")."""
    current_block = "\n".join(f"- {content}" for content in existing_contents) or "없음"
    user_prompt = (
        f"타겟 원천: {target_var}\n"
        f"[목표 난이도] Lv{level}/5 — {LEVEL_GUIDES[level]}\n"
        f"일기:\n{diary_text}\n\n"
    )
    if recent_reflections:
        user_prompt += f"[최근 미션 회고]\n{recent_reflections}\n\n"
    if custom_prompt:
        user_prompt += f"[사용자 추가 컨텍스트]\n{custom_prompt}\n\n"
    user_prompt += f"[기존 미션 목록]\n{current_block}"
    data = await chat_json([
        {"role": "system", "content": MISSION_SYSTEM},
        {"role": "user", "content": user_prompt},
    ])
    if not isinstance(data, dict):
        return "", ""
    content = _fix_tone(str(data.get("content", "") or "").strip())
    reason = str(data.get("reason", "") or "").strip()[:120]
    return content, reason


async def generate_mission_content(
    target_var: str,
    level: int,
    diary_text: str,
    existing_contents: list[str],
    custom_prompt: str = "",
) -> str:
    content, _ = await generate_mission_draft(target_var, level, diary_text, existing_contents, custom_prompt)
    return content


REFLECTION_STATUS = {"done": "완료", "skipped": "어려웠음", "expired": "못 함"}


async def get_recent_reflections(user_id: int, db: AsyncSession, limit: int = 3) -> str:
    """최근 미션 회고를 프롬프트용 문자열로. 없으면 ""."""
    result = await db.execute(
        select(Mission.content, Mission.status, Mission.reflection)
        .where(
            Mission.user_id == user_id,
            Mission.reflection.isnot(None),
            Mission.reflection != "",
        )
        .order_by(Mission.completed_at.desc().nullslast(), Mission.id.desc())
        .limit(limit)
    )
    lines = [
        f"- 미션 \"{row.content}\" ({REFLECTION_STATUS.get(row.status, row.status)}) → 회고: {row.reflection}"
        for row in result.all()
    ]
    return "\n".join(lines)


async def _get_recent_diary_text(user_id: int, db: AsyncSession) -> str:
    """어제 일기가 없으면 가장 최근 일기로 fallback."""
    yesterday = today_kst() - timedelta(days=1)
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


async def expire_stale_missions(user: User, db: AsyncSession) -> int:
    """기한이 지난 active 미션을 만료 처리하고 ELO 패배로 반영. 커밋은 호출자가 한다."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=MISSION_EXPIRE_DAYS)
    result = await db.execute(
        select(Mission)
        .where(Mission.user_id == user.id, Mission.status == "active", Mission.created_at < cutoff)
        .order_by(Mission.created_at)
    )
    stale = result.scalars().all()
    for mission in stale:
        mission.status = "expired"
        apply_result(user, mission, won=False, db=db)
    return len(stale)


async def generate_missions(user_id: int, db: AsyncSession) -> int:
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    custom_prompt = (user.custom_prompt or "").strip() if user else ""

    if user and await expire_stale_missions(user, db):
        await db.commit()

    # ELO 레이팅으로 이번 미션의 목표 난이도 결정
    level = target_level(user.elo if user and user.elo is not None else BASE_RATING)

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
        .order_by(DailyAnalysis.diary_date.desc(), DailyAnalysis.created_at.desc())
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
        weak_vars = rank_mission_sources(scores)
    else:
        # 분석 없으면 M 하나만 기본 생성
        weak_vars = ["M"]

    available_vars = [v for v in weak_vars if v not in used_vars]

    if not available_vars:
        return 0

    diary_text = await _get_recent_diary_text(user_id, db)
    recent_reflections = await get_recent_reflections(user_id, db)
    generated = 0
    generated_contents = list(existing_contents)

    slots_left = 3 - len(existing_rows)
    for i in range(min(slots_left, len(available_vars))):
        target_var = available_vars[i]
        try:
            content, reason = await generate_mission_draft(
                target_var, level, diary_text, generated_contents, custom_prompt, recent_reflections
            )
            if not content:
                continue
            mission = Mission(
                user_id=user_id,
                content=content,
                reason=reason or None,
                target_var=target_var,
                status="active",
                difficulty=LEVEL_RATINGS[level],
            )
            db.add(mission)
            generated_contents.append(content)
            generated += 1
        except Exception as e:
            logger.error(f"Mission generation failed user={user_id}: {e}")

    if generated:
        await db.commit()
        logger.info(f"Generated {generated} missions for user={user_id}, vars={available_vars[:slots_left]}, level={level}")
    return generated
