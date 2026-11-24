import Icon from "../components/Icon";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import client from "../api/client";
import { SOURCES } from "../utils/sources";

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
      <button type="button" className="analysis-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="analysis-date">{a.date.slice(5).replace("-", "/")}</span>
        <span className="analysis-score">
          {a.composite_score != null ? `${pct(a.composite_score)}점` : "미반영"}
        </span>
        <span className={`conf-badge ${conf.cls}`}>확신도 {pct(a.confidence)}% · {conf.text}</span>
        <Icon name={open ? "chevronUp" : "chevronDown"} className="analysis-toggle" />
      </button>

      {a.is_initial && <p className="analysis-note">가입 설문으로 정한 시작 점수예요.</p>}
      {!a.is_reflected && (
        <p className="analysis-note analysis-note--warn">
          {a.evidence_sources
            ? "확신도가 30% 미만이라 성장 그래프에 반영하지 않았어요. (일기가 짧으면 판단 근거가 부족해요)"
            : "일기에서 4가지 경험의 근거를 찾지 못해 성장 그래프에 반영하지 않았어요."}
        </p>
      )}

      {open && (
        <div className="analysis-body">
          {SOURCES.map((s) => {
            const score = a[`score_${s.key}`];
            const ev = a[`evidence_${s.key}`];
            const hasEvidence = (a.evidence_sources ?? "").includes(s.code);
            return (
              <div key={s.key} className={`analysis-row${hasEvidence ? "" : " analysis-row--none"}`}>
                <div className="analysis-row-top">
                  <span className="analysis-label">{s.label} <em>×{s.weight}</em></span>
                  <span className="analysis-val">{hasEvidence ? pct(score) : "근거 없음"}</span>
                </div>
                <div className="analysis-bar"><div style={{ width: hasEvidence ? `${pct(score)}%` : 0 }} /></div>
                {hasEvidence && ev && <p className="analysis-evidence">{ev}</p>}
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
      <main className="main-content">
        <header className="page-heading">
          <h1>AI 분석 근거</h1>
          <p>
            AI가 일기를 읽고 자신감을 키우는 4가지 경험(해낸 경험 · 보고 배운 경험 · 응원받은 경험 · 마음·몸 상태)을 0~100점으로 평가한 근거예요.
          </p>
        </header>
        <div className="chart-card">
          <p className="analysis-formula">
            종합 점수 = 근거가 있는 원천만 가중 평균 (해낸 경험 0.4 · 보고 배움 0.2 · 응원받음 0.2 · 마음·몸 0.2, 합이 1이 되게 조정)
            · 근거 없는 원천은 "보통(50점)"이 아니라 계산에서 빼요 · 확신도 30% 미만은 그래프에서 제외
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
      </main>
    </div>
  );
}
