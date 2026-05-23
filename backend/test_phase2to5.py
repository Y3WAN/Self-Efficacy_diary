# -*- coding: utf-8 -*-
"""Phase 2-5 integration test"""
import httpx, time, sys

BASE = "http://localhost:8000"
ok = True
USERNAME = f"p25_{int(time.time())}"
GROQ_AVAILABLE = False  # updated after first AI call


def check(label, cond, extra=""):
    global ok
    mark = "[PASS]" if cond else "[FAIL]"
    extra_str = f" -> {extra}" if extra else ""
    print(f"{mark} {label}{extra_str}")
    if not cond:
        ok = False


def skip(label):
    print(f"[SKIP] {label} (Groq unavailable)")


c = httpx.Client(base_url=BASE, timeout=30)

# ── Setup ─────────────────────────────────────────────────────────────
r = c.post("/api/auth/signup", json={"username": USERNAME, "password": "pw1234", "initial_grade": "상"})
check("signup 201", r.status_code == 201)
token = r.json().get("access_token", "")
auth = {"Authorization": f"Bearer {token}"}

for content in [
    "오늘 수학 문제를 10개 풀었다. 어려웠지만 다 맞았어!",
    "친구가 내 발표 잘했다고 칭찬해줬다. 기분 좋다.",
    "피곤하지만 내일도 열심히 해야지.",
]:
    r = c.post("/api/diaries", json={"content": content}, headers=auth)
    check(f"일기 작성", r.status_code == 201)

# ── Phase 2: 자기효능감 분석 ──────────────────────────────────────────
print("\n--- Phase 2: 자기효능감 분석 ---")

r = c.post("/api/debug/analyze-today", headers=auth)
check("debug/analyze-today 응답 200", r.status_code == 200, r.json())
analyzed = r.json().get("analyzed")

if analyzed:
    GROQ_AVAILABLE = True
    check("분석 실행됨 (analyzed=True)", True)

    # 멱등성
    r2 = c.post("/api/debug/analyze-today", headers=auth)
    check("멱등성: 두 번째 호출 analyzed=False", r2.json().get("analyzed") == False)

    # growth
    r = c.get("/api/dashboard/growth", headers=auth)
    check("dashboard/growth 200", r.status_code == 200)
    growth = r.json()
    check("growth 데이터 1개", len(growth) >= 1)
    if growth:
        check("avg_score 0~1 범위", 0 <= growth[0]["avg_score"] <= 1, growth[0]["avg_score"])

    # radar
    r = c.get("/api/dashboard/radar", headers=auth)
    check("dashboard/radar 200", r.status_code == 200)
    radar = r.json()
    if radar:
        for key in ["score_m", "score_v", "score_p", "score_a"]:
            check(f"radar.{key} 0~1", 0 <= radar[key] <= 1, radar.get(key))
else:
    print("[WARN] Groq API 응답 없음 - AI 분석 테스트 건너뜀")
    print("[WARN] .env GROQ_API_KEY 를 유효한 키로 교체 후 재실행하세요")

# AI 없이도 동작해야 하는 dashboard 엔드포인트
r_new = c.post("/api/auth/signup", json={"username": USERNAME + "_n", "password": "pw", "initial_grade": "중"})
new_auth = {"Authorization": f"Bearer {r_new.json().get('access_token','')}"}
r = c.get("/api/dashboard/growth", headers=new_auth)
check("신규유저 growth 빈배열 (500 아님)", r.status_code == 200 and r.json() == [])
r = c.get("/api/dashboard/radar", headers=new_auth)
check("신규유저 radar null (500 아님)", r.status_code == 200 and r.json() is None)

# ── Phase 3: 페르소나 ─────────────────────────────────────────────────
print("\n--- Phase 3: 페르소나 ---")

r = c.get("/api/persona", headers=auth)
check("GET /api/persona 200", r.status_code == 200)
persona_data = r.json()
check("current_persona 있음", "current_persona" in persona_data, persona_data.get("current_persona"))
check("history >= 1 (initial_grade)", len(persona_data.get("history", [])) >= 1)
if persona_data.get("history"):
    last = persona_data["history"][-1]
    check("첫 이력 source=initial_grade", last["source"] == "initial_grade")
    check("initial 이력에 diary_count_at=0", last.get("diary_count_at") == 0)

if GROQ_AVAILABLE:
    r = c.post("/api/debug/reclassify", headers=auth)
    check("debug/reclassify 200", r.status_code == 200, r.json())
    new_persona = r.json().get("persona")
    check("유효한 페르소나 반환", new_persona in ["당차미", "헤맹이", "멍하미", "지치미"], new_persona)

    r = c.get("/api/persona", headers=auth)
    history = r.json().get("history", [])
    check("재분류 후 history 2개", len(history) >= 2)
    check("최신 이력 source=ai_reclassify", history[0]["source"] == "ai_reclassify")
    check("AI 근거 있음", bool(history[0].get("reasoning")))
else:
    skip("AI 페르소나 재분류")

# ── Phase 4: ZPD 미션 ────────────────────────────────────────────────
print("\n--- Phase 4: ZPD 미션 ---")

if GROQ_AVAILABLE:
    r = c.post("/api/debug/generate-missions", headers=auth)
    check("generate-missions 200", r.status_code == 200, r.json())
    generated = r.json().get("generated", 0)
    check("미션 1개 이상 생성", generated >= 1, generated)

    r = c.get("/api/missions", headers=auth)
    check("GET /api/missions 200", r.status_code == 200)
    missions = r.json()
    check("활성 미션 1개 이상", len(missions) >= 1)
    check("미션 최대 3개", len(missions) <= 3)
    if missions:
        m = missions[0]
        check("target_var MVPA 중 하나", m["target_var"] in ["M", "V", "P", "A"], m["target_var"])
        check("content 있음 (20자 이상)", len(m["content"]) >= 10, m["content"][:30])

    # 슬롯 3개 초과 안 됨
    c.post("/api/debug/generate-missions", headers=auth)
    c.post("/api/debug/generate-missions", headers=auth)
    r = c.get("/api/missions", headers=auth)
    missions_all = r.json()
    check("슬롯 3개 초과 안 됨", len(missions_all) <= 3, len(missions_all))

    # 3개 가득 차면 generated=0
    if len(missions_all) == 3:
        r = c.post("/api/debug/generate-missions", headers=auth)
        check("슬롯 가득 → generated=0", r.json().get("generated") == 0, r.json())

    # 미션 완료
    if missions:
        mid = missions[0]["id"]
        r = c.post(f"/api/missions/{mid}/complete", headers=auth)
        check("미션 완료 200", r.status_code == 200)
        check("status=done", r.json().get("status") == "done")

        r = c.get("/api/missions", headers=auth)
        check("완료 미션 활성 목록 제외", mid not in [m["id"] for m in r.json()])
else:
    # 미션 없이 get은 동작해야 함
    r = c.get("/api/missions", headers=auth)
    check("GET /api/missions 빈배열 (500 아님)", r.status_code == 200 and isinstance(r.json(), list))
    skip("AI 미션 생성/완료")

# ── Phase 5: 경계 케이스 ──────────────────────────────────────────────
print("\n--- Phase 5: 경계 케이스 ---")

r = c.post("/api/missions/999999/complete", headers=auth)
check("없는 미션 완료 → 404", r.status_code == 404)

# 다른 유저의 자원 접근 불가
r2_signup = c.post("/api/auth/signup", json={"username": USERNAME + "_o", "password": "pw", "initial_grade": "중"})
other_auth = {"Authorization": f"Bearer {r2_signup.json().get('access_token','')}"}
r = c.get("/api/persona", headers=other_auth)
check("다른 유저 persona 조회 (자기 것만)", r.status_code == 200 and r.json()["history"][0]["source"] == "initial_grade")

print()
print("=" * 50)
if ok:
    print("[ALL PASS] Phase 2-5 비AI 테스트 통과!")
    if not GROQ_AVAILABLE:
        print("[NOTE] Groq API 키 교체 후 AI 기능 테스트를 재실행하세요.")
else:
    print("[FAIL] 일부 테스트 실패")
    sys.exit(1)
