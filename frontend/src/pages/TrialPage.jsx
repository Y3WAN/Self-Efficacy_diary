import { useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import BrandMark from "../components/BrandMark";
import MissionTask from "../components/MissionTask";
import { todayKST } from "../utils/date";

// 부스 체험 전용 화면: 질문 3개에 답하면 AI가 일기로 엮고, 그 일기를 분석(오늘 해낸 것 + 미션)한다.
// 직접 일기를 쓰는 탭도 있다.
// 체험 토큰은 이 화면 안에서만 들고 있어, 같은 브라우저의 시연용 로그인(demo)을 건드리지 않는다.
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000" });

// 해 보려던 일 → 어디까지 했고 어디서 막혔는지 → 기분·다음 생각.
// 분석('오늘 해낸 것')과 미션(막힌 곳을 푸는 작은 행동)이 둘 다 '해 보려던 일'이 있어야 제대로 나온다.
const QUESTIONS = [
  {
    q: "오늘 해 보려고 했던 일이 있나요?",
    hint: "숙제, 공부, 운동, 연습, 누군가에게 말 걸기처럼 아주 작은 일도 괜찮아요",
    placeholder: "예: 수학 문제집 3쪽 풀기",
    required: true,
  },
  {
    q: "그 일을 어디까지 했나요? 어디서 막혔나요?",
    hint: "다 못 했어도 괜찮아요. 한 만큼, 막힌 곳을 그대로 적어 보세요",
    placeholder: "예: 1~4번은 풀었는데 5번 도형 문제에서 막혔다",
    required: true,
  },
  {
    q: "그때 기분은 어땠나요? 다음엔 어떻게 해 보고 싶나요?",
    hint: "선택 · 떠오르는 대로 짧게 적어도 돼요",
    placeholder: "예: 답답했다. 다음엔 친구한테 물어보고 싶다",
    required: false,
  },
];

const EXAMPLES = [
  [
    "수학 문제집 3쪽을 풀려고 했다.",
    "1번부터 4번까지 풀었는데 5번 도형 문제에서 막혔다.",
    "답답했다. 다음엔 5번만 천천히 다시 보고 싶다.",
  ],
  [
    "영어 발표 첫 문단을 연습하려고 했다.",
    "처음 두 문장은 읽었는데 긴 단어의 발음이 어려웠다.",
    "처음보다 덜 떨렸다. 다음엔 어려운 단어만 따로 읽어 보고 싶다.",
  ],
  [
    "줄넘기 20개를 쉬지 않고 하려고 했다.",
    "열두 개를 했는데 발에 줄이 걸려 멈췄다.",
    "아쉬웠지만 지난번보다 많이 했다. 다음엔 조금 더 천천히 뛰고 싶다.",
  ],
];

export default function TrialPage() {
  const [step, setStep] = useState("input"); // input | composing | pending | result | error
  const [mode, setMode] = useState("questions"); // questions | write
  const [edits, setEdits] = useState(() => QUESTIONS.map(() => null));
  const [exampleIndex, setExampleIndex] = useState(-1);
  const example = EXAMPLES[exampleIndex];
  const answers = edits.map((edit, index) => edit ?? example?.[index] ?? "");
  const [freeText, setFreeText] = useState("");
  const [submitted, setSubmitted] = useState(""); // 분석할 일기 본문
  const [composed, setComposed] = useState(false); // AI가 질문 답으로 쓴 일기인지
  const [token, setToken] = useState(null);
  const [savedDiary, setSavedDiary] = useState(null);
  const [result, setResult] = useState(null); // { reflection, mission }
  const [levelChange, setLevelChange] = useState(null); // { from, to, harder }
  const [missionError, setMissionError] = useState("");
  const [missionBusy, setMissionBusy] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);

  const auth = (t) => ({ headers: { Authorization: `Bearer ${t}` } });

  const ensureToken = async () => {
    if (token) return token;
    const t = (await api.post("/api/auth/trial")).data.access_token;
    setToken(t);
    return t;
  };

  // 일기 본문을 저장하고 분석(오늘 해낸 것 + 미션)을 받는다
  const analyze = async (text, existingToken) => {
    const content = text.trim();
    if (!content) return;
    setSubmitted(content);
    setStep("pending");
    try {
      const t = existingToken ?? await ensureToken();
      const date = todayKST();
      const config = auth(t);
      let diary = savedDiary?.diary_date === date ? savedDiary : null;
      if (!diary) {
        try {
          diary = (await api.post("/api/diaries", { content, diary_date: date }, config)).data;
        } catch (error) {
          if (error.response?.status !== 409) throw error;
          // The first save may have succeeded before the connection was interrupted.
          diary = (await api.get(`/api/diaries/${date}`, config)).data.at(-1);
          if (!diary) throw error;
        }
      }
      if (diary.content !== content) {
        diary = (await api.patch(`/api/diaries/${diary.id}`, { content }, config)).data;
      }
      setSavedDiary(diary);
      const data = (await api.post(`/api/diaries/${diary.id}/reflect`, null, config)).data;
      setResult(data);
      setStep("result");
    } catch {
      setStep("error");
    }
  };

  // 질문 답 → AI가 일기로 엮기 → 그 일기를 분석
  const composeAndAnalyze = async () => {
    setComposed(true);
    setSubmitted("");
    setStep("composing");
    let content;
    let t;
    try {
      t = await ensureToken();
      const body = { answers: QUESTIONS.map((item, i) => ({ question: item.q, answer: answers[i].trim() })) };
      content = (await api.post("/api/diaries/compose", body, auth(t))).data.content;
    } catch {
      setStep("error");
      return;
    }
    await analyze(content, t);
  };

  const writeOwn = () => {
    setComposed(false);
    analyze(freeText);
  };

  // 미션 생성이 실패했을 때: 적은 답은 그대로 두고 입력 화면으로 돌아간다
  const rewrite = () => {
    setStep("input");
    setSubmitted("");
    setResult(null);
    setLevelChange(null);
    setMissionError("");
  };

  // 일기가 이미 만들어졌으면 분석만 다시, 아니면 일기 쓰기부터 다시
  const retry = () => (submitted ? analyze(submitted) : composeAndAnalyze());

  const canCompose = QUESTIONS.every((item, i) => !item.required || answers[i].trim());
  const fillExample = () => setExampleIndex((index) => (index + 1) % EXAMPLES.length);

  // 답에 따라 같은 일기·같은 원천으로 한 단계 어렵거나 쉬운 미션을 바로 받는다.
  // 실제로 해 본 결과가 아니므로 완료·실패 처리(ELO 반영)는 하지 않는다.
  const changeLevel = async (harder) => {
    if (!result?.mission || missionBusy || taskBusy) return;
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
    setMode("questions");
    setEdits(QUESTIONS.map(() => null));
    setExampleIndex(-1);
    setFreeText("");
    setSubmitted("");
    setComposed(false);
    setToken(null);
    setSavedDiary(null);
    setResult(null);
    setLevelChange(null);
    setMissionError("");
  };

  const level = result?.mission?.level;

  return (
    <div className="trial-page">
      <header className="trial-header">
        <Link to="/" className="brand-home" aria-label="코드마이월드 메인 화면" state={{ scrollToTop: true }}>
          <BrandMark />
        </Link>
        <span className="trial-badge">1분 체험</span>
      </header>

      {step === "input" && (
        <section className="trial-section">
          <h1 className="trial-title">오늘 해 보려던 일,<br />질문 세 개면 일기가 돼요</h1>
          <p className="trial-sub">AI가 일기로 정리하고, 그 안에서 <b>내가 해낸 것</b>을 찾아 드려요</p>

          <div className="trial-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === "questions"}
              className={`trial-tab${mode === "questions" ? " trial-tab--on" : ""}`} onClick={() => setMode("questions")}>
              ✍️ 질문에 답하기
            </button>
            <button type="button" role="tab" aria-selected={mode === "write"}
              className={`trial-tab${mode === "write" ? " trial-tab--on" : ""}`} onClick={() => setMode("write")}>
              📝 직접 일기 쓰기
            </button>
          </div>

          {mode === "questions" && (
            <form className="trial-questions" onSubmit={(e) => { e.preventDefault(); if (canCompose) composeAndAnalyze(); }}>
              {QUESTIONS.map((item, i) => (
                <div key={item.q} className="trial-question">
                  <label className="trial-question-label" htmlFor={`trial-q${i}`}>
                    <span className="trial-question-num">{i + 1}</span>{item.q}
                  </label>
                  <p className="trial-question-hint">{item.hint}</p>
                  <textarea
                    id={`trial-q${i}`}
                    className="trial-input trial-textarea"
                    rows={2}
                    maxLength={200}
                    placeholder={item.placeholder}
                    value={answers[i]}
                    onChange={(e) => setEdits((prev) => prev.map((edit, index) => index === i ? e.target.value : edit))}
                  />
                </div>
              ))}
              <button type="button" className="trial-fill" onClick={fillExample}>
                {example ? "다른 예시 보기" : "예시 답안으로 채워 보기"}
              </button>
              {example && edits.every((edit) => edit !== null) && (
                <ul className="trial-example" aria-label="예시 답안">
                  {example.map((answer) => <li key={answer}>{answer}</li>)}
                </ul>
              )}
              <button className="trial-submit trial-submit--wide" type="submit" disabled={!canCompose}>
                제출하고 일기 만들기
              </button>
            </form>
          )}

          {mode === "write" && (
            <form className="trial-questions" onSubmit={(e) => { e.preventDefault(); writeOwn(); }}>
              <label className="trial-question-label" htmlFor="trial-free">오늘의 일기</label>
              <p className="trial-question-hint">해 보려던 일, 어디까지 했는지, 그때 기분을 자유롭게 적어 보세요</p>
              <textarea
                id="trial-free"
                className="trial-input trial-textarea"
                rows={7}
                maxLength={1000}
                placeholder="예: 내일 발표라 연습을 두 번 했다. 처음엔 첫 문장에서 말이 막혔는데 두 번째는 끝까지 했다."
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
              />
              <button className="trial-submit trial-submit--wide" type="submit" disabled={!freeText.trim()}>
                제출하고 분석 받기
              </button>
            </form>
          )}
          <p className="trial-note">이름·연락처는 쓰지 마세요 · 체험 기록은 행사 후 삭제돼요</p>
        </section>
      )}

      {step !== "input" && (
        <section className="trial-section">
          {step === "composing" && (
            <div className="reflection-card reflection-card--pending" role="status">
              <span className="reflection-spinner" aria-hidden="true" />
              AI가 답을 모아 오늘의 일기를 쓰고 있어요…
            </div>
          )}

          {submitted && (
            <div className="trial-diary">
              <p className="reflection-label">{composed ? "📖 AI가 정리한 오늘의 일기" : "📖 내가 쓴 오늘의 일기"}</p>
              <p className="trial-diary-text">{submitted}</p>
            </div>
          )}

          {step === "pending" && (
            <div className="reflection-card reflection-card--pending" role="status">
              <span className="reflection-spinner" aria-hidden="true" />
              AI가 이 일기를 보고 미션을 만들고 있어요…
            </div>
          )}

          {step === "error" && (
            <div className="trial-error">
              <p>AI 응답을 받지 못했어요.</p>
              <button type="button" className="trial-submit" onClick={retry}>다시 시도</button>
            </div>
          )}

          {step === "result" && result && (
            <>
              {!result.mission && (
                <div className="trial-mission">
                  <p className="trial-mission-content">이번에는 미션을 만들지 못했어요.</p>
                  <button type="button" className="trial-submit trial-submit--wide" onClick={rewrite}>다시 써 보기</button>
                </div>
              )}

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
                  {!missionBusy && (
                    <MissionTask
                      mission={result.mission}
                      post={(path, body) => api.post(path, body, auth(token)).then((r) => r.data)}
                      onUpdated={(mission) => setResult((prev) => prev?.mission?.id === mission.id ? { ...prev, mission } : prev)}
                      onError={setMissionError}
                      onBusyChange={(busy) => {
                        setTaskBusy(busy);
                        if (busy) setMissionError("");
                      }}
                    />
                  )}

                  <p className="trial-mission-question">이 미션의 난이도는 어때요?</p>
                  <div className="trial-mission-actions">
                    <button type="button" className="trial-btn-ok" disabled={missionBusy || taskBusy || level >= 5} onClick={() => changeLevel(true)}>
                      쉬울 것 같아요 👍
                    </button>
                    <button type="button" className="trial-btn-hard" disabled={missionBusy || taskBusy || level <= 1} onClick={() => changeLevel(false)}>
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

          {step !== "pending" && step !== "composing" && (
            <button type="button" className="trial-next" onClick={reset} disabled={taskBusy}>🔄 다음 사람 체험하기</button>
          )}
        </section>
      )}

      <footer className="trial-footer">
        전문 심리 검사가 아니에요 · <Link to="/about" state={{ fromApp: true }}>안내·출처</Link> · <Link to="/login">로그인</Link>
      </footer>
    </div>
  );
}
