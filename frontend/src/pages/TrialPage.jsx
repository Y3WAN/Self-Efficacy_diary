import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import BrandMark from "../components/BrandMark";
import { todayKST } from "../utils/date";

// 부스 체험 전용 화면: 예시 카드 한 번 탭 또는 한 줄 입력 → 오늘 해낸 것 + 미션.
// 체험 토큰은 이 화면 안에서만 들고 있어, 같은 브라우저의 시연용 로그인(demo)을 건드리지 않는다.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });

const EXAMPLES = [
  { icon: "📚", text: "수학 숙제를 하다가 3번 문제에서 막혔다." },
  { icon: "🎤", text: "발표 연습을 두 번 했는데 아직 조금 떨린다." },
  { icon: "🏃", text: "오늘 줄넘기 60개를 했다. 목표는 100개다." },
];

export default function TrialPage() {
  const [step, setStep] = useState("input"); // input | pending | result | error
  const [line, setLine] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [token, setToken] = useState(null);
  const [result, setResult] = useState(null); // { reflection, mission }
  const [levelChange, setLevelChange] = useState(null); // { from, to, harder }
  const [missionError, setMissionError] = useState("");
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

  // 답에 따라 같은 일기·같은 원천으로 한 단계 어렵거나 쉬운 미션을 바로 받는다.
  // 실제로 해 본 결과가 아니므로 완료·실패 처리(ELO 반영)는 하지 않는다.
  const changeLevel = async (harder) => {
    if (!result?.mission || missionBusy) return;
    const from = result.mission.level;
    setMissionBusy(true);
    setMissionError("");
    try {
      const mission = (await api.post(`/api/missions/${result.mission.id}/retarget`, { harder }, auth(token))).data;
      setResult((prev) => ({ ...prev, mission }));
      setLevelChange({ from, to: mission.level, harder });
    } catch (e) {
      setMissionError(e.response?.status === 409 ? e.response.data.detail : "미션을 바꾸지 못했어요. 다시 눌러 주세요.");
    } finally {
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
    setLevelChange(null);
    setMissionError("");
  };

  const level = result?.mission?.level;

  return (
    <div className="trial-page">
      <header className="trial-header">
        <BrandMark />
        <span className="trial-badge">1분 체험</span>
      </header>

      {step === "input" && (
        <section className="trial-section">
          <h1 className="trial-title">오늘 있었던 일,<br />한 줄이면 충분해요</h1>
          <p className="trial-sub">AI가 그 안에서 <b>내가 해낸 것</b>을 찾아 드려요</p>

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
              placeholder="예: 영어 단어 10개를 외웠다"
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
                💡 왜 해낸 것을 찾아 줄까요? 직접 해낸 경험(성취 경험)은 '나도 할 수 있다'는 믿음, 자기효능감을 키우는
                <b> 가장 강한 힘</b>이에요 (심리학자 반두라, 1977)
              </p>

              {result.mission && (
                <div className="trial-mission">
                  <p className="reflection-label">
                    🎯 이어서 해 볼 작은 미션
                    {level && (
                      <span className="trial-level" aria-label={`난이도 5단계 중 ${level}단계`}>
                        난이도 {"●".repeat(level)}{"○".repeat(5 - level)}
                      </span>
                    )}
                  </p>
                  {levelChange && (
                    <p className="trial-level-change" role="status">
                      {levelChange.harder ? "💪 한 단계 크게" : "🌱 한 단계 작게"} 바꿨어요
                    </p>
                  )}
                  <p className={`trial-mission-content${missionBusy ? " trial-mission-content--busy" : ""}`}>
                    {missionBusy ? "AI가 난이도를 바꾼 미션을 만들고 있어요…" : result.mission.content}
                  </p>
                  {!missionBusy && result.mission.reason && <p className="reflection-mission-reason">{result.mission.reason}</p>}
                  {!missionBusy && result.mission.helper && <p className="mission-helper">🤝 막히면: {result.mission.helper}</p>}

                  <p className="trial-mission-question">이 미션, 할 수 있을 것 같나요?</p>
                  <div className="trial-mission-actions">
                    <button type="button" className="trial-btn-ok" disabled={missionBusy || level >= 5} onClick={() => changeLevel(true)}>
                      할 수 있겠어요 👍
                    </button>
                    <button type="button" className="trial-btn-hard" disabled={missionBusy || level <= 1} onClick={() => changeLevel(false)}>
                      어려울 것 같아요 😅
                    </button>
                  </div>
                  {missionError && <p className="trial-mission-error">{missionError}</p>}
                  <p className="trial-elo">
                    실제 앱에서는 미션을 해냈는지에 따라 다음 미션 난이도가 저절로 바뀌어요.
                  </p>
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
        전문 심리 검사가 아니에요 · <Link to="/about">안내·출처</Link> · <Link to="/login">로그인</Link>
      </footer>
    </div>
  );
}
