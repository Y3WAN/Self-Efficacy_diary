import os
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import httpx
from sqlalchemy import Integer
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://unused:unused@127.0.0.1:5432/unused")
os.environ.setdefault("JWT_SECRET", "profile-verification")

from app.core.deps import get_current_user
from app.db.models import Base, DailyAnalysis, Diary, Mission, Respect, User
from app.db.session import get_db
from app.main import app
from app.services.analysis_service import INITIAL_REASONING
from app.services.scoring import ema_step


class ProfileActivityTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        engine = create_async_engine("sqlite+aiosqlite://")
        self.addAsyncCleanup(engine.dispose)
        self.sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            with patch.object(Respect.__table__.c.id, "type", Integer()):
                await connection.run_sync(Base.metadata.create_all)

        self.user = User(id=1, username="owner", password_hash="unused", initial_grade="-")

        async def test_db():
            async with self.sessions() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = lambda: self.user
        self.addCleanup(app.dependency_overrides.pop, get_db)
        self.addCleanup(app.dependency_overrides.pop, get_current_user)
        self.client = await self.enterAsyncContext(
            httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        )
        async with self.sessions() as db:
            db.add_all([
                self.user,
                User(id=2, username="private-author", password_hash="unused", initial_grade="-"),
            ])
            await db.commit()

    async def test_daily_returns_scores_and_saved_diaries_without_analysis(self):
        def analysis(id_, day, *, reflected, composite, evidence):
            return DailyAnalysis(
                id=id_, user_id=1, diary_date=date.fromisoformat(day),
                score_m=0.5, score_v=0.5, score_p=0.5, score_a=0.5,
                composite_score=composite, evidence_sources=evidence,
                confidence=0.8, is_reflected=reflected,
            )

        async with self.sessions() as db:
            db.add_all([
                analysis(1, "2026-10-10", reflected=True, composite=0.5, evidence="MVPA"),
                analysis(2, "2026-10-24", reflected=True, composite=0.5, evidence=None),
                analysis(3, "2026-10-26", reflected=False, composite=None, evidence="M"),
                analysis(4, "2026-11-10", reflected=True, composite=0.5, evidence="MVPA"),
                Diary(id=1, user_id=1, diary_date=date(2026, 10, 27), content="Saved"),
                Diary(id=2, user_id=2, diary_date=date(2026, 10, 25), content="Private"),
            ])
            await db.commit()

        response = await self.client.get("/api/dashboard/daily", params={
            "diary_since": "2026-10-11", "through": "2026-11-09",
        })
        self.assertEqual(response.status_code, 200, response.text)
        days = {row["date"]: row for row in response.json()}
        self.assertEqual(list(days), ["2026-10-10", "2026-10-24", "2026-10-26", "2026-10-27"])
        self.assertEqual(days["2026-10-24"]["score"], 0.5)
        self.assertIsNone(days["2026-10-26"]["score"])
        self.assertIsNotNone(days["2026-10-26"]["confidence"])
        self.assertTrue(days["2026-10-27"]["has_diary"])
        self.assertIsNone(days["2026-10-27"]["confidence"])
        self.assertEqual(days["2026-10-27"]["ema"], 0.5)

    async def test_daily_diary_limit_uses_saved_dates_across_months(self):
        diary_dates = [date(2026, 9, 3) + timedelta(days=3 * i) for i in range(16)]
        scored_day = diary_dates[-2]
        orphan_day = scored_day - timedelta(days=1)
        through = diary_dates[-1]

        def analysis(id_, day, score):
            return DailyAnalysis(
                id=id_, user_id=1, diary_date=day,
                score_m=score, score_v=0.5, score_p=0.5, score_a=0.5,
                composite_score=score, evidence_sources="M", confidence=0.8, is_reflected=True,
            )

        async with self.sessions() as db:
            db.add_all([
                *(Diary(id=i, user_id=1, diary_date=day, content="Saved")
                  for i, day in enumerate(diary_dates, 1)),
                Diary(id=17, user_id=1, diary_date=scored_day, content="Legacy second entry"),
                Diary(id=18, user_id=2, diary_date=orphan_day, content="Another user's diary"),
                Diary(id=19, user_id=1, diary_date=through + timedelta(days=1), content="Future"),
                analysis(1, diary_dates[0], 0.5),
                analysis(2, orphan_day, 0.95),
                analysis(3, scored_day, 0.8),
            ])
            await db.commit()

        response = await self.client.get("/api/dashboard/daily", params={
            "diary_limit": 15, "through": through.isoformat(),
        })
        self.assertEqual(response.status_code, 200, response.text)
        days = response.json()
        self.assertEqual([day["date"] for day in days], [day.isoformat() for day in diary_dates[1:]])
        self.assertTrue(all(day["has_diary"] for day in days))
        self.assertEqual(days[0]["ema"], 0.5)
        self.assertEqual(days[-2]["score"], 0.8)
        self.assertEqual(days[-2]["ema"], round(ema_step(0.5, 0.8, 0.8), 3))
        self.assertIsNone(days[-1]["score"])
        self.assertIsNone(days[-1]["confidence"])

    async def test_daily_diary_limit_does_not_use_signup_survey_as_a_diary_score(self):
        day = date(2026, 11, 24)
        async with self.sessions() as db:
            db.add(DailyAnalysis(
                id=1, user_id=1, diary_date=day,
                score_m=0.5, score_v=0.5, score_p=0.5, score_a=0.5,
                composite_score=0.5, evidence_sources="MVPA", confidence=1,
                reasoning=INITIAL_REASONING, is_reflected=True,
            ))
            await db.commit()

        response = await self.client.get("/api/dashboard/daily", params={"diary_limit": 15})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json(), [])

        async with self.sessions() as db:
            db.add(Diary(id=1, user_id=1, diary_date=day, content="Waiting for analysis"))
            await db.commit()

        response = await self.client.get("/api/dashboard/daily", params={"diary_limit": 15})
        self.assertEqual(response.status_code, 200, response.text)
        [row] = response.json()
        self.assertEqual(row["date"], day.isoformat())
        self.assertTrue(row["has_diary"])
        self.assertIsNone(row["score"])
        self.assertIsNone(row["confidence"])
        self.assertEqual(row["ema"], 0.5)

    async def test_stack_total_matches_completed_books_and_public_feed_respects_visibility(self):
        stamp = datetime(2026, 10, 24, tzinfo=timezone.utc)

        def mission(id_, user_id, status, completed_at=stamp):
            return Mission(
                id=id_, user_id=user_id, status=status, content=f"Mission {id_}",
                target_var="M", created_at=stamp, completed_at=completed_at,
            )

        async with self.sessions() as db:
            db.add_all([
                *(mission(i, 1, "done") for i in range(1, 202)),
                mission(202, 1, "skipped"),
                mission(203, 1, "active", None),
                mission(204, 2, "done"),
                mission(205, 2, "done", None),
                mission(206, 2, "skipped"),
            ])
            await db.commit()

        me = await self.client.get("/api/auth/me")
        stack = await self.client.get("/api/missions/stack")
        self.assertEqual(stack.status_code, 200, stack.text)
        shelf = stack.json()
        self.assertEqual(me.json()["completed_missions_count"], 201)
        self.assertEqual(shelf["done_count"], 201)
        self.assertEqual(shelf["skipped_count"], 1)
        self.assertEqual(sum(book["status"] == "done" for book in shelf["books"]), shelf["done_count"])

        # The other author's public entry is recent enough to appear in the feed.
        async with self.sessions() as db:
            public = await db.get(Mission, 204)
            public.completed_at = datetime(2026, 10, 25, tzinfo=timezone.utc)
            await db.commit()
        response = await self.client.get("/api/missions/community/feed")
        self.assertEqual(response.status_code, 200, response.text)
        public = next(row for row in response.json() if not row["is_own"])
        self.assertEqual(public["public_completed_count"], 1)
        self.assertEqual(public["display_name"], "pr•••r")
        self.assertNotIn("user_id", public)
        self.assertNotIn("username", public)


    async def test_respect_can_be_undone_once_without_removing_other_reactions(self):
        stamp = datetime(2026, 10, 24, tzinfo=timezone.utc)
        async with self.sessions() as db:
            owner = await db.get(User, 2)
            owner.points = 10
            db.add(User(id=3, username="other-viewer", password_hash="unused", initial_grade="-"))
            db.add_all([
                Mission(id=1, user_id=2, status="done", content="Public", target_var="M", completed_at=stamp),
                Mission(id=2, user_id=2, status="done", content="No completion date", target_var="M"),
                Mission(id=3, user_id=1, status="done", content="Own", target_var="M", completed_at=stamp),
            ])
            await db.flush()
            db.add(Respect(from_user_id=3, mission_id=1))
            await db.commit()

        path = "/api/missions/community/1/respect"
        self.assertEqual((await self.client.post(path)).json(), {"respect_count": 2, "has_respected": True})
        self.assertEqual((await self.client.post(path)).status_code, 409)
        async with self.sessions() as db:
            self.assertEqual((await db.get(User, 2)).points, 15)
        for _ in range(2):
            undone = await self.client.delete(path)
            self.assertEqual(undone.status_code, 200, undone.text)
            self.assertEqual(undone.json(), {"respect_count": 1, "has_respected": False})
        async with self.sessions() as db:
            self.assertEqual((await db.get(User, 2)).points, 10)
        self.assertEqual((await self.client.post(path)).json(), {"respect_count": 2, "has_respected": True})
        self.assertEqual((await self.client.post("/api/missions/community/2/respect")).status_code, 404)
        self.assertEqual((await self.client.delete("/api/missions/community/3/respect")).status_code, 403)


if __name__ == "__main__":
    unittest.main()
