import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQueries } from "@tanstack/react-query";
import DiaryCalendar from "./DiaryCalendar";
import client from "../api/client";
import { missionHistoryQuery } from "../api/records";
import { dateKST } from "../utils/date";
import { isRecordDate, shiftRecordDate } from "../utils/recordDate";

// 그 날짜가 속한 주의 일요일
function weekStartOf(date) {
  return shiftRecordDate(date, -new Date(date).getUTCDay());
}

export default function ActivityHistory({ today }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const calendarRef = useRef(null);
  const requestedDate = searchParams.get("date") ?? "";
  const selectedDate = isRecordDate(requestedDate) && requestedDate <= today ? requestedDate : today;
  const weekStart = weekStartOf(selectedDate);
  // 한 주가 두 달에 걸칠 수 있어 양쪽 달의 기록을 모두 불러온다
  const months = [...new Set([weekStart.slice(0, 7), shiftRecordDate(weekStart, 6).slice(0, 7)])];

  const diaryQueries = useQueries({
    queries: months.map((month) => ({
      queryKey: ["diaries", "month", month],
      queryFn: ({ signal }) => client.get("/api/diaries", { params: { month }, signal }).then((response) => response.data.dates),
    })),
  });
  const missionQueries = useQueries({ queries: months.map((month) => missionHistoryQuery(month)) });

  useEffect(() => {
    if (!location.state?.focusCalendar) return;
    const calendar = calendarRef.current;
    calendar?.scrollIntoView({ block: "start" });
    calendar?.querySelector('[data-selected="true"]')?.focus({ preventScroll: true });
  }, [location.key, location.state]);

  function setCalendarDate(nextDate) {
    const params = new URLSearchParams(searchParams);
    params.delete("history");
    params.set("month", nextDate.slice(0, 7));
    params.set("date", nextDate);
    setSearchParams(params, { replace: true });
  }

  function changeWeek(offset) {
    const next = shiftRecordDate(selectedDate, offset * 7);
    setCalendarDate(next > today ? today : next);
  }

  const writtenDates = new Set(diaryQueries.flatMap((query) => query.data ?? []));
  const missionDates = new Set(missionQueries.flatMap((query) => (query.data ?? []).map((mission) => dateKST(mission.created_at))));
  const failedQueries = [...diaryQueries, ...missionQueries].filter((query) => query.isError);

  return (
    <section className="activity-history" aria-labelledby="activity-title" ref={calendarRef}>
      <h2 id="activity-title" className="section-title">지난 기록</h2>
      <DiaryCalendar
        weekStart={weekStart}
        selectedDate={selectedDate}
        today={today}
        writtenDates={writtenDates}
        missionDates={missionDates}
        locationKey={location.key}
        onToday={() => setCalendarDate(today)}
        onChangeWeek={changeWeek}
      />
      {failedQueries.length > 0 && (
        <button type="button" className="activity-write" onClick={() => failedQueries.forEach((query) => query.refetch())}>
          달력 표시 다시 불러오기
        </button>
      )}
    </section>
  );
}
