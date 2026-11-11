import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";
import { todayKST } from "../utils/date";

function useMonthDiaries(month) {
  return useQuery({
    queryKey: ["diaries", "month", month],
    queryFn: () => client.get("/api/diaries", { params: { month } }).then((r) => r.data.dates),
  });
}

export default function DiaryCalendar() {
  const today = todayKST();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const month = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(requestedMonth ?? "")
    ? requestedMonth
    : today.slice(0, 7);
  const [year, monthNumber] = month.split("-").map(Number);
  const { data: writtenDates = [] } = useMonthDiaries(month);

  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const cells = Array(firstDay).fill(null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  const moveMonth = (offset) => {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    const nextYear = next.getFullYear();
    if (nextYear < 1000 || nextYear > 9999) return;
    const params = new URLSearchParams(searchParams);
    params.set("month", `${nextYear}-${String(next.getMonth() + 1).padStart(2, "0")}`);
    setSearchParams(params, { replace: true });
  };

  return (
    <section className="calendar" aria-label="일기 캘린더">
      <div className="calendar-header">
        <button type="button" aria-label="이전 달" onClick={() => moveMonth(-1)}>‹</button>
        <span aria-live="polite">{year}년 {monthNumber}월</span>
        <button type="button" aria-label="다음 달" onClick={() => moveMonth(1)}>›</button>
      </div>
      <div className="calendar-grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((day) => (
          <div key={day} className="calendar-weekday">{day}</div>
        ))}
        {cells.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const hasEntry = writtenDates.includes(date);
          const isToday = date === today;
          return (
            <Link
              key={date}
              to={`/diary/${date}`}
              state={{ fromMain: true }}
              aria-label={`${date}${hasEntry ? " 일기 있음" : ""}`}
              aria-current={isToday ? "date" : undefined}
              className={`calendar-day ${hasEntry ? "has-entry" : ""} ${isToday ? "today" : ""}`}
            >
              {day}
              {hasEntry && <span className="dot" />}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
