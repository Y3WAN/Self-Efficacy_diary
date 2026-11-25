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
SIBLING_WORDS = ("형", "누나", "오빠", "언니", "동생")

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
- 가장 중요한 규칙: 미션의 대상은 일기에 나온 바로 그 일이어야 합니다.
  수학 3번 문제 → 그 3번 문제, 줄넘기 → 줄넘기, 발표 → 그 발표, 친구와 싸움 → 그 친구.
  일기와 다른 활동(호흡, 스트레칭, 산책, 일반 공부법 검색, 아무 친구에게 메시지)으로 바꾸지 마세요.
- 미션을 끝내면 1단계 문제가 실제로 조금 풀려 있어야 합니다.
  만들고 나서 스스로 확인하세요: "이 미션을 하면 일기 속 그 문제가 직접 줄어드는가?" 아니면 다시 만드세요.
- 실패한 일을 같은 방식 그대로 다시 시키지 말고, 같은 일을 원인을 바꾼 방식으로 하게 하세요.
  ("피아노 곡을 처음부터 다시 쳐 보세요" X → 틀리는 마디가 문제이므로 그 마디만 따로 연습하기 O)
- 일기에 '어디서, 왜' 막혔는지가 드러나지 않으면, 그 일 안에서 막힌 곳을 먼저 찾아내는 미션을 주세요.
  (예: "수학 3번에서 막혔다" → "문제 3에서 아는 조건과 구해야 할 것을 한 줄씩 적어 보세요")
  막힌 곳이 분명해지는 것도 작은 성공이고, 다음 미션이 그 지점을 정확히 풀 수 있게 됩니다.
- [타겟 원천]은 '그 일을 어떤 방식으로 할지'만 정합니다. 미션의 대상을 바꾸지 않습니다.
  · M 성취경험: 그 일을 해낼 수 있는 크기로 나눠 직접 해결해 보기
  · V 대리경험: 그 일을 먼저 해낸 사람의 방법을 하나 가져와 그 일에 바로 적용해 보기
  · P 사회적 설득: 그 일을 잘 아는 사람에게 그 일의 막힌 부분을 구체적으로 물어보기
  · A 정서·신체: 그 일을 할 때의 긴장·지침·감정을 다루는 방식으로 그 일을 해 보기
    (예: 떨리는 발표 → 떨림에 익숙해지도록 실제처럼 서서 소리 내어 한 번 해 보기,
         숨이 차는 줄넘기 → 쉬는 간격을 정해 끊어서 목표 개수에 가까이 가 보기)
- 원천에 맞추면 일기 속 그 일에서 벗어나는 경우에는, 원천보다 문제 해결을 우선하세요.
- [목표 난이도]는 같은 문제를 얼마나 크게 푸는지입니다. 단계가 올라갈수록 시간·양을 늘리거나
  문제의 더 큰 부분을 다루세요. 같은 일기라도 Lv1과 Lv4 미션은 크기가 분명히 달라야 합니다.
  · 예) 틀리는 피아노 마디 — Lv1 "틀리는 마디 하나만 아주 느리게 3번 쳐 보세요."
                          Lv4 "틀리는 마디만 따로 15분 동안 연습해서 원래 빠르기로 쳐 보세요."
- [최근 미션 회고]가 있으면 참고하세요. 어려웠다는 미션과 비슷한 건 더 작게 하세요.

현실성 규칙
- 지금 있는 곳에서 혼자, 이미 가진 것(교과서·문제집·공책·휴대폰)만으로 바로 시작할 수 있을 것. 돈·장소 이동·준비물 금지.
- 끝났는지 알 수 있게 양·시간·결과물 중 하나를 구체적으로 넣으세요 (예: 3문제, 10분, 한 줄 메모).
- [지금 시각]을 고려하세요. 밤이면 집에서 잠들기 전에 할 수 있는 것으로, 지금 만날 수 없는 사람은 '지금 보낼 메시지 한 통'으로.
- 행동은 하나. "~하고 ~해 보세요"처럼 다른 행동을 잇지 마세요.
  같은 행동을 나눠서 하는 방법("20개씩 끊어서 80개까지")은 하나의 행동으로 봅니다.
- 모호한 말("열심히", "조금", "생각해 보세요", "계획을 세워 보세요") 금지.
- [기존 미션 목록]과 겹치지 않을 것.
- 학생에게 말하듯 자연스러운 한 문장, 20자 이상 60자 이하, 반드시 '~보세요'로 끝내세요.
  '적어 해 보세요'처럼 동사 뒤에 '해'를 덧붙이지 마세요.
- 숫자(개수·시간·횟수)는 두 개까지만. ("20개씩 끊어서 80개까지" O / "20개씩 5번, 1분 쉬고 30분" X)

reason (이 미션을 하면 무엇이 좋아지는지)
- 이 미션을 하면 무엇이 쉬워지거나 풀리는지를 긍정형 한 문장으로. 50자 이하, 존댓말, '~요'로 끝내기.
- "~하지 못한 게 문제라", "~가 부족해서"처럼 학생의 부족함을 짚는 말로 시작하지 마세요.
- 원천 기호(M·V·P·A), 점수, 난이도 숫자는 쓰지 마세요.

helper (막히면 도와줄 사람과 실제로 건넬 말)
- 이 미션을 하다 막혔을 때 도움을 받을 사람(친구, 짝꿍, 선생님, 가족 등)과, 그 사람에게 실제로 건넬 질문을
  큰따옴표로 넣은 한 문장. 45자 이하, '~보세요'로 끝내기.
  (예: 짝꿍에게 "3번 첫 줄 어떻게 시작했어?"라고 물어보세요.)
- "물어보세요", "이야기해 보세요"로만 끝나는 막연한 문장은 쓰지 마세요. 질문을 구체적으로 만들 수 없으면 빈 문자열("")로 두세요.
- 일기에 나온 사람이 있으면 그 사람을 쓰고, 없으면 친구·선생님·가족 중에서 고르세요.
  동생·형·누나처럼 있는지 모르는 사람은 지어내지 마세요.
- [지금 시각]이 밤이면 '내일 물어보기'나 '메시지 한 통'처럼 지금 할 수 있는 방법으로.

올바른 예시 (형식만 참고하고, 문장을 그대로 베끼지 마세요)
- 일기 "방 청소하려고 했는데 너무 어질러져서 손도 못 댔다" / M / Lv2
  problem: 방 전체를 한 번에 치우려니 어디서 시작할지 몰랐다
  content: 책상 위만 타이머 10분을 맞추고 치워 보세요.
  reason: 한 곳만 정하면 시작하기가 훨씬 쉬워져요.
  helper: 가족에게 "이 물건 버려도 될까?"라고 물어보세요.
- 일기 "영어 듣기 평가에서 거의 못 알아들었다" / V / Lv2
  problem: 빠른 영어를 들을 때 쓸 방법을 모른다
  content: 영어 듣기 공부법 하나를 찾아서 지난 듣기 문제 5개에 써 보세요.
  reason: 먼저 해 본 사람의 방법을 가져오면 다음 듣기가 덜 막막해져요.
  helper: 영어 잘하는 친구에게 "듣기 할 때 뭐부터 들어?"라고 물어보세요.
- 일기 "조별 과제 회의에서 내 의견을 말 못 하고 넘어갔다" / P / Lv3
  problem: 말할 내용을 미리 정리하지 않아 끼어들 때를 놓쳤다
  content: 다음 회의에서 말할 의견 한 줄을 조원 단톡방에 미리 올려 보세요.
  reason: 의견을 먼저 글로 전해 두면 회의에서 말 꺼내기가 쉬워져요.
  helper: 친한 조원에게 "이 의견 어때?"라고 먼저 물어보세요.
- 일기 "시험 성적이 생각보다 낮아서 저녁 내내 짜증이 났다" / A / Lv1
  problem: 짜증이 풀리지 않아 다른 일을 시작하지 못했다
  content: 지금 짜증 나는 이유를 보내지 않을 메모에 세 줄로 적어 보세요.
  reason: 감정을 꺼내 적으면 마음이 정리되고 다음 일을 시작하기 쉬워져요.
  helper: ""

잘못된 예시 (절대 금지)
- "피아노 곡을 처음부터 다시 쳐 보세요" → 실패한 일을 반복할 뿐, 틀리는 마디는 그대로
- "수학 문제를 다시 풀어 보세요" → 막힌 곳을 모르면 같은 곳에서 또 막힘
- "공부 계획을 세워 보세요" → 끝났는지 알 수 없음
- "선생님을 찾아가 상담받아 보세요" (밤에) → 지금 할 수 없음
- "10분 동안 깊게 호흡해 보세요" (싸운 일기에) → 일기의 문제와 상관없는 일반 미션
- "숨을 깊게 들이마시고 천천히 내쉬어 보세요" (줄넘기 일기에) → 줄넘기 개수는 그대로
- "핵심 문장을 친구에게 보내 피드백을 받아 보세요" (발표가 떨린다는 일기에) → 떨림은 그대로
- 일기에 없는 문제를 지어낸 미션

JSON만 반환: {"problem": "일기에서 찾은 진짜 문제", "content": "미션 내용", "reason": "이 미션을 하면 좋아지는 점", "helper": "막히면 도와줄 사람과 방법"}"""


EVERYDAY_MISSION_SYSTEM = """당신은 학생의 하루 일기를 보고, 그날 있었던 일을 한 번 더 즐겁게 이어 가는 작은 미션 1개를 만드는 코치입니다.
이 일기는 공부·운동처럼 해 보려던 일이 없는 '일상 일기'입니다. 일기에서 고칠 점이나 문제를 찾지 마세요.

미션 (content)
- 일기에 나온 사람·장소·활동과 직접 이어지는 기분 좋은 행동 하나. 학생이 스스로 정해서 해냈다고 느낄 수 있는 것.
- 금지: 돈·예산·절약·계획표·목록 정리·반성·건강 관리(스트레칭·발성 등)·요리처럼 일기 속 아쉬운 점을 고치려는 미션.
- 지금 있는 곳에서 휴대폰이나 이미 가진 것만으로 바로 시작할 수 있을 것. 돈·장소 이동·준비물 금지.
- 끝났는지 알 수 있게 대상이나 개수를 구체적으로 넣으세요.
- [목표 난이도]가 높을수록 같은 방향에서 조금 더 큰 행동으로.
  (Lv1 짧은 메시지 한 통 → Lv3 다음 약속을 직접 정해 제안하기 → Lv5 여러 사람과 함께할 일을 직접 꾸리기)
- 행동은 하나. 학생에게 말하듯 자연스러운 한 문장, 20자 이상 60자 이하, 반드시 '~보세요'로 끝내세요.
- 일기에 없는 사람(형·누나·동생 등)을 지어내지 마세요.
- [지금 시각]이 밤이면 메시지처럼 지금 할 수 있는 방법으로.

reason: 이 행동을 하면 무엇이 좋은지 긍정형 한 문장. 50자 이하, 존댓말, '~요'로 끝내기.
helper: 막히면 도와줄 사람과 실제로 건넬 말을 큰따옴표로 넣은 한 문장. 45자 이하, '~보세요'로 끝내기. 마땅치 않으면 "".

예시 (형식만 참고하고, 문장을 그대로 베끼지 마세요)
- "친구와 마라탕을 먹었는데 돈이 모자라 꿔바로우를 뺐다" / Lv1
  content: 같이 간 친구에게 오늘 제일 맛있었던 재료를 메시지로 말해 보세요.
- 같은 일기 / Lv3
  content: 같이 간 친구에게 다음에 같이 먹을 날과 메뉴를 정해 제안해 보세요.
- "가족이랑 영화를 봤는데 생각보다 길어서 졸렸다" / Lv2
  content: 같이 본 가족에게 영화에서 제일 좋았던 장면을 하나 골라 말해 보세요.

JSON만 반환: {"problem": "일상 일기", "content": "미션 내용", "reason": "이 미션을 하면 좋아지는 점", "helper": "막히면 도와줄 사람과 방법"}"""


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
    everyday: bool = False,
) -> tuple[str, str, str]:
    """미션 내용, '왜 이 미션인지', '막히면 도와줄 사람'을 함께 만든다. 실패하면 ("", "", "").
    everyday: 해 보려던 일이 없는 일상 일기 → 문제 찾기 대신 그날 일을 즐겁게 이어 가는 미션 지시문을 쓴다."""
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
        {"role": "system", "content": EVERYDAY_MISSION_SYSTEM if everyday else MISSION_SYSTEM},
        {"role": "user", "content": user_prompt},
    ])
    if not isinstance(data, dict):
        return "", "", ""
    problem = str(data.get("problem", "") or "").strip()
    content = _fix_tone(str(data.get("content", "") or "").strip())
    reason = str(data.get("reason", "") or "").strip()[:120]
    helper = str(data.get("helper", "") or "").strip()[:80]
    # 일기에 없는 형제자매를 지어낸 조력자 줄은 버린다 (지시문으로는 완전히 막히지 않았음)
    invented = [w for w in SIBLING_WORDS if w in helper and w not in diary_text]
    if invented or helper in ('""', "''"):
        helper = ""
    logger.info("Mission draft target=%s level=%s problem=%s", target_var, level, problem[:80])
    return content, reason, helper


async def generate_mission_content(
    target_var: str,
    level: int,
    diary_text: str,
    existing_contents: list[str],
    custom_prompt: str = "",
) -> str:
    content, _, _ = await generate_mission_draft(target_var, level, diary_text, existing_contents, custom_prompt)
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
            content, reason, helper = await generate_mission_draft(
                target_var, level, diary_text, generated_contents, custom_prompt, recent_reflections
            )
            if not content:
                continue
            mission = Mission(
                user_id=user_id,
                content=content,
                reason=reason or None,
                helper=helper or None,
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
