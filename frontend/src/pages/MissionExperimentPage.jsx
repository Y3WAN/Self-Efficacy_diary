import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import client from "../api/client";
import AppBar from "../components/AppBar";
import "./MissionExperimentPage.css";

const SAMPLE_DIARY = "오늘 발표하다가 잠깐 말이 막혔다. 준비한 메모를 보고 끝까지 설명했다. 다음 발표에서는 질문에 더 차분하게 답하고 싶다.";
const BASE_ELO = 1000;
const BASE_SCORES = { m: 70, v: 30, p: 55, a: 65 };
const SOURCE_LABELS = { m: "성취경험", v: "대리경험", p: "사회적 설득", a: "정서·신체" };
const VARIABLES = { elo: "Elo", ...SOURCE_LABELS };

function ExperimentResult({ name, result, requestedMission }) {
  return (
    <article className="experiment-result">
      <h3>조건 {name}</h3>
      <dl>
        <div>
          <dt>미션 주제</dt>
          <dd>{SOURCE_LABELS[result.target_var.toLowerCase()]}</dd>
        </div>
        <div>
          <dt>목표 난이도</dt>
          <dd>Lv.{result.level}</dd>
        </div>
      </dl>
      {requestedMission && (
        <div className="experiment-mission">
          <strong>AI 생성 결과</strong>
          <p>{result.content || "AI 응답을 받지 못했어요. 다시 생성해 보세요."}</p>
        </div>
      )}
    </article>
  );
}

export default function MissionExperimentPage() {
  const [variable, setVariable] = useState("elo");
  const [values, setValues] = useState([BASE_ELO, 1200]);
  const comparison = useMutation({
    mutationFn: (body) => client.post("/api/missions/experiment", body).then((response) => response.data),
  });
  const isElo = variable === "elo";
  const isSameValue = values[0] === values[1];
  const fixedScores = Object.entries(BASE_SCORES).filter(([key]) => key !== variable);

  function selectVariable(nextVariable) {
    setVariable(nextVariable);
    if (nextVariable === "elo") {
      setValues([BASE_ELO, 1200]);
    } else {
      setValues([BASE_SCORES[nextVariable], nextVariable === "v" ? 70 : 20]);
    }
    comparison.reset();
  }

  function compare(generate) {
    comparison.mutate({
      diary: SAMPLE_DIARY,
      elo: isElo ? values[0] : BASE_ELO,
      scores: isElo ? BASE_SCORES : { ...BASE_SCORES, [variable]: values[0] },
      variable,
      comparison_value: values[1],
      generate,
    });
  }

  return (
    <div className="main-page">
      <AppBar />
      <main className="main-content mission-experiment">
        <Link to="/dashboard" className="experiment-back">← 대시보드</Link>
        <section className="chart-card experiment-intro">
          <span className="experiment-tag">실험용 데이터</span>
          <h1>미션 비교 실험</h1>
          <p>같은 일기에서 값 하나만 바꾸고, 다음 미션이 어떻게 달라지는지 확인해 보세요.</p>
          <blockquote>{SAMPLE_DIARY}</blockquote>
        </section>

        <section className="chart-card" aria-label="실험 조건">
          <fieldset className="experiment-controls" disabled={comparison.isPending}>
            <label className="experiment-variable">
              바꿀 변수
              <select value={variable} onChange={(event) => selectVariable(event.target.value)}>
                {Object.entries(VARIABLES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </label>
            <p className="experiment-fixed">
              <strong>두 조건에서 고정</strong>
              {!isElo && <span>Elo {BASE_ELO}</span>}
              {fixedScores.map(([key, score]) => <span key={key}>{SOURCE_LABELS[key]} {score}점</span>)}
            </p>
            <div className="experiment-pair">
              {values.map((value, index) => (
                <label className="experiment-slider" key={index}>
                  <span>조건 {index === 0 ? "A" : "B"} · {VARIABLES[variable]}</span>
                  <strong>{value}{isElo ? "" : "점"}</strong>
                  <input
                    type="range"
                    min={isElo ? 600 : 0}
                    max={isElo ? 1600 : 100}
                    step={isElo ? 10 : 1}
                    value={value}
                    onChange={(event) => {
                      const nextValue = Number(event.target.value);
                      setValues((current) => current.map((item, i) => i === index ? nextValue : item));
                      comparison.reset();
                    }}
                  />
                </label>
              ))}
            </div>
            <div className="experiment-actions">
              <button type="button" disabled={isSameValue} onClick={() => compare(false)}>조건 비교</button>
              <button type="button" disabled={isSameValue} onClick={() => compare(true)}>AI 미션 생성</button>
            </div>
          </fieldset>
          <p className="experiment-help">
            {isSameValue
              ? "조건 A와 B에 서로 다른 값을 지정해 주세요."
              : "AI 미션 생성에는 예시 일기와 실험 조건을 사용해요. 실험은 실제 미션 기록에 반영되지 않아요."}
          </p>
        </section>

        <div aria-live="polite" aria-busy={comparison.isPending}>
          {comparison.isPending && <p className="experiment-status">두 조건의 결과를 확인하고 있어요.</p>}
          {comparison.isError && (
            <p className="experiment-status">비교 결과를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          )}
          {comparison.isSuccess && (
            <section className="chart-card experiment-output" aria-label="실험 결과">
              <h2>비교 결과</h2>
              <div className="experiment-pair">
                <ExperimentResult name="A" result={comparison.data.baseline} requestedMission={comparison.variables.generate} />
                <ExperimentResult name="B" result={comparison.data.comparison} requestedMission={comparison.variables.generate} />
              </div>
              {comparison.variables.generate && (
                <p className="experiment-help">같은 조건에서도 AI가 생성하는 문장은 달라질 수 있어요.</p>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
