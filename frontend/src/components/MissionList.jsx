import Icon from "./Icon";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import client from "../api/client";
import MissionTask from "./MissionTask";

// 점수 대신 담백한 한마디. 해낸 미션을 그대로 짚어 준다.
function ResultModal({ result, onClose }) {
  return (
    <div className="celebration-overlay" onClick={onClose}>
      <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
        <Icon name={result.skipped ? "sprout" : "sparkle"} className="celebration-icon" />
        {result.skipped ? (
          <>
            <p className="celebration-message">괜찮아요. 다음 미션은 더 작게 준비할게요.</p>
            {result.helper && <p className="celebration-helper"><Icon name="user" /> 도움이 필요하면: {result.helper}</p>}
          </>
        ) : (
          <>
            <p className="celebration-message">해냈어요.</p>
            <p className="celebration-helper">"{result.content}"</p>
          </>
        )}
        <button className="celebration-btn" onClick={onClose}>확인</button>
      </div>
    </div>
  );
}


// '어려워요' → AI 조력자 상담. 미션 하나당 물어볼 수 있는 횟수가 정해져 있고, 다 쓰면 내일로 미룰 수 있다.
function HelperPanel({ mission, onClose, onGiveUp }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const remaining = mission.help_remaining ?? 0;
  const chat = mission.help_messages ?? [];

  const replaceMission = (updated) =>
    qc.setQueryData(["missions", "active"], (old) => old?.map((m) => (m.id === updated.id ? updated : m)));

  const ask = useMutation({
    mutationFn: (text) => client.post(`/api/missions/${mission.id}/help`, { message: text }).then((r) => r.data),
    onSuccess: (updated) => { setMessage(""); replaceMission(updated); },
    onError: (error) => {
      toast.error(error.response?.status === 409 ? "상담 기회를 모두 썼어요." : "조력자의 답을 받지 못했어요. 잠시 후 다시 물어봐 주세요.");
      qc.invalidateQueries({ queryKey: ["missions"] });
    },
  });

  const postpone = useMutation({
    mutationFn: () => client.post(`/api/missions/${mission.id}/postpone`).then((r) => r.data),
    onSuccess: async () => {
      toast.success("내일 오늘의 미션에 다시 보여 드릴게요.");
      onClose();
      await qc.invalidateQueries({ queryKey: ["missions"] });
      qc.invalidateQueries({ queryKey: ["mission-stack"] });
    },
    onError: () => toast.error("미루지 못했어요."),
  });

  const busy = ask.isPending || postpone.isPending;

  return (
    <section className="mission-helper-panel" aria-label="AI 조력자">
      <p className="helper-intro">
        <Icon name="user" /> 어디서 막혔는지 편하게 적어 주세요. 같이 더 작은 첫 걸음을 찾아볼게요.
      </p>
      {chat.length > 0 && (
        <ol className="helper-chat">
          {chat.map((turn, index) => (
            <li key={index} className={`helper-bubble helper-bubble--${turn.role}`}>
              {turn.expert && <span className="helper-expert">{turn.expert}</span>}
              {turn.content}
            </li>
          ))}
        </ol>
      )}
      {ask.isPending && (
        <ol className="helper-chat" aria-live="polite">
          <li className="helper-bubble helper-bubble--user">{ask.variables}</li>
          <li className="helper-bubble helper-bubble--assistant helper-bubble--pending">답을 생각하고 있어요…</li>
        </ol>
      )}

      {remaining > 0 ? (
        <form
          className="helper-form"
          onSubmit={(event) => {
            event.preventDefault();
            const text = message.trim();
            if (text && !busy) ask.mutate(text);
          }}
        >
          <label htmlFor={`helper-input-${mission.id}`} className="helper-remaining">
            조력자에게 {remaining}번 더 물어볼 수 있어요
          </label>
          <div className="helper-input-row">
            <textarea
              id={`helper-input-${mission.id}`}
              className="mission-feedback-input"
              maxLength={300}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={chat.length ? "더 궁금한 점을 적어 주세요" : "예) 어디서부터 시작해야 할지 모르겠어요"}
              disabled={busy}
            />
            <button type="submit" className="helper-send-btn" aria-label="전송" disabled={busy || !message.trim()}>
              <Icon name="arrowUp" />
            </button>
          </div>
        </form>
      ) : (
        <p className="helper-remaining">
          상담 기회를 모두 썼어요. {mission.can_postpone ? "지금 해 보기 어렵다면 내일로 미뤄도 괜찮아요." : ""}
        </p>
      )}

      <div className="mission-actions helper-actions">
        <button type="button" className="mission-done-btn" disabled={busy} onClick={onClose}>해 볼게요</button>
        {mission.can_postpone && (
          <button type="button" className="mission-done-btn helper-postpone-btn" disabled={busy} onClick={() => postpone.mutate()}>
            내일로 미루기
          </button>
        )}
        <button type="button" className="mission-skip-btn" disabled={busy} onClick={onGiveUp}>이번 미션은 그만할래요</button>
      </div>
    </section>
  );
}


export default function MissionList({ missions, isPending, isError, onRetry }) {
  const qc = useQueryClient();
  const [result, setResult] = useState(null);
  // AI 조력자 상담창이 열린 미션 id
  const [helperId, setHelperId] = useState(null);
  // 회고 입력창이 열린 미션: { id, action: "complete" | "skip" }
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState("");

  const openFeedback = (id, action) => { setHelperId(null); setPending({ id, action }); setNote(""); };
  const openHelper = (id) => { setPending(null); setHelperId(id); };

  const updateMission = useMutation({
    mutationFn: ({ id, action, reflection }) =>
      client.post(`/api/missions/${id}/${action}`, reflection ? { reflection } : undefined),
    onSuccess: async (response, { action }) => {
      setPending(null);
      setNote("");
      setResult({ ...response.data, skipped: action === "skip" });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["missions"] }),
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["dashboard", "elo"] }),
        qc.invalidateQueries({ queryKey: ["community-feed"] }),
        qc.invalidateQueries({ queryKey: ["mission-stack"] }),
      ]);
    },
    onError: async (error) => {
      if (error.response?.status === 409) {
        toast.error("이미 완료 또는 어려워요를 누른 미션이에요.");
        await qc.invalidateQueries({ queryKey: ["missions"] });
      } else {
        toast.error("미션 상태를 저장하지 못했어요.");
      }
    },
  });

  return (
    <>
      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
      <section className="mission-list" aria-labelledby="active-missions-title">
        <h2 id="active-missions-title" className="mission-title">오늘의 미션</h2>
        {isPending && <p className="mission-empty">미션을 불러오는 중이에요.</p>}
        {isError && <button className="mission-done-btn" onClick={onRetry}>미션 다시 불러오기</button>}
        {!isPending && !isError && missions.length === 0 && (
          <p className="mission-empty">진행 중인 미션이 없어요. 오늘 일기를 쓰면 다음 미션이 준비돼요.</p>
        )}
        {missions.length > 0 && (
          <ul className="main-scroll-list mission-items">
            {missions.map((mission) => (
              <li key={mission.id} className="mission-item">
                <div className="mission-body">
                  <p className="mission-content">{mission.content}</p>
                  <MissionTask
                    mission={mission}
                    post={(path, body) => client.post(path, body).then((r) => r.data)}
                    onUpdated={(updated) =>
                      qc.setQueryData(["missions", "active"], (old) => old?.map((m) => (m.id === updated.id ? updated : m)))}
                    onError={(message) => toast.error(message)}
                  />
                </div>
                {pending?.id === mission.id ? (
                  <form
                    className="mission-feedback"
                    onSubmit={(event) => {
                      event.preventDefault();
                      updateMission.mutate({ ...pending, reflection: note.trim() });
                    }}
                  >
                    <label htmlFor={`mission-note-${mission.id}`}>
                      {pending.action === "complete" ? "해 보니 어땠어요?" : "어떤 점이 어려웠어요?"}
                      <span className="mission-feedback-optional"> (안 써도 돼요 · 다음 미션 만들 때 참고해요)</span>
                    </label>
                    <textarea
                      id={`mission-note-${mission.id}`}
                      className="mission-feedback-input"
                      maxLength={300}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      placeholder={pending.action === "complete"
                        ? "예) 생각보다 금방 끝나서 하나 더 했어요"
                        : "예) 시간이 부족했어요, 너무 막막했어요"}
                    />
                    <div className="mission-actions">
                      <button type="submit" className="mission-done-btn" disabled={updateMission.isPending}>
                        기록하기
                      </button>
                      <button
                        type="button"
                        className="mission-skip-btn"
                        disabled={updateMission.isPending}
                        onClick={() => setPending(null)}
                      >취소</button>
                    </div>
                  </form>
                ) : helperId === mission.id ? (
                  <HelperPanel
                    mission={mission}
                    onClose={() => setHelperId(null)}
                    onGiveUp={() => openFeedback(mission.id, "skip")}
                  />
                ) : (
                  <div className="mission-actions">
                    <button
                      className="mission-done-btn"
                      disabled={updateMission.isPending}
                      onClick={() => openFeedback(mission.id, "complete")}
                    >해냈어요</button>
                    <button
                      className="mission-skip-btn"
                      disabled={updateMission.isPending}
                      onClick={() => openHelper(mission.id)}
                    >어려워요</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <nav className="mission-links" aria-label="미션 관련 메뉴">
          <Link to="/prompt" state={{ fromMain: true }} className="main-analysis-link">
            <span><Icon name="pencil" /> 맞춤 미션</span><Icon name="arrowRight" />
          </Link>
          <Link to="/community" state={{ fromMain: true }} className="main-analysis-link">
            <span><Icon name="globe" /> 함께 해낸 미션</span><Icon name="arrowRight" />
          </Link>
        </nav>
      </section>
    </>
  );
}
