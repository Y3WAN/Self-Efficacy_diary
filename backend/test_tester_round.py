import json
import os
import unittest
from unittest.mock import patch

import httpx
from groq import AsyncGroq
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://unused:unused@127.0.0.1:5432/unused")
os.environ.setdefault("JWT_SECRET", "tester-verification")

from app.db.models import Base, User
from app.db.session import get_db
from app.db.tester_models import TesterEvaluation
from app.main import app
from app.services.elo_service import BASE_RATING, target_level
from app.services.tester_service import COMMON_MISSION_ID, COMMON_SAMPLE_DIARY, create_tester_invites, prepare_common_mission

DIARY_A = "오늘은 자전거를 연습했다. 공원 한 바퀴를 혼자 돌았다."
DIARY_B = "오늘은 기타를 연습했다. 친구가 자세가 좋아졌다고 말해줬다. 안심이 됐다."
MISSION = "영어 발표 대본의 두 번째 문단을 문장마다 잠깐 쉬어 가며 두 번 읽어 보세요"
EVIDENCE_A = "공원 한 바퀴를 혼자 돌았다."
EVIDENCE_B = "친구가 자세가 좋아졌다고 말해줬다."


def fixture_groq(request: httpx.Request) -> httpx.Response:
    messages = json.loads(request.content)["messages"]
    prompt = messages[1]["content"]
    if COMMON_SAMPLE_DIARY in prompt:
        assert f"Lv{target_level(BASE_RATING)}/5" in prompt
        result = {
            "problem": "영어 발표를 시작할 때 긴장했다",
            "content": MISSION + ".",
            "reason": "천천히 읽으면 문장 사이에 쉬기 편해져요.",
            "helper": "",
        }
    else:
        assert "일기 원문" in messages[0]["content"]
        if DIARY_A in prompt:
            result = {"score_m": 0.8, "evidence_m": EVIDENCE_A,
                      "score_v": 0.6, "evidence_v": "일기 원문에 없는 구절",
                      "score_p": None, "evidence_p": EVIDENCE_A}
        else:
            assert DIARY_B in prompt
            result = {"score_p": 0.7, "evidence_p": EVIDENCE_B, "score_a": 0.6, "evidence_a": "안심이 됐다."}
    return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps(result)}}]})


class TesterRoundTest(unittest.IsolatedAsyncioTestCase):
    async def test_two_invites_keep_diaries_and_ratings_separate(self):
        engine = create_async_engine("sqlite+aiosqlite://")
        self.addAsyncCleanup(engine.dispose)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        async def test_db():
            async with sessions() as db:
                yield db

        app.dependency_overrides[get_db] = test_db
        self.addCleanup(app.dependency_overrides.pop, get_db)
        groq_requests = []

        def capture_groq(request):
            groq_requests.append(request)
            return fixture_groq(request)

        async with AsyncGroq(api_key="test-key", http_client=httpx.AsyncClient(
            transport=httpx.MockTransport(capture_groq)
        )) as groq, httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            with patch("app.services.groq_client.get_groq", return_value=groq):
                async with sessions() as db:
                    self.assertEqual((await prepare_common_mission(db)).content, MISSION)
                    self.assertEqual((await prepare_common_mission(db)).id, COMMON_MISSION_ID)
                    db.add(User(id=1, username="existing", password_hash="unused", initial_grade="중", elo=1078))
                    await db.commit()
                    (id_a, token_a), = await create_tester_invites(db, 1)
                    (id_b, token_b), = await create_tester_invites(db, 1, app_user_id=1)
                    (await db.get(User, 1)).elo = 1082
                    await db.commit()

                auth_a = {"Authorization": f"Bearer {token_a}"}
                auth_b = {"Authorization": f"Bearer {token_b}"}
                self.assertNotEqual(id_a, id_b)
                self.assertEqual((await client.get("/api/tester/session")).status_code, 401)
                self.assertEqual((await client.get("/api/tester/mission", headers=auth_a)).status_code, 409)
                response_a = await client.post("/api/tester/analysis", headers=auth_a, json={"diary": DIARY_A})
                self.assertEqual(response_a.status_code, 200, response_a.text)
                self.assertEqual(response_a.json(), {
                    "sources": {"M": EVIDENCE_A, "V": None, "P": None, "A": None},
                    "elo": BASE_RATING,
                })
                self.assertEqual(response_a.headers["Cache-Control"], "no-store")
                self.assertEqual((await client.get("/api/tester/mission", headers=auth_b)).status_code, 409)
                response_b = await client.post("/api/tester/analysis", headers=auth_b, json={"diary": DIARY_B})
                self.assertEqual(response_b.status_code, 200, response_b.text)
                self.assertEqual(response_b.json(), {
                    "sources": {"M": None, "V": None, "P": EVIDENCE_B, "A": "안심이 됐다."},
                    "elo": 1082,
                })
                mission_a = (await client.get("/api/tester/mission", headers=auth_a)).json()
                mission_b = (await client.get("/api/tester/mission", headers=auth_b)).json()
                self.assertEqual(mission_a, mission_b)
                self.assertEqual(mission_a["id"], COMMON_MISSION_ID)
                self.assertEqual(mission_a["sample_diary"], COMMON_SAMPLE_DIARY)
                self.assertEqual(mission_a["content"], MISSION)
                self.assertEqual(len(groq_requests), 3)

                scores_a = {"relevance": 5, "clarity": 4, "feasibility": 3, "comment": "발표 상황과 잘 맞아요."}
                scores_b = {"relevance": 2, "clarity": 3, "feasibility": 1}
                invalid = await client.post("/api/tester/evaluation", headers=auth_b, json={**scores_b, "clarity": 6})
                self.assertEqual(invalid.status_code, 422)
                for headers, scores in ((auth_a, scores_a), (auth_b, scores_b), (auth_a, scores_b)):
                    response = await client.post("/api/tester/evaluation", headers=headers, json=scores)
                    self.assertEqual(response.status_code, 200, response.text)
                    self.assertEqual(response.json(), {"completed": True})
                for headers, participant_id in ((auth_a, id_a), (auth_b, id_b)):
                    self.assertEqual((await client.get("/api/tester/session", headers=headers)).json(),
                                     {"participant_id": participant_id, "completed": True})

        async with sessions() as db:
            rows = (await db.scalars(select(TesterEvaluation))).all()
            saved = {str(row.participant_id): (
                row.mission_id, row.relevance, row.clarity, row.feasibility, row.comment
            ) for row in rows}
            self.assertEqual(saved, {
                id_a: (COMMON_MISSION_ID, 5, 4, 3, scores_a["comment"]),
                id_b: (COMMON_MISSION_ID, 2, 3, 1, None),
            })
            self.assertEqual((await db.get(User, 1)).elo, 1082)


if __name__ == "__main__":
    unittest.main()
