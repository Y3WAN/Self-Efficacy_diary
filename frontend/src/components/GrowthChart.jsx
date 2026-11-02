import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";

function useDaily() {
  return useQuery({
    queryKey: ["dashboard", "daily"],
    queryFn: () => client.get("/api/dashboard/daily").then((r) => r.data),
  });
}

const toPct = (v) => Math.round(v * 100);

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: "#fff", border: "1px solid #E5DDD4",
      borderRadius: 10, padding: "8px 12px", fontSize: 13, lineHeight: 1.6,
    }}>
      <p style={{ color: "#8C7B70" }}>{p.date}</p>
      <p style={{ color: "#B4A89E" }}>그날 점수 {toPct(p.score)}점</p>
      <p style={{ color: "#F4A261", fontWeight: 700 }}>추세(EMA) {toPct(p.ema)}점</p>
      <p style={{ color: "#8C7B70", fontSize: 11 }}>AI 확신도 {toPct(p.confidence)}%</p>
    </div>
  );
};

export default function GrowthChart() {
  const { data = [], isLoading } = useDaily();

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (!data.length) return <div className="chart-empty">아직 분석 데이터가 없어요. 일기를 쓰면 내일 그래프가 생겨요!</div>;

  const first = data[0];
  const last = data[data.length - 1];
  const diff = toPct(last.ema) - toPct(first.ema);

  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD4" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#8C7B70" }} tickFormatter={(v) => v.slice(5).replace("-", "/")} />
          <YAxis domain={[0, 1]} tick={{ fontSize: 11, fill: "#8C7B70" }} tickFormatter={(v) => toPct(v)} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Scatter name="그날 점수" dataKey="score" fill="#B4A89E" />
          <Line
            name="추세선(EMA)" type="monotone" dataKey="ema" stroke="#F4A261"
            strokeWidth={2.5} dot={false} activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {data.length > 1 && (
        <p className="elo-calibration">
          {data.length}일 동안 추세 {toPct(first.ema)} → {toPct(last.ema)}점
          {" "}<span className={diff >= 0 ? "elo-up" : "elo-down"}>{diff >= 0 ? `▲${diff}` : `▼${-diff}`}</span>
        </p>
      )}
    </>
  );
}
