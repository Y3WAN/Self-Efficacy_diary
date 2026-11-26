"""시연용: 전문가 조력자가 필요한 '오늘의 미션'을 기존 계정에 넣는 스크립트.

공부(수학·영어·국어·과학·역사·코딩), 음악, 미술, 운동, 요리, 정리, 관계, 발표, 돈 관리, 잠, 사진까지 16개 분야.
미션마다 그 분야 사람이 아는 요령(자세, 풀이 순서, 말 거는 법 등)이 있어야 잘 풀리도록 골랐고, 맞는 전문가를 함께 넣었다.
시연할 때 '어려워요' → AI 조력자 상담을 누르면 분야별 전문가(미션에 넣어 둔 전문가)가 답하는 장면을 바로 보여 줄 수 있다.

사용법 (backend 폴더에서):
    python -m scripts.seed_expert_missions --username demo
    python -m scripts.seed_expert_missions --username demo --clear-active   # 진행 중 미션을 지우고 넣기

- 계정이 먼저 있어야 한다. 없으면 scripts.seed_demo 로 만든다.
- AI 호출 없이 미리 작성한 값을 넣는다. 상담 횟수(help_count)는 0부터 시작한다.
- .env 의 DATABASE_URL 이 가리키는 DB에 쓴다. 운영 DB를 가리키는지 꼭 확인할 것.
"""
import argparse
import asyncio
import json
from datetime import datetime, timedelta

from sqlalchemy import delete, select

from app.core.timeutil import KST
from app.db.models import Mission, User
from app.db.session import AsyncSessionLocal
from app.services.elo_service import LEVEL_RATINGS, target_level

# (분야 domain, 목표 원천, 미션, 완료 기준, 좋아지는 점, 조력자 한 줄, 이 미션의 전문가)
# 전문가는 plan["expert"]에 저장되고, AI 조력자가 그 전문가로 답한다 (helper_service.mission_expert).
EXPERT_MISSIONS = [
    ("study", "M",
     "일차방정식 2x + 3 = 11을 풀고, 3을 오른쪽으로 옮길 때 왜 -3이 되는지 한 줄로 써 보기",
     "풀이와 '왜 -3이 되는지' 한 줄을 공책에 적었다",
     "답만 외우지 않고 이유를 알면 비슷한 문제도 혼자 풀 수 있어요.",
     '수학 선생님께 "이항하면 부호가 왜 바뀌어요?"라고 물어보세요.',
     "수학 선생님"),
    ("study", "M",
     "영어 지문 한 문단을 소리 내어 읽고, 모르는 단어 2개의 뜻을 앞뒤 문장으로 짐작해 적기",
     "단어 2개와 짐작한 뜻을 적고, 사전으로 맞는지 확인했다",
     "사전 없이 뜻을 짐작해 보는 연습이 쌓이면 긴 지문도 덜 막혀요.",
     '영어 선생님께 "모르는 단어는 어떻게 짐작해요?"라고 물어보세요.',
     "영어 선생님"),
    ("study", "M",
     "오늘 있었던 일 하나를 '언제·어디서·무엇을·느낌' 순서로 세 문장 써 보기",
     "네 가지가 다 들어간 세 문장을 적었다",
     "순서를 정해 두고 쓰면 빈 종이 앞에서 덜 막혀요.",
     '국어 선생님께 "첫 문장은 어떻게 시작해요?"라고 물어보세요.',
     "국어 선생님"),
    ("study", "M",
     "컵에 물을 반쯤 담고 소금 한 숟가락을 넣었을 때 달걀이 뜨는지 예상을 먼저 적고 확인하기",
     "예상과 실제 결과를 한 줄씩 적었다",
     "예상하고 확인하는 순서를 해 보면 과학이 외우는 과목이 아니라는 걸 느껴요.",
     '과학 선생님께 "소금물에서 왜 뜨는 거예요?"라고 물어보세요.',
     "과학 선생님"),
    ("study", "M",
     "교과서에서 사건 하나를 골라 '왜 일어났나 → 무슨 일이 → 그 뒤 어떻게' 세 칸으로 정리하기",
     "세 칸을 한 줄씩 채웠다",
     "원인과 결과로 묶으면 연도를 외우지 않아도 흐름이 남아요.",
     '역사 선생님께 "사건 원인은 어디서 찾아요?"라고 물어보세요.',
     "역사 선생님"),
    ("study", "M",
     "엔트리나 스크래치에서 '스페이스키를 누르면 캐릭터가 10만큼 움직이기' 블록 하나 만들기",
     "키를 눌렀을 때 캐릭터가 움직였다",
     "내가 만든 명령대로 화면이 움직이는 걸 보면 코딩이 훨씬 가까워져요.",
     '친구에게 "키 누르면 움직이는 블록 어디 있어?"라고 물어보세요.',
     "프로그래머"),
    (None, "M",
     "좋아하는 노래 첫 소절을 박수로 박자 맞춰 치며 3번 따라 부르기",
     "박자에 맞춰 세 번 끝까지 불렀다",
     "박자를 몸으로 먼저 익히면 악기나 노래가 덜 어렵게 느껴져요.",
     '음악 선생님께 "박자 세는 쉬운 방법 있어요?"라고 물어보세요.',
     "음악 선생님"),
    (None, "M",
     "책상 위 컵 하나를 5분 동안 보이는 그대로 연필로 그려 보기 (잘 그리지 않아도 돼요)",
     "5분 동안 컵 그림 하나를 끝까지 그렸다",
     "잘 그리는 것보다 끝까지 보고 그려 본 경험이 실력의 시작이에요.",
     '미술 선생님께 "컵 모양은 어디부터 그려요?"라고 물어보세요.',
     "미술 선생님"),
    ("exercise", "M",
     "플랭크 자세로 20초 버티기를 3번 하기 (허리가 처지지 않게, 사이에 30초 쉬기)",
     "20초씩 3번을 마쳤다",
     "짧게라도 바른 자세로 버텨 보면 몸에 힘이 붙는 걸 직접 느낄 수 있어요.",
     '체육 선생님께 "플랭크 자세 한번 봐 주세요"라고 해 보세요.',
     "운동 트레이너"),
    (None, "M",
     "노른자를 터뜨리지 않고 계란 프라이 하나 만들어 보기",
     "노른자가 동그랗게 남은 계란 프라이를 만들었다",
     "끝까지 내 손으로 완성한 요리 하나가 '해 보면 된다'는 경험이 돼요.",
     '가족에게 "계란 깰 때 요령 있어요?"라고 물어보세요.',
     "요리사"),
    (None, "M",
     "책상 서랍 한 칸만 꺼내서 '쓰는 것·안 쓰는 것' 두 무더기로 나누기",
     "서랍 한 칸을 두 무더기로 나눠 다시 넣었다",
     "한 칸만 끝내도 정리가 생각보다 빨리 된다는 걸 알 수 있어요.",
     '가족에게 "이건 버려도 될까?"라고 물어보세요.',
     "정리 전문가"),
    ("relationship", "P",
     "요즘 어색해진 친구에게 먼저 건넬 말을 한 줄 써 보기 (보내지 않아도 괜찮아요)",
     "건넬 말 한 줄을 메모장에 적었다",
     "할 말을 미리 적어 두면 막상 만났을 때 첫마디가 훨씬 쉬워져요.",
     '상담 선생님께 "먼저 말 걸 때 뭐라고 하면 좋아요?"라고 물어보세요.',
     "상담 선생님"),
    (None, "A",
     "발표할 내용의 첫 세 문장을 거울 앞에서 크게 2번 말해 보기",
     "첫 세 문장을 소리 내어 두 번 말했다",
     "시작 부분만 입에 붙어도 발표 날 긴장이 많이 줄어요.",
     '친구에게 "내 첫 문장 한번 들어 줄래?"라고 해 보세요.',
     "발표 코치"),
    (None, "M",
     "이번 주 용돈을 어디에 썼는지 기억나는 것 3개를 적고, 아낄 수 있던 것 하나에 표시하기",
     "쓴 곳 3개와 표시 하나를 적었다",
     "돈이 어디로 갔는지 보이면 다음 주 계획을 내가 세울 수 있어요.",
     '가족에게 "용돈 기록은 어떻게 하면 좋아요?"라고 물어보세요.',
     "경제 선생님"),
    (None, "A",
     "오늘 밤 자기 30분 전에 휴대폰을 책상 위에 두고 침대에 가기",
     "자기 30분 전에 휴대폰을 내려놓았다",
     "잠들기 전 화면을 줄이면 아침에 덜 피곤한 걸 직접 느낄 수 있어요.",
     '가족에게 "자기 전에 폰 좀 맡아 줄래?"라고 해 보세요.',
     "수면 코치"),
    (None, "M",
     "창가에서 물건 하나를 빛이 옆에서 들어오게 두고 사진 3장 찍어 비교하기",
     "각도를 바꾼 사진 3장을 찍고 마음에 드는 하나를 골랐다",
     "빛 방향 하나만 바꿔도 사진이 달라지는 걸 보면 찍는 재미가 생겨요.",
     '친구에게 "어느 사진이 제일 나아 보여?"라고 물어보세요.',
     "사진작가"),
]


async def main(username: str, clear_active: bool):
    async with AsyncSessionLocal() as db:
        user = (await db.execute(select(User).where(User.username == username))).scalar_one_or_none()
        if not user:
            raise SystemExit(f"'{username}' 계정이 없습니다. 먼저 python -m scripts.seed_demo --username {username} 로 만드세요.")

        if clear_active:
            await db.execute(delete(Mission).where(Mission.user_id == user.id, Mission.status == "active"))
        else:
            # 다시 실행해도 겹치지 않게, 이 스크립트로 넣었던 진행 중 미션만 지운다
            await db.execute(delete(Mission).where(
                Mission.user_id == user.id, Mission.status == "active",
                Mission.plan.like('%"branch": "demo_expert"%'),
            ))

        level = target_level(user.elo)
        base = datetime.now(KST) - timedelta(minutes=len(EXPERT_MISSIONS))
        for i, (domain, var, content, completion, reason, helper, expert) in enumerate(EXPERT_MISSIONS):
            db.add(Mission(
                user_id=user.id, content=content, target_var=var, status="active",
                difficulty=LEVEL_RATINGS[level], reason=reason, helper=helper,
                domain=domain, completion=completion,
                plan=json.dumps({"branch": "demo_expert", "expert": expert}, ensure_ascii=False),
                created_at=base + timedelta(minutes=i),  # 목록 순서를 위 순서대로
            ))

        await db.commit()
        print(f"완료: '{username}' 계정에 전문가 필요 미션 {len(EXPERT_MISSIONS)}개를 넣었습니다.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", default="demo")
    ap.add_argument("--clear-active", action="store_true", help="이 계정의 진행 중 미션을 먼저 지움")
    args = ap.parse_args()
    asyncio.run(main(args.username, args.clear_active))
