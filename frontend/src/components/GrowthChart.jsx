import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";

function useGrowth() {
  return useQuery({
    queryKey: ["dashboard", "growth"],
    queryFn: () => client.get("/api/dashboard/growth").then((r) => r.data),
  });
}

function usePersonaHistory() {
  return useQuery({
    queryKey: ["persona"],
    queryFn: () => client.get("/api/persona").then((r) => r.data),
  });
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#fff", border: "1px solid #E5DDD4",
      borderRadius: 10, padding: "8px 12px", fontSize: 13,
    }}>
      <p style={{ color: "#8C7B70", marginBottom: 2 }}>{label} 주</p>
      <p style={{ color: "#F4A261", fontWeight: 700 }}>
        {(payload[0].value * 100).toFixed(0)}점
      </p>
    </div>
  );
};

export default function GrowthChart() {
  const { data: growth = [], isLoading } = useGrowth();
  const { data: personaData } = usePersonaHistory();

  const changeWeeks = new Set(
    (personaData?.history ?? [])
      .filter((h) => h.source === "ai_reclassify")
      .map((h) => h.created_at?.slice(0, 10))
  );

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (!growth.length) return <div className="chart-empty">아직 분석 데이터가 없어요. 일기를 쓰면 내일 그래프가 생겨요!</div>;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={growth} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD4" />
        <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#8C7B70" }} tickFormatter={(v) => v.slice(5)} />
        <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: "#8C7B70" }} tickFormatter={(v) => `${(v * 100).toFixed(0)}`} />
        <Tooltip content={<CustomTooltip />} />
        {[...changeWeeks].map((w) => (
          <ReferenceLine key={w} x={w} stroke="#7A9E7E" strokeDasharray="4 2"
            label={{ value: "페르소나 변경", position: "top", fontSize: 9, fill: "#7A9E7E" }} />
        ))}
        <Line
          type="monotone" dataKey="avg_score" stroke="#F4A261"
          strokeWidth={2.5} dot={{ r: 4, fill: "#F4A261" }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
