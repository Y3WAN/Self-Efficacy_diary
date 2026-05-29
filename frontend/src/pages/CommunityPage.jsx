import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import AppBar from "../components/AppBar";
import toast from "react-hot-toast";

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
  const queryClient = useQueryClient();

  const { data: feed = [], isLoading } = useQuery({
    queryKey: ["community-feed"],
    queryFn: () => api.get("/api/missions/community/feed").then((r) => r.data),
    refetchInterval: 30000,
  });

  const respectMutation = useMutation({
    mutationFn: (missionId) =>
      api.post(`/api/missions/community/${missionId}/respect`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["community-feed"] });
    },
    onError: (err) => {
      if (err.response?.status === 409) {
        toast.error("이미 리스펙한 미션입니다.");
      } else {
        toast.error("오류가 발생했습니다.");
      }
    },
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
              <div className="community-card-footer">
                <span
                  className="community-badge"
                  style={{ backgroundColor: VAR_COLOR[item.target_var] }}
                >
                  {VAR_LABEL[item.target_var] ?? item.target_var}
                </span>
                {!item.is_own && (
                  <button
                    className={`respect-btn${item.has_respected ? " respect-btn--done" : ""}`}
                    onClick={() => {
                      if (!item.has_respected) respectMutation.mutate(item.id);
                    }}
                    disabled={item.has_respected || respectMutation.isPending}
                    title={item.has_respected ? "이미 리스펙했습니다" : "리스펙하기 (+5 포인트)"}
                  >
                    👊 {item.respect_count > 0 ? item.respect_count : ""}
                    {item.has_respected ? " 리스펙됨" : " 리스펙"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
