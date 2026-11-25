import Icon from "../components/Icon";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import MissionList from "../components/MissionList";
import ActivityHistory from "../components/ActivityHistory";
import client from "../api/client";
import { todayKST } from "../utils/date";
import { lazy, Suspense } from "react";

// 차트 라이브러리가 커서, 위쪽 카드가 먼저 보이도록 차트는 따로 불러온다
const RadarChartComponent = lazy(() => import("../components/RadarChartComponent"));

function TodayCard({ diaries, today, isPending }) {
  if (isPending) return null;
  const todays = diaries.filter((diary) => diary.diary_date === today);
  const hasDiaries = todays.length > 0;
  const achievements = [...new Set(todays.flatMap((diary) => diary.reflection?.achievements ?? []))];

  return (
    <Link
      to={`/diary/${today}`}
      state={{ fromMain: true }}
      data-ripple-navigation
      className={hasDiaries ? "today-card" : "today-card today-card--empty"}
    >
      {hasDiaries ? (
        <p className="today-card-title"><Icon name="sparkle" /> 오늘 해낸 것</p>
      ) : (
        <p className="today-card-sub today-card-prompt">오늘 있었던 일을 한 줄만 써 보세요</p>
      )}
      {achievements.length > 0 ? (
        <ul className="reflection-achievements">
          {achievements.map((item) => <li key={item}><Icon name="check" /> {item}</li>)}
        </ul>
      ) : hasDiaries && (
        <p className="today-card-sub">아직 해낸 것을 찾지 않았어요.</p>
      )}
      <span className="today-card-action">
        {hasDiaries ? "오늘 일기 열기" : "오늘 일기 쓰기"} <Icon name="arrowRight" />
      </span>
    </Link>
  );
}

export default function MainPage() {
  const today = todayKST();
  const diaryQuery = useQuery({
    queryKey: ["diaries", "recent"],
    queryFn: ({ signal }) => client.get("/api/diaries/recent", { signal }).then((r) => r.data),
  });
  const missionQuery = useQuery({
    queryKey: ["missions", "active"],
    queryFn: ({ signal }) => client.get("/api/missions", { signal }).then((r) => r.data),
  });
  const missions = [...(missionQuery.data ?? [])].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at) || b.id - a.id
  );
  return (
    <div className="main-page">
      <AppBar />
      <main className="main-content main-content--home">
        <header className="page-heading">
          <h1>오늘의 기록</h1>
        </header>
        <TodayCard diaries={diaryQuery.data ?? []} today={today} isPending={diaryQuery.isPending} />
        <MissionList
          missions={missions}
          isPending={missionQuery.isPending}
          isError={missionQuery.isError}
          onRetry={missionQuery.refetch}
        />
        <ActivityHistory today={today} />
        <section className="chart-card main-radar" aria-labelledby="main-radar-title">
          <h2 id="main-radar-title" className="chart-title">자기효능감</h2>
          <p className="chart-sub">자기효능감은 '나는 해낼 수 있어' 하고 나를 믿는 마음이에요. 최근 7일 일기를 보고 네 가지로 나눠 보여 줘요.</p>
          <Suspense fallback={<p className="chart-sub">차트를 불러오는 중…</p>}>
            <RadarChartComponent />
          </Suspense>
          <Link to="/analysis" className="chart-link">AI가 일기에서 찾은 문장 보기 <Icon name="arrowRight" /></Link>
        </section>
      </main>
    </div>
  );
}
