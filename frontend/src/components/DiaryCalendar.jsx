import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";

function useMonthDiaries(month) {
  return useQuery({
    queryKey: ["diaries", "month", month],
    queryFn: () => client.get(`/api/diaries?month=${month}`).then((r) => r.data.dates),
  });
}

export default function DiaryCalendar() {
  const today = new Date();
  const [current, setCurrent] = useState(today);
  const navigate = useNavigate();

  const month = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, "0")}`;
  const { data: writtenDates = [] } = useMonthDiaries(month);

  const year = current.getFullYear();
  const mon = current.getMonth();
  const firstDay = new Date(year, mon, 1).getDay();
  const daysInMonth = new Date(year, mon + 1, 0).getDate();

  const cells = Array(firstDay).fill(null).concat(
    Array.from({ length: daysInMonth }, (_, i) => i + 1)
  );

  const prevMonth = () => setCurrent(new Date(year, mon - 1, 1));
  const nextMonth = () => setCurrent(new Date(year, mon + 1, 1));

  const dateStr = (d) =>
    `${year}-${String(mon + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  return (
    <div className="calendar">
      <div className="calendar-header">
        <button onClick={prevMonth}>‹</button>
        <span>{year}년 {mon + 1}월</span>
        <button onClick={nextMonth}>›</button>
      </div>
      <div className="calendar-grid">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <div key={d} className="calendar-weekday">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />;
          const ds = dateStr(day);
          const hasEntry = writtenDates.includes(ds);
          const isToday = ds === dateStr(today.getDate()) &&
            mon === today.getMonth() && year === today.getFullYear();
          return (
            <div
              key={ds}
              className={`calendar-day ${hasEntry ? "has-entry" : ""} ${isToday ? "today" : ""}`}
              onClick={() => navigate(`/diary/${ds}`)}
            >
              {day}
              {hasEntry && <span className="dot" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
