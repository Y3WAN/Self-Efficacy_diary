const DATE_PATTERN = /^[1-9]\d{3}-\d{2}-\d{2}$/;

export function isRecordDate(date) {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function shiftRecordDate(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function recordCalendarLocation(date, search = "") {
  const params = new URLSearchParams(search);
  params.delete("history");
  params.set("month", date.slice(0, 7));
  params.set("date", date);
  return { pathname: "/", search: `?${params}` };
}
