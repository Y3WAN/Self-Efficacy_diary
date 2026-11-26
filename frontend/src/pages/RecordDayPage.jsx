import Icon from "../components/Icon";
import SubPageHeader from "../components/SubPageHeader";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { diaryDayQuery, missionHistoryQuery } from "../api/records";
import { dateKST, todayKST } from "../utils/date";
import { isRecordDate, recordCalendarLocation, shiftRecordDate } from "../utils/recordDate";

const FIRST_DATE = "1000-01-01";
const RAIL_RADIUS = 14;
const RAIL_BUFFER = 3;
const MAX_RAIL_DAYS = 4 * RAIL_RADIUS + 1;
const PREFETCH_RADIUS = 2;
const SCROLL_SETTLE_MS = 140;
const DRAG_THRESHOLD = 8;
const FLICK_THRESHOLD = 40;
const FLICK_MAX_MS = 280;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const dayDifference = (start, end) => (Date.parse(end) - Date.parse(start)) / MS_PER_DAY;
const MISSION_STATUS = { done: "해냈어요", skipped: "어려워요", expired: "기한 지남" };
const DAY_LABEL = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "UTC", year: "numeric", month: "long", day: "numeric", weekday: "long",
});
const DIARY_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
});

function DayRecords({ date, isToday, shouldLoad }) {
  const diaryQuery = useQuery({ ...diaryDayQuery(date), enabled: shouldLoad });
  const missionQuery = useQuery({ ...missionHistoryQuery(date.slice(0, 7)), enabled: shouldLoad });
  const diaries = diaryQuery.data ?? [];
  const missions = (missionQuery.data ?? []).filter((mission) => dateKST(mission.created_at) === date);
  const isPending = diaryQuery.isPending || missionQuery.isPending;
  const failedQueries = [diaryQuery, missionQuery].filter((query) => query.isError);

  return (
    <div className="activity-day" aria-busy={isPending}>
      <div className="activity-day-header">
        <h2><time dateTime={date}>{isToday ? "오늘 · " : ""}{DAY_LABEL.format(new Date(date))}</time></h2>
        {isToday && (
          <Link className="activity-write" to={`/diary/${date}`} state={{ fromMain: true }}>
            오늘의 일기 <Icon name="arrowUpRight" />
          </Link>
        )}
      </div>
      {isPending && <p className="activity-empty" role="status">기록을 불러오는 중이에요.</p>}
      {failedQueries.length > 0 && (
        <button type="button" className="activity-write" onClick={() => failedQueries.forEach((query) => query.refetch())}>
          기록 다시 불러오기
        </button>
      )}
      {!isPending && failedQueries.length === 0 && diaries.length === 0 && missions.length === 0 && (
        <p className="activity-empty">이날에 남긴 기록이 없어요.</p>
      )}
      {diaries.map((diary) => (
        <Link
          key={diary.id}
          className="activity-diary"
          to={`/diary/${date}#entry-${diary.id}`}
          state={{ fromMain: true }}
        >
          <span className="activity-diary-meta">일기 · {DIARY_TIME.format(new Date(diary.created_at))}</span>
          <span className="activity-diary-content">{diary.content}</span>
          {diary.reflection?.achievements?.length > 0 && (
            <span className="activity-diary-achievement"><Icon name="sparkle" /> {diary.reflection.achievements.join(" · ")}</span>
          )}
          <Icon name="chevronRight" className="activity-diary-arrow" />
        </Link>
      ))}
      {diaries.length > 0 && missions.length > 0 && <hr className="record-mission-divider" />}
      {missions.map((mission) => (
        <div key={mission.id} className="activity-mission">
          <div>
            <p className="activity-diary-meta">미션</p>
            <p className="mission-content">{mission.content}</p>
            {mission.reflection && <p className="activity-reflection">“{mission.reflection}”</p>}
          </div>
          <span className={`activity-status activity-status--${mission.status}`}>{MISSION_STATUS[mission.status]}</span>
        </div>
      ))}
    </div>
  );
}

function getDateRange(date, today) {
  const start = shiftRecordDate(date, -RAIL_RADIUS);
  const end = shiftRecordDate(date, RAIL_RADIUS);
  return {
    first: isRecordDate(start) ? start : FIRST_DATE,
    last: end < today ? end : today,
  };
}

function RecordCarousel({ date, today }) {
  const [range, setRange] = useState(() => getDateRange(date, today));
  const [previewDate, setPreviewDate] = useState(date);
  const railRef = useRef(null);
  const backRef = useRef(null);
  const layoutRef = useRef({ firstDate: null, lastDate: null, index: 0, left: 0 });
  const settleTimer = useRef(null);
  const requestedIndex = useRef(null);
  const dragRef = useRef(null);
  const skipClick = useRef(false);

  const rememberDate = useOutletContext();
  const navigate = useNavigate();
  const { state } = useLocation();
  const calendarKey = state?.calendarKey;
  const previous = date > FIRST_DATE;
  const next = date < today;
  const { first: firstDate, last: lastDate } = range;
  const dates = useMemo(() => Array.from(
    { length: dayDifference(firstDate, lastDate) + 1 },
    (_, index) => shiftRecordDate(firstDate, index),
  ), [firstDate, lastDate]);

  const activeIndex = dates.indexOf(date);
  const previewIndex = Math.max(0, dates.indexOf(previewDate));
  if (activeIndex === -1) {
    setRange(getDateRange(date, today));
    setPreviewDate(date);
  }

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    backRef.current?.focus({ preventScroll: true });

    const rail = railRef.current;
    let width = rail.clientWidth;
    const observer = new ResizeObserver(() => {
      if (rail.clientWidth === width) return;
      width = rail.clientWidth;
      window.clearTimeout(settleTimer.current);
      rail.scrollLeft = layoutRef.current.index * width;
      layoutRef.current.left = rail.scrollLeft;
    });
    observer.observe(rail);
    return () => {
      window.clearTimeout(settleTimer.current);
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const rail = railRef.current;
    const previousLayout = layoutRef.current;
    if (!previousLayout.firstDate || date < previousLayout.firstDate || date > previousLayout.lastDate) {
      rail.scrollLeft = activeIndex * rail.clientWidth;
    } else if (previousLayout.firstDate !== firstDate) {
      // Prepending days shifts their pixel coordinates, including those of a new drag.
      const added = dayDifference(firstDate, previousLayout.firstDate);
      const shift = added * rail.clientWidth;
      if (dragRef.current) {
        dragRef.current.left += shift;
        dragRef.current.index += added;
      }
      rail.scrollLeft = previousLayout.left + shift;
      if (requestedIndex.current !== null) {
        requestedIndex.current += added;
        rail.scrollTo({ left: requestedIndex.current * rail.clientWidth, behavior: "smooth" });
      }
    }
    layoutRef.current = { firstDate, lastDate, index: activeIndex, left: rail.scrollLeft };
    if (calendarKey) rememberDate(calendarKey, date);
  }, [activeIndex, calendarKey, date, firstDate, lastDate, rememberDate]);

  const finishScroll = useCallback(() => {
    const rail = railRef.current;
    if (!rail?.clientWidth || dragRef.current?.isDragging) return;
    const index = Math.round(rail.scrollLeft / rail.clientWidth);
    const selectedDate = dates[index];
    if (!selectedDate) return;

    requestedIndex.current = null;
    setPreviewDate(selectedDate);
    if (selectedDate === date) return;

    if (index <= RAIL_BUFFER && firstDate > FIRST_DATE) {
      const start = shiftRecordDate(firstDate, -RAIL_RADIUS);
      const first = isRecordDate(start) ? start : FIRST_DATE;
      const end = shiftRecordDate(first, MAX_RAIL_DAYS - 1);
      setRange({ first, last: end < lastDate ? end : lastDate });
    }
    if (index >= dates.length - 1 - RAIL_BUFFER && lastDate < today) {
      const end = shiftRecordDate(lastDate, RAIL_RADIUS);
      const last = end < today ? end : today;
      const start = shiftRecordDate(last, 1 - MAX_RAIL_DAYS);
      setRange({ first: start > firstDate ? start : firstDate, last });
    }
    navigate(`/records/${selectedDate}`, { replace: true, state });
  }, [date, dates, firstDate, lastDate, navigate, state, today]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    rail.addEventListener("scrollend", finishScroll);
    return () => {
      rail.removeEventListener("scrollend", finishScroll);
      window.clearTimeout(settleTimer.current);
    };
  }, [finishScroll]);

  function handleScroll(event) {
    const rail = event.currentTarget;
    layoutRef.current.left = rail.scrollLeft;
    const index = Math.round(rail.scrollLeft / rail.clientWidth);
    const visibleDate = dates[index];
    if (visibleDate && visibleDate !== previewDate) setPreviewDate(visibleDate);

    if ("onscrollend" in rail) return;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(finishScroll, SCROLL_SETTLE_MS);
  }

  function scrollToIndex(index) {
    const rail = railRef.current;
    const left = index * rail.clientWidth;
    requestedIndex.current = index;
    if (Math.abs(rail.scrollLeft - left) < 1) {
      finishScroll();
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    rail.scrollTo({ left, behavior: reducedMotion ? "instant" : "smooth" });
  }

  function moveSlide(offset) {
    const rail = railRef.current;
    const index = requestedIndex.current ?? Math.round(rail.scrollLeft / rail.clientWidth);
    if (dates[index + offset]) scrollToIndex(index + offset);
  }

  function handlePointerDown(event) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    skipClick.current = false;
    const rail = event.currentTarget;
    const index = requestedIndex.current ?? Math.round(rail.scrollLeft / rail.clientWidth);
    requestedIndex.current = null;
    dragRef.current = {
      id: event.pointerId,
      index,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      left: event.currentTarget.scrollLeft,
      isDragging: false,
    };
  }

  function handlePointerMove(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const rail = event.currentTarget;
    const distance = drag.x - event.clientX;

    if (!drag.isDragging) {
      if (Math.abs(distance) < DRAG_THRESHOLD) return;
      if (Math.abs(distance) < Math.abs(drag.y - event.clientY)) {
        dragRef.current = null;
        return;
      }
      drag.isDragging = true;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add("record-rail--dragging");
      window.getSelection()?.removeAllRanges();
    }

    event.preventDefault();
    rail.scrollLeft = drag.left + distance;
    layoutRef.current.left = rail.scrollLeft;
  }

  function handlePointerEnd(event) {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    if (!drag.isDragging) return;

    const rail = event.currentTarget;
    const distance = drag.x - event.clientX;
    const nearestIndex = Math.round(rail.scrollLeft / rail.clientWidth);
    const flicked = Math.abs(distance) >= FLICK_THRESHOLD && event.timeStamp - drag.time < FLICK_MAX_MS;
    const pages = Math.round(distance / rail.clientWidth) || (flicked ? Math.sign(distance) : 0);
    const targetIndex = event.type === "pointerup"
      ? Math.min(dates.length - 1, Math.max(0, drag.index + pages))
      : nearestIndex;
    skipClick.current = true;
    rail.classList.remove("record-rail--dragging");
    scrollToIndex(targetIndex);
  }

  function handleKeys(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveSlide(event.key === "ArrowLeft" ? -1 : 1);
  }

  function returnToCalendar() {
    const rail = railRef.current;
    const visibleDate = dates[Math.round(rail.scrollLeft / rail.clientWidth)] ?? date;
    if (calendarKey) {
      rememberDate(calendarKey, visibleDate);
      navigate(-1);
    } else {
      navigate(recordCalendarLocation(visibleDate), { replace: true, state: { focusCalendar: true } });
    }
  }

  return (
    <main className="record-page" onKeyDown={handleKeys}>
      <SubPageHeader title="그날의 기록" backRef={backRef} backLabel="홈" onBack={returnToCalendar}>
        <div className="record-arrows">
          <button type="button" aria-label="이전 날짜" disabled={!previous} onClick={() => moveSlide(-1)}><Icon name="chevronLeft" /></button>
          <button type="button" aria-label="다음 날짜" disabled={!next} onClick={() => moveSlide(1)}><Icon name="chevronRight" /></button>
        </div>
      </SubPageHeader>
      <span className="record-date-announcement" role="status">{DAY_LABEL.format(new Date(date))}</span>
      <div
        className="record-rail"
        ref={railRef}
        onScroll={handleScroll}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onPointerLeave={() => {
          if (!dragRef.current?.isDragging) dragRef.current = null;
        }}
        onDragStart={(event) => event.preventDefault()}
        onClickCapture={(event) => {
          if (!skipClick.current || event.detail === 0) return;
          skipClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
        aria-label="그날의 기록"
        role="group"
      >
        {dates.map((slideDate, index) => (
          <section key={slideDate} className="record-slide" inert={slideDate !== date}>
            <DayRecords
              date={slideDate}
              isToday={slideDate === today}
              shouldLoad={slideDate === date || Math.abs(previewIndex - index) <= PREFETCH_RADIUS}
            />
          </section>
        ))}
      </div>
    </main>
  );
}

export default function RecordDayPage() {
  const { date } = useParams();
  const today = todayKST();
  if (!isRecordDate(date) || date > today) {
    return <Navigate to={recordCalendarLocation(today)} replace state={{ focusCalendar: true }} />;
  }
  return <RecordCarousel date={date} today={today} />;
}
