# 백엔드 구조

## 디렉토리 구조
```
backend/app/
├── main.py                   # FastAPI 진입점
├── core/
│   ├── config.py             # 환경변수 (DB_URL, GROQ_API_KEY, JWT_SECRET)
│   ├── security.py           # bcrypt, JWT 발급/검증
│   └── deps.py               # get_current_user 의존성
├── db/
│   ├── session.py            # SQLAlchemy 세션
│   └── models.py             # ORM 모델 (5개 테이블)
├── schemas/                  # Pydantic 스키마
│   ├── auth.py, diary.py, analysis.py, persona.py, mission.py
├── api/                      # 라우터
│   ├── auth.py, diary.py, dashboard.py, persona.py, mission.py
├── services/                 # AI 호출 + 비즈니스 로직
│   ├── groq_client.py
│   ├── analysis_service.py
│   ├── persona_service.py
│   └── mission_service.py
└── jobs/                     # APScheduler
    ├── midnight_analysis.py  # 매일 00:05
    └── morning_mission.py    # 매일 07:00
```

## API 전체 목록

| 메서드 | 경로 | 설명 | 인증 |
|--------|------|------|------|
| POST | /api/auth/signup | 회원가입 | X |
| POST | /api/auth/login | 로그인 → JWT | X |
| GET | /api/auth/me | 내 정보 | O |
| GET | /api/diaries?month=YYYY-MM | 월별 날짜 목록 | O |
| GET | /api/diaries/{date} | 날짜별 일기 조회 | O |
| POST | /api/diaries | 일기 작성 | O |
| PATCH | /api/diaries/{id} | 일기 수정 | O |
| GET | /api/dashboard/growth | 주 평균 시계열 | O |
| GET | /api/dashboard/radar | 최근 M/V/P/A | O |
| GET | /api/persona | 페르소나 + 이력 | O |
| GET | /api/missions | 활성 미션 목록 | O |
| POST | /api/missions/{id}/complete | 미션 완료 | O |

## AI 호출 가드 원칙
모든 AI 호출 함수에 적용:
1. 호출 전 DB 확인 → 이미 있으면 skip (멱등성)
2. 없을 때만 Groq 호출
3. 결과 즉시 DB 저장

스케줄러 타임라인:
- `midnight_analysis.py`: 00:05 → 일기 동결 + 자기효능감 분석 + 페르소나 재분류 트리거
- `morning_mission.py`: 07:00 → 미션 슬롯 보충
