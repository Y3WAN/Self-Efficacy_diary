import { Link, useSearchParams } from "react-router-dom";
import { dateKST } from "../utils/date";

const MISSION_STATUS = { done: "완료", skipped: "어려웠어요", expired: "기간 종료" };
const DIARY_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit",
});

function groupByDate(diaries, missions) {
  const groups = new Map();
  function getDay(date) {
    if (!groups.has(date)) groups.set(date, { date, diaries: [], missions: [] });
    return groups.get(date);
  }

  for (const mission of missions) {
    getDay(dateKST(mission.created_at)).missions.push(mission);
  }
  for (const diary of diaries) {
    getDay(diary.diary_date).diaries.push(diary);
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}

export default function ActivityHistory({ diaries, missions, isPending, onRetry }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const isOpen = searchParams.get("history") === "1";
  const groups = isOpen ? groupByDate(diaries, missions) : [];

  function updateOpen(event) {
    const nextOpen = event.currentTarget.open;
    if (nextOpen === isOpen) return;
    const params = new URLSearchParams(searchParams);
    if (nextOpen) params.set("history", "1");
    else params.delete("history");
    setSearchParams(params, { replace: true });
  }

  return (
    <details className="activity-history" open={isOpen} onToggle={updateOpen}>
      <summary>일기·미션 기록 보기</summary>
      {isPending && <p className="mission-empty">기록을 불러오는 중이에요.</p>}
      {onRetry && <button className="mission-done-btn" onClick={onRetry}>기록 다시 불러오기</button>}
      {isOpen && !isPending && !onRetry && groups.length === 0 && (
        <p className="mission-empty">아직 남긴 기록이 없어요.</p>
      )}
      {groups.length > 0 && (
        <ul className="activity-days">
          {groups.map((day) => (
            <li key={day.date} className="activity-day">
              <h3><time dateTime={day.date}>{day.date}</time></h3>
              {day.missions.map((mission) => (
                <div key={mission.id} className="activity-mission">
                  <p className="mission-content">{mission.content}</p>
                  <span className={`activity-status activity-status--${mission.status}`}>
                    {MISSION_STATUS[mission.status]}
                  </span>
                </div>
              ))}
              {day.diaries.map((diary) => (
                <Link
                  key={diary.id}
                  className="activity-diary"
                  to={`/diary/${diary.diary_date}#entry-${diary.id}`}
                  state={{ fromMain: true }}
                >
                  <span className="activity-diary-meta">일기 · {DIARY_TIME.format(new Date(diary.created_at))}</span>
                  <p className="activity-diary-preview">{diary.content}</p>
                </Link>
              ))}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
