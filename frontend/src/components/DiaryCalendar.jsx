import Icon from "./Icon";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { shiftRecordDate } from "../utils/recordDate";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const SWIPE_MIN_PX = 50;

function parts(date) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function weekLabel(weekStart) {
  // 토요일 기준으로 계산하면 매월 1일이 포함된 주가 그달의 첫 주가 된다.
  const { year, month, day } = parts(shiftRecordDate(weekStart, 6));
  const weekOfMonth = Math.ceil(day / 7);
  return `${year}년 ${month}월 ${weekOfMonth}째 주`;
}

// 한 주(일~토)만 보여 주는 달력. 이전·다음 버튼이나 좌우로 밀어서 주를 넘긴다.
// 날짜를 누르면 /records/:date 로 가서, 그 화면에서 좌우로 밀며 지난 기록을 이어서 볼 수 있다.
export default function DiaryCalendar({
  weekStart, selectedDate, today, writtenDates, missionDates, locationKey, onToday, onChangeWeek,
}) {
  const [focusedDate, setFocusedDate] = useState(null);
  const touchStart = useRef(null);
  const days = Array.from({ length: 7 }, (_, index) => shiftRecordDate(weekStart, index));
  const isCurrentWeek = days.includes(today);
  const tabDate = focusedDate && days.includes(focusedDate) ? focusedDate : selectedDate;

  function moveWeek(offset) {
    if (offset > 0 && isCurrentWeek) return;
    setFocusedDate(null);
    onChangeWeek(offset);
  }

  function moveFocus(event, index) {
    const offset = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!offset) return;
    event.preventDefault();
    const next = days[index + offset];
    if (!next || next > today) return;
    event.currentTarget.parentElement.querySelector(`[data-date="${next}"]`)?.focus();
  }

  function onTouchStart(event) {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy)) return;
    moveWeek(dx < 0 ? 1 : -1); // 왼쪽으로 밀면 다음 주, 오른쪽으로 밀면 지난주
  }

  return (
    <>
      <div className="calendar-header">
        <span className="calendar-week-label" aria-live="polite">{weekLabel(weekStart)}</span>
        <div className="calendar-controls">
          <button type="button" aria-label="지난주" onClick={() => moveWeek(-1)}><Icon name="chevronLeft" /></button>
          <button type="button" className="calendar-today" onClick={() => {
            setFocusedDate(null);
            onToday();
          }}>오늘</button>
          <button type="button" aria-label="다음 주" disabled={isCurrentWeek} onClick={() => moveWeek(1)}><Icon name="chevronRight" /></button>
        </div>
      </div>
      <div
        className="calendar-grid calendar-grid--week"
        role="group"
        aria-label="지난 기록 열기 (좌우로 밀어서 주 이동)"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {WEEKDAYS.map((day) => <span key={day} className="calendar-weekday" aria-hidden="true">{day}</span>)}
        {days.map((date, index) => {
          const { month, day } = parts(date);
          if (date > today) {
            return <span key={date} className="calendar-day" aria-disabled="true">{day}</span>;
          }
          const hasDiary = writtenDates.has(date);
          const hasMission = missionDates.has(date);
          return (
            <Link
              key={date}
              to={`/records/${date}`}
              state={{ calendarKey: locationKey }}
              data-date={date}
              data-selected={date === selectedDate}
              aria-label={`${month}월 ${day}일 기록${hasDiary ? ", 일기 있음" : ""}${hasMission ? ", 미션 기록 있음" : ""}`}
              aria-current={date === today ? "date" : undefined}
              tabIndex={tabDate === date ? 0 : -1}
              className="calendar-day"
              onFocus={() => setFocusedDate(date)}
              onKeyDown={(event) => moveFocus(event, index)}
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
