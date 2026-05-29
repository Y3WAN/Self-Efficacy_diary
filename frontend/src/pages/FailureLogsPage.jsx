import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import client from "../api/client";

export default function FailureLogsPage() {
  const navigate = useNavigate();

  const { data: failureLogs = [], isLoading } = useQuery({
    queryKey: ["failure-logs"],
    queryFn: () => client.get("/api/failure-logs").then((r) => r.data),
  });

  return (
    <div className="failure-logs-page">
      <div className="diary-header">
        <button onClick={() => navigate(-1)}>← 뒤로</button>
        <h2>실패 로그</h2>
      </div>

      <div className="profile-content">
        {isLoading ? (
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
    </div>
  );
}
