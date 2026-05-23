import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";

function useRadar() {
  return useQuery({
    queryKey: ["dashboard", "radar"],
    queryFn: () => client.get("/api/dashboard/radar").then((r) => r.data),
  });
}

export default function RadarChartComponent() {
  const { data: radar, isLoading } = useRadar();

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (!radar) return <div className="chart-empty">최근 분석 데이터가 없어요.</div>;

  const chartData = [
    { subject: "성취(M)", score: radar.score_m },
    { subject: "대리(V)", score: radar.score_v },
    { subject: "지지(P)", score: radar.score_p },
    { subject: "정서(A)", score: radar.score_a },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <RadarChart data={chartData}>
        <PolarGrid stroke="#EDE8E1" />
        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 12, fill: "#9E9189" }} />
        <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
        <Radar
          dataKey="score" stroke="#F5A65B" fill="#F5A65B"
          fillOpacity={0.25} strokeWidth={2}
        />
        <Tooltip
          formatter={(v) => [`${(v * 100).toFixed(0)}점`, "점수"]}
          contentStyle={{ borderRadius: 10, border: "1px solid #EDE8E1", fontSize: 13 }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
