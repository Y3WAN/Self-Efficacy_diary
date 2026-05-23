# 자기효능감 분석 (Bandura 4원천)

## 기능 명세
- 분석 단위: 하루 1회
- 트리거: 자정에 날짜가 바뀌는 시점 (배치 `jobs/midnight_analysis.py`, 00:05)
- 변수: M(성취·대처), V(대리·관계), P(받은 지지), A(정서·신체) 각 0.0~1.0
- 종합 점수: `M×0.4 + V×0.2 + P×0.2 + A×0.2`
- `confidence < 0.3`: 분석 결과는 DB에 기록하되 `composite_score=NULL`, `is_reflected=FALSE`

## AI 프롬프트 원칙
- Bandura 4원천 기반, JSON 강제 응답
- 한국어 근거, 0.5 중립 기본값
- "슬픔 ≠ 낮은 효능감" 원칙 포함

## 자정 배치 로직 (매일 00:05)
어제 일기를 쓴 모든 user에 대해:
1. 어제 일기들 동결: `UPDATE diaries SET is_locked=TRUE WHERE diary_date=어제`
2. 어제 일기를 string_agg로 합치기
3. Groq 호출 → JSON 파싱
4. `composite = M*0.4 + V*0.2 + P*0.2 + A*0.2`
   - `confidence < 0.3`이면 `composite=NULL`, `is_reflected=FALSE`
5. `daily_analyses`에 1행 insert
6. `users.diary_count`가 15의 배수가 됐다면 → `persona_service.reclassify(user_id)` 호출

## AI 호출 가드 패턴

```python
def analyze_day(user_id, diary_date):
    if exists(daily_analyses where user_id=? and diary_date=?):
        return  # 멱등성: 이미 분석된 날 skip
    diaries = fetch_diaries(user_id, diary_date)
    if not diaries: return
    result = groq.analyze(combined_text)
    save_analysis(result)
```

## DB

```sql
CREATE TABLE daily_analyses (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    diary_date      DATE NOT NULL,
    score_m         NUMERIC(3,2) NOT NULL,
    score_v         NUMERIC(3,2) NOT NULL,
    score_p         NUMERIC(3,2) NOT NULL,
    score_a         NUMERIC(3,2) NOT NULL,
    composite_score NUMERIC(3,2),
    confidence      NUMERIC(3,2) NOT NULL,
    evidence_m      TEXT,
    evidence_v      TEXT,
    evidence_p      TEXT,
    evidence_a      TEXT,
    reasoning       TEXT,
    is_reflected    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, diary_date)
);
CREATE INDEX idx_analyses_user_date ON daily_analyses(user_id, diary_date);
```
