# 성장 기록 플랫폼

## 스펙 문서
기능별 상세 스펙은 `spec/` 폴더를 참고한다.

| 파일 | 내용 |
|------|------|
| `spec/overview.md` | 기술 스택, 구현 우선순위, AI 호출 정책, 제약 |
| `spec/auth.md` | 인증 (회원가입/로그인, JWT, users 테이블) |
| `spec/diary.md` | 일기 CRUD + 캘린더 |
| `spec/analysis.md` | 자기효능감 분석 (Bandura 4원천, 자정 배치) |
| `spec/persona.md` | 페르소나 4종 (재분류 로직, 메타데이터) |
| `spec/mission.md` | ZPD 미션 (슬롯 로직, 아침 배치) |
| `spec/dashboard.md` | 대시보드 (성장 그래프, 방사형 차트) |
| `spec/backend.md` | 백엔드 전체 구조 (디렉토리, API 목록) |
| `spec/frontend.md` | 프론트엔드 전체 구조 (라우팅, 상태관리, 디자인) |

---

## 개발 체크포인트

### Phase 1 — 인증 + 일기 CRUD + 캘린더
- [ ] DB 마이그레이션 (users, diaries 테이블)
- [ ] POST /api/auth/signup — 회원가입, initial_grade → current_persona 초기 부여
- [ ] POST /api/auth/login — JWT 발급
- [ ] GET /api/auth/me — 토큰 검증
- [ ] POST /api/diaries — 오늘 날짜로 저장, diary_count 증가
- [ ] PATCH /api/diaries/{id} — is_locked 체크, 당일만 수정
- [ ] GET /api/diaries?month=, GET /api/diaries/{date}
- [ ] 프론트: LoginPage, SignupPage, MainPage, DiaryEditorPage, DiaryCalendar

### Phase 2 — 자기효능감 분석 + 대시보드
- [ ] DB 마이그레이션 (daily_analyses 테이블)
- [ ] 자정 배치 (00:05): 일기 동결 + Groq 분석 + daily_analyses insert
- [ ] confidence < 0.3 처리 (composite=NULL, is_reflected=FALSE)
- [ ] GET /api/dashboard/growth, GET /api/dashboard/radar
- [ ] 프론트: DashboardPage, GrowthChart, RadarChart

### Phase 3 — 페르소나
- [ ] DB 마이그레이션 (persona_history 테이블)
- [ ] 초기 페르소나: 회원가입 시 initial_grade 기반 부여 + persona_history insert
- [ ] 페르소나 재분류: diary_count가 15 배수 도달 시 Groq 호출
- [ ] GET /api/persona
- [ ] 프론트: PersonaPage, AppBar 캐릭터 애니메이션 (4종 모션)

### Phase 4 — ZPD 미션
- [ ] DB 마이그레이션 (missions 테이블)
- [ ] 아침 배치 (07:00): 활성 슬롯 카운트 확인, 3개 미만이면 Groq 호출로 보충
- [ ] GET /api/missions, POST /api/missions/{id}/complete
- [ ] 프론트: MissionList, 완료 버튼

### Phase 5 — 디테일
- [ ] AppBar 애니메이션 완성 (SVG/Lottie)
- [ ] DashboardPage 라인 차트에 페르소나 변경 마커 표시
- [ ] SideBar 슬라이드 인 애니메이션
- [ ] 오류 처리 (토스트, 로딩 스피너)
- [ ] 배치 실패 시 재시도 로직

---

## 테스트 항목

> Claude는 각 Phase 완료 시 아래 항목을 직접 실행하여 확인한다.
> 브라우저 또는 API 클라이언트로 직접 동작을 검증하고, 통과 여부를 보고한다.

### 인증
- 회원가입 → 로그인 → `/api/auth/me` 응답에 `current_persona` 포함 확인
- 잘못된 토큰으로 보호된 API 호출 시 401 반환 확인
- 성적 5단계 외 값 입력 시 422 반환 확인

### 일기
- 일기 작성 후 `diary_count` 증가 확인
- 같은 날 여러 개 작성 가능 확인
- 당일 일기 수정 성공, `is_locked=TRUE`인 일기 수정 시 409 반환 확인
- 캘린더 API: 작성한 날짜가 응답에 포함되는지 확인

### 분석
- 자정 배치 수동 실행 후 `daily_analyses` 행 생성 확인
- `is_reflected=FALSE`인 경우 `composite_score=NULL` 확인
- 같은 날 중복 실행 시 멱등성 확인 (행이 추가되지 않음)

### 페르소나
- 회원가입 직후 `persona_history`에 `source='initial_grade'` 행 존재 확인
- `diary_count`가 15 도달 시 재분류 트리거 확인
- `/api/persona` 응답에 이력 포함 확인

### 미션
- 아침 배치 수동 실행 후 `status='active'` 미션이 최대 3개 생성 확인
- 슬롯이 3개인 상태에서 배치 재실행 시 Groq 호출 없이 skip 확인
- 미션 완료 처리 후 `status='done'` 확인

### 대시보드
- 분석 데이터 없을 때 growth/radar API 빈 배열 반환 (500 아님) 확인
- `is_reflected=FALSE` 데이터가 그래프에서 제외되는지 확인
