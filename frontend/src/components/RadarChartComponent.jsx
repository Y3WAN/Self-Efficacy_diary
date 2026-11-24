import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import { SOURCES, SOURCE_BY_KEY } from "../utils/sources";

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const { key, score, days } = payload[0]?.payload ?? {};
  const info = SOURCE_BY_KEY[key];
  if (!info) return null;

  return (
    <div className="chart-tooltip">
      <strong>
        {info.label} — {(score * 100).toFixed(0)}점
      </strong>
      <p>{info.desc}</p>
      <p>
        {days ? `최근 7일 중 일기에 나온 날 ${days}일` : "최근 7일 일기에는 없어서 예전 기록으로 계산했어요"}
      </p>
    </div>
  );
}

// 해낸 경험: 같은 화면의 '오늘의 미션'으로 스크롤하고 잠깐 강조
function spotlightMissions() {
  const el = document.querySelector(".mission-list");
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.remove("is-spotlight");
  void el.offsetWidth; // 연속 클릭해도 애니메이션 다시 재생
  el.classList.add("is-spotlight");
  setTimeout(() => el.classList.remove("is-spotlight"), 2400);
}

// 축 글자를 누르면 그 원천을 키울 수 있는 화면으로 이동
function SourceTick({ x, y, payload, textAnchor, onPick }) {
  const s = SOURCES.find((src) => src.label === payload.value);
  const go = () => s && onPick(s);
  return (
    <text
      x={x} y={y} textAnchor={textAnchor} dominantBaseline="central"
      className="radar-tick" role="link" tabIndex={0}
      aria-label={`${payload.value} 관련 화면으로 이동`}
      onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
    >
      {payload.value}
    </text>
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
  const navigate = useNavigate();

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (!radar) return <div className="chart-empty">아직 분석된 일기가 없어요.</div>;

  const chartData = SOURCES.map((s) => ({
    key: s.key,
    subject: s.label,
    score: radar[`score_${s.key}`],
    days: radar[`days_${s.key}`],
  }));

  return (
    <>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="var(--divider)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={(props) => <SourceTick {...props} onPick={(s) => (s.link === "mission" ? spotlightMissions() : navigate(s.link))} />}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          <Radar
            dataKey="score" stroke="var(--accent)" fill="var(--accent)"
            fillOpacity={0.22} strokeWidth={2}
          />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
      <p className="chart-sub radar-hint">글자를 누르면 그 경험을 키울 수 있는 곳으로 이동해요</p>
    </>
  );
}
