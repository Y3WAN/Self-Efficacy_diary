import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import client from "../api/client";
import MallangFace from "./MallangFace";
import { readMallangCustomization } from "../utils/mallangCustomization";
import { getMallangPalette, rgbColor } from "../utils/mallangTheme";
import { SOURCES, SOURCE_BY_KEY } from "../utils/sources";

const CHART_MARGIN = { top: 24, right: 86, bottom: 24, left: 86 };

// A cubic Bézier approximation of a quarter ellipse.
const QUARTER_ELLIPSE_HANDLE = (4 * (Math.SQRT2 - 1)) / 3;

const MALLANG_PRESS_ANIMATION = "radar-mallang-press";

function pressRadarMallang(element) {
  element.getAnimations().find(({ id }) => id === MALLANG_PRESS_ANIMATION)?.cancel();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const keyframes = reduceMotion
    ? [{ opacity: 1 }, { opacity: 0.64 }, { opacity: 1 }]
    : [
        { transform: "scale(1)" },
        { transform: "scale(1.08, 0.87)", offset: 0.28 },
        { transform: "scale(0.98, 1.04)", offset: 0.66 },
        { transform: "scale(1)" },
      ];

  const reaction = element.animate(keyframes, { duration: reduceMotion ? 160 : 320, easing: "ease-out" });
  reaction.id = MALLANG_PRESS_ANIMATION;
}

function RadarMallang({ points = [] }) {
  const id = useId();
  if (points.length !== 4) return null;

  const [north, east, south, west] = points;
  const { cx, cy } = north;
  const look = readMallangCustomization();
  const palette = getMallangPalette(look.theme);

  // Each curve starts and ends at the actual radar points. Its handles follow the perpendicular axes.
  const segments = points.map((start, index) => {
    const end = points[(index + 1) % points.length];
    const firstX = start.x + (end.x - cx) * QUARTER_ELLIPSE_HANDLE;
    const firstY = start.y + (end.y - cy) * QUARTER_ELLIPSE_HANDLE;
    const secondX = end.x + (start.x - cx) * QUARTER_ELLIPSE_HANDLE;
    const secondY = end.y + (start.y - cy) * QUARTER_ELLIPSE_HANDLE;
    return `C ${firstX} ${firstY}, ${secondX} ${secondY}, ${end.x} ${end.y}`;
  });
  const outline = `M ${north.x} ${north.y} ${segments.join(" ")} Z`;
  const faceSize = Math.min(east.x - west.x, south.y - north.y);
  const faceX = (east.x + west.x - faceSize) / 2;
  const faceY = (south.y + north.y - faceSize) / 2;

  return (
    <g
      className="radar-mallang"
      role="button"
      tabIndex={0}
      aria-label="사말이 누르기"
      onClick={(event) => pressRadarMallang(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (!event.repeat) pressRadarMallang(event.currentTarget);
      }}
    >
      <defs>
        <radialGradient id={`${id}-skin`} cx="36%" cy="30%" r="82%">
          <stop offset="0%" stopColor={rgbColor(palette.skinLight, 0.88)} />
          <stop offset="100%" stopColor={rgbColor(palette.skinEdge, 0.68)} />
        </radialGradient>
        <clipPath id={`${id}-face`}><path d={outline} /></clipPath>
      </defs>
      <path
        className="radar-mallang-body"
        d={outline}
        fill={`url(#${id}-skin)`}
        stroke={rgbColor(palette.edgeStroke)}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {faceSize > 0 && (
        <g clipPath={`url(#${id}-face)`} pointerEvents="none">
          <MallangFace look={look} x={faceX} y={faceY} size={faceSize} />
        </g>
      )}
    </g>
  );
}

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
    <ResponsiveContainer className="radar-plot" width="100%" height={220}>
      <RadarChart data={chartData} margin={CHART_MARGIN} outerRadius="100%" startAngle={90} endAngle={-270}>
        <PolarGrid gridType="circle" stroke="var(--divider)" />
        <PolarAngleAxis
          dataKey="subject"
          axisLineType="circle"
          axisLine={{ stroke: "var(--accent-line)", strokeWidth: 1.5 }}
          tickLine={false}
          tick={(props) => <SourceTick {...props} onPick={(s) => (s.link === "mission" ? spotlightMissions() : navigate(s.link))} />}
        />
        <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
        <Radar dataKey="score" shape={<RadarMallang />} fill="var(--accent)" />
        <Tooltip content={<CustomTooltip />} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
