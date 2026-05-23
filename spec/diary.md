# 일기

## 기능 명세
- 읽기 / 쓰기 / 수정
- 하루에 여러 개 작성 가능
- 글자수 제한 없음 (한 줄도 허용)
- 수정은 당일에만 가능, 자정에 날짜가 바뀌면 동결 (`is_locked=TRUE`)
- 일기 작성 여부는 캘린더에 표시

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/diaries?month=YYYY-MM | 월별 일기 작성 날짜 목록 (캘린더용) |
| GET | /api/diaries/{date} | 특정 날짜 일기들 조회 |
| POST | /api/diaries | 일기 작성 (오늘만) |
| PATCH | /api/diaries/{id} | 일기 수정 (당일·미동결만) |

## 비즈니스 로직

**일기 작성 (POST /api/diaries)**
- `diary_date` = 사용자 로컬 오늘
- `is_locked=FALSE`로 insert
- `users.diary_count += 1`
- AI 호출 없음 (분석은 자정에)

**일기 수정 (PATCH /api/diaries/{id})**
- `is_locked=TRUE`면 거부 (409 Conflict)
- 당일이고 미동결이면 content 갱신

## DB

```sql
CREATE TABLE diaries (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_date  DATE NOT NULL,
    content     TEXT NOT NULL,
    is_locked   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_diaries_user_date ON diaries(user_id, diary_date);
```

분석 input용 쿼리:
```sql
SELECT string_agg(content, E'\n---\n' ORDER BY created_at)
FROM diaries WHERE user_id = $1 AND diary_date = $2;
```

## 프론트엔드

**DiaryCalendar** (`components/DiaryCalendar.jsx`)
- `useMonthDiaries(month)`: 월별 작성 날짜 조회
- 일기 쓴 날짜에 점 표시
- 날짜 클릭 시 `/diary/:date`로 이동

**DiaryEditorPage** (`pages/DiaryEditorPage.jsx`)
- 텍스트 영역 + 글자수 카운터 (제한 없음)
- 당일·미동결이면 저장/수정 버튼 활성
- 그 외 날짜는 read-only
- 라우트: `/diary/new` (오늘 작성), `/diary/:date` (조회/수정)
