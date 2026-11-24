import Icon from "../components/Icon";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import MissionList from "../components/MissionList";
import ActivityHistory from "../components/ActivityHistory";
import RadarChartComponent from "../components/RadarChartComponent";
import client from "../api/client";
import { todayKST } from "../utils/date";

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
      ) : (
        <p className="today-card-sub">
          {hasDiaries ? "일기를 열어 AI 반응을 받아 보세요." : "잘 안 된 하루여도 괜찮아요. AI가 그 안에서 오늘 해낸 것을 찾아 드려요."}
        </p>
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
          <h2 id="main-radar-title" className="chart-title">나의 자신감 4가지 원천</h2>
          <p className="chart-sub">최근 7일 추세 · 일기에 근거가 있었던 날만 반영 · 미션 대상 선택에 쓰여요</p>
          <RadarChartComponent />
          <Link to="/analysis" className="chart-link">AI가 왜 이렇게 판단했는지 보기 <Icon name="arrowRight" /></Link>
          <p className="notice-text">점수는 AI의 추정이며 심리 진단이 아니에요. <Link to="/about">안내·출처</Link></p>
        </section>
      </main>
    </div>
  );
}
