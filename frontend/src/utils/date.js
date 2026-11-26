const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 서버와 같은 한국 시간 기준 날짜 (YYYY-MM-DD)
export function dateKST(value) {
  return new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayKST() {
  return dateKST(Date.now());
}

export function dateLocal(value) {
  const date = new Date(value);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
