import logging
from datetime import datetime, time
from sqlalchemy import select
from app.db.session import AsyncSessionLocal
from app.db.models import Mission, User
from app.core.timeutil import KST, today_kst
from app.services.mission_service import generate_missions

logger = logging.getLogger(__name__)


async def run_morning_mission():
    logger.info("Morning mission job started")
    today_start = datetime.combine(today_kst(), time.min, tzinfo=KST)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User.id))
        user_ids = result.scalars().all()
        # 보충 실행으로 하루에 두 번 돌 수 있으므로 오늘 이미 미션을 받은 사용자는 건너뜀
        done = await db.execute(
            select(Mission.user_id).where(Mission.created_at >= today_start).distinct()
        )
        already = set(done.scalars().all())

    for user_id in user_ids:
        if user_id in already:
            continue
        async with AsyncSessionLocal() as db:
            try:
                generated = await generate_missions(user_id, db)
                if generated:
                    logger.info(f"Morning mission: generated {generated} for user={user_id}")
            except Exception as e:
                logger.error(f"Morning mission failed user={user_id}: {e}")

    logger.info("Morning mission job completed")
