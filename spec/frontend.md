# 프론트엔드 구조

## 디렉토리 구조
```
frontend/src/
├── main.jsx
├── App.jsx                 # 라우터 + 인증 가드
├── api/
│   └── client.js           # axios (JWT 헤더 자동 부착)
├── store/
│   └── auth.js             # Zustand: 토큰, username, current_persona
├── pages/
│   ├── LoginPage.jsx
│   ├── SignupPage.jsx
│   ├── MainPage.jsx        # 캘린더 + 미션
│   ├── DiaryEditorPage.jsx
│   ├── DashboardPage.jsx
│   └── PersonaPage.jsx
├── components/
│   ├── AppBar.jsx          # 페르소나 캐릭터 애니메이션
│   ├── SideBar.jsx
│   ├── DiaryCalendar.jsx
│   ├── MissionList.jsx
│   ├── GrowthChart.jsx     # recharts LineChart
│   └── RadarChart.jsx      # recharts RadarChart
└── lib/
    └── persona.js          # 페르소나 메타데이터
```

## 라우팅
```
/login        → LoginPage
/signup       → SignupPage
/             → MainPage           (인증 필요)
/diary/new    → DiaryEditorPage    (오늘 작성)
/diary/:date  → DiaryEditorPage    (조회/수정)
/dashboard    → DashboardPage      (인증 필요)
/persona      → PersonaPage        (인증 필요)
```

## 상태 관리

| 구분 | 도구 | 대상 |
|------|------|------|
| 전역 | Zustand | 인증 토큰, username, current_persona |
| 서버 | React Query | API 응답 캐싱 |

React Query 훅:
- `useMonthDiaries(month)` — 캘린더용
- `useGrowth()`, `useRadar()` — 대시보드용
- `useMissions()` — 메인 페이지용
- `useMe()` — AppBar 페르소나용

## 메인 페이지 레이아웃
- AppBar (top): 우측에 페르소나 캐릭터 SVG/Lottie 애니메이션
- 좌상단: 햄버거 버튼 → SideBar 토글
- 본문 상단: DiaryCalendar
- 본문 하단: MissionList
- 우하단 FAB: "오늘 일기 쓰기" → `/diary/new`

## SideBar
- 메뉴: 대시보드 / 페르소나 / 로그아웃
- 오버레이 + 좌측 슬라이드 인 애니메이션

## 디자인 토큰 (셋로그 스타일)

| 항목 | 값 |
|------|----|
| 배경 | `#FAF7F2` (미색/아이보리) |
| 포인트1 | `#F5A65B` (따뜻한 오렌지) |
| 포인트2 | `#A8C97F` (연두) |
| 텍스트 | `#3A332E` (진한 회갈색) |
| 폰트 | Pretendard |
| 카드 | `border-radius: 16px`, 약한 그림자, 일러스트 위주 |
