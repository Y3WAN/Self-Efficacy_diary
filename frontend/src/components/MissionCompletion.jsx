export default function MissionCompletion({ mission, isChecking = false, checkFailed = false }) {
  const status = mission.attempts?.at(-1)?.status;
  let label;
  if (isChecking) label = "확인 중";
  else if (checkFailed) label = "확인하지 못했어요";
  else if (status === "met") label = "✓ 기준 충족";
  else if (status === "needs_revision") label = "✕ 보완 필요";

  if (!mission.completion && !label) return null;
  return (
    <p className="mission-completion">
      {mission.completion && <span>완료 기준 · {mission.completion}</span>}
      <span role="status" className="mission-assessment-status">{label}</span>
    </p>
  );
}
