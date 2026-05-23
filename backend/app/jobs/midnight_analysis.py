import logging
from datetime import date, timedelta
from sqlalchemy import select, update, distinct
from app.db.session import AsyncSessionLocal
from app.db.models import User, Diary, PersonaHistory
from app.services.analysis_service import analyze_day
from app.services.persona_service import reclassify

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

                user_result = await db.execute(select(User).where(User.id == user_id))
                user = user_result.scalar_one_or_none()
                if not user:
                    continue

                if user.diary_count > 0 and user.diary_count % 15 == 0:
                    last_result = await db.execute(
                        select(PersonaHistory)
                        .where(
                            PersonaHistory.user_id == user_id,
                            PersonaHistory.source == "ai_reclassify",
                        )
                        .order_by(PersonaHistory.created_at.desc())
                        .limit(1)
                    )
                    last = last_result.scalar_one_or_none()
                    last_count = last.diary_count_at if last else 0
                    if user.diary_count > last_count:
                        await reclassify(user_id, db)

            except Exception as e:
                logger.error(f"Midnight analysis failed user={user_id}: {e}")

    logger.info(f"Midnight analysis completed for {yesterday}, processed {len(user_ids)} users")
