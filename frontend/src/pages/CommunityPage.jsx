import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import AppBar from "../components/AppBar";
import toast from "react-hot-toast";

function timeAgo(dateStr) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "방금 전";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}분 전`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}시간 전`;
  return `${Math.floor(seconds / 86400)}일 전`;
}

export default function CommunityPage() {
  const queryClient = useQueryClient();
  const { data: feed = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["community-feed"],
    queryFn: ({ signal }) => api.get("/api/missions/community/feed", { signal }).then((r) => r.data),
    refetchInterval: 30000,
  });
  const refreshFeed = () => queryClient.invalidateQueries({ queryKey: ["community-feed"] });

  const respectMutation = useMutation({
    mutationFn: (missionId) => api.post(`/api/missions/community/${missionId}/respect`),
    onSuccess: refreshFeed,
    onError: (error) => {
      if (error.response?.status === 409) {
        toast.error("이미 응원한 미션이에요.");
        return refreshFeed();
      }
      toast.error("응원을 보내지 못했어요.");
    },
  });

  return (
    <div className="community-page">
      <AppBar />
      <main className="community-container">
        <h2 className="community-title">함께 해낸 미션</h2>
        <p className="community-subtitle">서로의 실천을 보고 응원을 보내요.</p>

        {isLoading && <p className="community-empty">불러오는 중이에요.</p>}
        {isError && <button className="respect-btn" onClick={() => refetch()}>다시 불러오기</button>}
        {!isLoading && !isError && feed.length === 0 && (
          <p className="community-empty">아직 완료된 미션이 없어요.</p>
        )}

        <ul className="community-feed">
          {feed.map((item) => (
            <li key={item.id} className="community-card">
              <div className="community-card-header">
                <strong className="community-author">{item.is_own ? "나" : item.display_name ?? "다른 사용자"}</strong>
                <time className="community-time" dateTime={item.completed_at}>{timeAgo(item.completed_at)}</time>
              </div>
              <p className="community-content">{item.content}</p>
              <div className="community-card-footer">
                {item.is_own ? (
                  <span className="community-time">받은 응원 {item.respect_count}개</span>
                ) : (
                  <button
                    className={`respect-btn${item.has_respected ? " respect-btn--done" : ""}`}
                    onClick={() => respectMutation.mutate(item.id)}
                    disabled={item.has_respected || respectMutation.isPending}
                  >
                    {item.has_respected ? "응원했어요" : "응원하기"}
                    {item.respect_count > 0 && ` · ${item.respect_count}`}
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
