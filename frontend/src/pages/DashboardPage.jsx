import AppBar from "../components/AppBar";
import GrowthChart from "../components/GrowthChart";
import RadarChartComponent from "../components/RadarChartComponent";

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
          <h3 className="chart-title">4원천 분석</h3>
          <p className="chart-sub">최근 분석 기준</p>
          <RadarChartComponent />
        </div>
      </div>
    </div>
  );
}
