# 대시보드

## 기능 명세
- 자기효능감 성장 그래프: 주 평균 단위로 시계열 표시
- 4원천 방사형 그래프: 최근 M, V, P, A 점수를 방사형 차트로 표시
- 사이드바에서 접근

## API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /api/dashboard/growth | 주 평균 자기효능감 시계열 |
| GET | /api/dashboard/radar | 최근 M/V/P/A 점수 |

## DB 쿼리

**주 평균 자기효능감 (성장 그래프)**
```sql
SELECT
  date_trunc('week', diary_date) AS week,
  AVG(composite_score) AS avg_score
FROM daily_analyses
WHERE user_id = $1 AND is_reflected = TRUE
GROUP BY week
ORDER BY week;
```

**최근 분석 1건 (방사형 그래프)**
```sql
SELECT score_m, score_v, score_p, score_a
FROM daily_analyses
WHERE user_id = $1 AND is_reflected = TRUE
ORDER BY diary_date DESC LIMIT 1;
```

## 프론트엔드

**DashboardPage** (`pages/DashboardPage.jsx`)
- 상단: 주 평균 자기효능감 라인 차트 (recharts LineChart)
- 하단: 4원천 방사형 차트 (recharts RadarChart, M/V/P/A 4축)
- 페르소나 변경 이력이 있으면 라인 차트에 마커 표시

**GrowthChart** (`components/GrowthChart.jsx`)
- `useGrowth()`: `/api/dashboard/growth` 조회
- recharts LineChart 사용

**RadarChart** (`components/RadarChart.jsx`)
- `useRadar()`: `/api/dashboard/radar` 조회
- recharts RadarChart 사용
