import Icon from "../components/Icon";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import MissionList from "../components/MissionList";
import ActivityHistory from "../components/ActivityHistory";
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
        <Link to="/analysis" className="main-analysis-link">
          <span>일기 분석 근거 보기</span>
          <Icon name="arrowRight" />
        </Link>
      </main>
    </div>
  );
}
