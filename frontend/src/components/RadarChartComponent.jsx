import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";

const SOURCE_DESC = {
  "성취(M)": { label: "성취경험(M)", desc: "과제를 직접 수행하고 성공했던 경험" },
  "대리(V)": { label: "대리경험(V)", desc: "나와 비슷한 사람이 해내는 걸 보며 자극받은 경험" },
  "지지(P)": { label: "사회적 설득(P)", desc: "주변에서 '넌 할 수 있어'라는 격려와 지지를 받은 경험" },
  "정서(A)": { label: "정서·신체(A)", desc: "감정이 안정되고 몸 컨디션이 좋았던 상태" },
};

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const subject = payload[0]?.payload?.subject;
  const score = payload[0]?.value;
  const info = SOURCE_DESC[subject];
  if (!info) return null;

  return (
    <div style={{
      background: "#fff", border: "1px solid #EDE8E1", borderRadius: 12,
      padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
      boxShadow: "0 2px 12px rgba(0,0,0,0.08)", maxWidth: 220,
    }}>
      <div style={{ fontWeight: 700, color: "#3A332E", marginBottom: 3 }}>
        {info.label} — {(score * 100).toFixed(0)}점
      </div>
      <div style={{ color: "#9E9189", fontSize: 12 }}>{info.desc}</div>
    </div>
  );
}

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
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
