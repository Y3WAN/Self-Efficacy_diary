import Icon from "./Icon";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
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
      <strong>{p.date.slice(5).replace("-", "/")}</strong>
      <p>이날 일기에서 찾은 자신감</p>
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
          <YAxis domain={[0, 1]} tick={false} axisLine={false} width={24} />
          <Tooltip content={<CustomTooltip />} />
          <Scatter name="그날" dataKey="score" fill="var(--text-soft)" />
          <Line
            name="흐름" type="monotone" dataKey="ema" stroke="var(--accent)"
            strokeWidth={2.5} dot={false} activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {data.length > 1 && (
        <p className="elo-calibration">
          {diff >= 3
            ? <><Icon name="sprout" /> {data.length}일 전보다 자신감이 자랐어요.</>
            : diff <= -3
              ? "요즘 조금 지쳤나 봐요. 작은 미션부터 천천히 해 봐요."
              : "요즘 자신감은 비슷하게 이어지고 있어요."}
        </p>
      )}
    </>
  );
}
