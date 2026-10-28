const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 서버와 같은 한국 시간 기준 오늘 날짜 (YYYY-MM-DD)
export function todayKST() {
  return new Date(Date.now() + KST_OFFSET_MS).toISOString().split("T")[0];
}
