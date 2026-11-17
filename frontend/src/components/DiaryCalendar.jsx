import Icon from "./Icon";
import { useState } from "react";
import { Link } from "react-router-dom";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_OFFSETS = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };

export default function DiaryCalendar({
  month, selectedDate, today, writtenDates, missionDates, locationKey, onToday, onChangeMonth,
}) {
  const [focusedDate, setFocusedDate] = useState(null);
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(year, monthNumber - 1, 1).getDay();
  const daysInMonth = new Date(year, monthNumber, 0).getDate();
  const lastSelectableDay = month === today.slice(0, 7) ? Number(today.slice(-2)) : daysInMonth;
  const tabDate = focusedDate?.startsWith(month) ? focusedDate : selectedDate;

  function moveMonth(offset) {
    const next = new Date(year, monthNumber - 1 + offset, 1);
    setFocusedDate(null);
    onChangeMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  function moveFocus(event, day) {
    const offset = DAY_OFFSETS[event.key];
    if (!offset) return;
    event.preventDefault();
    const nextDay = day + offset;
    if (nextDay < 1 || nextDay > lastSelectableDay) return;
    event.currentTarget.parentElement.querySelector(`[data-day="${nextDay}"]`)?.focus();
  }

  return (
    <>
      <div className="calendar-header">
        <span className="calendar-month" aria-live="polite">{year}년 {monthNumber}월</span>
        <div className="calendar-controls">
          <button type="button" aria-label="이전 달" disabled={month === "1000-01"} onClick={() => moveMonth(-1)}><Icon name="chevronLeft" /></button>
          <button type="button" className="calendar-today" onClick={() => {
            setFocusedDate(null);
            onToday();
          }}>오늘</button>
          <button type="button" aria-label="다음 달" disabled={month === today.slice(0, 7)} onClick={() => moveMonth(1)}><Icon name="chevronRight" /></button>
        </div>
      </div>
      <div className="calendar-grid" role="group" aria-label="날짜별 기록 열기">
        {WEEKDAYS.map((day) => <span key={day} className="calendar-weekday" aria-hidden="true">{day}</span>)}
        {Array.from({ length: firstDay }, (_, index) => <span key={index} aria-hidden="true" />)}
        {Array.from({ length: daysInMonth }, (_, index) => {
          const day = index + 1;
          if (day > lastSelectableDay) {
            return <span key={day} className="calendar-day" aria-disabled="true">{day}</span>;
          }
          const date = `${month}-${String(day).padStart(2, "0")}`;
          const hasDiary = writtenDates.has(date);
          const hasMission = missionDates.has(date);
          return (
            <Link
              key={date}
              to={`/records/${date}`}
              state={{ calendarKey: locationKey }}
              data-day={day}
              data-selected={date === selectedDate}
              aria-label={`${year}년 ${monthNumber}월 ${day}일 기록${hasDiary ? ", 일기 있음" : ""}${hasMission ? ", 미션 기록 있음" : ""}`}
              aria-current={date === today ? "date" : undefined}
              tabIndex={tabDate === date ? 0 : -1}
              className="calendar-day"
              onFocus={() => setFocusedDate(date)}
              onKeyDown={(event) => moveFocus(event, day)}
            >
              {day}
              <span className="calendar-marks" aria-hidden="true">
                {hasDiary && <span className="calendar-mark calendar-mark--diary" />}
                {hasMission && <span className="calendar-mark calendar-mark--mission" />}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="calendar-legend" aria-hidden="true">
        <span><span className="calendar-mark calendar-mark--diary" /> 일기</span>
        <span><span className="calendar-mark calendar-mark--mission" /> 미션 기록</span>
      </div>
    </>
  );
}
