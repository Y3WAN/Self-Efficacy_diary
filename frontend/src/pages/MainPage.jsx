import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import DiaryCalendar from "../components/DiaryCalendar";
import MissionList from "../components/MissionList";
import ActivityHistory from "../components/ActivityHistory";
import client from "../api/client";
import { todayKST } from "../utils/date";

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
        <DiaryCalendar />
        <Link to="/analysis" className="main-analysis-link">
          <span>일기 분석 근거 보기</span>
          <span aria-hidden="true">→</span>
        </Link>
        <MissionList
          missions={missions.filter((mission) => mission.status === "active")}
          isPending={missionQuery.isPending}
          isError={missionQuery.isError}
          onRetry={missionQuery.refetch}
        />
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
