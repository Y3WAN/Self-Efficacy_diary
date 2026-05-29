import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { useAuthStore } from "../store/auth";

export default function ProfilePage() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState("info");

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => client.get("/api/auth/me").then((r) => r.data),
  });

  const { data: failureLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: ["failure-logs"],
    queryFn: () => client.get("/api/failure-logs").then((r) => r.data),
    enabled: activeTab === "failures",
  });

  if (userLoading) return <div className="page-loading">불러오는 중…</div>;

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

      <div className="profile-tabs">
        <button
          className={`profile-tab ${activeTab === "info" ? "profile-tab--active" : ""}`}
          onClick={() => setActiveTab("info")}
        >
          내 정보
        </button>
        <button
          className={`profile-tab ${activeTab === "failures" ? "profile-tab--active" : ""}`}
          onClick={() => setActiveTab("failures")}
        >
          실패 로그
        </button>
      </div>

      {activeTab === "info" && (
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
              <span className="profile-label">작성한 일기</span>
              <span className="profile-value">{user.diary_count}개</span>
            </div>
            <div className="profile-row">
              <span className="profile-label">완료한 미션</span>
              <span className="profile-value">{user.completed_missions_count}개</span>
            </div>
            <div className="profile-row profile-row--points">
              <span className="profile-label">포인트</span>
              <span className="profile-value profile-points">
                {(user.points ?? 0).toLocaleString()} P
              </span>
            </div>
          </div>

          <button
            className="profile-logout-btn"
            onClick={() => { logout(); navigate("/login"); }}
          >
            🚪 로그아웃
          </button>
        </div>
      )}

      {activeTab === "failures" && (
        <div className="profile-content">
          {logsLoading ? (
            <div className="page-loading">불러오는 중…</div>
          ) : failureLogs.length === 0 ? (
            <div className="failure-log-empty">
              <span className="failure-log-empty-icon">🏆</span>
              <p>기록된 실패가 없어요.</p>
              <p className="failure-log-empty-sub">실패도 성장의 발판이에요. 솔직하게 기록해보세요!</p>
            </div>
          ) : (
            <ul className="failure-log-list">
              {failureLogs.map((log) => (
                <li key={log.id} className="failure-log-item">
                  <div className="failure-log-date">
                    {new Date(log.diary_date).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    <span className="failure-log-badge">+25P</span>
                  </div>
                  <p className="failure-log-summary">{log.failure_summary}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
