"""분야별 미션 기준·자료 등록부 (app/data/mission_kb.json).

팀이 JSON에 분야(공부·운동·인간관계)별 '먼저 확인할 정보', '막힌 지점별 활동', '완료 기준',
'피드백 기준', '도움 요청 안내가 필요한 조건'과 자료(지문·문제·카드)를 등록한다.
서버가 처음 읽을 때 형식을 검사해서, 잘못 등록된 항목은 바로 오류로 알려 준다.
"""
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator

KB_PATH = Path(__file__).resolve().parent.parent / "data" / "mission_kb.json"

ReviewStatus = Literal["draft", "source_checked", "expert_reviewed"]
# 안전이 걸린 상황에 보여 줄 수 있는 도움 요청 안내의 최소 검토 상태
SAFE_GUIDE_STATUSES = ("source_checked", "expert_reviewed")


class Review(BaseModel):
    status: ReviewStatus
    reviewer: Optional[str] = None
    reviewed_at: Optional[str] = None
    note: str = ""


class Source(BaseModel):
    type: Literal["team_written", "public", "licensed"]
    by: str
    note: str = ""


class Condition(BaseModel):
    label: str
    question: str
    options: list[str] = []


class Option(BaseModel):
    label: str
    value: str


class BlockerQuestion(BaseModel):
    question: str
    options: list[Option]


class Fallback(BaseModel):
    guide: str
    content: str
    completion: str


class Blocker(BaseModel):
    label: str
    activity: str
    requires: list[str] = []
    needs_material: bool = False
    response: Literal["choice", "text", "scale_text", "none"] = "text"
    response_prompt: str = ""
    completion: str
    feedback_criteria: list[str] = []
    fallback: Fallback


class Escalation(BaseModel):
    id: str
    flag: Literal["pain", "threat", "crisis"]
    label: str
    keywords: list[str] = []
    guide: str


class Domain(BaseModel):
    label: str
    check_first: list[str] = []
    blocker_question: BlockerQuestion
    default_fallback: Fallback
    blockers: dict[str, Blocker]
    escalation: list[Escalation] = []


class Material(BaseModel):
    id: str
    domain: str
    subject: Optional[str] = None
    blockers: list[str]
    levels: list[int]
    type: Literal["mcq", "card"]
    title: str
    passage: str = ""
    question: str = ""
    choices: list[str] = []
    answer: Optional[int] = None
    rationale: str = ""
    steps: list[str] = []
    example: str = ""
    source: Source
    review: Review

    @model_validator(mode="after")
    def _check_mcq(self):
        if self.type == "mcq":
            if len(self.choices) < 2 or self.answer is None or not 0 <= self.answer < len(self.choices):
                raise ValueError(f"{self.id}: 객관식은 선택지 2개 이상과 등록된 정답 번호가 필요합니다")
        return self


class GuideMission(BaseModel):
    content: str
    completion: str


class HelpGuide(BaseModel):
    id: str
    title: str
    text: str
    mission: GuideMission
    source: Source
    review: Review


class KnowledgeBase(BaseModel):
    version: str
    review_statuses: dict[str, str]
    conditions: dict[str, Condition]
    domains: dict[str, Domain]
    global_escalation: list[Escalation] = []
    materials: list[Material] = []
    help_guides: list[HelpGuide] = []
    material_index: dict[str, Material] = Field(default_factory=dict, exclude=True)
    guide_index: dict[str, HelpGuide] = Field(default_factory=dict, exclude=True)

    @model_validator(mode="after")
    def _check_refs(self):
        self.material_index = {m.id: m for m in self.materials}
        self.guide_index = {g.id: g for g in self.help_guides}
        if len(self.material_index) != len(self.materials):
            raise ValueError("자료 ID가 겹칩니다")
        for name, domain in self.domains.items():
            for key in domain.check_first:
                if key not in self.conditions:
                    raise ValueError(f"{name}.check_first: 등록되지 않은 조건 {key}")
            for bkey, blocker in domain.blockers.items():
                for key in blocker.requires:
                    if key not in self.conditions:
                        raise ValueError(f"{name}.{bkey}: 등록되지 않은 조건 {key}")
            for opt in domain.blocker_question.options:
                if opt.value not in domain.blockers:
                    raise ValueError(f"{name}.blocker_question: 등록되지 않은 막힌 지점 {opt.value}")
            for esc in domain.escalation:
                if esc.guide not in self.guide_index:
                    raise ValueError(f"{esc.id}: 등록되지 않은 안내 {esc.guide}")
        for esc in self.global_escalation:
            if esc.guide not in self.guide_index:
                raise ValueError(f"{esc.id}: 등록되지 않은 안내 {esc.guide}")
        for m in self.materials:
            domain = self.domains.get(m.domain)
            if domain is None or any(b not in domain.blockers for b in m.blockers):
                raise ValueError(f"{m.id}: 등록되지 않은 분야·막힌 지점")
            if any(not 1 <= lv <= 5 for lv in m.levels):
                raise ValueError(f"{m.id}: 난이도는 1~5")
        return self

    def review_label(self, review: Review) -> str:
        return self.review_statuses.get(review.status, review.status)


@lru_cache(maxsize=1)
def get_kb() -> KnowledgeBase:
    return KnowledgeBase.model_validate(json.loads(KB_PATH.read_text(encoding="utf-8")))


def public_material(material_id: str | None, reveal_answer: bool = False) -> dict | None:
    """미션 화면에 보낼 자료. 정답·해설은 학생이 답을 남긴 뒤에만 보낸다."""
    kb = get_kb()
    material = kb.material_index.get(material_id or "")
    if material is None:
        return None
    data = {
        "id": material.id,
        "type": material.type,
        "title": material.title,
        "passage": material.passage,
        "question": material.question,
        "choices": material.choices,
        "steps": material.steps,
        "example": material.example,
        "source": material.source.by,
        "review_status": material.review.status,
        "review_label": kb.review_label(material.review),
    }
    if reveal_answer and material.type == "mcq":
        data["answer"] = material.answer
        data["rationale"] = material.rationale
    return data


def public_guide(guide_id: str | None) -> dict | None:
    kb = get_kb()
    guide = kb.guide_index.get(guide_id or "")
    if guide is None:
        return None
    return {
        "id": guide.id,
        "title": guide.title,
        "text": guide.text,
        "source": guide.source.by,
        "review_status": guide.review.status,
        "review_label": kb.review_label(guide.review),
    }
