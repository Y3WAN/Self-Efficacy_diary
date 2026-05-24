import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";

const CELEBRATIONS = [
  { emoji: "🎉", message: "미션 완료! 오늘도 한 걸음 성장했어요." },
  { emoji: "🔥", message: "대단해요! 작은 실천이 큰 변화를 만들어요." },
  { emoji: "⭐", message: "완벽해요! 이 기세로 계속 나아가요." },
  { emoji: "🏆", message: "해냈어요! 오늘의 나, 정말 잘했어요." },
];

function CelebrationModal({ onClose }) {
  const c = CELEBRATIONS[Math.floor(Math.random() * CELEBRATIONS.length)];
  return (
    <div className="celebration-overlay" onClick={onClose}>
      <div className="celebration-card" onClick={(e) => e.stopPropagation()}>
        <span className="celebration-emoji">{c.emoji}</span>
        <p className="celebration-message">{c.message}</p>
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
  const [showCelebration, setShowCelebration] = useState(false);

  const complete = useMutation({
    mutationFn: (id) => client.post(`/api/missions/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["missions"] });
      qc.invalidateQueries({ queryKey: ["me"] });
      setShowCelebration(true);
    },
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
      {showCelebration && <CelebrationModal onClose={() => setShowCelebration(false)} />}
      <div className="mission-list">
        <h3 className="mission-title">오늘의 미션</h3>
        {missions.map((m) => (
          <div key={m.id} className="mission-item">
            <span className="mission-target">{m.target_var}</span>
            <p className="mission-content">{m.content}</p>
            <button className="mission-done-btn" onClick={() => complete.mutate(m.id)}>완료</button>
          </div>
        ))}
      </div>
    </>
  );
}
