import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../api/client";
import AppDialog from "../components/AppDialog";
import SubPageHeader from "../components/SubPageHeader";
import Icon from "../components/Icon";
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
  const [selectedMissionId, setSelectedMissionId] = useState(null);
  const { data: feed = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["community-feed"],
    queryFn: ({ signal }) => api.get("/api/missions/community/feed", { signal }).then((r) => r.data),
    refetchInterval: 30000,
  });
  const author = feed.find((item) => item.id === selectedMissionId);
  const closeProfile = () => setSelectedMissionId(null);

  // 메인 그래프 '응원받은 경험'에서 오면 내가 받은 응원을 강조
  const [params] = useSearchParams();
  const cheerFocus = params.get("focus") === "cheer";
  useEffect(() => {
    if (!cheerFocus || !feed.length) return;
    document.querySelector(".community-card--cheer")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [cheerFocus, feed.length]);
  const refreshFeed = () => queryClient.invalidateQueries({ queryKey: ["community-feed"] });

  const respectMutation = useMutation({
    mutationFn: ({ id, has_respected: undo }) => {
      const path = `/api/missions/community/${id}/respect`;
      return (undo ? api.delete(path) : api.post(path)).then((response) => response.data);
    },
    onSuccess: (reaction, item) => {
      queryClient.setQueryData(["community-feed"], (items) => items?.map((entry) =>
        entry.id === item.id ? {
          ...entry,
          respect_count: reaction.respect_count,
          has_respected: reaction.has_respected ?? !item.has_respected,
        } : entry
      ));
      return refreshFeed();
    },
    onError: (error, item) => {
      if (error.response?.status === 409) return refreshFeed();
      toast.error(item.has_respected ? "응원을 취소하지 못했어요." : "응원을 보내지 못했어요.");
    },
  });

  return (
    <div className="community-page">
      <SubPageHeader title="함께 해낸 미션" />
      <main className="community-container">

        {isLoading && <p className="community-empty">불러오는 중이에요.</p>}
        {isError && <button className="respect-btn" onClick={() => refetch()}>다시 불러오기</button>}
        {!isLoading && !isError && feed.length === 0 && (
          <p className="community-empty">아직 완료된 미션이 없어요.</p>
        )}

        <ul className="community-feed">
          {feed.map((item) => (
            <li key={item.id} className={`community-card${cheerFocus && item.is_own ? " community-card--cheer" : ""}`}>
              <div className="community-card-header">
                {item.is_own ? <strong className="community-author">나</strong> : (
                  <button type="button" className="community-author community-author-link" aria-haspopup="dialog"
                    onClick={() => setSelectedMissionId(item.id)}>
                    {item.display_name ?? "다른 사용자"}
                  </button>
                )}
                <time className="community-time" dateTime={item.completed_at}>{timeAgo(item.completed_at)}</time>
              </div>
              <p className="community-content">{item.content}</p>
              <div className="community-card-footer">
                {item.is_own ? (
                  <span className="community-time">받은 응원 {item.respect_count}개</span>
                ) : (
                  <button
                    className={`respect-btn${item.has_respected ? " respect-btn--done" : ""}`}
                    type="button"
                    aria-pressed={item.has_respected}
                    title={item.has_respected ? "한 번 더 눌러 응원 취소" : undefined}
                    onClick={() => respectMutation.mutate(item)}
                    disabled={respectMutation.isPending}
                  >
                    {item.has_respected ? "응원했어요" : "응원하기"}
                    {item.respect_count > 0 && ` · ${item.respect_count}`}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        {selectedMissionId !== null && (
          <AppDialog title="공개 프로필" onDismiss={closeProfile}>
            <p className="community-profile-name">
              <span className="community-profile-icon"><Icon name="user" /></span>
              <strong>{author?.display_name ?? "다른 사용자"}</strong>
            </p>
            {author?.public_completed_count == null ? (
              <p className="community-profile-unavailable">성공한 미션 수를 지금은 확인할 수 없어요.</p>
            ) : (
              <dl className="community-profile-stat">
                <dt>성공한 미션 수</dt>
                <dd><strong>{author.public_completed_count}개</strong></dd>
              </dl>
            )}
            <div className="app-dialog-actions">
              <button type="button" className="btn btn--primary" onClick={closeProfile}>닫기</button>
            </div>
          </AppDialog>
        )}
      </main>
    </div>
  );
}
