import Icon from "../components/Icon";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import client from "../api/client";
import GrowthChart from "../components/GrowthChart";
import EloChart from "../components/EloChart";
import { useConfirmLogout } from "../utils/useConfirmLogout";

export default function ProfilePage() {
  const navigate = useNavigate();
  const confirmLogout = useConfirmLogout();

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
      <div className="diary-header">
        <button onClick={() => navigate(-1)}><Icon name="arrowLeft" /> 뒤로</button>
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
            <span className="profile-label">작성한 일기</span>
            <span className="profile-value">{user.diary_count}개</span>
          </div>
          <div className="profile-row">
            <span className="profile-label">완료한 미션</span>
            <span className="profile-value">{user.completed_missions_count}개</span>
          </div>
        </div>

        <section className="chart-card" aria-labelledby="growth-title">
          <h2 id="growth-title" className="chart-title">자기효능감 성장 그래프</h2>
          <p className="chart-sub">일별 점수와 확신도 가중 EMA 추세선 (AI가 확실한 날일수록 추세를 더 움직여요)</p>
          <GrowthChart />
        </section>

        <section className="chart-card" aria-labelledby="elo-title">
          <h2 id="elo-title" className="chart-title">성장 지수 (ELO)</h2>
          <p className="chart-sub">미션 결과에 따라 다음 미션 난이도가 조절돼요</p>
          <EloChart />
        </section>

        <div className="profile-links">
          <Link to="/prompt" className="main-analysis-link">
            <span><Icon name="pencil" /> 미션 맞춤 설정</span><Icon name="arrowRight" />
          </Link>
          <Link to="/community" className="main-analysis-link">
            <span><Icon name="globe" /> 함께 해낸 미션</span><Icon name="arrowRight" />
          </Link>
        </div>

        <button
          className="profile-logout-btn"
          onClick={confirmLogout}
        >
          <Icon name="logout" /> 로그아웃
        </button>
      </div>
    </div>
  );
}
