import { useState } from "react";
import {
  ComposedChart, Line, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import Icon from "./Icon";
import { useDailyEfficacyTrend } from "../api/dashboard";
import { getContributionShares, toScoreOutOf100 } from "../utils/efficacyTrend";

const NO_CONTRIBUTIONS = "비중을 계산할 기록이 없어요";

function GrowthTooltip({ active, payload }) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;

  const [year, month, date] = day.date.split("-");
  const details = day.ema_contributions ? getContributionShares(day.ema_contributions) : null;

  return (
    <div className="chart-tooltip growth-trend-tooltip" role="status">
      <strong>{year}년 {Number(month)}월 {Number(date)}일</strong>
      <p>종합 추세 점수 {day.ema == null ? "없음" : toScoreOutOf100(day.ema) + " / 100점"}</p>
      {day.is_initial && <p className="growth-tooltip-note">가입 설문 점수를 반영한 날이에요.</p>}
      {day.score == null && day.evidence_sources && (
        <p className="growth-tooltip-note">이날 찾은 근거는 추세에 반영되지 않았어요.</p>
      )}
      {!details && <p>원천별 비중을 불러오지 못했어요.</p>}
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
  const { data = [], isLoading, isError } = useDailyEfficacyTrend();
  const [tooltipTrigger, setTooltipTrigger] = useState("hover");

  if (isLoading) return <div className="chart-empty">불러오는 중...</div>;
  if (isError && !data.length) return <div className="chart-empty">그래프 데이터를 불러오지 못했어요.</div>;
  if (!data.length) return <div className="chart-empty">{NO_CONTRIBUTIONS}</div>;

  const scoredDays = data.filter((day) => day.score != null);
  const first = scoredDays[0];
  const last = scoredDays.at(-1);
  const diff = first ? toScoreOutOf100(last.ema) - toScoreOutOf100(first.ema) : 0;

  return (
    <>
      <div
        onPointerDownCapture={(event) => setTooltipTrigger(event.pointerType === "touch" ? "click" : "hover")}
        onPointerMoveCapture={(event) => {
          if (tooltipTrigger !== "hover" && event.pointerType === "mouse") setTooltipTrigger("hover");
        }}
      >
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--divider)" />
            <XAxis dataKey="date" tick={{ fill: "var(--text-muted)" }} tickFormatter={(v) => v.slice(5).replace("-", "/")} />
            <YAxis domain={[0, 1]} tick={false} axisLine={false} width={24} />
            <Tooltip trigger={tooltipTrigger} filterNull={false} content={<GrowthTooltip />} />
            <Scatter name="그날" dataKey="score" fill="var(--text-soft)" />
            <Line
              name="흐름" type="monotone" dataKey="ema" stroke="var(--accent)"
              strokeWidth={2.5} dot={false} activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {scoredDays.length > 1 && (
        <p className="elo-calibration">
          {diff >= 3
            ? <><Icon name="sprout" /> 첫 기록보다 자기효능감이 자랐어요.</>
            : diff <= -3
              ? "요즘 조금 지쳤나 봐요. 작은 미션부터 천천히 해 봐요."
              : "요즘 자기효능감은 비슷하게 이어지고 있어요."}
        </p>
      )}
    </>
  );
}
