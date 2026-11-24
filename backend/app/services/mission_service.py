import logging
import re
from datetime import datetime, timedelta, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.db.models import Diary, DailyAnalysis, Mission, User
from app.core.timeutil import KST, today_kst
from app.services.groq_client import chat_json
from app.services.elo_service import BASE_RATING, LEVEL_GUIDES, LEVEL_RATINGS, target_level
from app.services.scoring import PROFILE_DAYS, rank_sources_from_profile, source_profile

logger = logging.getLogger(__name__)

MISSION_EXPIRE_DAYS = 3

MISSION_SYSTEM = """당신은 학생의 일기에서 '진짜 문제'를 찾고, 그 문제를 직접 풀어 주는 작은 미션 1개를 만드는 코치입니다.

1단계 — 진짜 문제 찾기 (problem)
- 일기에 적힌 결과("포기했다", "망했다", "멈췄다")가 아니라, 그 결과가 나온 원인이나 막힌 지점을 찾으세요.
  · "줄넘기 100개 목표였는데 60개에서 멈췄다" → 한 번에 100개를 이어서 하기엔 아직 숨이 찬다
  · "수학 문제가 너무 어려워서 포기했다" → 어디서 막혔는지 모르는 채로 문제를 덮었다
  · "공부하려다 폰 보다가 새벽 2시가 됐다" → 휴대폰이 손 닿는 곳에 있어 공부를 시작하지 못했다
- 일기에 이유가 적혀 있으면 그것을 쓰고, 없으면 일기 내용으로 가장 그럴듯한 원인 하나만 고르세요.
- 일기에 없는 사실(성격, 가족, 성적 등)을 지어내지 마세요.
- 학생 탓("의지가 약하다", "게으르다")이 아니라 바꿀 수 있는 상황으로 쓰세요.

2단계 — 그 문제를 푸는 미션 (content)
- 미션을 끝내면 1단계 문제가 실제로 조금 풀려 있어야 합니다.
- 실패한 일을 같은 방식으로 다시 시키지 마세요. 원인을 바꾸는 행동을 주세요.
  ("피아노 곡을 처음부터 다시 쳐 보세요" X → 틀리는 마디가 문제이므로 그 마디만 따로 연습하기 O)
- [타겟 원천]은 문제를 푸는 방법입니다.
  · M 성취경험: 문제를 직접, 해낼 수 있는 크기로 줄여서 해결해 보기
  · V 대리경험: 같은 문제를 해결한 사람의 방법을 찾아 하나 따라 해 보기
  · P 사회적 설득: 그 문제를 알 만한 사람에게 구체적으로 묻거나 도움 요청하기
  · A 정서·신체: 문제를 만든 감정이나 몸 상태를 바꾸기. 이때도 일기 속 그 감정과 상황에 맞춘 행동이어야 하며,
    아무 일기에나 줄 수 있는 호흡·스트레칭만으로 끝내지 마세요.
- [목표 난이도]는 같은 문제를 얼마나 크게 푸는지입니다. 단계가 올라갈수록 시간·양을 늘리거나
  문제의 더 큰 부분을 다루세요. 같은 일기라도 Lv1과 Lv4 미션은 크기가 분명히 달라야 합니다.
  · 예) 틀리는 피아노 마디 — Lv1 "틀리는 마디 하나만 아주 느리게 3번 쳐 보세요."
                          Lv4 "틀리는 마디만 따로 15분 동안 연습해서 원래 빠르기로 쳐 보세요."
- [최근 미션 회고]가 있으면 참고하세요. 어려웠다는 미션과 비슷한 건 더 작게 하세요.

현실성 규칙
- 지금 있는 곳에서 혼자, 이미 가진 것(교과서·문제집·공책·휴대폰)만으로 바로 시작할 수 있을 것. 돈·장소 이동·준비물 금지.
- 끝났는지 알 수 있게 양·시간·결과물 중 하나를 구체적으로 넣으세요 (예: 3문제, 10분, 한 줄 메모).
- [지금 시각]을 고려하세요. 밤이면 집에서 잠들기 전에 할 수 있는 것으로, 지금 만날 수 없는 사람은 '지금 보낼 메시지 한 통'으로.
- 행동은 하나. "~하고 ~해 보세요"처럼 여러 행동을 잇지 마세요.
- 모호한 말("열심히", "조금", "생각해 보세요", "계획을 세워 보세요") 금지.
- [기존 미션 목록]과 겹치지 않을 것.
- 학생에게 말하듯 자연스러운 한 문장, 20자 이상 60자 이하, 반드시 '~보세요'로 끝내세요.
  '적어 해 보세요'처럼 동사 뒤에 '해'를 덧붙이지 마세요.

reason (왜 이 미션인지)
- 일기에서 찾은 문제와, 이 미션이 그 문제를 어떻게 푸는지를 한 문장으로. 70자 이하, 존댓말.
- 원천 기호(M·V·P·A), 점수, 난이도 숫자는 쓰지 마세요.

올바른 예시 (형식만 참고하고, 문장을 그대로 베끼지 마세요)
- 일기 "방 청소하려고 했는데 너무 어질러져서 손도 못 댔다" / M / Lv2
  problem: 방 전체를 한 번에 치우려니 어디서 시작할지 몰랐다
  content: 책상 위만 타이머 10분을 맞추고 치워 보세요.
  reason: 한꺼번에 하려다 시작을 못 한 게 문제라, 한 곳만 정해 시작해 보는 미션이에요.
- 일기 "영어 듣기 평가에서 거의 못 알아들었다" / V / Lv2
  problem: 빠른 영어를 들을 때 쓸 방법을 모른다
  content: 영어 듣기 공부법 하나를 찾아서 오늘 써 볼 방법을 한 줄로 적어 보세요.
  reason: 들을 때 쓸 방법이 없는 게 문제라, 먼저 해 본 사람의 방법을 가져오는 미션이에요.
- 일기 "조별 과제 회의에서 내 의견을 말 못 하고 넘어갔다" / P / Lv3
  problem: 말할 내용을 미리 정리하지 않아 끼어들 때를 놓쳤다
  content: 다음 회의에서 말할 의견 한 줄을 조원 단톡방에 미리 올려 보세요.
  reason: 말할 때를 놓친 게 문제라, 의견을 먼저 글로 전해 두는 미션이에요.
- 일기 "시험 성적이 생각보다 낮아서 저녁 내내 짜증이 났다" / A / Lv1
  problem: 짜증이 풀리지 않아 다른 일을 시작하지 못했다
  content: 지금 짜증 나는 이유를 보내지 않을 메모에 세 줄로 적어 보세요.
  reason: 짜증이 계속 남아 있는 게 문제라, 감정을 꺼내 놓고 정리하는 미션이에요.

잘못된 예시 (절대 금지)
- "피아노 곡을 처음부터 다시 쳐 보세요" → 실패한 일을 반복할 뿐, 틀리는 마디는 그대로
- "수학 문제를 다시 풀어 보세요" → 막힌 곳을 모르면 같은 곳에서 또 막힘
- "공부 계획을 세워 보세요" → 끝났는지 알 수 없음
- "선생님을 찾아가 상담받아 보세요" (밤에) → 지금 할 수 없음
- "10분 동안 깊게 호흡해 보세요" (싸운 일기에) → 일기의 문제와 상관없는 일반 미션
- 일기에 없는 문제를 지어낸 미션

JSON만 반환: {"problem": "일기에서 찾은 진짜 문제", "content": "미션 내용", "reason": "왜 이 미션인지"}"""


def _fix_tone(content: str) -> str:
    """반말·명사형 종결을 '~해 보세요' 존댓말로 교정."""
    content = content.rstrip(".")
    # '적어 해 보세요', '써서 해 보세요' → '적어 보세요', '써 보세요'
    content = re.sub(r'([어아워써여])서? 해 ?보세요$', r'\1 보세요', content)
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
        f"[지금 시각] {datetime.now(KST):%H:%M} (한국 시간)\n"
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
    problem = str(data.get("problem", "") or "").strip()
    content = _fix_tone(str(data.get("content", "") or "").strip())
    reason = str(data.get("reason", "") or "").strip()[:120]
    logger.info("Mission draft target=%s level=%s problem=%s", target_var, level, problem[:80])
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
    """기한이 지난 active 미션을 만료 처리한다. 커밋은 호출자가 한다.

    만료는 ELO에 반영하지 않는다. 접속하지 않은 것(바빠서)과 해내지 못한 것(어려워서)은
    다르기 때문에, 실패는 사용자가 직접 '어려워요'를 누른 경우만 센다.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=MISSION_EXPIRE_DAYS)
    result = await db.execute(
        select(Mission)
        .where(Mission.user_id == user.id, Mission.status == "active", Mission.created_at < cutoff)
        .order_by(Mission.created_at)
    )
    stale = result.scalars().all()
    for mission in stale:
        mission.status = "expired"
    return len(stale)


async def load_source_profile(user_id: int, db: AsyncSession) -> dict[str, dict]:
    """최근 PROFILE_DAYS일 원천별 확신도 가중 EMA. 그 이전 마지막 분석(가입 설문 포함)은 출발점으로 쓴다."""
    since = today_kst() - timedelta(days=PROFILE_DAYS)
    base = select(DailyAnalysis).where(
        DailyAnalysis.user_id == user_id, DailyAnalysis.is_reflected == True  # noqa: E712
    )
    prior = await db.execute(
        base.where(DailyAnalysis.diary_date < since)
        .order_by(DailyAnalysis.diary_date.desc(), DailyAnalysis.created_at.desc())
        .limit(1)
    )
    recent = await db.execute(
        base.where(DailyAnalysis.diary_date >= since)
        .order_by(DailyAnalysis.diary_date, DailyAnalysis.created_at)
    )
    rows = list(prior.scalars().all()) + list(recent.scalars().all())
    return source_profile(rows, since=since)


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

    # 최근 7일 원천별 추세(근거 있는 날만)로 약한 원천을 고른다
    weak_vars = rank_sources_from_profile(await load_source_profile(user_id, db))

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
