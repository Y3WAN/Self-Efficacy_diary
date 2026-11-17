"""부스 체험용 임시 계정(guest_ 로 시작) 일괄 삭제 스크립트.

사용법 (backend 폴더에서):
    python -m scripts.delete_trial_users          # 몇 개인지만 확인
    python -m scripts.delete_trial_users --yes    # 실제 삭제

- 일기·분석·미션·ELO 기록은 외래키 ON DELETE CASCADE 로 함께 지워진다.
- 행사 당일 자정 분석이 돌기 전에 지우면 Groq 호출도 아낄 수 있다.
- .env 의 DATABASE_URL 이 가리키는 DB에 쓴다. 운영 DB를 가리키는지 꼭 확인할 것.
"""
import argparse
import asyncio

from sqlalchemy import delete, func, select

from app.api.auth import TRIAL_PREFIX
from app.db.models import User
from app.db.session import AsyncSessionLocal, engine


async def main(yes: bool):
    cond = User.username.startswith(TRIAL_PREFIX, autoescape=True)
    async with AsyncSessionLocal() as db:
        count = (await db.execute(select(func.count()).where(cond))).scalar() or 0
        print(f"체험 계정 {count}개")
        if yes and count:
            await db.execute(delete(User).where(cond))
            await db.commit()
            print("삭제 완료")
        elif count:
            print("지우려면 --yes 를 붙여 다시 실행")
    await engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--yes", action="store_true")
    asyncio.run(main(parser.parse_args().yes))
