"""시연·캡처용 데모 데이터 생성 스크립트 (가상 인물, 실제 개인정보 없음).

사용법 (backend 폴더에서):
    python -m scripts.seed_demo --username demo --password demo1234 --reset

- 해당 계정이 없으면 만들고, 있으면 --reset 을 줘야만 기존 일기·분석·미션·ELO 기록을 지우고 다시 채운다.
- 오늘 기준 과거 14일치 일기, AI 분석(근거·확신도 포함), 미션, ELO 이력을 만든다.
- AI 호출 없이 미리 작성한 값을 넣으므로 Groq 키가 없어도 된다.
- .env 의 DATABASE_URL 이 가리키는 DB에 쓴다. 운영 DB를 가리키는지 꼭 확인할 것.
"""
import argparse
import asyncio
from datetime import datetime, time, timedelta

from sqlalchemy import delete, select

from app.core.security import hash_password
from app.core.timeutil import KST, today_kst
from app.db.models import (
    Base, DailyAnalysis, Diary, EloHistory, FailureLog, Mission, User,
)
from app.db.session import AsyncSessionLocal, engine
from app.services.analysis_service import INITIAL_REASONING
from app.services.elo_service import LEVEL_RATINGS, apply_result, target_level

# (일기, M, V, P, A, 확신도, 근거 M/V/P/A, 종합, 실패 요약)
DAYS = [
    ("수학 숙제를 하려고 앉았는데 첫 문제부터 막혀서 그냥 덮었다. 나는 원래 수학을 못하는 것 같다. 하루 종일 기운이 없었다.",
     0.25, 0.40, 0.35, 0.30, 0.70,
     "숙제를 시작했지만 첫 문제에서 포기함. 성취 경험보다 회피가 두드러짐",
     "타인과의 비교나 관찰 내용이 없음",
     "주변의 격려에 대한 언급 없음",
     "'기운이 없었다'는 표현에서 낮은 에너지 상태가 드러남",
     "과제를 시작했다는 점은 긍정적이나, 한 번의 막힘을 능력 부족으로 일반화하는 경향이 보임",
     "수학 숙제 첫 문제에서 막혀 포기함"),
    ("오늘은 짧게. 학원 갔다 와서 피곤했다.",
     0.45, 0.50, 0.50, 0.40, 0.25,
     "구체적인 활동 서술이 부족함", "근거 없음(중립값)", "근거 없음(중립값)",
     "피곤함을 언급함",
     "일기가 매우 짧아 판단 근거가 부족함. 확신도가 낮아 성장 그래프에는 반영하지 않음", ""),
    ("어제 못 푼 문제를 다시 봤다. 교과서 예제를 따라 하니까 절반은 풀렸다. 다 푼 건 아니지만 생각보다 할 만했다.",
     0.55, 0.45, 0.40, 0.50, 0.75,
     "전날 포기한 문제에 다시 도전해 절반을 해결함. 작은 성취 경험",
     "예제를 따라 한 것은 모델링에 가깝지만 타인 관찰은 아님",
     "격려 언급 없음",
     "'생각보다 할 만했다'에서 부담감이 줄어든 상태",
     "실패 후 재도전이라는 대처 행동이 나타남. 성취 원천이 전날보다 뚜렷하게 상승", ""),
    ("미션으로 받은 '문제 3개만 풀기'를 했다. 3개는 진짜 금방 끝났다. 친구 민지가 나도 그 부분 어려웠다고 해서 좀 안심됐다.",
     0.62, 0.60, 0.45, 0.55, 0.80,
     "제시된 미션을 완수함. 목표를 작게 잡은 것이 성공으로 이어짐",
     "친구도 같은 부분을 어려워했다는 것을 알게 됨 (비슷한 타인을 통한 대리 경험)",
     "직접적인 격려는 아님",
     "'안심됐다'는 표현에서 불안 감소",
     "작은 목표 달성과 또래 비교로 '나만 못하는 게 아니다'라는 인식이 생김", ""),
    ("체육 시간에 줄넘기 2단 뛰기 연습했는데 계속 걸렸다. 다들 쳐다보는 것 같아서 창피했다. 그래도 끝까지 하긴 했다.",
     0.45, 0.35, 0.40, 0.30, 0.75,
     "성공하진 못했지만 끝까지 연습을 이어감",
     "다른 학생들과 비교하며 위축됨",
     "격려 언급 없음",
     "창피함과 긴장이 드러남",
     "결과는 실패였지만 중도 포기하지 않은 점은 대처 의지로 볼 수 있음. 정서 점수 하락",
     "줄넘기 2단 뛰기에 계속 실패해 창피함을 느낌"),
    ("오늘은 쉬는 날. 방 정리를 하고 밀린 영어 단어를 20개 외웠다. 단어 테스트 앱에서 18개 맞았다!",
     0.68, 0.45, 0.45, 0.65, 0.80,
     "스스로 계획한 단어 암기를 완료하고 18/20의 결과를 확인함",
     "타인 관찰 없음",
     "격려 언급 없음",
     "느낌표 사용 등 긍정적인 정서",
     "스스로 세운 목표를 달성하고 결과를 숫자로 확인한 뚜렷한 성취 경험", ""),
    ("수학 선생님이 내가 낸 풀이를 보고 '과정을 잘 썼다'고 하셨다. 답은 틀렸는데도 칭찬받으니까 신기했다.",
     0.62, 0.45, 0.80, 0.65, 0.85,
     "답은 틀렸지만 풀이 과정을 완성함",
     "타인 관찰 없음",
     "교사에게서 과정에 대한 구체적 칭찬을 받음",
     "놀람과 기쁨이 드러남",
     "결과가 아닌 과정에 대한 구체적 피드백이 사회적 설득 원천을 크게 높임", ""),
    ("미션이 '모르는 문제 하나 선생님께 질문하기'였는데 못 했다. 쉬는 시간마다 갈까 말까 하다가 끝났다.",
     0.42, 0.45, 0.55, 0.45, 0.75,
     "계획한 행동(질문하기)을 실행하지 못함",
     "타인 관찰 없음",
     "전날의 칭찬 경험이 남아 있으나 오늘 새로운 지지는 없음",
     "망설임과 아쉬움",
     "도전적인 미션에서 실패. 다음 미션은 난이도를 낮추는 것이 적절함",
     "선생님께 질문하기 미션을 망설이다 실행하지 못함"),
    ("어제 못 한 질문을 오늘은 메모에 적어서 갔다. 막상 물어보니 선생님이 엄청 자세히 알려주셨다. 별거 아니었다.",
     0.75, 0.50, 0.70, 0.70, 0.85,
     "전날 실패한 행동을 방법을 바꿔(메모) 성공함",
     "타인 관찰 없음",
     "교사의 친절한 설명이 지지로 작용함",
     "'별거 아니었다'에서 불안 해소",
     "실패 → 전략 수정 → 성공의 흐름이 명확한 대처 경험. 성취 원천 최고치", ""),
    ("민지랑 같이 도서관에서 공부했다. 민지는 오답 노트를 쓰는데 나도 따라 해 보기로 했다. 두 문제 정리했다.",
     0.70, 0.75, 0.55, 0.65, 0.80,
     "오답 노트 두 문제 정리",
     "친구의 공부법을 관찰하고 따라 함 (모델링)",
     "함께 공부하는 관계",
     "안정적인 상태",
     "또래 모델을 통한 대리 경험이 새로운 학습 행동으로 이어짐", ""),
    ("시험 범위가 너무 많아서 머리가 아팠다. 오늘은 아무것도 못 했다.",
     0.40, 0.45, 0.45, 0.30, 0.60,
     "공부를 시작하지 못함",
     "근거 없음(중립값)",
     "근거 없음(중립값)",
     "두통과 압박감",
     "과제량에 대한 부담으로 회피가 나타남. 다만 하루의 정체는 추세에 큰 영향을 주지 않음",
     "시험 범위 부담으로 공부를 시작하지 못함"),
    ("범위를 날짜별로 쪼개서 계획표를 만들었다. 오늘 분량 다 했다. 쪼개니까 할 수 있을 것 같다.",
     0.78, 0.50, 0.50, 0.65, 0.85,
     "큰 과제를 작게 나누고 당일 분량을 완료함",
     "타인 관찰 없음",
     "격려 언급 없음",
     "'할 수 있을 것 같다'는 자기효능감 표현",
     "전날의 회피를 스스로 계획 수립으로 극복함. 목표 쪼개기를 스스로 적용하기 시작함", ""),
    ("엄마가 계획표 보시고 대단하다고 하셨다. 오늘도 계획대로 했다. 줄넘기 2단 뛰기도 처음으로 3개 성공!",
     0.82, 0.50, 0.75, 0.75, 0.90,
     "학습 계획 이행 + 이전에 실패했던 2단 뛰기 3회 성공",
     "타인 관찰 없음",
     "보호자의 구체적 칭찬",
     "성공에 대한 기쁨",
     "서로 다른 영역에서 연속적인 성취가 나타남. 이전 실패 과제를 극복한 점이 의미 있음", ""),
    ("오늘 수학 쪽지시험에서 70점 받았다. 지난번보다 25점 올랐다. 틀린 건 오답 노트에 써야지.",
     0.85, 0.55, 0.60, 0.75, 0.90,
     "쪽지시험 점수 25점 상승이라는 객관적 성취",
     "오답 노트(친구에게 배운 방법) 지속",
     "격려 언급 없음",
     "만족감과 다음 행동 계획",
     "노력과 결과의 연결을 스스로 확인함. 결과를 다음 학습으로 이어 가려는 태도", ""),
]

# (목표 원천, 미션 내용, 완료 여부) — 난이도는 그날 ELO 기준 목표 레벨로 정한다
MISSIONS = [
    ("M", "수학 문제 3개만 골라 풀어 보기", True),
    ("A", "자기 전에 오늘 잘한 일 한 줄 적기", True),
    ("V", "친구에게 어려웠던 단원이 어디인지 물어보기", True),
    ("M", "영어 단어 20개 외우고 스스로 테스트하기", True),
    ("A", "10분 산책하며 기분 점검하기", True),
    ("P", "모르는 문제 하나를 선생님께 질문하기", False),
    ("M", "질문할 내용을 메모에 적어 선생님께 가져가기", True),
    ("V", "친구의 공부법 하나를 따라 해 보기", True),
    ("M", "오답 노트에 틀린 문제 3개 정리하기", False),
    ("M", "시험 범위를 날짜별로 나눠 계획표 만들기", True),
    ("P", "가족에게 이번 주 계획 보여 주기", True),
    ("M", "쪽지시험 틀린 문제 다시 풀어 보기", True),
]


def at(day, hour, minute=0):
    return datetime.combine(day, time(hour, minute), tzinfo=KST)


async def main(username: str, password: str, reset: bool):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
        if user and not reset:
            raise SystemExit(f"'{username}' 계정이 이미 있습니다. 기존 기록을 지우고 다시 채우려면 --reset 을 붙이세요.")
        if not user:
            user = User(username=username, password_hash=hash_password(password), initial_grade="-")
            db.add(user)
            await db.flush()
        else:
            user.password_hash = hash_password(password)
            for model in (EloHistory, Mission, FailureLog, DailyAnalysis, Diary):
                await db.execute(delete(model).where(model.user_id == user.id))

        today = today_kst()
        start = today - timedelta(days=len(DAYS))
        user.elo = 1000
        user.points = 0
        user.diary_count = len(DAYS)
        user.created_at = at(start - timedelta(days=1), 20)

        # 가입 설문 (첫 일기 전날)
        db.add(DailyAnalysis(
            user_id=user.id, diary_date=start - timedelta(days=1),
            score_m=0.30, score_v=0.40, score_p=0.40, score_a=0.40,
            composite_score=0.36, confidence=1.0, reasoning=INITIAL_REASONING, is_reflected=True,
            created_at=at(start - timedelta(days=1), 20),
        ))

        for i, row in enumerate(DAYS):
            text, m, v, p, a, conf, em, ev, ep, ea, reason, fail = row
            day = start + timedelta(days=i)
            reflected = conf >= 0.3
            db.add(Diary(user_id=user.id, diary_date=day, content=text, is_locked=True,
                         created_at=at(day, 22), updated_at=at(day, 22)))
            db.add(DailyAnalysis(
                user_id=user.id, diary_date=day,
                score_m=m, score_v=v, score_p=p, score_a=a,
                composite_score=round(m * 0.4 + v * 0.2 + p * 0.2 + a * 0.2, 2) if reflected else None,
                confidence=conf, evidence_m=em, evidence_v=ev, evidence_p=ep, evidence_a=ea,
                reasoning=reason, is_reflected=reflected, created_at=at(day + timedelta(days=1), 0, 5),
            ))
            if fail:
                db.add(FailureLog(user_id=user.id, diary_date=day, failure_summary=fail,
                                  created_at=at(day + timedelta(days=1), 0, 5)))
                user.points += 25

        # 미션: 이틀째부터 하루 하나, 그날 ELO 기준 난이도로 만들고 결과 반영
        for i, (var, content, won) in enumerate(MISSIONS):
            day = start + timedelta(days=i + 1)
            level = target_level(user.elo)
            mission = Mission(
                user_id=user.id, content=content, target_var=var,
                status="done" if won else "skipped", difficulty=LEVEL_RATINGS[level],
                created_at=at(day, 7), completed_at=at(day, 18) if won else None,
            )
            db.add(mission)
            await db.flush()
            apply_result(user, mission, won, db)
            await db.flush()
            # apply_result 가 방금 추가한 이력의 시각을 미션 날짜로 맞춘다
            hist = (await db.execute(
                select(EloHistory).where(EloHistory.mission_id == mission.id)
            )).scalar_one()
            hist.created_at = at(day, 18)
            if won:
                user.points += 100

        # 오늘 아침 새 미션 (진행 중)
        level = target_level(user.elo)
        db.add(Mission(user_id=user.id, content="오답 노트 문제 중 하나를 친구에게 설명해 보기",
                       target_var="V", status="active", difficulty=LEVEL_RATINGS[level],
                       created_at=at(today, 7)))

        await db.commit()
        print(f"완료: '{username}' 일기 {len(DAYS)}개, 미션 {len(MISSIONS) + 1}개, 최종 ELO {user.elo}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", default="demo")
    ap.add_argument("--password", default="demo1234")
    ap.add_argument("--reset", action="store_true", help="기존 계정 기록을 지우고 다시 채움")
    args = ap.parse_args()
    asyncio.run(main(args.username, args.password, args.reset))
