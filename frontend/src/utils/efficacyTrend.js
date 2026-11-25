import { SOURCES } from "./sources.js";

const SOURCE_COLORS = { M: "#7961a0", V: "#4e7da2", P: "#ad654b", A: "#4d8270" };
const UNITS_PER_PERCENT = 10;
const FULL_SHARE_UNITS = 100 * UNITS_PER_PERCENT;

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
