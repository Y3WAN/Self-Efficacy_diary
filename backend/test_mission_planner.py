# -*- coding: utf-8 -*-
"""분야별 미션 설계 검증 (AI 호출 없음: chat_json을 가짜 응답으로 바꿔 끼운다).

    python test_mission_planner.py          # 선택·검증 로직만
    python test_mission_planner.py --api    # + 로컬 DB로 일기→미션→답→확인 질문→재조정→완료(ELO) 흐름

--api는 .env의 DATABASE_URL(로컬 DB)에 체험 계정을 하나 만들고 끝나면 지운다.
"""
import asyncio
import json
import sys

from app.services import mission_planner as planner
from app.services import mission_service, reflection_service, helper_service
from app.services.mission_kb import get_kb, public_material
from app.services.mission_planner import Selection, grade_choice, normalize_extraction, select_context, validate_draft

ok = True


def check(label, cond, extra=""):
    global ok
    print(f"{'[PASS]' if cond else '[FAIL]'} {label}{' -> ' + str(extra) if extra else ''}")
    if not cond:
        ok = False


def ex(domain, blocker, conditions=None, safety="none", diary=""):
    return normalize_extraction(
        {"domain": domain, "blocker_type": blocker, "conditions": conditions or {}, "safety": safety,
         "intended_task": "", "blocker": ""}, diary)


# ── 등록부 ────────────────────────────────────────────────────────────
kb = get_kb()
check("등록부 형식 검사 통과", kb.version == "2026-11-26")
check("모든 자료에 출처·검토 상태", all(m.source.by and m.review.status for m in kb.materials))
check("팀 작성 자료는 전문가 검토 전으로 표시",
      all(m.review.status == "draft" for m in kb.materials if m.source.type == "team_written"))
check("도움 요청 안내는 안전 상황에 쓸 수 있는 검토 상태",
      all(g.review.status in ("source_checked", "expert_reviewed") for g in kb.help_guides))
pub = public_material("study.ko.read.01")
check("답 남기기 전 자료에는 정답이 없음", "answer" not in pub and "rationale" not in pub)
check("답 남긴 뒤 자료에는 정답·해설", public_material("study.ko.read.01", reveal_answer=True)["answer"] == 1)
check("자료에 검토 상태 표시 문구", pub["review_label"] == "팀 작성 · 전문가 검토 전", pub["review_label"])

# ── 상황 정리 ─────────────────────────────────────────────────────────
e = normalize_extraction({"domain": "cooking", "blocker_type": "x", "conditions": {"subject": "국어", "foo": "bar"}}, "")
check("등록되지 않은 분야 → none", e["domain"] == "none")
check("등록되지 않은 조건 키는 버림", "foo" not in e["conditions"])
e = normalize_extraction({"domain": "study", "blocker_type": "no_time"}, "")
check("분야에 없는 유형 → unknown", e["blocker_type"] == "unknown")
e = normalize_extraction({"domain": "study", "blocker_type": "focus", "conditions": {"subject": "없음"}}, "")
check("'없음' 같은 빈 조건은 버림", e["conditions"] == {})

# ── 사례 1: 국어 집중 → 화면에서 바로 푸는 문제 ─────────────────────
sel = select_context(ex("study", "focus", {"subject": "국어"}), level=2)
check("국어·집중·Lv2 → 계획 미션", sel.mode == "planned", sel.mode)
check("국어 Lv2 자료 = 짧은 글 문제", sel.materials and sel.materials[0].id == "study.ko.read.01",
      [m.id for m in sel.materials])
check("객관식 자료 → 답 고르기", sel.response_type == "choice")
check("확인 질문 없음", sel.clarify is None)
sel3 = select_context(ex("study", "focus", {"subject": "국어"}), level=3)
check("Lv3이면 Lv3 지문이 먼저", sel3.materials[0].id == "study.ko.read.02", [m.id for m in sel3.materials])
sel5 = select_context(ex("study", "focus", {"subject": "국어"}), level=5)
check("Lv5이면 Lv4~5 지문만 (±1 단계)", [m.id for m in sel5.materials] == ["study.ko.read.03"], [m.id for m in sel5.materials])

# 자료가 없을 때
sel = select_context(ex("study", "focus", {"subject": "과학"}), level=2)
check("자료 없는 과목 → 대체 활동", sel.mode == "fallback" and not sel.materials)
check("자료 없으면 글로 남기기", sel.response_type == "text")
sel = select_context(ex("study", "focus"), level=2)
check("과목 모름 → 과목 한 가지만 확인", sel.clarify and sel.clarify["key"] == "subject", sel.clarify)
sel = select_context(ex("study", "focus", {"subject": "국어"}), level=2, allow_materials=False)
check("자료를 쓰지 않는 호출 → 대체 활동", sel.mode == "fallback")

# ── 사례 2: 운동 미룸 → 시간 확인 ────────────────────────────────────
sel = select_context(ex("exercise", "no_time", {"place": "집"}), level=2)
check("운동 미룸·시간 모름 → 시간 확인", sel.clarify and sel.clarify["key"] == "available_time", sel.clarify)
check("시간 모름 → 확인된 정보만으로 하는 대체 활동", sel.mode == "fallback")
check("확인 보기 = 5분/10분/20분 이상", [o["label"] for o in sel.clarify["options"]] == ["5분", "10분", "20분 이상"])
sel = select_context(ex("exercise", "no_time", {"place": "집", "available_time": "10분"}), level=2)
check("시간 확인 후 → 계획 미션, 부담 확인", sel.mode == "planned" and sel.response_type == "scale_text")
sel_how = select_context(ex("exercise", "unknown_how", {"place": "집"}), level=2)
check("같은 운동이라도 '동작 모름'은 다른 활동(몸풀기 카드)",
      sel_how.materials and sel_how.materials[0].id == "exercise.card.warmup.01")
sel = select_context(ex("exercise", "unknown"), level=2)
check("막힌 지점 모름 → 유형부터 확인", sel.clarify and sel.clarify["key"] == "blocker_type")
check("유형 확인 질문 보기 3개", len(sel.clarify["options"]) == 3)
sel = select_context({**ex("exercise", "no_time", {"place": "집"}), "clarified": True}, level=2)
check("이미 한 번 확인했으면 다시 묻지 않음", sel.clarify is None and sel.mode == "fallback")

# ── 사례 3: 별명 → 부탁 한 문장 ──────────────────────────────────────
diary3 = "친구가 사람들 앞에서 내 별명을 불러서 불편하다."
sel = select_context(ex("relationship", "hard_to_say", {"who": "친구", "behavior": "사람들 앞에서 별명을 부름"}, diary=diary3), level=2)
check("별명 → 안전 안내가 아닌 부탁 문장 연습", sel.mode == "planned" and sel.blocker_key == "hard_to_say")
check("부탁 문장 틀 카드 후보", [m.id for m in sel.materials] == ["relationship.card.request.01"])
check("글로 남기기", sel.response_type == "text")

# ── 안전 ─────────────────────────────────────────────────────────────
e = ex("exercise", "too_hard", diary="줄넘기를 하다가 발목이 아파서 멈췄다")
check("운동 중 통증 표현 → pain (AI가 놓쳐도)", e["safety"] == "pain")
sel = select_context(e, level=3)
check("통증 → 검토된 도움 요청 안내", sel.mode == "help" and sel.guide.id == "help.pain")
check("숨이 찬 정도는 안전 신호 아님", ex("exercise", "too_hard", diary="줄넘기 60개에서 숨이 차서 멈췄다")["safety"] == "none")
check("'답이 맞았다'는 위협 아님", ex("relationship", "hard_to_say", diary="친구 말이 맞았다. 내가 먼저 사과할걸")["safety"] == "none")
check("'친구한테 맞았다' → threat", ex("relationship", "hard_to_say", diary="오늘 친구한테 맞았다")["safety"] == "threat")
check("자해 표현은 분야와 상관없이 crisis", ex("study", "focus", diary="공부가 안 돼서 죽고 싶다")["safety"] == "crisis")
check("AI가 threat로 판정 → 안내", select_context(ex("relationship", "hard_to_say", safety="threat"), 2).guide.id == "help.threat")

# ── 저장 전 확인 ─────────────────────────────────────────────────────
sel = select_context(ex("study", "focus", {"subject": "국어"}), level=2)
out = validate_draft({"content": "화면의 지문을 읽고 문제 하나를 풀어 보세요", "completion": "문제를 풀었다",
                      "material_id": "study.ko.read.99"}, sel, 2)
check("등록되지 않은 자료 ID → 앱이 고른 자료로 교체", out["material_id"] == "study.ko.read.01", out["checks"])
check("교체 기록 남김", any(c.startswith("unregistered_material") for c in out["checks"]) and "material_from_app" in out["checks"])
out = validate_draft({"content": "화면의 지문을 읽고 풀어 보세요", "completion": "", "material_id": "study.ko.read.03"}, sel, 2)
check("후보 밖(난이도 안 맞는) 자료 ID도 교체", out["material_id"] == "study.ko.read.01")
check("빈 완료 기준 → 등록된 완료 기준", out["completion"] == kb.domains["study"].blockers["focus"].completion)

sel = select_context(ex("study", "focus", {"subject": "과학"}), level=2)
out = validate_draft({"content": "화면의 지문을 읽고 문제를 풀어 보세요", "completion": "풀었다",
                      "material_id": "study.ko.read.01"}, sel, 2)
check("자료 없는데 화면 자료를 가리키면 → 등록된 대체 활동", out["material_id"] is None
      and out["content"] == kb.domains["study"].blockers["focus"].fallback.content, out)
out = validate_draft(None, sel, 2)
check("AI 응답 없음 → 등록된 대체 활동", out["content"] and out["completion"])
sel = select_context(ex("relationship", "hard_to_say", {"who": "친구", "behavior": "별명"}), level=2)
out = validate_draft({"content": "친구에게 할 부탁 한 문장을 메모에 써 보세요", "completion": "x" * 80,
                      "material_id": None}, sel, 2)
check("너무 긴 완료 기준 → 등록된 기준", out["completion"] == kb.domains["relationship"].blockers["hard_to_say"].completion)
check("필수 아닌 자료는 비워 둬도 됨", out["material_id"] is None and out["content"].startswith("친구에게"))

# ── 채점 ─────────────────────────────────────────────────────────────
check("객관식 정답 채점", grade_choice("study.ko.read.01", 1) is True)
check("객관식 오답 채점", grade_choice("study.ko.read.01", 0) is False)
check("객관식 아닌 자료는 채점 안 함", grade_choice("exercise.card.warmup.01", 0) is None)


# ── draft_mission 분기 (가짜 AI) ─────────────────────────────────────
class FakeLLM:
    """시스템 프롬프트로 어느 단계의 호출인지 구분해 미리 정한 답을 돌려준다."""

    def __init__(self, extraction=None, planned=None, fail_extract=False):
        self.extraction, self.planned, self.fail_extract = extraction, planned, fail_extract
        self.calls = []

    async def __call__(self, messages):
        system = messages[0]["content"]
        if system.startswith("학생 일기에서 미션을 고르는"):
            self.calls.append("extract")
            if self.fail_extract:
                raise RuntimeError("boom")
            return self.extraction
        if system == planner.PLANNED_MISSION_SYSTEM:
            self.calls.append("planned")
            return self.planned
        if system == mission_service.EVERYDAY_MISSION_SYSTEM:
            self.calls.append("everyday")
            return {"content": "같이 간 친구에게 제일 맛있던 메뉴를 말해 보세요", "reason": "좋아요.", "helper": ""}
        if system == mission_service.MISSION_SYSTEM:
            self.calls.append("general")
            return {"problem": "p", "content": "책상 위만 10분 동안 치워 보세요", "reason": "쉬워져요.", "helper": ""}
        if system == planner.FEEDBACK_SYSTEM:
            self.calls.append("feedback")
            return {"feedback": "2번을 고른 근거로 '요일마다 물 줄 사람을 정했다'를 찾았어요."}
        if system.startswith("당신은 학생의 자기효능감을"):
            self.calls.append("reflect")
            return {"has_task": True, "achievements": ["국어 공부를 시작했어요"], "message": "시작했어요."}
        self.calls.append("helper")
        return {"reply": "지문 첫 문장부터 다시 볼까요?", "expert": "국어 선생님"}


def install(fake):
    for module in (planner, mission_service, reflection_service, helper_service):
        module.chat_json = fake


async def run_draft_cases():
    korean = {"domain": "study", "intended_task": "국어 공부", "blocker": "집중이 덜 됨", "blocker_type": "focus",
              "conditions": {"subject": "국어"}, "safety": "none"}
    fake = FakeLLM(korean, {"content": "화면의 지문을 읽고 문제 하나를 풀어 보세요", "completion": "문제 1개를 풀고 근거를 적었다",
                            "material_id": "study.ko.read.01", "reason": "한 문제를 끝내면 다음이 쉬워져요.", "helper": ""})
    install(fake)
    d = await mission_service.draft_mission("M", 2, "국어 공부를 하는데 집중이 덜 됐다.", [])
    check("국어: 상황 뽑기 → 계획 미션 (AI 2회)", fake.calls == ["extract", "planned"], fake.calls)
    check("국어: 자료·완료 기준·답 형식 저장", d.material_id == "study.ko.read.01" and d.completion and d.plan["response_type"] == "choice")

    fake = FakeLLM(korean, {"content": "화면의 지문을 읽고 풀어 보세요", "completion": "풀었다", "material_id": "made-up-123"})
    install(fake)
    d = await mission_service.draft_mission("M", 2, "국어 공부를 하는데 집중이 덜 됐다.", [])
    check("등록되지 않은 자료 ID 반환 → 등록 자료로 교체", d.material_id == "study.ko.read.01", d.plan["checks"])

    science = {**korean, "conditions": {"subject": "과학"}}
    fake = FakeLLM(science, {"content": "화면의 지문을 읽고 풀어 보세요", "completion": "풀었다", "material_id": "study.ko.read.01"})
    install(fake)
    d = await mission_service.draft_mission("M", 2, "과학 공부하는데 집중이 안 됐다.", [])
    check("자료 없음 → 자료 없이 할 수 있는 활동", d.material_id is None and "화면" not in d.content, d.content)
    check("자료 없음 → 대체 활동 분기 기록", d.plan["branch"] == "fallback")

    fake = FakeLLM()
    install(fake)
    d = await mission_service.draft_mission("M", 2, "친구랑 마라탕 먹었다.", [], everyday=True)
    check("일상 일기 → 기존 일상 분기 그대로 (AI 1회, 상황 뽑기 없음)", fake.calls == ["everyday"] and d.plan["branch"] == "everyday", fake.calls)
    check("일상 일기 → 자료·완료 기준 없음", d.material_id is None and d.completion == "")

    fake = FakeLLM({"domain": "none", "blocker_type": "unknown", "conditions": {}, "safety": "none"})
    install(fake)
    d = await mission_service.draft_mission("M", 2, "방 청소하려다 못 했다.", [])
    check("분야 밖 일기 → 기존 미션 지시문", fake.calls == ["extract", "general"] and d.content, fake.calls)

    fake = FakeLLM(fail_extract=True)
    install(fake)
    d = await mission_service.draft_mission("M", 2, "국어 공부를 하는데 집중이 덜 됐다.", [])
    check("상황 뽑기 실패 → 기존 미션 지시문", fake.calls == ["extract", "general"] and d.plan["branch"] == "general")

    fake = FakeLLM({"domain": "exercise", "blocker_type": "too_hard", "conditions": {}, "safety": "none"})
    install(fake)
    d = await mission_service.draft_mission("M", 3, "줄넘기를 하다가 무릎이 아파서 멈췄다", [])
    check("통증 → AI 생성 없이 검토된 안내 문장", fake.calls == ["extract"] and d.plan["kind"] == "help", fake.calls)
    check("통증 안내 미션 문장", d.content == kb.guide_index["help.pain"].mission.content)

    fake = FakeLLM()
    install(fake)
    content, reason, helper = await mission_service.generate_mission_draft("A", 3, "영어 발표 준비", [])
    check("generate_mission_draft는 기존처럼 (내용, 이유, 조력자) 튜플", fake.calls == ["general"] and content)


asyncio.run(run_draft_cases())


# ── API·DB 흐름 (--api) ──────────────────────────────────────────────
async def run_api():
    import httpx
    from sqlalchemy import text, select, delete
    from app.main import app
    from app.db.session import engine, AsyncSessionLocal
    from app.db.models import Base, User, EloHistory

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for col, typ in (("domain", "VARCHAR(20)"), ("completion", "TEXT"), ("material_id", "VARCHAR(60)"),
                         ("plan", "TEXT"), ("answer", "TEXT")):
            await conn.execute(text(f"ALTER TABLE missions ADD COLUMN IF NOT EXISTS {col} {typ}"))

    korean = {"domain": "study", "intended_task": "국어 공부", "blocker": "집중이 덜 됨", "blocker_type": "focus",
              "conditions": {"subject": "국어"}, "safety": "none"}
    fake = FakeLLM(korean, {"content": "화면의 지문을 읽고 문제 하나를 풀어 보세요", "completion": "문제 1개를 풀고 근거를 적었다",
                            "material_id": "study.ko.read.01", "reason": "한 문제를 끝내면 다음이 쉬워져요.", "helper": ""})
    install(fake)
    from app.core.timeutil import today_kst
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        token = (await c.post("/api/auth/trial")).json()["access_token"]
        h = {"Authorization": f"Bearer {token}"}
        diary = (await c.post("/api/diaries", json={"content": "국어 공부를 하는데 집중이 덜 됐다.", "diary_date": str(today_kst())}, headers=h)).json()
        r = await c.post(f"/api/diaries/{diary['id']}/reflect", headers=h)
        check("일기 저장 직후 반응 200", r.status_code == 200, r.text[:200])
        m = r.json()["mission"]
        check("미션 응답에 자료(지문·문제·보기)", m["material"] and m["material"]["choices"] and "answer" not in m["material"])
        check("미션 응답에 완료 기준·답 형식", m["completion"] and m["response_type"] == "choice")
        check("기존 필드 유지 (level·difficulty·help_remaining)", m["level"] and m["difficulty"] and m["help_remaining"] == 3)

        r = await c.post(f"/api/missions/{m['id']}/answer", json={"choice": 9}, headers=h)
        check("없는 보기 번호 → 422", r.status_code == 422)
        r = await c.post(f"/api/missions/{m['id']}/answer", json={"choice": 1, "text": "셋째 문장에 요일마다 정했다고 나와서"}, headers=h)
        m2 = r.json()
        check("답 제출 200 + 등록 정답으로 채점(정답)", r.status_code == 200 and m2["attempts"][0]["correct"] is True, r.text[:200])
        check("답 남긴 뒤 정답·해설 공개", m2["material"]["answer"] == 1)
        check("피드백이 조력자 대화에 남음, 상담 횟수는 그대로",
              m2["help_messages"][-1]["content"].startswith("2번을") and m2["help_remaining"] == 3)
        check("객관식은 한 번만 제출", m2["attempts_remaining"] == 0)
        r = await c.post(f"/api/missions/{m['id']}/answer", json={"choice": 0}, headers=h)
        check("객관식 두 번째 제출 → 409", r.status_code == 409)
        r = await c.post(f"/api/missions/{m['id']}/help", json={"message": "근거 찾는 게 어려워요"}, headers=h)
        check("이어서 조력자 상담 가능", r.status_code == 200 and r.json()["help_remaining"] == 2, r.text[:200])

        r = await c.post(f"/api/missions/{m['id']}/retarget", json={"harder": True}, headers=h)
        m3 = r.json()
        check("체험 재조정 → 상황 다시 안 뽑고 한 단계 위", r.status_code == 200 and m3["level"] == m["level"] + 1, r.text[:200])
        check("재조정 뒤 이전 답은 비움", m3["attempts"] == [])

        async with AsyncSessionLocal() as db:
            user = (await db.execute(select(User).where(User.username.like("guest_%")).order_by(User.id.desc()))).scalars().first()
            elo_before = user.elo
        r = await c.post(f"/api/missions/{m['id']}/complete", json={}, headers=h)
        res = r.json()
        check("완료 → ELO 기존대로 반영", r.status_code == 200 and res["elo_before"] == elo_before and res["elo_after"] > elo_before, r.text[:200])

        # 운동: 시간 확인 → 맞춤 미션
        fake.extraction = {"domain": "exercise", "intended_task": "운동", "blocker": "집에 오면 미룸", "blocker_type": "no_time",
                           "conditions": {"place": "집"}, "safety": "none"}
        fake.planned = {"content": "집에 와서 가방을 내려놓자마자 제자리 걷기를 2분만 해 보세요", "completion": "2분 동안 했다",
                        "material_id": None, "reason": "짧게 시작하면 덜 미뤄져요.", "helper": ""}
        async with AsyncSessionLocal() as db:
            from app.db.models import Mission
            await db.execute(delete(Mission).where(Mission.user_id == user.id))
            await db.commit()
        diary = (await c.post("/api/diaries", json={"content": "집에 오면 운동을 자꾸 미룬다.", "diary_date": str(today_kst())}, headers=h))
        r = await c.post(f"/api/diaries/{diary.json()['id']}/reflect", headers=h)
        m = r.json()["mission"]
        check("운동 미룸 → 시간 한 가지 확인 질문", m and m["clarify"] and m["clarify"]["key"] == "available_time", r.text[:300])
        fake.planned = {"content": "집에 오면 10분 동안 해 본 적 있는 줄넘기를 해 보세요", "completion": "10분 동안 줄넘기를 했다",
                        "material_id": None, "reason": "정해 둔 시간만 하면 돼요.", "helper": ""}
        n_extract = fake.calls.count("extract")
        r = await c.post(f"/api/missions/{m['id']}/clarify", json={"answer": "10분"}, headers=h)
        mc = r.json()
        check("확인 답 → 맞춤 미션, 질문 사라짐", r.status_code == 200 and mc["clarify"] is None and "10분" in mc["content"], r.text[:300])
        check("확인 답 → 상황 다시 안 뽑음", fake.calls.count("extract") == n_extract)
        check("확인 답 뒤 부담 확인 형식", mc["response_type"] == "scale_text")
        r = await c.post(f"/api/missions/{m['id']}/clarify", json={"answer": "5분"}, headers=h)
        check("확인은 한 번만", r.status_code == 409)
        r = await c.post(f"/api/missions/{m['id']}/answer", json={"text": "했어요"}, headers=h)
        check("부담 숫자 없이 제출 → 422", r.status_code == 422)
        r = await c.post(f"/api/missions/{m['id']}/answer", json={"scale": 2, "text": "생각보다 할 만했어요"}, headers=h)
        check("부담 2 제출 → 피드백", r.status_code == 200 and r.json()["attempts"][0]["scale"] == 2)

        # 안전: 통증 → 안내 미션, ELO 그대로
        async with AsyncSessionLocal() as db:
            await db.execute(delete(Mission).where(Mission.user_id == user.id))
            await db.commit()
        fake.extraction = {"domain": "exercise", "blocker_type": "too_hard", "conditions": {}, "safety": "none"}
        d = await c.post("/api/diaries", json={"content": "줄넘기하다가 발목이 아파서 멈췄다.", "diary_date": str(today_kst())}, headers=h)
        r = await c.post(f"/api/diaries/{d.json()['id']}/reflect", headers=h)
        m = r.json()["mission"]
        check("통증 → 도움 요청 안내 미션", m and m["kind"] == "help" and m["help_guide"]["id"] == "help.pain", r.text[:300])
        check("안내에 검토 상태 표시", m["help_guide"]["review_label"].startswith("공개 출처와 대조함"))
        r = await c.post(f"/api/missions/{m['id']}/skip", json={}, headers=h)
        check("안내 미션은 ELO에 넣지 않음", r.json()["elo_before"] == r.json()["elo_after"])

    async with AsyncSessionLocal() as db:
        await db.execute(delete(EloHistory).where(EloHistory.user_id == user.id))
        await db.execute(delete(User).where(User.id == user.id))
        await db.commit()
    await engine.dispose()


if "--api" in sys.argv:
    asyncio.run(run_api())

print("\n전체 결과:", "PASS" if ok else "FAIL")
sys.exit(0 if ok else 1)
