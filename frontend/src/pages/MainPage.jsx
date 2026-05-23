import { useNavigate } from "react-router-dom";
import AppBar from "../components/AppBar";
import DiaryCalendar from "../components/DiaryCalendar";
import MissionList from "../components/MissionList";

export default function MainPage() {
  const navigate = useNavigate();
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="main-page">
      <AppBar />
      <div className="main-content">
        <DiaryCalendar />
        <MissionList />
      </div>
      <button className="fab" onClick={() => navigate(`/diary/${today}`)}>
        ✏️ 오늘 일기 쓰기
      </button>
    </div>
  );
}
