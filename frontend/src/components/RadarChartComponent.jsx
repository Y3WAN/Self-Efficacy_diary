import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { useId } from "react";
import { useNavigate } from "react-router-dom";
import { useDailyEfficacyTrend } from "../api/dashboard";
import MallangFace from "./MallangFace";
import { readMallangCustomization } from "../utils/mallangCustomization";
import { getMallangPalette, rgbColor } from "../utils/mallangTheme";
import { SOURCE_BY_KEY } from "../utils/sources";
import { getContributionShares, toScoreOutOf100 } from "../utils/efficacyTrend";

const CHART_MARGIN = { top: 40, right: 92, bottom: 40, left: 92 };
// 기여 비율은 합이 1이라 그대로 그리면 말랑이가 홀쭉해진다.
// 가장 큰 원천이 거의 끝까지 닿고, 작은 원천도 바닥이 있게 키운다(순서는 그대로, 숫자는 % 글자로 따로 보임).
const MALLANG_MIN_RADIUS = 0.42;
const plumpRadius = (share, maxShare) =>
  maxShare > 0 ? MALLANG_MIN_RADIUS + (0.95 - MALLANG_MIN_RADIUS) * Math.sqrt(share / maxShare) : 0;
const NO_CONTRIBUTIONS = "아직 기여 비율을 계산할 기록이 없어요";
const LOAD_ERROR = "기여 비율을 불러오지 못했어요.";

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
      aria-label="말랑이 누르기"
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
  const { key, percent } = payload[0]?.payload ?? {};
  const info = SOURCE_BY_KEY[key];
  if (!info) return null;

  return (
    <div className="chart-tooltip">
      <strong>{info.label}</strong>
      <p>{info.desc}</p>
      <p>종합 추세 점수 기여 비율 {percent}%</p>
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
// 이름 아래에 기여 비율을 표시한다. 맨 위 이름은 원 밖으로 한 줄만큼 올린다.
function SourceTick({ x, y, payload, textAnchor, index, sources, onPick }) {
  const source = sources.find(({ subject }) => subject === payload.value);
  if (!source) return null;

  const top = index === 0 ? y - 16 : y;
  const go = () => onPick(source);
  return (
    <text
      x={x} y={top} textAnchor={textAnchor} dominantBaseline="central"
      className="radar-tick" role="link" tabIndex={0}
      aria-label={`${source.subject} ${source.percent}% 관련 화면으로 이동`}
      onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
    >
      <tspan>{payload.value}</tspan>
      <tspan className="radar-tick-short" x={x} dy={17}>{source.percent}%</tspan>
    </text>
  );
}

export default function RadarChartComponent() {
  const { data = [], isLoading, isError } = useDailyEfficacyTrend();
  const navigate = useNavigate();
  const latest = data.at(-1);

  if (isLoading) return <p className="chart-empty">차트를 불러오는 중…</p>;
  if (isError && !latest) return <p className="chart-empty">{LOAD_ERROR}</p>;
  if (latest?.ema == null) return <p className="chart-empty">{NO_CONTRIBUTIONS}</p>;
  if (!latest.ema_contributions) return <p className="chart-empty">{LOAD_ERROR}</p>;

  const { parts, hasContributions } = getContributionShares(latest.ema_contributions);
  if (!hasContributions) return <p className="chart-empty">{NO_CONTRIBUTIONS}</p>;

  const maxShare = Math.max(...parts.map(({ share }) => share));
  const chartData = parts.map(({ code, label, link, share, percent }) => ({
    key: code.toLowerCase(),
    subject: label,
    score: plumpRadius(share, maxShare),
    percent,
    link,
  }));

  return (
    <>
      <p className="radar-trend-score">
        종합 추세 점수 <strong>{toScoreOutOf100(latest.ema)}점 / 100점</strong>
      </p>
      <ResponsiveContainer className="radar-plot" width="100%" height={250}>
        <RadarChart data={chartData} margin={CHART_MARGIN} outerRadius="100%" startAngle={90} endAngle={-270}>
          <PolarGrid gridType="circle" stroke="var(--divider)" />
          <PolarAngleAxis
            dataKey="subject"
            axisLineType="circle"
            axisLine={{ stroke: "var(--accent-line)", strokeWidth: 1.5 }}
            tickLine={false}
            tick={(props) => (
              <SourceTick
                {...props}
                sources={chartData}
                onPick={(source) => (source.link === "mission" ? spotlightMissions() : navigate(source.link))}
              />
            )}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          <Radar dataKey="score" shape={<RadarMallang />} fill="var(--accent)" />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </>
  );
}
