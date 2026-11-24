import Icon from "./Icon";
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
    <div className="chart-tooltip">
      <strong>{p.date}</strong>
      <p>그날 점수 {toPct(p.score)}점</p>
      <p><b>흐름 점수 {toPct(p.ema)}점</b></p>
      <p>AI 확신 {toPct(p.confidence)}%</p>
    </div>
  );
};

export default function GrowthChart() {
  const { data = [], isLoading } = useDaily();

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (!data.length) return <div className="chart-empty">아직 분석된 일기가 없어요. 일기를 쓰면 내일 그래프가 생겨요!</div>;

  const first = data[0];
  const last = data[data.length - 1];
  const diff = toPct(last.ema) - toPct(first.ema);

  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
          <XAxis dataKey="date" tick={{ fill: "var(--text-muted)" }} tickFormatter={(v) => v.slice(5).replace("-", "/")} />
          <YAxis domain={[0, 1]} tick={{ fill: "var(--text-muted)" }} tickFormatter={(v) => toPct(v)} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Scatter name="그날 점수" dataKey="score" fill="var(--text-soft)" />
          <Line
            name="변화 흐름" type="monotone" dataKey="ema" stroke="var(--accent)"
            strokeWidth={2.5} dot={false} activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {data.length > 1 && (
        <p className="elo-calibration">
          {data.length}일 동안 변화 {toPct(first.ema)} <Icon name="arrowRight" /> {toPct(last.ema)}점
          {" "}<span className={diff >= 0 ? "elo-up" : "elo-down"}><Icon name={diff >= 0 ? "arrowUp" : "arrowDown"} label={diff >= 0 ? "상승" : "하락"} /> {Math.abs(diff)}</span>
        </p>
      )}
    </>
  );
}
