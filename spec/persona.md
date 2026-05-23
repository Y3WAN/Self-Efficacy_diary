# 페르소나

## 기능 명세
- 종류: 당차미(자존감 높은 수재형) / 헤맹이(노력 대비 저효율형) / 멍하미(학습 무기력형) / 지치미(번아웃 위험형)
- 초기 분류: 회원가입 시 입력한 성적 5단계로 1차 페르소나 부여
- 갱신: 일기가 15개 누적될 때마다 AI가 최근 15개 일기를 분석하여 페르소나 재결정
- 페르소나 변경 이력은 DB에 저장

## 백엔드 로직 (`persona_service.reclassify`)
1. 최근 15개 일기를 시간순으로 합쳐 prompt에 주입
2. Groq 호출, 4개 페르소나 중 하나 + 근거 JSON 반환
3. `users.current_persona` 갱신
4. `persona_history`에 `source='ai_reclassify'`로 insert

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/persona | 현재 페르소나 + 설명 + 이력 |

## DB

```sql
CREATE TABLE persona_history (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    persona         VARCHAR(10) NOT NULL
                    CHECK (persona IN ('당차미','헤맹이','멍하미','지치미')),
    source          VARCHAR(20) NOT NULL
                    CHECK (source IN ('initial_grade','ai_reclassify')),
    reasoning       TEXT,
    diary_count_at  INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_persona_user ON persona_history(user_id, created_at DESC);
```

## 프론트엔드

**PersonaPage** (`pages/PersonaPage.jsx`)
- 현재 페르소나의 큰 캐릭터 일러스트
- 설명 텍스트 (PERSONAS 메타데이터)
- 하단에 페르소나 변경 이력 타임라인

**AppBar 애니메이션** (`components/AppBar.jsx`)
- 당차미: 또박또박 걷는 모션 (walk)
- 헤맹이: 갸우뚱하는 모션 (tilt)
- 멍하미: 꾸벅꾸벅 졸기 (doze)
- 지치미: 한숨 쉬기 (sigh)

**메타데이터** (`lib/persona.js`)
```js
export const PERSONAS = {
  당차미: { label:'당차미', tagline:'자존감 높은 수재형', img:'/persona/dangchami.png', motion:'walk' },
  헤맹이: { label:'헤맹이', tagline:'노력 대비 저효율형', img:'/persona/hemaengi.png', motion:'tilt' },
  멍하미: { label:'멍하미', tagline:'학습 무기력형',      img:'/persona/myunghami.png', motion:'doze' },
  지치미: { label:'지치미', tagline:'번아웃 위험형',      img:'/persona/jichimi.png',   motion:'sigh' },
};
```
