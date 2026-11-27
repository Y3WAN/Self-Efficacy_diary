import Icon from "./Icon";
import { useRef, useState } from "react";
import MissionCompletion from "./MissionCompletion";

// 분야별 미션의 '해 보기' 부분: 완료 기준, 함께 주는 자료(지문·문제·카드), 한 가지 확인 질문,
// 답·수행 결과 남기기와 그 답에 맞춘 피드백. 기존 미션(필드 없음)에서는 아무것도 그리지 않는다.
// post(path, body) → 갱신된 미션을 돌려주는 함수, onUpdated(mission)로 화면을 바꾼다.
export default function MissionTask({ mission, post, onUpdated, onError, onBusyChange }) {
  const [choice, setChoice] = useState(null);
  const [scale, setScale] = useState(null);
  const [text, setText] = useState("");
  const [custom, setCustom] = useState("");
  const [pending, setPending] = useState(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const inFlight = useRef(false);

  const material = mission.material;
  const attempts = mission.attempts ?? [];
  const last = attempts[attempts.length - 1];
  const type = mission.response_type ?? "none";
  const canAnswer = type !== "none" && (mission.attempts_remaining ?? 0) > 0;
  const isWrittenType = type === "text" || type === "scale_text";
  const busy = pending !== null;
  const isChecking = pending === "assessment";
  const revisionPrompt = isWrittenType && last?.status === "needs_revision"
    ? last.retry_hint || mission.response_prompt
    : null;
  const answerPrompt = revisionPrompt || mission.response_prompt;
  const ready = type === "choice" ? choice !== null : type === "scale_text" ? scale !== null : text.trim().length > 0;

  const send = async (path, body, reset) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const checksWrittenAnswer = path === "answer" && isWrittenType && Boolean(body.text);
    setPending(checksWrittenAnswer ? "assessment" : path);
    setCheckFailed(false);
    onBusyChange?.(true);
    try {
      const updated = await post(`/api/missions/${mission.id}/${path}`, body);
      await onUpdated(updated);
      reset?.(updated);
    } catch (error) {
      if (checksWrittenAnswer && (!error.response || error.response.status === 502)) {
        setCheckFailed(true);
      } else {
        onError?.(error.response?.data?.detail || "저장하지 못했어요. 잠시 후 다시 해 주세요.");
      }
    } finally {
      inFlight.current = false;
      setPending(null);
      onBusyChange?.(false);
    }
  };

  const submitAnswer = (event) => {
    event.preventDefault();
    if (!canAnswer || !ready) return;
    const body = { text: text.trim() || undefined, attempt_index: attempts.length };
    if (type === "choice") body.choice = choice;
    if (type === "scale_text") body.scale = scale;
    send("answer", body, (updated) => {
      if (updated.attempts?.at(-1)?.status === "needs_revision") return;
      setText("");
      setChoice(null);
      setScale(null);
    });
  };

  return (
    <div className="mission-task">
      <MissionCompletion mission={mission} isChecking={isChecking} checkFailed={checkFailed} />

      {mission.help_guide && (
        <div className="mission-guide" role="note">
          <p className="mission-guide-title"><Icon name="info" /> {mission.help_guide.title}</p>
          <p>{mission.help_guide.text}</p>
          <p className="mission-source">출처: {mission.help_guide.source} · {mission.help_guide.review_label}</p>
        </div>
      )}

      {mission.clarify && (
        <div className="mission-clarify">
          <p className="mission-clarify-question">{mission.clarify.question}</p>
          <p className="mission-clarify-hint">답하면 미션을 거기에 맞춰 바꿔 드려요.</p>
          {mission.clarify.options?.length > 0 && (
            <div className="mission-clarify-options">
              {mission.clarify.options.map((option) => (
                <button key={option.value} type="button" className="mission-chip" disabled={busy}
                  onClick={() => send("clarify", { answer: option.value })}>
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <form className="mission-clarify-form" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) send("clarify", { answer: custom.trim() }, () => setCustom("")); }}>
            <input className="mission-feedback-input" maxLength={60} value={custom} disabled={busy}
              placeholder="직접 적어도 돼요" onChange={(e) => setCustom(e.target.value)} aria-label={mission.clarify.question} />
            <button type="submit" className="mission-chip" disabled={busy || !custom.trim()}>알려 주기</button>
          </form>
        </div>
      )}

      {material && (
        <section className="mission-material" aria-label="미션 자료">
          <p className="mission-material-title">{material.title}</p>
          {material.passage && <p className="mission-material-passage">{material.passage}</p>}
          {material.steps?.length > 0 && (
            <ol className="mission-material-steps">
              {material.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          )}
          {material.example && <p className="mission-material-example">예) {material.example}</p>}
          {material.question && <p className="mission-material-question">{material.question}</p>}
          {material.type === "mcq" && (
            <ol className="mission-choices">
              {material.choices.map((label, index) => {
                const picked = canAnswer ? choice === index : last?.choice === index;
                const isAnswer = material.answer === index;
                return (
                  <li key={label}>
                    <label className={`mission-choice${picked ? " mission-choice--picked" : ""}${isAnswer ? " mission-choice--answer" : ""}`}>
                      <input type="radio" name={`choice-${mission.id}`} disabled={!canAnswer || busy || type !== "choice"}
                        checked={picked} onChange={() => setChoice(index)} />
                      <span>{index + 1}. {label}</span>
                      {isAnswer && <span className="mission-choice-tag">정답</span>}
                    </label>
                  </li>
                );
              })}
            </ol>
          )}
          <p className="mission-source">출처: {material.source} · {material.review_label}</p>
        </section>
      )}

      {last && !isChecking && !checkFailed && (
        <div className="mission-answer-result" aria-live="polite">
          {last.correct === true && <p className="mission-grade mission-grade--ok">맞았어요</p>}
          {last.correct === false && <p className="mission-grade">정답은 {material?.answer + 1}번이에요</p>}
          <p className="mission-feedback-text">{last.feedback}</p>
          {!canAnswer && revisionPrompt && <p className="mission-feedback-text">{revisionPrompt}</p>}
        </div>
      )}

      {canAnswer && (
        <form className="mission-answer" onSubmit={submitAnswer}>
          {answerPrompt && <label htmlFor={`answer-${mission.id}`} className="mission-answer-prompt">{answerPrompt}</label>}
          {type === "scale_text" && (
            <div className="mission-scale" role="radiogroup" aria-label="부담 정도 1~5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={scale === n}
                  className={`mission-chip${scale === n ? " mission-chip--on" : ""}`} disabled={busy} onClick={() => setScale(n)}>
                  {n}
                </button>
              ))}
              <span className="mission-scale-hint">1 가벼움 · 5 힘듦</span>
            </div>
          )}
          <textarea id={`answer-${mission.id}`} className="mission-feedback-input" maxLength={300} value={text} disabled={busy}
            placeholder={type === "choice" ? "고른 까닭 (안 써도 돼요)" : "해 본 내용을 적어 주세요"}
            onChange={(e) => setText(e.target.value)} />
          <button type="submit" className="mission-done-btn" disabled={busy || !ready}>
            {busy ? "보는 중이에요…" : attempts.length ? "다시 남기기" : "답 남기기"}
          </button>
        </form>
      )}
    </div>
  );
}
