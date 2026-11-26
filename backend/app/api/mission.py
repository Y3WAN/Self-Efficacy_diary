import json
import logging
from calendar import monthrange
from datetime import date, datetime, time, timedelta, timezone
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from app.db.session import get_db
from app.db.models import Diary, Mission, User, Respect
from app.core.deps import get_current_user
from app.core.timeutil import KST, today_kst
from app.api.auth import TRIAL_PREFIX
from app.services.elo_service import (
    BASE_RATING, LEVEL_RATINGS, apply_result, level_for_rating,
)
from app.services.mission_service import draft_mission, load_plan
from app.services.mission_kb import public_guide, public_material
from app.services.mission_planner import feedback_for, grade_choice
from app.services.helper_service import MAX_HELP_TURNS, ask_helper, load_chat, remaining_turns
from pydantic import BaseModel, StringConstraints

logger = logging.getLogger(__name__)


class MissionResponse(BaseModel):
    id: int
    content: str
    target_var: str
    status: str
    difficulty: Optional[int] = None
    level: Optional[int] = None
    reason: Optional[str] = None
    helper: Optional[str] = None
    diary_id: Optional[int] = None
    reflection: Optional[str] = None
    created_at: datetime
    help_remaining: int = MAX_HELP_TURNS
    help_messages: list[dict] = []
    can_postpone: bool = True
    postponed_until: Optional[date] = None
    # 분야별 미션 (기존 미션은 모두 기본값 → 예전 화면·클라이언트와 호환)
    kind: str = "action"  # action | help(안전이 걸린 상황의 도움 요청 안내)
    domain: Optional[str] = None
    completion: Optional[str] = None
    material: Optional[dict] = None  # 미션 화면에 함께 보여 줄 지문·문제·카드 (정답은 답을 남긴 뒤에만)
    help_guide: Optional[dict] = None
    response_type: str = "none"  # choice | text | scale_text | none
    response_prompt: Optional[str] = None
    clarify: Optional[dict] = None  # 미션을 맞추려고 한 가지 확인하는 질문 (답하면 사라짐)
    attempts: list[dict] = []
    attempts_remaining: int = 0

    model_config = {"from_attributes": True}

    @classmethod
    def of(cls, mission: Mission) -> "MissionResponse":
        res = cls.model_validate(mission)
        if mission.difficulty is not None:
            res.level = level_for_rating(mission.difficulty)
        res.help_remaining = remaining_turns(mission)
        res.help_messages = load_chat(mission)
        res.can_postpone = mission.postponed_until is None
        plan = load_plan(mission)
        attempts = load_attempts(mission)
        res.kind = plan.get("kind", "action")
        res.material = public_material(mission.material_id, reveal_answer=bool(attempts))
        res.help_guide = public_guide(plan.get("guide_id"))
        res.response_type = plan.get("response_type", "none")
        res.response_prompt = plan.get("response_prompt") or None
        res.clarify = plan.get("clarify") if not attempts else None
        res.attempts = attempts
        res.attempts_remaining = max(0, max_attempts(res.response_type) - len(attempts))
        return res


MAX_ATTEMPTS = 3


def max_attempts(response_type: str) -> int:
    """객관식은 답을 남기면 정답이 공개되므로 한 번, 글·부담 기록은 세 번까지."""
    return {"none": 0, "choice": 1}.get(response_type, MAX_ATTEMPTS)


def load_attempts(mission: Mission) -> list[dict]:
    try:
        attempts = json.loads(mission.answer or "[]")
    except (TypeError, ValueError):
        return []
    return [a for a in attempts if isinstance(a, dict)] if isinstance(attempts, list) else []


class MissionFeedback(BaseModel):
    """완료·포기할 때 남기는 한 줄 회고 (선택). 다음 분석·미션에 반영된다."""
    reflection: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]] = None


def _apply_feedback(mission: Mission, body: "MissionFeedback | None") -> None:
    if body and body.reflection:
        mission.reflection = body.reflection


class MissionResultResponse(MissionResponse):
    elo_before: int
    elo_after: int


class CommunityFeedItem(BaseModel):
    id: int
    display_name: str
    content: str
    completed_at: datetime
    respect_count: int
    has_respected: bool
    is_own: bool


router = APIRouter(prefix="/api/missions", tags=["missions"])


@router.get("", response_model=list[MissionResponse])
async def list_missions(
    include_history: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Mission)
        .where(Mission.user_id == current_user.id, Mission.status == "active")
        .order_by(Mission.created_at)
    )
    today = today_kst()
    # 미룬 미션은 미룬 날이 되기 전까지 오늘의 미션에서 뺀다.
    missions = [m for m in result.scalars().all() if m.postponed_until is None or m.postponed_until <= today]
    if include_history:
        history = await db.execute(
            select(Mission)
            .where(Mission.user_id == current_user.id, Mission.status != "active")
            .order_by(Mission.created_at.desc(), Mission.id.desc())
            .limit(20)
        )
        missions.extend(history.scalars().all())
    return [MissionResponse.of(m) for m in missions]


@router.get("/history", response_model=list[MissionResponse])
async def list_mission_history(
    month: Annotated[str, Query(pattern=r"^[1-9][0-9]{3}-(0[1-9]|1[0-2])$")],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    first_day = date.fromisoformat(f"{month}-01")
    last_day = first_day.replace(day=monthrange(first_day.year, first_day.month)[1])
    result = await db.execute(
        select(Mission)
        .where(
            Mission.user_id == current_user.id,
            Mission.status != "active",
            Mission.created_at.between(
                datetime.combine(first_day, time.min, KST),
                datetime.combine(last_day, time.max, KST),
            ),
        )
        .order_by(Mission.created_at.desc(), Mission.id.desc())
    )
    return [MissionResponse.of(mission) for mission in result.scalars()]


def _mask_username(username: str) -> str:
    if len(username) <= 2:
        return "□" * len(username)
    prefix_length = 2 if len(username) >= 4 else 1
    return f"{username[:prefix_length]}{'□' * (len(username) - prefix_length - 1)}{username[-1]}"


@router.get("/community/feed", response_model=list[CommunityFeedItem])
async def community_feed(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Mission.id,
            User.username,
            Mission.content,
            Mission.completed_at,
            func.count(Respect.id).label("respect_count"),
            func.bool_or(Respect.from_user_id == current_user.id).label("has_respected"),
            (Mission.user_id == current_user.id).label("is_own"),
        )
        .join(User, Mission.user_id == User.id)
        .outerjoin(Respect, Respect.mission_id == Mission.id)
        .where(Mission.status == "done", Mission.completed_at.isnot(None))
        .group_by(Mission.id, User.username, Mission.content, Mission.completed_at)
        .order_by(Mission.completed_at.desc())
        .limit(50)
    )
    rows = result.all()
    return [
        CommunityFeedItem(
            id=row.id,
            display_name=_mask_username(row.username),
            content=row.content,
            completed_at=row.completed_at,
            respect_count=row.respect_count or 0,
            has_respected=bool(row.has_respected),
            is_own=bool(row.is_own),
        )
        for row in rows
    ]


class StackBook(BaseModel):
    id: int
    content: str
    status: str  # done / skipped
    was_postponed: bool
    respect_count: int
    finished_at: datetime


class MissionStackResponse(BaseModel):
    """미션 쌓기: 끝난 미션을 결과별 책으로 쌓아 보여 준다. 나만 보는 탑."""
    books: list[StackBook]  # 오래된 것부터 (아래부터 쌓임)
    done_count: int
    skipped_count: int
    postponed_count: int  # 미뤘던 적이 있는 끝난 미션
    waiting_count: int  # 지금 미뤄 둔 미션 (아직 책이 아님)


STACK_LIMIT = 200


@router.get("/stack", response_model=MissionStackResponse)
async def mission_stack(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    finished_at = func.coalesce(Mission.completed_at, Mission.created_at)
    result = await db.execute(
        select(
            Mission.id, Mission.content, Mission.status,
            (Mission.postponed_until.isnot(None)).label("was_postponed"),
            func.count(Respect.id).label("respect_count"),
            finished_at.label("finished_at"),
        )
        .outerjoin(Respect, Respect.mission_id == Mission.id)
        .where(Mission.user_id == current_user.id, Mission.status.in_(("done", "skipped")))
        .group_by(Mission.id)
        .order_by(finished_at.desc(), Mission.id.desc())
        .limit(STACK_LIMIT)
    )
    books = [StackBook(**row._mapping) for row in result.all()][::-1]

    counts = dict((await db.execute(
        select(Mission.status, func.count())
        .where(Mission.user_id == current_user.id, Mission.status.in_(("done", "skipped")))
        .group_by(Mission.status)
    )).all())
    postponed = await db.scalar(
        select(func.count()).select_from(Mission).where(
            Mission.user_id == current_user.id,
            Mission.status.in_(("done", "skipped")),
            Mission.postponed_until.isnot(None),
        )
    )
    waiting = await db.scalar(
        select(func.count()).select_from(Mission).where(
            Mission.user_id == current_user.id,
            Mission.status == "active",
            Mission.postponed_until > today_kst(),
        )
    )
    return MissionStackResponse(
        books=books,
        done_count=counts.get("done", 0),
        skipped_count=counts.get("skipped", 0),
        postponed_count=postponed or 0,
        waiting_count=waiting or 0,
    )


async def _get_active_mission(mission_id: int, user: User, db: AsyncSession) -> Mission:
    result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.user_id == user.id)
    )
    mission = result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.status != "active":
        raise HTTPException(status_code=409, detail="Mission is not active")
    return mission


def _result_response(mission: Mission, elo_before: int, elo_after: int) -> MissionResultResponse:
    return MissionResultResponse(
        **MissionResponse.of(mission).model_dump(), elo_before=elo_before, elo_after=elo_after
    )


def _apply_elo(user: User, mission: Mission, won: bool, db: AsyncSession) -> tuple[int, int]:
    """도움 요청 안내 미션은 실력과 상관없으므로 ELO에 넣지 않는다. 나머지는 기존과 같다."""
    if load_plan(mission).get("kind") == "help":
        rating = user.elo if user.elo is not None else BASE_RATING
        return rating, rating
    return apply_result(user, mission, won=won, db=db)


@router.post("/{mission_id}/complete", response_model=MissionResultResponse)
async def complete_mission(
    mission_id: int,
    body: Optional[MissionFeedback] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mission = await _get_active_mission(mission_id, current_user, db)

    mission.status = "done"
    mission.completed_at = datetime.now(timezone.utc)
    _apply_feedback(mission, body)
    current_user.points = (current_user.points or 0) + 100
    before, after = _apply_elo(current_user, mission, won=True, db=db)
    await db.commit()
    await db.refresh(mission)
    return _result_response(mission, before, after)


@router.post("/{mission_id}/skip", response_model=MissionResultResponse)
async def skip_mission(
    mission_id: int,
    body: Optional[MissionFeedback] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """'너무 어려워요' — ELO 패배로 반영해 다음 미션 난이도를 낮춘다."""
    mission = await _get_active_mission(mission_id, current_user, db)

    mission.status = "skipped"
    mission.completed_at = datetime.now(timezone.utc)
    _apply_feedback(mission, body)
    before, after = _apply_elo(current_user, mission, won=False, db=db)
    await db.commit()
    await db.refresh(mission)
    return _result_response(mission, before, after)


class HelpRequest(BaseModel):
    message: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]


@router.post("/{mission_id}/help", response_model=MissionResponse)
async def ask_mission_helper(
    mission_id: int,
    body: HelpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """'어려워요' → AI 조력자 상담. 미션 하나당 MAX_HELP_TURNS번까지."""
    mission = await _get_active_mission(mission_id, current_user, db)
    if remaining_turns(mission) <= 0:
        raise HTTPException(status_code=409, detail="상담 기회를 모두 썼어요")

    reply, expert = await ask_helper(mission, body.message)
    if not reply:
        raise HTTPException(status_code=502, detail="AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.")

    chat = load_chat(mission)
    answer = {"role": "assistant", "content": reply}
    if expert:
        answer["expert"] = expert
    chat += [{"role": "user", "content": body.message}, answer]
    mission.help_chat = json.dumps(chat, ensure_ascii=False)
    mission.help_count = (mission.help_count or 0) + 1
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


@router.post("/{mission_id}/postpone", response_model=MissionResponse)
async def postpone_mission(
    mission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """내일로 미루기. 실패로 세지 않는다(ELO 그대로). 미션당 1번."""
    mission = await _get_active_mission(mission_id, current_user, db)
    if mission.postponed_until is not None:
        raise HTTPException(status_code=409, detail="이미 한 번 미룬 미션이에요")
    mission.postponed_until = today_kst() + timedelta(days=1)
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


class RetargetRequest(BaseModel):
    harder: bool


@router.post("/{mission_id}/retarget", response_model=MissionResponse)
async def retarget_mission(
    mission_id: int,
    body: RetargetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """부스 체험 전용: 같은 일기·같은 원천으로 한 단계 어렵거나 쉬운 미션으로 바꾼다.

    '할 수 있겠어요/어려울 것 같아요'는 미션을 실제로 해 본 결과가 아니므로
    완료·실패 처리나 ELO 갱신을 하지 않고, 진행 중인 미션의 내용과 난이도만 바꾼다.
    """
    if not current_user.username.startswith(TRIAL_PREFIX):
        raise HTTPException(status_code=403, detail="Trial accounts only")
    mission = await _get_active_mission(mission_id, current_user, db)

    level = level_for_rating(mission.difficulty if mission.difficulty is not None else BASE_RATING)
    new_level = max(1, min(5, level + (1 if body.harder else -1)))
    if new_level == level:
        raise HTTPException(status_code=409, detail="이미 가장 어려운 단계예요" if body.harder else "이미 가장 쉬운 단계예요")

    plan = load_plan(mission)
    if plan.get("kind") == "help":
        raise HTTPException(status_code=409, detail="도움 요청 안내는 난이도를 바꾸지 않아요")

    draft = await draft_mission(
        mission.target_var, new_level, await _diary_text(mission, db), [mission.content],
        everyday=bool(mission.is_everyday),
        extraction=plan.get("extraction"),  # 같은 일기에서 이미 뽑은 상황을 다시 쓴다
    )
    if not draft.content:
        raise HTTPException(status_code=502, detail="AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.")

    draft.apply_to(mission)
    mission.answer = None
    mission.difficulty = LEVEL_RATINGS[new_level]
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


async def _diary_text(mission: Mission, db: AsyncSession) -> str:
    if mission.diary_id is None:
        return ""
    diary = await db.get(Diary, mission.diary_id)
    return diary.content if diary else ""


class ClarifyRequest(BaseModel):
    answer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]


@router.post("/{mission_id}/clarify", response_model=MissionResponse)
async def clarify_mission(
    mission_id: int,
    body: ClarifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """미션이 달라질 정보 한 가지에 답하면, 같은 난이도로 그 답에 맞춘 미션으로 바꾼다.

    실제로 해 본 결과가 아니므로 ELO는 그대로 두고, 확인은 미션당 한 번만 한다.
    """
    mission = await _get_active_mission(mission_id, current_user, db)
    plan = load_plan(mission)
    clarify = plan.get("clarify")
    extraction = plan.get("extraction")
    if not clarify or not isinstance(extraction, dict) or load_attempts(mission):
        raise HTTPException(status_code=409, detail="지금은 확인할 질문이 없어요")

    extraction = {**extraction, "conditions": dict(extraction.get("conditions") or {}), "clarified": True}
    if clarify["key"] == "blocker_type":
        values = {o["value"] for o in clarify.get("options", [])}
        labels = {o["label"]: o["value"] for o in clarify.get("options", [])}
        value = body.answer if body.answer in values else labels.get(body.answer)
        if value is None:
            raise HTTPException(status_code=422, detail="보기 중에서 골라 주세요")
        extraction["blocker_type"] = value
    else:
        extraction["conditions"][clarify["key"]] = body.answer

    level = level_for_rating(mission.difficulty if mission.difficulty is not None else BASE_RATING)
    draft = await draft_mission(
        mission.target_var, level, await _diary_text(mission, db), [mission.content],
        (current_user.custom_prompt or "").strip(), extraction=extraction,
    )
    if not draft.content:
        raise HTTPException(status_code=502, detail="AI 응답을 받지 못했어요. 잠시 후 다시 시도해 주세요.")
    draft.apply_to(mission)
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


class AnswerRequest(BaseModel):
    choice: Optional[int] = None  # 객관식 보기 번호 (0부터)
    scale: Optional[int] = None  # 부담 정도 1~5
    text: Optional[Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]] = None


@router.post("/{mission_id}/answer", response_model=MissionResponse)
async def answer_mission(
    mission_id: int,
    body: AnswerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """미션 화면에서 남긴 답·수행 결과 → 객관식은 등록된 정답으로 채점, 피드백은 그 답을 짚어 준다.

    피드백은 조력자 대화에도 남겨, '어려워요'를 누르면 그 답을 이어서 물어볼 수 있다.
    조력자 상담 횟수는 쓰지 않는다. 완료(ELO)는 기존처럼 학생이 '해냈어요'로 정한다.
    """
    mission = await _get_active_mission(mission_id, current_user, db)
    plan = load_plan(mission)
    response_type = plan.get("response_type", "none")
    if response_type == "none":
        raise HTTPException(status_code=409, detail="답을 남기는 미션이 아니에요")
    attempts = load_attempts(mission)
    if len(attempts) >= max_attempts(response_type):
        raise HTTPException(status_code=409, detail="이미 답을 남겼어요")

    attempt: dict = {}
    if response_type == "choice":
        material = public_material(mission.material_id)
        if body.choice is None or material is None or not 0 <= body.choice < len(material["choices"]):
            raise HTTPException(status_code=422, detail="보기 중에서 하나를 골라 주세요")
        attempt["choice"] = body.choice
        attempt["correct"] = grade_choice(mission.material_id, body.choice)
    if response_type == "scale_text":
        if body.scale is None or not 1 <= body.scale <= 5:
            raise HTTPException(status_code=422, detail="부담 정도를 1~5 중에서 골라 주세요")
        attempt["scale"] = body.scale
    if body.text:
        attempt["text"] = body.text
    if response_type == "text" and not body.text:
        raise HTTPException(status_code=422, detail="해 본 내용을 적어 주세요")

    attempt["feedback"] = await feedback_for(plan, mission.content, mission.completion or "", attempt)
    attempt["at"] = datetime.now(timezone.utc).isoformat()
    attempts.append(attempt)
    mission.answer = json.dumps(attempts, ensure_ascii=False)

    # 조력자 흐름 재사용: 답과 피드백을 상담 기록에 남긴다 (상담 횟수는 그대로)
    summary = []
    if "choice" in attempt:
        material = public_material(mission.material_id)
        summary.append(f"내 답: {attempt['choice'] + 1}번 {material['choices'][attempt['choice']]}")
    if "scale" in attempt:
        summary.append(f"부담: {attempt['scale']}/5")
    if attempt.get("text"):
        summary.append(attempt["text"])
    chat = load_chat(mission)
    chat += [
        {"role": "user", "content": " · ".join(summary), "kind": "answer"},
        {"role": "assistant", "content": attempt["feedback"], "kind": "feedback"},
    ]
    mission.help_chat = json.dumps(chat, ensure_ascii=False)
    await db.commit()
    await db.refresh(mission)
    return MissionResponse.of(mission)


@router.post("/community/{mission_id}/respect")
async def respect_mission(
    mission_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mission_result = await db.execute(
        select(Mission).where(Mission.id == mission_id, Mission.status == "done")
    )
    mission = mission_result.scalar_one_or_none()
    if not mission:
        raise HTTPException(status_code=404, detail="Mission not found")
    if mission.user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot respect own mission")

    respect = Respect(from_user_id=current_user.id, mission_id=mission_id)
    db.add(respect)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Already respected")

    owner_result = await db.execute(select(User).where(User.id == mission.user_id))
    owner = owner_result.scalar_one()
    owner.points = (owner.points or 0) + 5

    await db.commit()

    count_result = await db.execute(
        select(func.count(Respect.id)).where(Respect.mission_id == mission_id)
    )
    total = count_result.scalar() or 0
    return {"respect_count": total}
