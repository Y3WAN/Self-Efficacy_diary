import { Link } from "react-router-dom";

// 일기 저장 직후 AI가 찾아 준 '오늘 해낸 것' + 이어지는 미션
export default function ReflectionCard({ reflection, mission, isPending, isError, onRequest }) {
  if (isPending) {
    return (
      <div className="reflection-card reflection-card--pending" role="status">
        <span className="reflection-spinner" aria-hidden="true" />
        AI가 오늘 해낸 것을 찾고 있어요…
      </div>
    );
  }

  if (!reflection) {
    if (!onRequest) return null;
    return (
      <div className="reflection-card reflection-card--empty">
        {isError && <p className="reflection-error">AI 응답을 받지 못했어요.</p>}
        <button type="button" className="reflection-request-btn" onClick={onRequest}>
          {isError ? "다시 시도" : "✨ AI에게 오늘 해낸 것 찾아 달라고 하기"}
        </button>
      </div>
    );
  }

  return (
    <div className="reflection-card">
      <p className="reflection-label">✨ 오늘 해낸 것</p>
      <ul className="reflection-achievements">
        {reflection.achievements.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      {reflection.message && <p className="reflection-message">{reflection.message}</p>}
      {mission && (
        <div className="reflection-mission">
          <p className="reflection-label">🎯 이어서 해 볼 미션</p>
          <p className="reflection-mission-content">{mission.content}</p>
          {mission.reason && <p className="reflection-mission-reason">{mission.reason}</p>}
          <Link to="/" className="reflection-mission-link">오늘의 미션에서 보기 →</Link>
        </div>
      )}
    </div>
  );
}
