import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import client from "../api/client";

const CELEBRATIONS = [
  { emoji: "🎉", message: "미션 완료! 오늘도 한 걸음 성장했어요." },
  { emoji: "🔥", message: "대단해요! 작은 실천이 큰 변화를 만들어요." },
  { emoji: "⭐", message: "완벽해요! 이 기세로 계속 나아가요." },
  { emoji: "🏆", message: "해냈어요! 오늘의 나, 정말 잘했어요." },
];

const SKIP_MESSAGE = { emoji: "🌱", message: "괜찮아요! 다음 미션은 조금 더 가볍게 준비할게요." };

function ResultModal({ result, onClose }) {
  const [c] = useState(() =>
    result.skipped ? SKIP_MESSAGE : CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)]
  );
  const delta = result.elo_after - result.elo_before;
  return (
    <div className="celebration-overlay" onClick={onClose}>
      <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
        <span className="celebration-emoji">{c.emoji}</span>
        <p className="celebration-message">{c.message}</p>
        <p className="celebration-elo">
          성장 지수 {result.elo_after}
          <span className={delta >= 0 ? "elo-up" : "elo-down"}>
            {delta >= 0 ? ` ▲${delta}` : ` ▼${-delta}`}
          </span>
        </p>
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
        toast.error("이미 처리된 미션이에요.");
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
                  {mission.reason && <p className="mission-reason">💡 {mission.reason}</p>}
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
                      <span className="mission-feedback-optional"> (선택 · 다음 미션에 반영돼요)</span>
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
                        {pending.action === "complete" ? "완료 기록" : "어려워요 기록"}
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
                    >완료</button>
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
      </section>
    </>
  );
}
