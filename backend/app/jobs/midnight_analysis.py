import logging
from datetime import date, timedelta
from sqlalchemy import select, update, distinct
from app.db.session import AsyncSessionLocal
from app.db.models import Diary
from app.services.analysis_service import analyze_day

logger = logging.getLogger(__name__)


async def run_midnight_analysis():
    yesterday = date.today() - timedelta(days=1)
    logger.info(f"Midnight analysis started for {yesterday}")

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(distinct(Diary.user_id)).where(Diary.diary_date == yesterday)
        )
        user_ids = result.scalars().all()

    for user_id in user_ids:
        async with AsyncSessionLocal() as db:
            try:
                await db.execute(
                    update(Diary)
                    .where(Diary.user_id == user_id, Diary.diary_date == yesterday)
                    .values(is_locked=True)
                )
                await db.commit()

                await analyze_day(user_id, yesterday, db)

            except Exception as e:
                logger.error(f"Midnight analysis failed user={user_id}: {e}")

    logger.info(f"Midnight analysis completed for {yesterday}, processed {len(user_ids)} users")
