import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip,
} from "recharts";
import { useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDailyEfficacyTrend } from "../api/dashboard";
import MallangFace from "./MallangFace";
import { readMallangCustomization } from "../utils/mallangCustomization";
import { getMallangPalette, rgbColor } from "../utils/mallangTheme";
import { SOURCE_BY_KEY } from "../utils/sources";
import { getMallangTrend, toScoreOutOf100 } from "../utils/efficacyTrend";
import { getMallangFaceFrame, membranePath, sampleMallangContour } from "../utils/mallangMaterial";

const CHART_MARGIN = { top: 40, right: 108, bottom: 40, left: 108 };
const COMPACT_CHART_MARGIN = { ...CHART_MARGIN, right: 76, left: 76 };
const COMPACT_CHART_WIDTH = 360;
const NO_CONTRIBUTIONS = "아직 기여 비율을 계산할 기록이 없어요";
const LOAD_ERROR = "기여 비율을 불러오지 못했어요.";

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

  const contour = {
    north: cy - north.y, east: east.x - cx, south: south.y - cy, west: cx - west.x,
  };
  if (Object.values(contour).some((radius) => !Number.isFinite(radius) || radius <= 0)) return null;
  const outline = membranePath(sampleMallangContour(contour), cx, cy);
  const face = getMallangFaceFrame(contour, cx, cy);

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
      <g clipPath={`url(#${id}-face)`} pointerEvents="none">
        <MallangFace look={look} {...face} />
      </g>
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
function SourceTick({ x, y, payload, textAnchor, index, sources, onPick, compact }) {
  const source = sources.find(({ subject }) => subject === payload.value);
  if (!source) return null;

  const lines = compact && index === 3 ? source.subject.split(" ") : [source.subject];
  const top = index === 0 || lines.length > 1 ? y - 16 : y;
  const go = () => onPick(source);
  return (
    <text
      x={x} y={top} textAnchor={textAnchor} dominantBaseline="central"
      className="radar-tick" role="link" tabIndex={0}
      aria-label={`${source.subject} ${source.percent}% 관련 화면으로 이동`}
      onClick={go}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } }}
    >
      {lines.map((line, lineIndex) => (
        <tspan key={line} className="radar-tick-label" x={x} dy={lineIndex === 0 ? 0 : 17}>{line}</tspan>
      ))}
      <tspan className="radar-tick-short" x={x} dy={17}>{source.percent}%</tspan>
    </text>
  );
}

export default function RadarChartComponent() {
  const { data = [], isLoading, isError } = useDailyEfficacyTrend();
  const navigate = useNavigate();
  const [compact, setCompact] = useState(true);
  if (isLoading) return <p className="chart-empty">차트를 불러오는 중…</p>;
  if (isError && !data.length) return <p className="chart-empty">{LOAD_ERROR}</p>;

  const trend = getMallangTrend(data);
  if (!trend) return <p className="chart-empty">{NO_CONTRIBUTIONS}</p>;

  const chartData = trend.parts.map(({ code, label, link, percent }, index) => ({
    key: code.toLowerCase(),
    subject: label,
    score: trend.radii[index],
    percent,
    link,
  }));

  return (
    <>
      <p className="radar-trend-score">
        종합 추세 점수 <strong>{toScoreOutOf100(trend.ema)}점 / 100점</strong>
      </p>
      <ResponsiveContainer className="radar-plot" width="100%" height={250}
        onResize={(width) => setCompact(width < COMPACT_CHART_WIDTH)}>
        <RadarChart data={chartData} margin={compact ? COMPACT_CHART_MARGIN : CHART_MARGIN}
          outerRadius="100%" startAngle={90} endAngle={-270}>
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
                compact={compact}
                onPick={(source) => (source.link === "mission" ? spotlightMissions() : navigate(source.link, { state: { fromMain: true } }))}
              />
            )}
          />
          <PolarRadiusAxis domain={[0, 1]} tick={false} axisLine={false} />
          <Radar dataKey="score" shape={<RadarMallang />} fill="var(--accent)" isAnimationActive={false} />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </>
  );
}
