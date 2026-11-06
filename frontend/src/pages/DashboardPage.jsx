import { Link } from "react-router-dom";
import AppBar from "../components/AppBar";
import GrowthChart from "../components/GrowthChart";
import RadarChartComponent from "../components/RadarChartComponent";
import EloChart from "../components/EloChart";

export default function DashboardPage() {
  return (
    <div className="main-page">
      <AppBar />
      <div className="main-content">
        <div className="chart-card">
          <h3 className="chart-title">자기효능감 성장 그래프</h3>
          <p className="chart-sub">일별 점수와 지수이동평균(EMA, α=0.3) 추세선</p>
          <GrowthChart />
        </div>
        <div className="chart-card">
          <h3 className="chart-title">성장 지수 (ELO)</h3>
          <p className="chart-sub">미션 결과에 따라 다음 미션 난이도가 조절돼요</p>
          <EloChart />
        </div>
        <div className="chart-card">
          <h3 className="chart-title">4원천 분석</h3>
          <p className="chart-sub">최근 분석 기준</p>
          <RadarChartComponent />
          <Link to="/analysis" className="chart-link">AI가 왜 이렇게 판단했는지 보기 →</Link>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">미션 비교 실험</h3>
          <Link to="/mission-experiment" className="chart-link">Elo나 4원천 점수를 바꿔 비교하기 →</Link>
        </div>
        <p className="notice-text">
          점수는 AI의 추정이며 심리 진단이 아니에요. <Link to="/about">안내·출처</Link>
        </p>
      </div>
    </div>
  );
}
