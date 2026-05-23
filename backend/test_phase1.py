# -*- coding: utf-8 -*-
import httpx, datetime, time

BASE = "http://localhost:8000"
ok = True
USERNAME = f"tester_{int(time.time())}"

def check(label, cond, extra=""):
    global ok
    mark = "[PASS]" if cond else "[FAIL]"
    print(f"{mark} {label}{' -> ' + str(extra) if extra else ''}")
    if not cond:
        ok = False

c = httpx.Client(base_url=BASE)

# 1. 회원가입
r = c.post("/api/auth/signup", json={"username": USERNAME, "password": "test1234", "initial_grade": "중"})
check("회원가입 201", r.status_code == 201, r.json())
token = r.json().get("access_token", "")
auth = {"Authorization": f"Bearer {token}"}

# 2. /me current_persona 포함
r = c.get("/api/auth/me", headers=auth)
d = r.json()
check("/me 200 + current_persona", r.status_code == 200 and "current_persona" in d, d)
check("성적 '중' -> 페르소나 '헤맹이'", d.get("current_persona") == "헤맹이")

# 3. 잘못된 토큰 -> 401
r = c.get("/api/auth/me", headers={"Authorization": "Bearer bad-token"})
check("잘못된 토큰 -> 401", r.status_code == 401)

# 4. 잘못된 성적 -> 422
r = c.post("/api/auth/signup", json={"username": "x", "password": "x", "initial_grade": "최상"})
check("잘못된 성적 -> 422", r.status_code == 422)

# 5. 중복 아이디 -> 409
r = c.post("/api/auth/signup", json={"username": USERNAME, "password": "xxx", "initial_grade": "상"})
check("중복 아이디 -> 409", r.status_code == 409)

# 6. 로그인
r = c.post("/api/auth/login", json={"username": USERNAME, "password": "test1234"})
check("로그인 200", r.status_code == 200)
token = r.json().get("access_token", token)
auth = {"Authorization": f"Bearer {token}"}

# 7. 일기 작성
r = c.post("/api/diaries", json={"content": "오늘 공부 열심히 했다"}, headers=auth)
check("일기 작성 201", r.status_code == 201, f"id={r.json().get('id')}")
diary_id = r.json().get("id")

# 8. 같은 날 두 번째 일기
r = c.post("/api/diaries", json={"content": "저녁엔 운동도 했어"}, headers=auth)
check("같은 날 두 번째 일기 201", r.status_code == 201)

# 9. diary_count 2
r = c.get("/api/auth/me", headers=auth)
check("diary_count == 2", r.json().get("diary_count") == 2, r.json().get("diary_count"))

# 10. 캘린더 API - 오늘 날짜 포함
month = datetime.date.today().strftime("%Y-%m")
today = datetime.date.today().isoformat()
r = c.get(f"/api/diaries?month={month}", headers=auth)
check("캘린더 dates에 오늘 포함", r.status_code == 200 and today in r.json().get("dates", []), r.json())

# 11. 날짜별 조회 2개
r = c.get(f"/api/diaries/{today}", headers=auth)
check("날짜별 조회 2개", r.status_code == 200 and len(r.json()) == 2)

# 12. 일기 수정
r = c.patch(f"/api/diaries/{diary_id}", json={"content": "수정된 내용"}, headers=auth)
check("일기 수정 200", r.status_code == 200)

# 13. 미션 빈 배열
r = c.get("/api/missions", headers=auth)
check("미션 빈 배열", r.status_code == 200 and r.json() == [])

print()
print("=" * 40)
print("[ALL PASS] Phase 1 complete!" if ok else "[FAIL] Some tests failed")
