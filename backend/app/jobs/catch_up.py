"""정기 작업 실행과 보충 실행.

Railway 무료 플랜(serverless)은 요청이 없으면 컨테이너를 재워
자정 분석·아침 미션 cron이 실행되지 않을 수 있다.
서버가 깨어날 때 catch_up()으로 놓친 작업을 보충하고,
cron과 보충 실행이 겹치지 않도록 같은 lock을 쓴다.
"""
import asyncio
import logging
from datetime import datetime
from app.core.timeutil import KST
from app.jobs.midnight_analysis import run_midnight_analysis
from app.jobs.morning_mission import run_morning_mission

logger = logging.getLogger(__name__)

MORNING_HOUR = 7

_lock = asyncio.Lock()


async def midnight_job():
    async with _lock:
        await run_midnight_analysis()


async def morning_job():
    async with _lock:
        await run_morning_mission()


async def catch_up():
    async with _lock:
        logger.info("Catch-up started")
        # 이미 분석된 날짜는 건너뛰므로 반복 실행해도 안전
        await run_midnight_analysis()
        if datetime.now(KST).hour >= MORNING_HOUR:
            await run_morning_mission()
