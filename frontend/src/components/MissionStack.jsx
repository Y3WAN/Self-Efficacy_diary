import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "../api/client";

// 미션 쌓기: 끝난 미션을 책처럼 쌓는다. 새 책이 맨 위. 나만 보는 탑이다.
const FILTERS = [
  { key: "all", label: "전체" },
  { key: "done", label: "해냈어요" },
  { key: "skipped", label: "어려워요" },
  { key: "postponed", label: "미뤘던 미션" },
];
const COLLAPSED = 12;

// 책마다 길이·어긋남을 조금씩 달리해 손으로 쌓은 느낌을 낸다 (id로 고정).
function bookShape(id) {
  const n = (id * 2654435761) % 1000;
  return { width: `${78 + (n % 22)}%`, marginLeft: `${(n >> 3) % 9}%` };
}

export default function MissionStack() {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["mission-stack"],
    queryFn: ({ signal }) => api.get("/api/missions/stack", { signal }).then((r) => r.data),
  });

  if (isLoading) return <section className="stack-card"><p className="community-empty">탑을 불러오는 중이에요.</p></section>;
  if (isError) return <section className="stack-card"><button className="respect-btn" onClick={() => refetch()}>다시 불러오기</button></section>;

  const books = data.books.filter((b) =>
    filter === "all" ? true : filter === "postponed" ? b.was_postponed : b.status === filter
  );
  const shown = expanded ? books : books.slice(-COLLAPSED);
  const total = data.done_count + data.skipped_count;

  return (
    <section className="stack-card" aria-labelledby="stack-title">
      <div className="stack-head">
        <h3 id="stack-title">나의 미션 탑</h3>
        <span className="stack-total">{total}권</span>
      </div>
      <p className="stack-summary">
        해냈어요 <strong>{data.done_count}</strong> · 어려워요 <strong>{data.skipped_count}</strong> · 미뤘던 미션 <strong>{data.postponed_count}</strong>
        {data.waiting_count > 0 && <> · 미뤄 둔 미션 {data.waiting_count}</>}
      </p>

      <div className="stack-filters" role="group" aria-label="책 골라 보기">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" aria-pressed={filter === f.key}
            className={`stack-filter${filter === f.key ? " stack-filter--on" : ""}`}
            onClick={() => setFilter(f.key)}>{f.label}</button>
        ))}
      </div>

      {books.length === 0 ? (
        <p className="community-empty">
          {total === 0 ? "미션을 끝내면 여기에 책이 한 권씩 쌓여요." : "이 분류에는 아직 책이 없어요."}
        </p>
      ) : (
        <>
          {!expanded && books.length > COLLAPSED && (
            <button type="button" className="stack-more" onClick={() => setExpanded(true)}>
              아래에 {books.length - COLLAPSED}권 더 있어요 · 모두 보기
            </button>
          )}
          <ol className="stack-books" reversed>
            {[...shown].reverse().map((b) => (
              <li key={b.id} className={`stack-book stack-book--${b.status}`} style={bookShape(b.id)}
                title={b.content}>
                <span className="stack-book-text">{b.content}</span>
                {b.was_postponed && <span className="stack-tag">미룸</span>}
                {b.respect_count > 0 && <span className="stack-tag stack-tag--cheer">응원 {b.respect_count}</span>}
              </li>
            ))}
          </ol>
          <div className="stack-floor" aria-hidden="true" />
        </>
      )}
      <p className="stack-note">이 탑은 나만 봐요. 해낸 미션만 아래 '함께 해낸 미션'에 올라가요.</p>
    </section>
  );
}
