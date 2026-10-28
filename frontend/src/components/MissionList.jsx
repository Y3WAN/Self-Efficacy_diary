import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

function useMissions() {
  return useQuery({
    queryKey: ["missions"],
    queryFn: () => client.get("/api/missions").then((r) => r.data),
  });
}

export default function MissionList() {
  const { data: missions = [] } = useMissions();
  const qc = useQueryClient();
  const [result, setResult] = useState(null);

  const onDone = (skipped) => (res) => {
    qc.invalidateQueries({ queryKey: ["missions"] });
    qc.invalidateQueries({ queryKey: ["me"] });
    qc.invalidateQueries({ queryKey: ["dashboard", "elo"] });
    setResult({ ...res.data, skipped });
  };

  const complete = useMutation({
    mutationFn: (id) => client.post(`/api/missions/${id}/complete`),
    onSuccess: onDone(false),
  });

  const skip = useMutation({
    mutationFn: (id) => client.post(`/api/missions/${id}/skip`),
    onSuccess: onDone(true),
  });

  if (missions.length === 0) {
    return (
      <div className="mission-list">
        <h3 className="mission-title">오늘의 미션</h3>
        <p className="mission-empty">미션이 아직 없어요. 일기를 쓰면 내일 아침 미션이 생겨요! ✨</p>
      </div>
    );
  }

  return (
    <>
      {result && <ResultModal result={result} onClose={() => setResult(null)} />}
      <div className="mission-list">
        <h3 className="mission-title">오늘의 미션</h3>
        {missions.map((m) => (
          <div key={m.id} className="mission-item">
            <span className="mission-target">{m.target_var}</span>
            <p className="mission-content">
              {m.content}
              {m.level && <span className="mission-level">Lv{m.level}</span>}
            </p>
            <div className="mission-actions">
              <button className="mission-done-btn" onClick={() => complete.mutate(m.id)}>완료</button>
              <button className="mission-skip-btn" onClick={() => skip.mutate(m.id)}>어려워요</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
