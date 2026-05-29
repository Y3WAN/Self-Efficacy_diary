from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import text
from app.db.session import engine
from app.db.models import Base
from app.api import auth, diary, mission, dashboard, debug, failure_log
from app.core.config import settings

scheduler = AsyncIOScheduler(timezone="UTC")


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

    from app.jobs.midnight_analysis import run_midnight_analysis
    from app.jobs.morning_mission import run_morning_mission

    scheduler.add_job(run_midnight_analysis, "cron", hour=0, minute=5, id="midnight_analysis")
    scheduler.add_job(run_morning_mission, "cron", hour=7, minute=0, id="morning_mission")
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
app.include_router(debug.router)
app.include_router(failure_log.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
