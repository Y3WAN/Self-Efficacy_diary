"""분야별 미션 실제 AI 점검 (작게: 약 12회 호출).

같은 고민을 한 줄 일기와 긴 일기로 넣어 상황 뽑기(분야·막힌 지점 유형·조건)가 같은 방향인지 보고,
한 줄 일기로 미션을 만들어 자료·완료 기준·확인 질문을 확인한다. 피드백은 국어·인간관계 2건만.

사용법 (backend 폴더에서):  python -m experiments.mission_planner_check
결과: experiments/results/mission_planner_check.json
"""
import asyncio
import json
import os
from pathlib import Path

os.environ.setdefault("JWT_SECRET", "unused")

from app.services import mission_planner as planner  # noqa: E402
from app.services.mission_service import draft_mission  # noqa: E402

CASES = [
    ("국어", "국어 공부를 하는데 집중이 덜 됐다.",
     "저녁 먹고 국어 문제집을 펴서 비문학 지문을 읽기 시작했다. 그런데 두 번째 문단쯤부터 자꾸 딴생각이 나고 "
     "같은 줄을 몇 번이나 다시 읽었다. 30분 앉아 있었는데 실제로 푼 건 한 문제뿐이라 좀 허무했다. 내일은 집중해서 풀고 싶다."),
    ("운동", "집에 오면 운동을 자꾸 미룬다.",
     "요즘 체력이 떨어진 것 같아서 운동을 하기로 했다. 그런데 학원 끝나고 집에 오면 피곤해서 '조금만 쉬고 해야지' 하다가 "
     "결국 폰만 보고 잠든다. 오늘도 운동복까지 꺼내 놓고 못 했다. 매번 미루는 내가 좀 답답하다."),
    ("인간관계", "친구가 사람들 앞에서 내 별명을 불러서 불편하다.",
     "점심시간에 같은 반 친구가 다른 애들 앞에서 내가 싫어하는 별명을 크게 불렀다. 다들 웃어서 나도 그냥 웃어 넘겼는데 "
     "집에 와서도 계속 신경이 쓰였다. 친구가 나쁜 뜻으로 그런 건 아닌 것 같은데, 그 별명은 안 불렀으면 좋겠다. 어떻게 말해야 할지 모르겠다."),
]
OUT = Path(__file__).parent / "results" / "mission_planner_check.json"


async def main():
    report = []
    for name, short, long in CASES:
        ex_short = await planner.extract_situation(short)
        ex_long = await planner.extract_situation(long)
        same = (ex_short["domain"], ex_short["blocker_type"]) == (ex_long["domain"], ex_long["blocker_type"])
        print(f"\n== {name}  한 줄: {ex_short['domain']}/{ex_short['blocker_type']} {ex_short['conditions']}"
              f"  | 긴 일기: {ex_long['domain']}/{ex_long['blocker_type']} {ex_long['conditions']}  → 같은 방향: {same}")
        draft = await draft_mission("M", 2, short, [], extraction=ex_short)
        print(f"  미션: {draft.content}\n  완료 기준: {draft.completion}\n  자료: {draft.material_id}"
              f"  분기: {draft.plan.get('branch')}  확인 질문: {(draft.plan.get('clarify') or {}).get('question')}"
              f"  고친 것: {draft.plan.get('checks')}")
        entry = {"case": name, "short": short, "long": long, "extraction_short": ex_short, "extraction_long": ex_long,
                 "same_direction": same, "draft": draft.__dict__}

        if name == "운동" and draft.plan.get("clarify"):
            answered = {**ex_short, "conditions": {**ex_short["conditions"], draft.plan["clarify"]["key"]: "10분"}, "clarified": True}
            after = await draft_mission("M", 2, short, [draft.content], extraction=answered)
            print(f"  '10분' 답한 뒤 미션: {after.content} / 완료 기준: {after.completion} / 답 형식: {after.plan.get('response_type')}")
            entry["after_clarify"] = after.__dict__
        if name == "국어" and draft.material_id:
            attempt = {"choice": 0, "correct": planner.grade_choice(draft.material_id, 0),
                       "text": "봉숭아를 해마다 심는다고 첫 문장에 나와서"}
            attempt["feedback"] = await planner.feedback_for(draft.plan, draft.content, draft.completion, attempt)
            print(f"  [오답 피드백] {attempt['feedback']}")
            entry["feedback"] = attempt
        if name == "인간관계":
            attempt = {"text": "너 진짜 왜 그래? 나 그 별명 싫어."}
            attempt["feedback"] = await planner.feedback_for(draft.plan, draft.content, draft.completion, attempt)
            print(f"  [문장 피드백] {attempt['feedback']}")
            entry["feedback"] = attempt
        report.append(entry)
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n저장: {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
