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
          <p className="chart-sub">주간 평균 점수</p>
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
        </div>
      </div>
    </div>
  );
}
