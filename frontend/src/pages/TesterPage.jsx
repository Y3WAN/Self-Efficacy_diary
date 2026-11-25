import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Icon from "../components/Icon";
import { SOURCES } from "../utils/sources";
import "./TesterPage.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const TESTER_SESSION_KEY = "samari.tester.session";
const STEPS = ["일기 작성", "자기효능감 분석", "공통 미션", "미션 채점"];
const DIARY_PROMPT = "오늘 해보려던 일, 실제로 한 행동, 그때 느낀 점을 적어주세요";
const SOURCE_LABELS = { p: "언어적 설득", a: "신체·정서 상태" };
const SOURCE_ICONS = { m: "trophy", v: "bulb", p: "user", a: "sparkle" };
const QUESTIONS = [
  ["relevance", "이 미션은 공통 예시 일기의 상황과 잘 맞나요?"],
  ["clarity", "미션에서 무엇을 해야 하는지 명확한가요?"],
  ["feasibility", "예시 일기 속 사람이 이 미션을 실제로 해볼 만한가요?"],
];

function browserSessionToken() {
  const stored = localStorage.getItem(TESTER_SESSION_KEY);
  if (/^[A-Za-z0-9_-]{43}$/.test(stored)) return stored;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  localStorage.setItem(TESTER_SESSION_KEY, token);
  return token;
}

async function requestTester(token, endpoint, { body, signal } = {}) {
  const response = await fetch(`${API_URL}/api/tester/${endpoint}`, {
    method: body ? "POST" : "GET",
    credentials: "omit",
    cache: "no-store",
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: body && JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "입력 내용을 다시 확인해 주세요.");
  }
  return data;
}

function Button({ children, secondary = false, ...props }) {
  return <button className={`tester-button${secondary ? " tester-button-secondary" : ""}`} {...props}>{children}</button>;
}

function Progress({ step }) {
  return (
    <aside className="tester-progress" aria-label="테스트 진행 순서">
      <h2>진행 순서</h2>
      <ol>
        {STEPS.map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined} data-complete={step > index}>
            <span className="tester-step-index" aria-hidden="true">
              {step > index ? <Icon name="check" /> : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function MissionSummary({ mission }) {
  return (
    <section className="tester-mission" aria-labelledby="tester-mission-title">
      <h2 id="tester-mission-title"><Icon name="target" /> 평가할 미션</h2>
      <p className="tester-mission-action">{mission.content}</p>
      {mission.reason && <p>{mission.reason}</p>}
      {mission.helper && <p className="tester-mission-helper">{mission.helper}</p>}
    </section>
  );
}

function TesterFlow({ invite }) {
  const [session, setSession] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [step, setStep] = useState(0);
  const [diary, setDiary] = useState("");
  const [analysis, setAnalysis] = useState(null);
  const [mission, setMission] = useState(null);
  const [ratings, setRatings] = useState({});
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef(null);
  const requestInProgress = useRef(false);
  const sessionToken = useRef(null);
  const activeStep = session?.completed ? STEPS.length : step;

  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      sessionToken.current ||= invite || browserSessionToken();
      return requestTester(sessionToken.current, "session", {
        body: invite ? undefined : {},
        signal: controller.signal,
      });
    })
      .then((result) => { if (result && !controller.signal.aborted) setSession(result); })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setLoadError(failure instanceof TypeError || failure instanceof SyntaxError
            ? "테스트를 불러오지 못했습니다. 다시 시도해 주세요."
            : failure.message);
        }
      });
    return () => controller.abort();
  }, [invite, loadAttempt]);

  useEffect(() => {
    if (!session) return;
    titleRef.current?.focus();
  }, [activeStep, session]);

  function goTo(nextStep) {
    setError("");
    setStep(nextStep);
  }

  async function runRequest(action) {
    if (requestInProgress.current) return;
    requestInProgress.current = true;
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (failure) {
      setError(failure instanceof TypeError || failure instanceof SyntaxError
        ? "서버에 연결하지 못했습니다. 다시 시도해 주세요."
        : failure.message);
    } finally {
      setBusy(false);
      requestInProgress.current = false;
    }
  }

  function submitDiary(event) {
    event.preventDefault();
    runRequest(async () => {
      setAnalysis(await requestTester(sessionToken.current, "analysis", { body: { diary } }));
      setDiary("");
      goTo(1);
    });
  }

  function openMission() {
    runRequest(async () => {
      setMission(await requestTester(sessionToken.current, "mission"));
      goTo(2);
    });
  }

  function submitRating(event) {
    event.preventDefault();
    runRequest(async () => {
      await requestTester(sessionToken.current, "evaluation", { body: { ...ratings, comment } });
      setAnalysis(null);
      setComment("");
      setSession({ ...session, completed: true });
    });
  }

  if (!session) {
    return (
      <main className="tester-notice tester-card">
        <h1>사말이 미션 평가</h1>
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <Button type="button" onClick={() => { setLoadError(""); setLoadAttempt(loadAttempt + 1); }}>다시 시도</Button>
          </>
        ) : <p role="status">테스터 세션을 준비하는 중입니다…</p>}
      </main>
    );
  }

  return (
    <div className="tester-layout">
      <Progress step={activeStep} />
      <main className="tester-card" aria-busy={busy}>
        {activeStep === 0 && (
          <>
            <div className="tester-feature-icon"><Icon name="pencil" /></div>
            <h1 ref={titleRef} tabIndex={-1}>오늘의 일기</h1>
            <form onSubmit={submitDiary}>
              <label htmlFor="tester-diary">{DIARY_PROMPT}</label>
              <textarea id="tester-diary" name="diary" value={diary} rows={8} maxLength={3000} required
                aria-describedby="tester-diary-privacy" disabled={busy} onChange={(event) => setDiary(event.target.value)}
                placeholder="떠오르는 대로 자유롭게 써 보세요." />
              <div className="tester-text-meta">
                <small id="tester-diary-privacy"><Icon name="lock" /> 일기와 발췌문은 분석에 사용되며 평가 결과에 저장하지 않습니다.</small>
                <small aria-hidden="true">{diary.length.toLocaleString("ko-KR")} / 3,000</small>
              </div>
              {error && <p className="tester-error" role="alert">{error}</p>}
              <div className="tester-actions">
                <Button type="submit" disabled={busy || !diary.trim()}>
                  {busy ? "분석하는 중…" : "일기 제출하고 분석하기"}
                </Button>
              </div>
            </form>
          </>
        )}
        {activeStep === 1 && (
          <>
            <header className="tester-analysis-header">
              <div>
                <div className="tester-feature-icon"><Icon name="sparkle" /></div>
                <h1 ref={titleRef} tabIndex={-1}>자기효능감 분석</h1>
              </div>
              <div className="tester-elo">
                <span>현재 ELO 레이팅</span>
                <strong>{analysis.elo.toLocaleString("ko-KR")}</strong>
              </div>
            </header>
            <p className="tester-intro">내 일기에서 찾은 자기효능감 네 가지 원천의 단서예요.</p>
            <div className="tester-sources">
              {SOURCES.map(({ key, code, label }) => (
                <section className="tester-source" key={code}>
                  <h2><Icon name={SOURCE_ICONS[key]} />{SOURCE_LABELS[key] || label}</h2>
                  {analysis.sources[code]
                    ? <blockquote>“{analysis.sources[code]}”</blockquote>
                    : <p>일기에서 확인하기 어려움</p>}
                </section>
              ))}
            </div>
            {error && <p className="tester-error" role="alert">{error}</p>}
            <div className="tester-actions">
              <Button type="button" disabled={busy} onClick={openMission}>
                {busy ? "불러오는 중…" : "공통 미션 확인하기"}
              </Button>
            </div>
          </>
        )}
        {activeStep === 2 && (
          <>
            <div className="tester-feature-icon"><Icon name="target" /></div>
            <h1 ref={titleRef} tabIndex={-1}>공통 예시 일기</h1>
            <blockquote className="tester-sample">{mission.sample_diary}</blockquote>
            <MissionSummary mission={mission} />
            <div className="tester-actions">
              <Button type="button" secondary onClick={() => goTo(1)}>분석 다시 보기</Button>
              <Button type="button" onClick={() => goTo(3)}>미션 채점하기</Button>
            </div>
          </>
        )}
        {activeStep === 3 && (
          <>
            <div className="tester-feature-icon"><Icon name="star" /></div>
            <h1 ref={titleRef} tabIndex={-1}>미션 채점</h1>
            <MissionSummary mission={mission} />
            <p className="tester-scale" id="tester-scale">
              <span><strong>1점</strong> 전혀 그렇지 않다</span>
              <span><strong>5점</strong> 매우 그렇다</span>
            </p>
            <form onSubmit={submitRating}>
              {QUESTIONS.map(([key, question]) => (
                <fieldset key={key} className="tester-question" disabled={busy} aria-describedby="tester-scale">
                  <legend>{question}</legend>
                  <div className="tester-options">
                    {[1, 2, 3, 4, 5].map((score) => (
                      <label key={score}>
                        <input type="radio" name={key} value={score} required checked={ratings[key] === score}
                          onChange={() => setRatings({ ...ratings, [key]: score })} />
                        <span>{score}<span className="tester-sr-only">점</span></span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
              <label htmlFor="tester-comment">미션에서 바꾸고 싶은 점 <small>(선택)</small></label>
              <textarea id="tester-comment" name="comment" value={comment} rows={3} disabled={busy} maxLength={1000}
                onChange={(event) => setComment(event.target.value)} />
              {error && <p className="tester-error" role="alert">{error}</p>}
              <div className="tester-actions">
                <Button type="button" secondary disabled={busy} onClick={() => goTo(2)}>공통 예시 일기 다시 보기</Button>
                <Button type="submit" disabled={busy}>{busy ? "제출하는 중…" : "채점 제출하기"}</Button>
              </div>
            </form>
          </>
        )}
        {session.completed && (
          <div className="tester-complete">
            <div className="tester-feature-icon"><Icon name="check" /></div>
            <h1 ref={titleRef} tabIndex={-1}>평가를 제출했어요</h1>
            <p>세 문항의 점수를 저장했습니다. 사말이 미션 테스트에 참여해 주셔서 고마워요.</p>
            <dl className="tester-receipt">
              <dt>익명 참가자 ID</dt>
              <dd>{session.participant_id}</dd>
            </dl>
          </div>
        )}
      </main>
    </div>
  );
}

export default function TesterPage() {
  const { hash } = useLocation();
  const invite = new URLSearchParams(hash.slice(1)).get("invite");
  return (
    <div className="tester-shell">
      <header className="tester-topbar">
        <div className="tester-brand"><span><Icon name="sprout" /></span> 사말이</div>
        <p>테스터 전용 · 미션 평가</p>
      </header>
      <TesterFlow key={invite} invite={invite} />
    </div>
  );
}
