import { useRef, useState } from "react";
import AppBar from "../components/AppBar";
import AppDialog from "../components/AppDialog";
import Icon from "../components/Icon";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";
import GrowthChart from "../components/GrowthChart";
import MissionStack from "../components/MissionStack";
import { useConfirmLogout } from "../utils/useConfirmLogout";

export default function ProfilePage() {
  const logout = useConfirmLogout();
  const [filter, setFilter] = useState("all");
  const shelfHeading = useRef(null);
  const stackQuery = useQuery({
    queryKey: ["mission-stack"],
    queryFn: ({ signal }) => client.get("/api/missions/stack", { signal }).then((r) => r.data),
  });

  function openCompletedMissions() {
    setFilter("done");
    shelfHeading.current?.focus({ preventScroll: true });
    shelfHeading.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      block: "start",
    });
  }

  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: () => client.get("/api/auth/me").then((r) => r.data),
  });

  if (isLoading) return <div className="page-loading">불러오는 중…</div>;
  if (!user) return <div className="page-loading">정보를 불러오지 못했어요.</div>;

  const joinDate = new Date(user.created_at).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="profile-page">
      <AppBar />
      <main className="profile-content">
        <header className="page-heading">
          <h1>내 정보</h1>
        </header>
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
          <button type="button" className="profile-row profile-mission-row"
            aria-controls="mission-bookshelf" onClick={openCompletedMissions}>
            <span className="profile-label">지금까지 쌓은 미션</span>
            <span className="profile-value">
              {stackQuery.data && <strong>{stackQuery.data.done_count}개</strong>}
              <Icon name="chevronRight" />
            </span>
          </button>
        </div>

        <section className="chart-card" aria-labelledby="growth-title">
          <h2 id="growth-title" className="chart-title">자기효능감 흐름</h2>
          <GrowthChart />
        </section>

        <MissionStack query={stackQuery} filter={filter} onFilterChange={setFilter} headingRef={shelfHeading} />

        <button type="button" className="profile-logout-btn" onClick={logout.open}>
          <Icon name="logout" /> 로그아웃
        </button>
        {logout.isOpen && (
          <AppDialog title="로그아웃할까요?" onDismiss={logout.cancel} busy={logout.isPending}>
            {logout.error && <p className="app-dialog-error" role="alert">{logout.error}</p>}
            <div className="app-dialog-actions">
              <button type="button" className="btn" onClick={logout.cancel} disabled={logout.isPending}>취소</button>
              <button type="button" className="btn btn--primary" onClick={logout.confirm} disabled={logout.isPending}>
                {logout.isPending ? "로그아웃 중…" : "로그아웃"}
              </button>
            </div>
          </AppDialog>
        )}
      </main>
    </div>
  );
}
