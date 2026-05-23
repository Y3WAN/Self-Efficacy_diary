# ZPD 미션

## 기능 명세
- 슬롯 최대 3개 (3개 초과 생성 금지)
- 갱신 시점: 매일 아침 1회 슬롯 개수 확인
  - 슬롯 3개 미만 → 부족한 만큼 AI가 전날 일기 기반으로 새 미션 생성
  - 슬롯 3개 가득 참 → AI 호출 없음
- 사용자가 "완료" 표시하면 슬롯에서 빠짐 → 다음 갱신 시 채워짐
- 미션 이력(완료/만료)은 DB에 저장

## 아침 배치 로직 (`jobs/morning_mission.py`, 매일 07:00)
모든 user에 대해:
1. `SELECT COUNT(*) FROM missions WHERE user_id=? AND status='active'`
2. 3개면 skip (AI 호출 없음)
3. 부족분 N개에 대해:
   - 가장 최근 `daily_analyses`에서 M/V/P/A 중 최솟값 변수 = `target_var`
   - 전날 일기 + `target_var`를 prompt에 주입해 Groq 호출
   - 반환된 미션 텍스트로 `missions` insert

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/missions | 활성 미션 슬롯 (최대 3개) |
| POST | /api/missions/{id}/complete | 미션 완료 처리 |

**미션 완료 로직**
- `status='active'` → `'done'`, `completed_at=NOW()`
- 빈 슬롯은 다음 아침 배치에서 자동 보충

## DB

```sql
CREATE TABLE missions (
    id           BIGSERIAL PRIMARY KEY,
    user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content      TEXT NOT NULL,
    target_var   CHAR(1) NOT NULL CHECK (target_var IN ('M','V','P','A')),
    status       VARCHAR(10) NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','done','expired')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_missions_user_status ON missions(user_id, status);
```

활성 슬롯 카운트: `status='active'`인 행 수 = 현재 슬롯 수

활성 미션 조회:
```sql
SELECT id, content, target_var, created_at
FROM missions WHERE user_id = $1 AND status = 'active'
ORDER BY created_at;
```

## 프론트엔드

**MissionList** (`components/MissionList.jsx`)
- `useMissions()`: 활성 미션 조회
- 활성 미션 최대 3개 표시
- 각 항목에 "완료" 버튼
- 메인 페이지 본문 하단에 배치
