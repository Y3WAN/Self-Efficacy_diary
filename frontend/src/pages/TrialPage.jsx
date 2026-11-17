import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import BrandMark from "../components/BrandMark";
import { todayKST } from "../utils/date";

// 부스 체험 전용 화면: 예시 카드 한 번 탭 또는 한 줄 입력 → 오늘 해낸 것 + 미션.
// 체험 토큰은 이 화면 안에서만 들고 있어, 같은 브라우저의 시연용 로그인(demo)을 건드리지 않는다.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });

const EXAMPLES = [
  { icon: "📚", text: "수학 문제 풀다가 너무 어려워서 포기했다." },
  { icon: "🎤", text: "발표하다가 말이 막혀서 창피했다. 그래도 끝까지 했다." },
  { icon: "🏃", text: "줄넘기 100개 목표였는데 60개에서 멈췄다." },
];

export default function TrialPage() {
  const [step, setStep] = useState("input"); // input | pending | result | error
  const [line, setLine] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [token, setToken] = useState(null);
  const [result, setResult] = useState(null); // { reflection, mission }
  const [missionResult, setMissionResult] = useState(null); // { won }
  const [missionBusy, setMissionBusy] = useState(false);

  const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });

  const submit = async (text) => {
    const content = text.trim();
    if (!content) return;
    setSubmitted(content);
    setStep("pending");
    try {
      let t = token;
      if (!t) {
        t = (await api.post("/api/auth/trial")).data.access_token;
        setToken(t);
      }
      const diary = (await api.post("/api/diaries", { content, diary_date: todayKST() }, auth(t))).data;
      const data = (await api.post(`/api/diaries/${diary.id}/reflect`, null, auth(t))).data;
      setResult(data);
      setStep("result");
    } catch {
      setStep("error");
    }
  };

  const answerMission = async (won) => {
    if (!result?.mission || missionBusy) return;
    setMissionBusy(true);
    try {
      const path = won ? "complete" : "skip";
      await api.post(`/api/missions/${result.mission.id}/${path}`, null, auth(token));
    } catch {
      // 체험 화면에서는 반영 실패해도 안내 문구는 그대로 보여 준다
    } finally {
      setMissionResult({ won });
      setMissionBusy(false);
    }
  };

  // 다음 관람객: 계정을 새로 쓰도록 토큰까지 비운다
  const reset = () => {
    setStep("input");
    setLine("");
    setSubmitted("");
    setToken(null);
    setResult(null);
    setMissionResult(null);
  };

  return (
    <div className="trial-page">
      <header className="trial-header">
        <BrandMark />
        <span className="trial-badge">1분 체험</span>
      </header>

      {step === "input" && (
        <section className="trial-section">
          <h1 className="trial-title">오늘 잘 안 된 일,<br />한 줄이면 충분해요</h1>
          <p className="trial-sub">AI가 그 안에서 <b>내가 해낸 것</b>을 찾아 드려요</p>

          <p className="trial-label">예시를 눌러 바로 시작</p>
          <div className="trial-examples">
            {EXAMPLES.map((ex) => (
              <button key={ex.text} type="button" className="trial-example" onClick={() => submit(ex.text)}>
                <span className="trial-example-icon" aria-hidden="true">{ex.icon}</span>
                <span>{ex.text}</span>
              </button>
            ))}
          </div>

          <label className="trial-label" htmlFor="trial-line">또는 직접 한 줄</label>
          <form className="trial-form" onSubmit={(e) => { e.preventDefault(); submit(line); }}>
            <input
              id="trial-line"
              className="trial-input"
              placeholder="예: 운동 가려다 결국 안 갔다"
              maxLength={200}
              value={line}
              onChange={(e) => setLine(e.target.value)}
            />
            <button className="trial-submit" type="submit" disabled={!line.trim()}>확인</button>
          </form>
          <p className="trial-note">이름·연락처는 쓰지 마세요 · 체험 기록은 행사 후 삭제돼요</p>
        </section>
      )}

      {step !== "input" && (
        <section className="trial-section">
          <blockquote className="trial-quote">“{submitted}”</blockquote>

          {step === "pending" && (
            <div className="reflection-card reflection-card--pending" role="status">
              <span className="reflection-spinner" aria-hidden="true" />
              AI가 이 한 줄에서 해낸 것을 찾고 있어요…
            </div>
          )}

          {step === "error" && (
            <div className="trial-error">
              <p>AI 응답을 받지 못했어요.</p>
              <button type="button" className="trial-submit" onClick={() => submit(submitted)}>다시 시도</button>
            </div>
          )}

          {step === "result" && result && (
            <>
              <div className="reflection-card">
                <p className="reflection-label">✨ 오늘 해낸 것</p>
                <ul className="reflection-achievements">
                  {result.reflection.achievements.map((item) => <li key={item}>{item}</li>)}
                </ul>
                {result.reflection.message && <p className="reflection-message">{result.reflection.message}</p>}
              </div>
              <p className="trial-why">
                💡 왜 해낸 것을 찾아 줄까요? 직접 해낸 경험은 자기효능감을 키우는
                <b> 가장 강한 원천</b>이에요 (반두라, 1977)
              </p>

              {result.mission && (
                <div className="trial-mission">
                  <p className="reflection-label">🎯 이어서 해 볼 작은 미션</p>
                  <p className="trial-mission-content">{result.mission.content}</p>
                  {result.mission.reason && <p className="reflection-mission-reason">{result.mission.reason}</p>}

                  {!missionResult ? (
                    <>
                      <p className="trial-mission-question">이 미션, 할 수 있을 것 같나요?</p>
                      <div className="trial-mission-actions">
                        <button type="button" className="trial-btn-ok" disabled={missionBusy} onClick={() => answerMission(true)}>
                          할 수 있겠어요 👍
                        </button>
                        <button type="button" className="trial-btn-hard" disabled={missionBusy} onClick={() => answerMission(false)}>
                          어려울 것 같아요 😅
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="trial-mission-result">
                      {missionResult.won
                        ? "좋아요! 다음엔 조금 더 도전적인 미션을 드릴게요."
                        : "괜찮아요! 다음엔 더 작고 쉬운 미션을 드릴게요."}
                      <span className="trial-elo">답할 때마다 성공할 만한 수준으로 미션 난이도를 맞춰요</span>
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {step !== "pending" && (
            <button type="button" className="trial-next" onClick={reset}>🔄 다음 사람 체험하기</button>
          )}
        </section>
      )}

      <footer className="trial-footer">
        심리 진단 도구가 아닙니다 · <Link to="/about">안내·출처</Link> · <Link to="/login">로그인</Link>
      </footer>
    </div>
  );
}
