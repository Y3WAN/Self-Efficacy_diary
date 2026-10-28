"""ELO 레이팅 기반 미션 난이도 조절.

사용자 실력(R)과 미션 난이도(D)를 같은 척도에 두고,
미션 완료 = 승(1), 포기·기한 만료 = 패(0)로 보고 R을 갱신한다.
새 미션은 예상 성공 확률이 TARGET_SUCCESS가 되는 난이도로 만들어
ZPD('조금 어렵지만 혼자 해낼 수 있는' 수준)를 수치로 유지한다.
"""
import math
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import EloHistory, Mission, User

BASE_RATING = 1000
K_FACTOR = 32
TARGET_SUCCESS = 0.65

# 난이도 단계별 레이팅과 LLM에 넘길 설명
LEVEL_RATINGS = {1: 800, 2: 900, 3: 1000, 4: 1100, 5: 1200}
LEVEL_GUIDES = {
    1: "5분 안에 혼자 바로 할 수 있는 아주 작은 행동",
    2: "10분 정도, 혼자 하는 간단한 행동",
    3: "20분 정도, 약간의 집중이 필요한 행동",
    4: "30분 정도, 미뤄 왔거나 부담스러운 일에 직접 부딪히는 행동",
    5: "30분 정도, 다른 사람에게 먼저 다가가거나 결과물을 남기는 도전적인 행동",
}


def expected_success(user_rating: float, difficulty: float) -> float:
    """사용자가 해당 난이도의 미션을 성공할 확률."""
    return 1 / (1 + 10 ** ((difficulty - user_rating) / 400))


def target_difficulty(user_rating: float) -> float:
    """예상 성공 확률이 TARGET_SUCCESS가 되는 난이도 (E 식을 D에 대해 푼 값)."""
    return user_rating + 400 * math.log10(1 / TARGET_SUCCESS - 1)


def level_for_rating(rating: float) -> int:
    return min(LEVEL_RATINGS, key=lambda lv: abs(LEVEL_RATINGS[lv] - rating))


def target_level(user_rating: float) -> int:
    return level_for_rating(target_difficulty(user_rating))


def apply_result(user: User, mission: Mission, won: bool, db: AsyncSession) -> tuple[int, int]:
    """미션 결과로 사용자 레이팅을 갱신하고 이력을 남긴다. (before, after) 반환. 커밋은 호출자가 한다."""
    before = user.elo if user.elo is not None else BASE_RATING
    difficulty = mission.difficulty if mission.difficulty is not None else BASE_RATING
    expected = expected_success(before, difficulty)
    after = round(before + K_FACTOR * ((1 if won else 0) - expected))

    user.elo = after
    db.add(EloHistory(
        user_id=user.id,
        mission_id=mission.id,
        result=1 if won else 0,
        expected=round(expected, 3),
        difficulty=difficulty,
        rating_before=before,
        rating_after=after,
    ))
    return before, after
