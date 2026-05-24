import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuthStore } from "../store/auth";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => client.get("/api/auth/me").then((r) => r.data),
  });

  if (isLoading) return <div className="page-loading">불러오는 중…</div>;

  const joinDate = new Date(user.created_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="profile-page">
      <div className="diary-header">
        <button onClick={() => navigate(-1)}>← 뒤로</button>
        <h2>내 정보</h2>
      </div>

      <div className="profile-content">
        <div className="profile-info-card">
          <div className="profile-row">
            <span className="profile-label">아이디</span>
            <span className="profile-value">{user.username}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">가입일</span>
            <span className="profile-value">{joinDate}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">초기 성적</span>
            <span className="profile-value">{user.initial_grade}</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">작성한 일기</span>
            <span className="profile-value">{user.diary_count}개</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">완료한 미션</span>
            <span className="profile-value">{user.completed_missions_count}개</span>
          </div>
        </div>

        <button
          className="profile-logout-btn"
          onClick={() => { logout(); navigate("/login"); }}
        >
          🚪 로그아웃
        </button>
      </div>
    </div>
  );
}
