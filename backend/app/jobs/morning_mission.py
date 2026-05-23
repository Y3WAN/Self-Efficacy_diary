import logging
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models import User
from app.services.mission_service import generate_missions

logger = logging.getLogger(__name__)


async def run_morning_mission():
    logger.info("Morning mission job started")

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User.id))
        user_ids = result.scalars().all()

    for user_id in user_ids:
        async with AsyncSessionLocal() as db:
            try:
                generated = await generate_missions(user_id, db)
                if generated:
                    logger.info(f"Morning mission: generated {generated} for user={user_id}")
            except Exception as e:
                logger.error(f"Morning mission failed user={user_id}: {e}")

    logger.info("Morning mission job completed")
