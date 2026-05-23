import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../store/auth";
import { PERSONAS } from "../lib/persona";
import AppBar from "../components/AppBar";
import client from "../api/client";

function usePersona() {
  return useQuery({
    queryKey: ["persona"],
    queryFn: () => client.get("/api/persona").then((r) => r.data),
  });
}

const SOURCE_LABEL = { initial_grade: "첫 페르소나", ai_reclassify: "AI 재분류" };

export default function PersonaPage() {
  const { user } = useAuthStore();
  const { data } = usePersona();
  const persona = user ? PERSONAS[user.current_persona] : null;

  return (
    <div className="main-page">
      <AppBar />
      <div className="main-content">
        {persona && (
          <div className="persona-card">
            <div className={`motion-${persona.motion}`}>
              <span className="persona-big-emoji persona-emoji">{persona.emoji}</span>
            </div>
            <h2>{persona.label}</h2>
            <p className="persona-tagline">{persona.tagline}</p>
          </div>
        )}

        {data?.history?.length > 0 && (
          <div className="timeline-card">
            <h3 className="chart-title">페르소나 변경 이력</h3>
            <div className="timeline">
              {data.history.map((h, i) => (
                <div key={h.id} className="timeline-item">
                  <div className="timeline-dot" />
                  {i < data.history.length - 1 && <div className="timeline-line" />}
                  <div className="timeline-content">
                    <div className="timeline-header">
                      <span className="timeline-persona">{h.persona}</span>
                      <span className="timeline-source">{SOURCE_LABEL[h.source]}</span>
                    </div>
                    {h.reasoning && (
                      <p className="timeline-reason">{h.reasoning}</p>
                    )}
                    <p className="timeline-date">
                      {new Date(h.created_at).toLocaleDateString("ko-KR")}
                      {h.diary_count_at != null && ` · 일기 ${h.diary_count_at}개 시점`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
