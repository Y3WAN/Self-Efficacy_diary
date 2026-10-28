from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text
from app.db.session import engine
from app.db.models import Base
from app.api import auth, diary, mission, dashboard, debug, failure_log, user_prompt
from app.core.config import settings
from app.core.timeutil import KST

scheduler = AsyncIOScheduler(timezone=KST)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(text("DROP TABLE IF EXISTS persona_history CASCADE"))
        await conn.execute(text("ALTER TABLE users DROP COLUMN IF EXISTS current_persona"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0"))
        await conn.execute(text(
            "CREATE TABLE IF NOT EXISTS failure_logs ("
            "id BIGSERIAL PRIMARY KEY, "
            "user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
            "diary_date DATE NOT NULL, "
            "failure_summary TEXT NOT NULL, "
            "created_at TIMESTAMPTZ NOT NULL DEFAULT now()"
            ")"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_failure_logs_user_date "
            "ON failure_logs(user_id, diary_date)"
        ))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_prompt TEXT"))
        await conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS elo INTEGER NOT NULL DEFAULT 1000"))
        await conn.execute(text("ALTER TABLE missions ADD COLUMN IF NOT EXISTS difficulty INTEGER"))

    from app.jobs.catch_up import catch_up, midnight_job, morning_job, MORNING_HOUR

    scheduler.add_job(midnight_job, "cron", hour=0, minute=5, id="midnight_analysis")
    scheduler.add_job(morning_job, "cron", hour=MORNING_HOUR, minute=0, id="morning_mission")
    # 서버가 잠든 사이 놓친 작업 보충 (trigger 없이 등록하면 즉시 1회 실행)
    scheduler.add_job(catch_up, id="catch_up")
    scheduler.start()

    yield

    scheduler.shutdown()


app = FastAPI(title="성장 기록 플랫폼", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(diary.router)
app.include_router(mission.router)
app.include_router(dashboard.router)
if settings.ENABLE_DEBUG_API:
    app.include_router(debug.router)
app.include_router(failure_log.router)
app.include_router(user_prompt.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
