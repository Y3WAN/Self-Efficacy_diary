import asyncio
import os
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch

import httpx
from sqlalchemy import Integer
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://unused:unused@127.0.0.1:5432/unused")
os.environ.setdefault("JWT_SECRET", "diary-limit-verification")

from app.core.deps import get_current_user
from app.db.models import Base, Diary, User
from app.db.session import get_db
from app.main import app


class DiaryDailyLimitTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        fixture = self.enterContext(tempfile.TemporaryDirectory())
        database = (Path(fixture) / "diaries.sqlite3").as_posix()
        engine = create_async_engine(f"sqlite+aiosqlite:///{database}")
        self.addAsyncCleanup(engine.dispose)
        self.sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as connection:
            with patch.object(Diary.__table__.c.id, "type", Integer()):
                await connection.run_sync(Base.metadata.create_all)

        async def test_db():
            async with self.sessions() as db:
                yield db

        async def test_user():
            async with self.sessions() as db:
                return await db.get(User, 1)

        app.dependency_overrides[get_db] = test_db
        app.dependency_overrides[get_current_user] = test_user
        self.addCleanup(app.dependency_overrides.pop, get_db)
        self.addCleanup(app.dependency_overrides.pop, get_current_user)
        self.today = date(2026, 11, 26)
        self.clock = self.enterContext(patch("app.api.diary.today_kst", return_value=self.today))
        self.client = await self.enterAsyncContext(
            httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
        )
        async with self.sessions() as db:
            db.add(User(id=1, username="diary-writer", password_hash="unused", initial_grade="-"))
            await db.commit()

    async def test_parallel_writes_save_one_entry_and_deletion_does_not_reopen_day(self):
        path = f"/api/diaries/{self.today}/editor"
        self.assertEqual((await self.client.get(path)).json(), {"diaries": [], "can_create": True})
        blank = await self.client.post("/api/diaries", json={"content": "  "})
        self.assertEqual(blank.status_code, 422)

        writes = await asyncio.gather(*[
            self.client.post("/api/diaries", json={"content": f"Draft from tab {tab}"}) for tab in (1, 2)
        ])
        self.assertEqual(sorted(response.status_code for response in writes), [201, 409])
        editor = (await self.client.get(path)).json()
        self.assertEqual(len(editor["diaries"]), 1)
        self.assertFalse(editor["can_create"])
        diary = editor["diaries"][0]
        async with self.sessions() as db:
            self.assertEqual((await db.get(User, 1)).diary_count, 1)

        entry = f"/api/diaries/{diary['id']}"
        edited = await self.client.patch(entry, json={"content": "Updated existing diary"})
        self.assertEqual(edited.status_code, 200, edited.text)
        self.assertEqual(edited.json()["content"], "Updated existing diary")
        self.assertEqual((await self.client.delete(entry)).status_code, 204)
        self.assertEqual((await self.client.get(path)).json(), {"diaries": [], "can_create": False})
        self.assertEqual((await self.client.post("/api/diaries", json={"content": "New entry"})).status_code, 409)

        self.clock.return_value = self.today + timedelta(days=1)
        self.assertEqual((await self.client.post("/api/diaries", json={"content": "Tomorrow"})).status_code, 201)
        async with self.sessions() as db:
            self.assertEqual((await db.get(User, 1)).diary_count, 1)

    async def test_existing_entries_remain_readable_and_count_without_a_marker(self):
        async with self.sessions() as db:
            db.add_all([
                Diary(id=1, user_id=1, diary_date=self.today, content="Existing first diary"),
                Diary(id=2, user_id=1, diary_date=self.today, content="Existing second diary"),
            ])
            await db.commit()

        path = f"/api/diaries/{self.today}/editor"
        editor = (await self.client.get(path)).json()
        self.assertEqual(len(editor["diaries"]), 2)
        self.assertFalse(editor["can_create"])
        self.assertEqual((await self.client.post("/api/diaries", json={"content": "Blocked"})).status_code, 409)
        for diary_id in (1, 2):
            self.assertEqual((await self.client.delete(f"/api/diaries/{diary_id}")).status_code, 204)
        self.assertEqual((await self.client.get(path)).json(), {"diaries": [], "can_create": False})


if __name__ == "__main__":
    unittest.main()
