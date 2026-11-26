import { useState } from "react";

// 미션 쌓기: 끝난 미션을 책처럼 쌓는다. 새 책이 맨 위. 나만 본다.
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

export default function MissionStack({ query, filter, onFilterChange, headingRef }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isPending, refetch } = query;
  const books = (data?.books ?? []).filter((b) =>
    filter === "all" ? true : filter === "postponed" ? b.was_postponed : b.status === filter
  );
  const shown = expanded ? books : books.slice(-COLLAPSED);
  const hasMore = !expanded && books.length > COLLAPSED;

  return (
    <section id="mission-bookshelf" className="stack-card" aria-labelledby="stack-title" aria-busy={isPending}>
      <div className="stack-head">
        <h2 id="stack-title" ref={headingRef} tabIndex={-1}>미션 책장</h2>
        {data && <span className="stack-total">완료 {data.done_count}권</span>}
      </div>
      {isPending && <p className="community-empty">미션을 불러오는 중이에요.</p>}
      {!data && !isPending && (
        <button type="button" className="respect-btn" onClick={() => refetch()}>다시 불러오기</button>
      )}
      {data && (
        <>
          <p className="stack-summary">
            어려워요 <strong>{data.skipped_count}</strong> · 미뤘던 미션 <strong>{data.postponed_count}</strong>
            {data.waiting_count > 0 && <> · 미뤄 둔 미션 {data.waiting_count}</>}
          </p>
          <div className="stack-filters" role="group" aria-label="책 골라 보기">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" aria-pressed={filter === f.key}
                className={`stack-filter${filter === f.key ? " stack-filter--on" : ""}`}
                onClick={() => onFilterChange(f.key)}>{f.label}</button>
            ))}
          </div>
          {books.length === 0 && (
            <p className="community-empty">
              {data.books.length === 0 ? "미션을 끝내면 여기에 책이 한 권씩 쌓여요." : "이 분류에는 아직 책이 없어요."}
            </p>
          )}
        </>
      )}
      {books.length > 0 && (
        <>
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
          {hasMore ? (
            <button type="button" className="stack-more" onClick={() => setExpanded(true)}>
              아래에 {books.length - COLLAPSED}권 더 있어요 · 모두 보기
            </button>
          ) : <div className="stack-floor" aria-hidden="true" />}
        </>
      )}
      <p className="stack-note">여기는 나만 봐요. 해낸 미션만 '함께 해낸 미션'에 올라가요.</p>
    </section>
  );
}
