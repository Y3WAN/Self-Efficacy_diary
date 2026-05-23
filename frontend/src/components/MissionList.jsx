import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";

function useMissions() {
  return useQuery({
    queryKey: ["missions"],
    queryFn: () => client.get("/api/missions").then((r) => r.data),
  });
}

export default function MissionList() {
  const { data: missions = [] } = useMissions();
  const qc = useQueryClient();

  const complete = useMutation({
    mutationFn: (id) => client.post(`/api/missions/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["missions"] }),
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
  );
}
