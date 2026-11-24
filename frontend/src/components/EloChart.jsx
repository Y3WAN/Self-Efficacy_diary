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
    <div className="chart-tooltip">
      <p>
        {p.start ? "시작 점수" : `${p.result ? "완료" : "어려워요"} · 해낼 확률(예상) ${pct(p.expected)}`}
      </p>
      <strong>{p.rating}</strong>
    </div>
  );
};

export default function EloChart() {
  const { data, isLoading } = useElo();

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (!data) return null;

  // 첫 점은 첫 미션 결과가 반영되기 전 점수 (툴팁에는 표시하지 않음)
  const points = [
    { idx: 0, rating: data.start_rating ?? data.history[0]?.rating ?? data.rating, start: true },
    ...data.history.map((h, i) => ({ ...h, idx: i + 1 })),
  ];

  return (
    <>
      <div className="elo-stats">
        <div className="elo-stat">
          <span className="elo-stat-value">{data.rating}</span>
          <span className="elo-stat-label">지금 실력 점수</span>
        </div>
        <div className="elo-stat">
          <span className="elo-stat-value">Lv{data.next_level}</span>
          <span className="elo-stat-label">다음 미션 난이도</span>
        </div>
        <div className="elo-stat">
          <span className="elo-stat-value">{pct(data.next_expected)}</span>
          <span className="elo-stat-label">해낼 확률(예상)</span>
        </div>
      </div>
      {data.games === 0 ? (
        <div className="chart-empty">미션을 완료하면 실력 점수가 기록돼요!</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={points} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
              <XAxis dataKey="idx" tick={{ fill: "var(--text-muted)" }} />
              <YAxis domain={["dataMin - 30", "dataMax + 30"]} tick={{ fill: "var(--text-muted)" }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone" dataKey="rating" stroke="var(--accent)"
                strokeWidth={2.5} dot={{ r: 3, fill: "var(--accent)" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="elo-calibration">
            미션 {data.games}개 · 예상한 성공 확률 {pct(data.avg_expected)} / 실제로 해낸 비율 {pct(data.actual_rate)}
          </p>
        </>
      )}
    </>
  );
}
