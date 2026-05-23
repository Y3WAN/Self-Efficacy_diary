# 인증

## 기능 명세
- 로그인 / 회원가입
- 회원가입 입력 항목: 아이디, 비밀번호, 성적 5단계 (상/중상/중/중하/하)
- 성적은 초기 페르소나 1차 분류의 입력값으로 사용

## API 엔드포인트

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | /api/auth/signup | 회원가입 (username, password, initial_grade) | X |
| POST | /api/auth/login | 로그인 → JWT 발급 | X |
| GET | /api/auth/me | 내 정보 (현재 페르소나 포함) | O |

## 백엔드
- JWT access token만 사용, 24h 유효
- 비밀번호: bcrypt 해시
- `Authorization: Bearer <token>` 헤더 검증 → `get_current_user` 의존성
- 관련 파일: `core/security.py`, `core/deps.py`, `api/auth.py`

## DB

```sql
CREATE TABLE users (
    id              BIGSERIAL PRIMARY KEY,
    username        VARCHAR(50) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    initial_grade   VARCHAR(4) NOT NULL
                    CHECK (initial_grade IN ('상','중상','중','중하','하')),
    current_persona VARCHAR(10) NOT NULL
                    CHECK (current_persona IN ('당차미','헤맹이','멍하미','지치미')),
    diary_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 프론트엔드
- LoginPage / SignupPage: 셋로그 스타일의 미니멀 폼
- SignupPage에 성적 5단계 라디오 버튼 (상/중상/중/중하/하)
- 로그인 성공 시 JWT 저장, 홈으로 이동
- 전역 상태: 인증 토큰, username, current_persona → Zustand (`store/auth.js`)
- 비인증 사용자가 `/`로 접근하면 `/login`으로 리디렉트
- 라우트: `/login` → LoginPage, `/signup` → SignupPage
