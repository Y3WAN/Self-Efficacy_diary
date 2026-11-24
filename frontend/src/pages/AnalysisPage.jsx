import Icon from "../components/Icon";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import AppBar from "../components/AppBar";
import client from "../api/client";
import { SOURCES } from "../utils/sources";

const pct = (v) => Math.round(v * 100);

// 점수·확신도 숫자는 보여 주지 않는다. 막대 길이와 AI가 찾은 문장만 보여 준다.
function AnalysisCard({ a, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="chart-card analysis-card">
      <button type="button" className="analysis-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="analysis-date">{a.date.slice(5).replace("-", "/")}</span>
        <Icon name={open ? "chevronUp" : "chevronDown"} className="analysis-toggle" />
      </button>

      {a.is_initial && <p className="analysis-note">가입할 때 답한 내용으로 시작했어요.</p>}
      {!a.is_reflected && (
        <p className="analysis-note analysis-note--warn">
          {a.evidence_sources
            ? "이 일기는 AI도 잘 모르겠대요. 그래프에는 넣지 않았어요."
            : "이 일기에서는 4가지 경험을 찾지 못해 그래프에 넣지 않았어요."}
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
                  <span className="analysis-label">{s.label}</span>
                  {!hasEvidence && <span className="analysis-val">일기에 없음</span>}
                </div>
                <div className="analysis-bar"><div style={{ width: hasEvidence ? `${pct(score)}%` : 0 }} /></div>
                {hasEvidence && ev && <p className="analysis-evidence">“{ev}”</p>}
              </div>
            );
          })}
          {a.reasoning && !a.is_initial && (
            <div className="analysis-reason">
              <strong>AI 한마디</strong>
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
          <h1>AI가 일기에서 찾은 문장</h1>
        </header>
        {isLoading && <div className="chart-empty">불러오는 중...</div>}
        {!isLoading && !data.length && (
          <div className="chart-empty">아직 분석된 일기가 없어요. 일기를 쓰면 밤 12시에 분석돼요.</div>
        )}
        {data.map((a, i) => <AnalysisCard key={`${a.date}-${i}`} a={a} defaultOpen={i === 0} />)}
        <p className="notice-text">
          AI 분석은 나를 돌아보는 데 참고하는 정보예요. 전문 심리 검사가 아니에요.
        </p>
      </main>
    </div>
  );
}
