import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";

function useElo() {
  return useQuery({
    queryKey: ["dashboard", "elo"],
    queryFn: () => client.get("/api/dashboard/elo").then((r) => r.data),
  });
}

const pct = (v) => `${Math.round(v * 100)}%`;

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{
      background: "#fff", border: "1px solid #E5DDD4",
      borderRadius: 10, padding: "8px 12px", fontSize: 13,
    }}>
      <p style={{ color: "#8C7B70", marginBottom: 2 }}>
        {p.result ? "완료" : "포기·만료"} · 예상 성공률 {pct(p.expected)}
      </p>
      <p style={{ color: "#F4A261", fontWeight: 700 }}>{p.rating}</p>
    </div>
  );
};

export default function EloChart() {
  const { data, isLoading } = useElo();

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (!data) return null;

  const points = [{ idx: 0, rating: 1000, result: 1, expected: 0.5 }, ...data.history.map((h, i) => ({ ...h, idx: i + 1 }))];

  return (
    <>
      <div className="elo-stats">
        <div className="elo-stat">
          <span className="elo-stat-value">{data.rating}</span>
          <span className="elo-stat-label">현재 성장 지수</span>
        </div>
        <div className="elo-stat">
          <span className="elo-stat-value">Lv{data.next_level}</span>
          <span className="elo-stat-label">다음 미션 난이도</span>
        </div>
        <div className="elo-stat">
          <span className="elo-stat-value">{pct(data.next_expected)}</span>
          <span className="elo-stat-label">예상 성공률</span>
        </div>
      </div>
      {data.games === 0 ? (
        <div className="chart-empty">미션을 완료하면 성장 지수가 기록돼요!</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5DDD4" />
              <XAxis dataKey="idx" tick={{ fontSize: 11, fill: "#8C7B70" }} />
              <YAxis domain={["dataMin - 30", "dataMax + 30"]} tick={{ fontSize: 11, fill: "#8C7B70" }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone" dataKey="rating" stroke="#F4A261"
                strokeWidth={2.5} dot={{ r: 3, fill: "#F4A261" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="elo-calibration">
            미션 {data.games}개 · 예측 성공률 {pct(data.avg_expected)} / 실제 성공률 {pct(data.actual_rate)}
          </p>
        </>
      )}
    </>
  );
}
