import Icon from "./Icon";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import client from "../api/client";

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


export default function MissionList({ missions, isPending, isError, onRetry }) {
  const qc = useQueryClient();
  const [result, setResult] = useState(null);
  // 회고 입력창이 열린 미션: { id, action: "complete" | "skip" }
  const [pending, setPending] = useState(null);
  const [note, setNote] = useState("");

  const openFeedback = (id, action) => { setPending({ id, action }); setNote(""); };

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
                  {mission.reason && <p className="mission-reason"><Icon name="bulb" /> {mission.reason}</p>}
                  {mission.helper && <p className="mission-helper"><Icon name="user" /> 막히면: {mission.helper}</p>}
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
                      onClick={() => openFeedback(mission.id, "skip")}
                    >어려워요</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <nav className="mission-links" aria-label="미션 관련 메뉴">
          <Link to="/prompt" className="main-analysis-link">
            <span><Icon name="pencil" /> 미션 맞춤 설정</span><Icon name="arrowRight" />
          </Link>
          <Link to="/community" className="main-analysis-link">
            <span><Icon name="globe" /> 함께 해낸 미션</span><Icon name="arrowRight" />
          </Link>
        </nav>
      </section>
    </>
  );
}
