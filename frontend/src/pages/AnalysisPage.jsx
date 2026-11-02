import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import client from "../api/client";

const SOURCES = [
  { key: "m", label: "성취경험", code: "M", weight: 0.4 },
  { key: "v", label: "대리경험", code: "V", weight: 0.2 },
  { key: "p", label: "사회적 설득", code: "P", weight: 0.2 },
  { key: "a", label: "정서·신체", code: "A", weight: 0.2 },
];

const pct = (v) => Math.round(v * 100);

function confidenceLevel(c) {
  if (c >= 0.7) return { text: "높음", cls: "conf--high" };
  if (c >= 0.3) return { text: "보통", cls: "conf--mid" };
  return { text: "낮음", cls: "conf--low" };
}

function AnalysisCard({ a, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const conf = confidenceLevel(a.confidence);

  return (
    <div className="chart-card analysis-card">
      <button className="analysis-head" onClick={() => setOpen(!open)}>
        <span className="analysis-date">{a.date.slice(5).replace("-", "/")}</span>
        <span className="analysis-score">
          {a.composite_score != null ? `${pct(a.composite_score)}점` : "미반영"}
        </span>
        <span className={`conf-badge ${conf.cls}`}>확신도 {pct(a.confidence)}% · {conf.text}</span>
        <span className="analysis-toggle">{open ? "▲" : "▼"}</span>
      </button>

      {a.is_initial && <p className="analysis-note">가입 설문으로 정한 시작 점수예요.</p>}
      {!a.is_reflected && (
        <p className="analysis-note analysis-note--warn">
          확신도가 30% 미만이라 성장 그래프에 반영하지 않았어요. (일기가 짧으면 판단 근거가 부족해요)
        </p>
      )}

      {open && (
        <div className="analysis-body">
          {SOURCES.map((s) => {
            const score = a[`score_${s.key}`];
            const ev = a[`evidence_${s.key}`];
            return (
              <div key={s.key} className="analysis-row">
                <div className="analysis-row-top">
                  <span className="analysis-label">{s.label}({s.code}) <em>×{s.weight}</em></span>
                  <span className="analysis-val">{pct(score)}</span>
                </div>
                <div className="analysis-bar"><div style={{ width: `${pct(score)}%` }} /></div>
                {ev && <p className="analysis-evidence">{ev}</p>}
              </div>
            );
          })}
          {a.reasoning && !a.is_initial && (
            <div className="analysis-reason">
              <strong>AI 종합 판단</strong>
              <p>{a.reasoning}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AnalysisPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["dashboard", "analyses"],
    queryFn: () => client.get("/api/dashboard/analyses").then((r) => r.data),
  });

  return (
    <div className="main-page">
      <AppBar />
      <div className="main-content">
        <div className="chart-card">
          <h3 className="chart-title">AI 분석 근거</h3>
          <p className="chart-sub" style={{ marginBottom: 8 }}>
            AI가 일기에서 반두라의 자기효능감 4원천을 0~100점으로 평가한 근거예요.
          </p>
          <p className="analysis-formula">
            종합 점수 = 성취 0.4 + 대리 0.2 + 설득 0.2 + 정서 0.2 · 확신도 30% 미만은 그래프에서 제외
          </p>
        </div>
        {isLoading && <div className="chart-empty">불러오는 중...</div>}
        {!isLoading && !data.length && (
          <div className="chart-empty">아직 분석된 일기가 없어요. 일기를 쓰면 자정에 분석돼요.</div>
        )}
        {data.map((a, i) => <AnalysisCard key={`${a.date}-${i}`} a={a} defaultOpen={i === 0} />)}
        <p className="notice-text">
          AI 분석은 자기 성찰을 돕기 위한 참고 정보이며 심리 진단이 아니에요.
        </p>
      </div>
    </div>
  );
}
