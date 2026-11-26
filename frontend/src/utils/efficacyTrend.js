import { SOURCES } from "./sources.js";

const SOURCE_COLORS = { M: "#7961a0", V: "#4e7da2", P: "#ad654b", A: "#4d8270" };
const UNITS_PER_PERCENT = 10;
const FULL_SHARE_UNITS = 100 * UNITS_PER_PERCENT;

const MALLANG_MIN_RADIUS = 0.42;
const MALLANG_MAX_RADIUS = 0.95;

export function getMallangTrend(days) {
  const latest = days?.at(-1);
  if (latest?.ema == null || !latest.ema_contributions) return null;

  const { parts, hasContributions } = getContributionShares(latest.ema_contributions);
  if (!hasContributions) return null;

  // 같은 비율에서 레이더와 실제 몸통의 상하좌우 길이를 구한다.
  const maxShare = Math.max(...parts.map(({ share }) => share));
  const values = parts.map(({ share }) =>
    MALLANG_MIN_RADIUS + (MALLANG_MAX_RADIUS - MALLANG_MIN_RADIUS) * Math.sqrt(share / maxShare)
  );
  const contour = {
    north: values[0], east: values[1], south: values[2], west: values[3],
  };
  return { ema: latest.ema, parts, radii: values, contour };
}

export function toScoreOutOf100(ema) {
  return Math.round(ema * 100);
}

export function getContributionShares(contributions) {
  const total = SOURCES.reduce((sum, { code }) => sum + contributions[code], 0);
  const hasContributions = total > 0;
  const parts = SOURCES.map(({ code, label, link }) => {
    const share = hasContributions ? contributions[code] / total : 0;
    const exactUnits = share * FULL_SHARE_UNITS;
    const units = Math.floor(exactUnits);
    return {
      code, label, link, share, units, color: SOURCE_COLORS[code],
      remainder: exactUnits - units,
    };
  });

  if (hasContributions) {
    // 화면에 표시할 비율도 합이 100%가 되도록 나머지가 큰 원천부터 0.1%씩 배분한다.
    const unassigned = FULL_SHARE_UNITS - parts.reduce((sum, part) => sum + part.units, 0);
    const byRemainder = [...parts].sort((first, second) => second.remainder - first.remainder);
    for (const part of byRemainder.slice(0, unassigned)) part.units += 1;
  }

  return {
    hasContributions,
    parts: parts.map(({ code, label, link, share, color, units }) => ({
      code, label, link, share, color, percent: units / UNITS_PER_PERCENT,
    })),
  };
}
