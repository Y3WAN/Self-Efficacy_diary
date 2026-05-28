import { useQuery } from "@tanstack/react-query";
import api from "../api/client";
import AppBar from "../components/AppBar";

const VAR_LABEL = { M: "성취경험", V: "대리경험", P: "사회적 설득", A: "정서·신체" };
const VAR_COLOR = { M: "#6C63FF", V: "#43B89C", P: "#F4A261", A: "#E76F51" };

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "방금 전";
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
}

export default function CommunityPage() {
  const { data: feed = [], isLoading } = useQuery({
    queryKey: ["community-feed"],
    queryFn: () => api.get("/api/missions/community/feed").then((r) => r.data),
    refetchInterval: 30000,
  });

  return (
    <div className="community-page">
      <AppBar />
      <main className="community-container">
        <h2 className="community-title">🌍 커뮤니티 미션 피드</h2>
        <p className="community-subtitle">다른 유저들의 미션 완료 기록을 확인하세요</p>

        {isLoading && <p className="community-empty">불러오는 중...</p>}

        {!isLoading && feed.length === 0 && (
          <p className="community-empty">아직 완료된 미션이 없습니다.</p>
        )}

        <ul className="community-feed">
          {feed.map((item) => (
            <li key={item.id} className="community-card">
              <div className="community-card-header">
                <span className="community-time">{timeAgo(item.completed_at)}</span>
              </div>
              <p className="community-content">✅ {item.content}</p>
              <span
                className="community-badge"
                style={{ backgroundColor: VAR_COLOR[item.target_var] }}
              >
                {VAR_LABEL[item.target_var] ?? item.target_var}
              </span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
