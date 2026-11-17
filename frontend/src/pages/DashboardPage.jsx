import Icon from "../components/Icon";
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
          <p className="chart-sub">일별 점수와 확신도 가중 EMA 추세선 (AI가 확실한 날일수록 추세를 더 움직여요)</p>
          <GrowthChart />
        </div>
        <div className="chart-card">
          <h3 className="chart-title">성장 지수 (ELO)</h3>
          <p className="chart-sub">미션 결과에 따라 다음 미션 난이도가 조절돼요</p>
          <EloChart />
        </div>
        <div className="chart-card">
          <h3 className="chart-title">4원천 분석</h3>
          <p className="chart-sub">최근 7일 추세 · 일기에 근거가 있었던 날만 반영 · 미션 대상 선택에 쓰여요</p>
          <RadarChartComponent />
          <Link to="/analysis" className="chart-link">AI가 왜 이렇게 판단했는지 보기 <Icon name="arrowRight" /></Link>
        </div>
        <div className="chart-card">
          <h3 className="chart-title">미션 비교 실험</h3>
          <Link to="/mission-experiment" className="chart-link">Elo나 4원천 점수를 바꿔 비교하기 <Icon name="arrowRight" /></Link>
        </div>
        <p className="notice-text">
          점수는 AI의 추정이며 심리 진단이 아니에요. <Link to="/about">안내·출처</Link>
        </p>
      </div>
    </div>
  );
}
