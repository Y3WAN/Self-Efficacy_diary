import logging
from datetime import timedelta
from sqlalchemy import select, update
from app.db.session import AsyncSessionLocal
from app.db.models import Diary
from app.core.timeutil import today_kst
from app.services.analysis_service import analyze_day

logger = logging.getLogger(__name__)

# 분석 실패(Groq 오류 등)한 날짜를 다음 날 자정에 재시도하는 기간
CATCH_UP_DAYS = 7


async def run_midnight_analysis():
    today = today_kst()
    start = today - timedelta(days=CATCH_UP_DAYS)
    logger.info(f"Midnight analysis started for {start} ~ {today - timedelta(days=1)}")

    async with AsyncSessionLocal() as db:
        # 지난 날짜 일기는 모두 잠금
        await db.execute(
            update(Diary)
            .where(Diary.diary_date < today, Diary.is_locked == False)
            .values(is_locked=True)
        )
        await db.commit()

        result = await db.execute(
            select(Diary.user_id, Diary.diary_date)
            .where(Diary.diary_date >= start, Diary.diary_date < today)
            .distinct()
            .order_by(Diary.diary_date)
        )
        targets = result.all()

    analyzed = 0
    for user_id, diary_date in targets:
        async with AsyncSessionLocal() as db:
            try:
                # 이미 분석된 날짜는 analyze_day가 건너뜀
                if await analyze_day(user_id, diary_date, db):
                    analyzed += 1
            except Exception as e:
                logger.error(f"Midnight analysis failed user={user_id} date={diary_date}: {e}")

    logger.info(f"Midnight analysis completed, analyzed {analyzed} of {len(targets)} user-days")
