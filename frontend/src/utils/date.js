const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 서버와 같은 한국 시간 기준 날짜 (YYYY-MM-DD)
export function dateKST(value) {
  return new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayKST() {
  return dateKST(Date.now());
}
