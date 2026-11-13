import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import DiaryCalendar from "../components/DiaryCalendar";
import MissionList from "../components/MissionList";
import ActivityHistory from "../components/ActivityHistory";
import client from "../api/client";
import { todayKST } from "../utils/date";

function TodayCard({ diaries, today, isPending }) {
  if (isPending) return null;
  const todays = diaries.filter((diary) => diary.diary_date === today);
  const achievements = [...new Set(todays.flatMap((diary) => diary.reflection?.achievements ?? []))];

  if (todays.length === 0) {
    return (
      <Link to={`/diary/${today}`} state={{ fromMain: true }} className="today-card today-card--empty">
        <p className="today-card-title">오늘 있었던 일을 한 줄만 써 보세요</p>
        <p className="today-card-sub">잘 안 된 하루여도 괜찮아요. AI가 그 안에서 오늘 해낸 것을 찾아 드려요.</p>
      </Link>
    );
  }

  return (
    <Link to={`/diary/${today}`} state={{ fromMain: true }} className="today-card">
      <p className="today-card-title">✨ 오늘 해낸 것</p>
      {achievements.length > 0 ? (
        <ul className="reflection-achievements">
          {achievements.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="today-card-sub">일기를 열어 AI 반응을 받아 보세요.</p>
      )}
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
    queryKey: ["missions", "with-history"],
    queryFn: ({ signal }) => client.get("/api/missions", {
      params: { include_history: true }, signal,
    }).then((r) => r.data),
  });
  const missions = [...(missionQuery.data ?? [])].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at) || b.id - a.id
  );
  const hasHistoryError = diaryQuery.isError || missionQuery.isError;

  function retryHistory() {
    if (diaryQuery.isError) diaryQuery.refetch();
    if (missionQuery.isError) missionQuery.refetch();
  }

  return (
    <div className="main-page">
      <AppBar />
      <main className="main-content">
        <TodayCard diaries={diaryQuery.data ?? []} today={today} isPending={diaryQuery.isPending} />
        <MissionList
          missions={missions.filter((mission) => mission.status === "active")}
          isPending={missionQuery.isPending}
          isError={missionQuery.isError}
          onRetry={missionQuery.refetch}
        />
        <DiaryCalendar />
        <Link to="/analysis" className="main-analysis-link">
          <span>일기 분석 근거 보기</span>
          <span aria-hidden="true">→</span>
        </Link>
        <ActivityHistory
          diaries={diaryQuery.data ?? []}
          missions={missions.filter((mission) => mission.status !== "active")}
          isPending={diaryQuery.isPending || missionQuery.isPending}
          onRetry={hasHistoryError ? retryHistory : undefined}
        />
      </main>
      <Link className="fab" to={`/diary/${today}`} state={{ fromMain: true }}>
        ✏️ 오늘 일기 쓰기
      </Link>
    </div>
  );
}
