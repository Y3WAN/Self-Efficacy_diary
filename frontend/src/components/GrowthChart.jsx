import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useDailyEfficacyTrend } from "../api/dashboard";
import { getContributionShares, getDailyTrendRange, toScoreOutOf100, TREND_DAYS } from "../utils/efficacyTrend";

const NO_CONTRIBUTIONS = "비중을 계산할 기록이 없어요";
const AXIS_MARGIN = 18;
const LABEL_WIDTH = 30;
const LABEL_ROW_HEIGHT = 24;
const TOOLTIP_OFFSET = 12;
const VIEWPORT_INSET = 8;

function DayTick({ x, y, index, payload, rows, selectedDate, onSelect }) {
  const date = payload.value;
  const top = y + (index % rows) * LABEL_ROW_HEIGHT;
  const [, month, day] = date.split("-");
  const isSelected = selectedDate === date;
  return (
    <g className="growth-day-tick" role="button" tabIndex={0} aria-pressed={isSelected}
      aria-label={`${Number(month)}월 ${Number(day)}일 기록 보기`}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(date, event);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          onSelect(date, event);
        }
      }}>
      <rect x={x - LABEL_WIDTH / 2} y={top} width={LABEL_WIDTH} height={LABEL_ROW_HEIGHT} rx={5} />
      <text x={x} y={top + LABEL_ROW_HEIGHT / 2} dominantBaseline="central" textAnchor="middle"
        fill={isSelected ? "var(--accent)" : "var(--text-muted)"} fontSize={13}>
        {Number(day)}일
      </text>
    </g>
  );
}

function DailyScoreDot({ cx, cy, payload }) {
  if (payload?.score == null || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return <circle className="growth-score-dot" cx={cx} cy={cy} r={3} fill="var(--text-soft)" />;
}

function GrowthTooltip({ active, payload, selectedDay, anchor }) {
  const tooltipRef = useRef(null);
  const day = selectedDay ?? payload?.[0]?.payload;

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!tooltip || !anchor) return;

    function placeTooltip() {
      const { width, height } = tooltip.getBoundingClientRect();
      const { clientWidth, clientHeight } = document.documentElement;
      const right = anchor.x + TOOLTIP_OFFSET;
      const below = anchor.y + TOOLTIP_OFFSET;
      const left = right + width <= clientWidth - VIEWPORT_INSET ? right : anchor.x - TOOLTIP_OFFSET - width;
      const top = below + height <= clientHeight - VIEWPORT_INSET ? below : anchor.y - TOOLTIP_OFFSET - height;

      tooltip.style.left = Math.max(VIEWPORT_INSET, Math.min(clientWidth - width - VIEWPORT_INSET, left)) + "px";
      tooltip.style.top = Math.max(VIEWPORT_INSET, Math.min(clientHeight - height - VIEWPORT_INSET, top)) + "px";
    }

    placeTooltip();
    window.addEventListener("resize", placeTooltip);
    return () => window.removeEventListener("resize", placeTooltip);
  }, [active, anchor, day]);

  if (!active || !day || !anchor) return null;

  const [year, month, date] = day.date.split("-");
  const details = day.ema_contributions ? getContributionShares(day.ema_contributions) : null;

  return (
    <div ref={tooltipRef} className="chart-tooltip growth-trend-tooltip" role="status">
      <strong>{year}년 {Number(month)}월 {Number(date)}일</strong>
      <p>종합 추세 점수 {day.ema == null ? "없음" : toScoreOutOf100(day.ema) + " / 100점"}</p>
      {day.score != null && <p>일별 점수 {toScoreOutOf100(day.score)} / 100점</p>}
      {day.is_initial && <p className="growth-tooltip-note">가입 설문 점수를 반영한 날이에요.</p>}
      {day.score == null && (
        <p className="growth-tooltip-note">
          {day.confidence != null
            ? "이날의 분석은 추세에 반영되지 않았어요."
            : day.has_diary ? "일기는 저장됐어요. 아직 분석 점수가 없어요." : "이날은 기록이 없어요."}
        </p>
      )}
      {details && (
        <>
          {!details.hasContributions && <p>{NO_CONTRIBUTIONS}</p>}
          <ul className="growth-tooltip-sources">
            {details.parts.map((part) => {
              const hasEvidence = day.evidence_sources.includes(part.code);
              const isCarried = part.share > 0 && !day.is_initial && (!hasEvidence || day.score == null);
              return (
                <li key={part.code}>
                  <div className="growth-tooltip-source">
                    <span>
                      <i aria-hidden="true" style={{ background: part.color }} />
                      {part.label}
                    </span>
                    {details.hasContributions && <b>{part.percent}%</b>}
                  </div>
                  {(!hasEvidence || isCarried) && (
                    <p className="growth-tooltip-note">
                      {[
                        !hasEvidence && "이날 근거 없음",
                        isCarried && "이전 기록에서 이어진 비중",
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default function GrowthChart() {
  const { data, start, today, isPending, isError } = useDailyEfficacyTrend();
  const [tooltipTrigger, setTooltipTrigger] = useState("hover");
  const [selectedDate, setSelectedDate] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const [isTooltipDismissed, setIsTooltipDismissed] = useState(false);
  const [axisRows, setAxisRows] = useState(2);
  const days = useMemo(() => data ? getDailyTrendRange(data, start, today) : [], [data, start, today]);

  if (isPending) return <div className="chart-empty">불러오는 중…</div>;
  if (isError && !data) return <div className="chart-empty">그래프 데이터를 불러오지 못했어요.</div>;

  const selectedIndex = days.findIndex((day) => day.date === selectedDate);
  function selectDate(date, event) {
    const shouldDismiss = selectedDate === date;
    if (!shouldDismiss) {
      const tick = event.currentTarget.getBoundingClientRect();
      setAnchor(event.type === "click" && event.detail > 0
        ? { x: event.clientX, y: event.clientY }
        : { x: tick.left + tick.width / 2, y: tick.top + tick.height / 2 });
    }
    setSelectedDate(shouldDismiss ? null : date);
    setIsTooltipDismissed(shouldDismiss);
  }

  const scored = days.filter((day) => day.score != null);
  const diff = scored.length > 1
    ? toScoreOutOf100(scored.at(-1).ema) - toScoreOutOf100(scored[0].ema)
    : null;

  return (
    <>
      <p className="chart-sub">최근 {TREND_DAYS}일 · 점은 일별 점수, 선은 종합 추세예요.</p>
      <div
        className="growth-chart-plot"
        onPointerDownCapture={(event) => {
          if (event.target.closest(".growth-trend-tooltip")) return;
          if (!event.target.closest(".growth-day-tick")) {
            setSelectedDate(null);
            setIsTooltipDismissed(false);
          }
          setAnchor({ x: event.clientX, y: event.clientY });
          setTooltipTrigger(event.pointerType === "touch" ? "click" : "hover");
        }}
        onPointerMoveCapture={(event) => {
          if (event.target.closest(".growth-trend-tooltip")) return;
          if (event.pointerType === "mouse") setAnchor({ x: event.clientX, y: event.clientY });
          if (event.target.closest(".growth-day-tick")) return;
          if (isTooltipDismissed) setIsTooltipDismissed(false);
          if (tooltipTrigger !== "hover" && event.pointerType === "mouse") setTooltipTrigger("hover");
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          setSelectedDate(null);
          setIsTooltipDismissed(true);
        }}
      >
        <ResponsiveContainer width="100%" height={212 + axisRows * LABEL_ROW_HEIGHT}
          onResize={(width) => {
            const plotWidth = Math.max(LABEL_WIDTH, width - 2 * AXIS_MARGIN);
            setAxisRows(Math.ceil((days.length - 1) * LABEL_WIDTH / plotWidth));
          }}
        >
          <ComposedChart data={days} margin={{ top: 12, right: AXIS_MARGIN, left: AXIS_MARGIN, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
            <XAxis dataKey="date" interval={0} height={axisRows * LABEL_ROW_HEIGHT + 6} tickMargin={6} tickLine={false}
              tick={<DayTick rows={axisRows} selectedDate={selectedDate} onSelect={selectDate} />} />
            <YAxis domain={[0, 1]} tick={false} axisLine={false} width={0} />
            <Tooltip trigger={tooltipTrigger} filterNull={false} portal={document.getElementById("root")}
              isAnimationActive={false}
              active={isTooltipDismissed ? false : undefined}
              wrapperStyle={{ pointerEvents: selectedIndex >= 0 ? "auto" : "none" }}
              defaultIndex={selectedIndex >= 0 ? selectedIndex : undefined}
              cursor={selectedIndex >= 0 ? false : undefined}
              content={<GrowthTooltip selectedDay={days[selectedIndex]} anchor={anchor} />} />
            <Line
              name="종합 추세" type="monotoneX" dataKey="ema" stroke="var(--accent)"
              strokeWidth={2.5} dot={false} activeDot={false} isAnimationActive={false}
            />
            <Scatter name="일별 점수" dataKey="score" shape={<DailyScoreDot />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {diff != null && diff < 3 && (
        <p className="elo-calibration">
          {diff <= -3 ? "요즘 조금 지쳤나 봐요. 작은 미션부터 천천히 해 봐요." : "요즘 자기효능감은 비슷하게 이어지고 있어요."}
        </p>
      )}
    </>
  );
}
