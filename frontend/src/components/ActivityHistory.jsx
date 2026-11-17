import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import DiaryCalendar from "./DiaryCalendar";
import client from "../api/client";
import { missionHistoryQuery } from "../api/records";
import { dateKST } from "../utils/date";
import { isRecordDate } from "../utils/recordDate";

const MONTH_PATTERN = /^[1-9]\d{3}-(0[1-9]|1[0-2])$/;

export default function ActivityHistory({ today }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const calendarRef = useRef(null);
  const todayMonth = today.slice(0, 7);
  const requestedMonth = searchParams.get("month") ?? "";
  const month = MONTH_PATTERN.test(requestedMonth) && requestedMonth <= todayMonth ? requestedMonth : todayMonth;
  const requestedDate = searchParams.get("date") ?? "";
  const selectedDate = isRecordDate(requestedDate) && requestedDate.startsWith(month) && requestedDate <= today
    ? requestedDate
    : month === todayMonth ? today : `${month}-01`;

  const monthDiaries = useQuery({
    queryKey: ["diaries", "month", month],
    queryFn: ({ signal }) => client.get("/api/diaries", { params: { month }, signal }).then((response) => response.data.dates),
  });
  const monthMissions = useQuery(missionHistoryQuery(month));

  useEffect(() => {
    if (!location.state?.focusCalendar) return;
    const calendar = calendarRef.current;
    calendar?.scrollIntoView({ block: "start" });
    calendar?.querySelector('[data-selected="true"]')?.focus({ preventScroll: true });
  }, [location.key, location.state]);

  function setCalendarDate(nextMonth, nextDate) {
    const params = new URLSearchParams(searchParams);
    params.delete("history");
    params.set("month", nextMonth);
    if (nextDate) params.set("date", nextDate);
    else params.delete("date");
    setSearchParams(params, { replace: true });
  }

  const failedQueries = [monthDiaries, monthMissions].filter((query) => query.isError);

  return (
    <section className="activity-history" aria-labelledby="activity-title" ref={calendarRef}>
      <h2 id="activity-title" className="section-title">일기·미션 기록</h2>
      <DiaryCalendar
        month={month}
        selectedDate={selectedDate}
        today={today}
        writtenDates={new Set(monthDiaries.data ?? [])}
        missionDates={new Set((monthMissions.data ?? []).map((mission) => dateKST(mission.created_at)))}
        locationKey={location.key}
        onToday={() => setCalendarDate(todayMonth, today)}
        onChangeMonth={setCalendarDate}
      />
      {failedQueries.length > 0 && (
        <button type="button" className="activity-write" onClick={() => failedQueries.forEach((query) => query.refetch())}>
          달력 표시 다시 불러오기
        </button>
      )}
    </section>
  );
}
