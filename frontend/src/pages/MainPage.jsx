import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import DiaryCalendar from "../components/DiaryCalendar";
import MissionList from "../components/MissionList";
import client from "../api/client";

export default function MainPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  const { data: todayDiaries = [] } = useQuery({
    queryKey: ["diaries", today],
    queryFn: () => client.get(`/api/diaries/${today}`).then((r) => r.data),
  });

  return (
    <div className="main-page">
      <AppBar />
      <div className="main-content">
        <DiaryCalendar />
        {todayDiaries.length > 0 && (
          <div className="today-diaries">
            <p className="today-diaries-title">오늘의 일기</p>
            {todayDiaries.map((d) => (
              <div
                key={d.id}
                className="today-diary-item"
                onClick={() => navigate(`/diary/${today}`)}
              >
                <p className="today-diary-content">{d.content}</p>
                <span className="today-diary-time">
                  {new Date(d.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  {d.is_locked && " 🔒"}
                </span>
              </div>
            ))}
          </div>
        )}
        <MissionList />
      </div>
      <button className="fab" onClick={() => navigate(`/diary/${today}`)}>
        ✏️ 오늘 일기 쓰기
      </button>
    </div>
  );
}
