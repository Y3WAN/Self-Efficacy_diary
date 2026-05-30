import { useState, useEffect, useRef, useCallback } from "react";
import AppBar from "../components/AppBar";

const CHAR_SIZE = 210;
const TRAVEL_MS = 500;
const SQUISH_MS = 300;
const INIT_SCORE = 42;

const REFRAMES = [
  { kw: ["심장", "두근", "뛰어", "심박", "가슴"], msg: "심장이 뛰는 건 망한 게 아니에요! 뇌가 최고 효율을 내려고 준비운동 중인 거랍니다 ⚡" },
  { kw: ["불안", "무서워", "겁나", "쫄", "두려"], msg: "불안함은 '이게 나한테 중요하다'는 신호예요. 진심으로 임하는 사람만 느끼는 감각이랍니다 💙" },
  { kw: ["집중", "안돼", "안 돼", "못하겠", "흩어", "산만"], msg: "집중이 잘 안 될 때는 뇌가 새 정보를 처리 중인 거예요. 잠깐 쉬면 더 깊이 집중할 수 있어요 🌟" },
  { kw: ["손", "떨림", "떨려", "식은땀", "땀"], msg: "몸이 에너지를 최대로 끌어모으는 중이에요! 이 힘을 쏟으면 더 강해지는 거랍니다 💪" },
  { kw: ["숨", "막혀", "호흡", "답답"], msg: "깊게 숨 한 번 쉬어봐요 🌬️ 산소가 뇌에 들어가면 생각이 훨씬 맑아진답니다" },
  { kw: ["잠", "못 자", "피곤", "졸려"], msg: "피곤함은 열심히 살았다는 증거예요! 오늘 최선을 다한 몸에게 고마워해봐요 🌙" },
  { kw: ["못할", "모르겠", "자신없", "모르"], msg: "모르는 게 당연해요 — 지금 배우는 중이니까요! 모를 때 느끼는 불편함이 성장의 시작이랍니다 🌱" },
];

function getReframe(text) {
  for (const { kw, msg } of REFRAMES) {
    if (kw.some(k => text.includes(k))) return msg;
  }
  return "그 감정을 나한테 줘서 고마워요! 그 에너지가 성장의 원동력이 된답니다 ✨";
}

function bezierPt(t, p0, p1, p2) {
  const m = 1 - t;
  return m * m * p0 + 2 * m * t * p1 + t * t * p2;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

const PCOLORS = ["#FF85A2", "#FFB3C1", "#C084FC", "#A78BFA", "#FCD34D", "#F9A8D4", "#7DD3FC", "#FCA5A5"];

function MallangFace({ state, squish }) {
  const blushAlpha = squish || state === "eating" ? 0.52 : 0.34;
  return (
    <svg viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      <defs>
        <filter id="blush-blur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
        </filter>
      </defs>
      <ellipse cx="62" cy="116" rx="22" ry="13" fill={`rgba(251,113,133,${blushAlpha})`} filter="url(#blush-blur)" />
      <ellipse cx="138" cy="116" rx="22" ry="13" fill={`rgba(251,113,133,${blushAlpha})`} filter="url(#blush-blur)" />

      {state === "squished" && (
        <>
          <line x1="80" y1="95" x2="93" y2="95" stroke="#6B2D40" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="107" y1="95" x2="120" y2="95" stroke="#6B2D40" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="95" y1="117" x2="105" y2="117" stroke="#8B4058" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}

      {(state === "happy" || state === "glowing") && (
        <>
          <path d="M 79 97 Q 86 89 93 97" stroke="#6B2D40" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 107 97 Q 114 89 121 97" stroke="#6B2D40" strokeWidth="3" fill="none" strokeLinecap="round" />
          {state === "glowing"
            ? <path d="M 85 113 Q 100 130 115 113" stroke="#8B4058" strokeWidth="3" fill="none" strokeLinecap="round" />
            : <path d="M 89 114 Q 100 127 111 114" stroke="#8B4058" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          }
        </>
      )}

      {state === "eating" && (
        <>
          <path d="M 79 97 Q 86 89 93 97" stroke="#6B2D40" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 107 97 Q 114 89 121 97" stroke="#6B2D40" strokeWidth="3" fill="none" strokeLinecap="round" />
          <text x="72" y="89" fontSize="10" textAnchor="middle" fill="#FCD34D" style={{ userSelect: "none" }}>✦</text>
          <text x="128" y="89" fontSize="10" textAnchor="middle" fill="#FCD34D" style={{ userSelect: "none" }}>✦</text>
          <ellipse cx="100" cy="120" rx="14" ry="12" fill="#8B4058" />
          <ellipse cx="100" cy="122" rx="9.5" ry="7.5" fill="#3D0F1E" />
          <ellipse cx="100" cy="127" rx="6" ry="3.5" fill="#C05070" />
        </>
      )}

      {(state === "normal" || state === "moving") && (
        <>
          <circle cx="86" cy="94" r={state === "moving" ? 3.8 : 6.2} fill="#3D1A26" />
          <circle cx="89.5" cy="90.5" r={state === "moving" ? 1.0 : 1.9} fill="white" />
          <circle cx="114" cy="94" r={state === "moving" ? 3.8 : 6.2} fill="#3D1A26" />
          <circle cx="117.5" cy="90.5" r={state === "moving" ? 1.0 : 1.9} fill="white" />
          <text x="100" y="123" textAnchor="middle" fontSize="20" fill="#8B4058" fontWeight="800"
            fontFamily="system-ui,sans-serif" style={{ userSelect: "none" }}>ω</text>
        </>
      )}
    </svg>
  );
}

export default function MallangPage() {
  const [pos, setPos] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [squish, setSquish] = useState(false);
  const [eyeState, setEyeState] = useState("normal");
  const arrivalTimer = useRef(null);

  const [inputText, setInputText] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | animating | eating | done
  const [reframeMsg, setReframeMsg] = useState(null);
  const [stabilityScore, setStabilityScore] = useState(INIT_SCORE);
  const [displayScore, setDisplayScore] = useState(INIT_SCORE);
  const [lastGain, setLastGain] = useState(0);

  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const rafRef = useRef(null);
  const inputBoxRef = useRef(null);
  const onDoneRef = useRef(null);
  const resetTimerRef = useRef(null);

  useEffect(() => {
    setPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 + 30 });
  }, []);

  useEffect(() => {
    function resize() {
      const c = canvasRef.current;
      if (!c) return;
      c.width = window.innerWidth;
      c.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    if (displayScore === stabilityScore) return;
    const id = setInterval(() => {
      setDisplayScore(p => {
        const next = p + (stabilityScore > p ? 1 : -1);
        if (next === stabilityScore) clearInterval(id);
        return next;
      });
    }, 35);
    return () => clearInterval(id);
  }, [stabilityScore]);

  const handleClick = useCallback((e) => {
    if (e.target.closest(".appbar") || e.target.closest(".samal-input-panel") || phase !== "idle") return;
    setPos({ x: e.clientX, y: e.clientY });
    setIsMoving(true);
    setSquish(false);
    setEyeState("moving");
    if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
    arrivalTimer.current = setTimeout(() => {
      setIsMoving(false);
      setSquish(true);
      setEyeState("squished");
      setTimeout(() => {
        setSquish(false);
        setEyeState("happy");
        setTimeout(() => setEyeState("normal"), 600);
      }, SQUISH_MS + 80);
    }, TRAVEL_MS);
  }, [phase]);

  function runParticles(fromX, fromY, toX, toY, onDone) {
    onDoneRef.current = onDone;
    const count = 28;
    const now = performance.now();
    particlesRef.current = Array.from({ length: count }, (_, i) => {
      const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6;
      const spread = 55 + Math.random() * 80;
      return {
        sx: fromX + (Math.random() - 0.5) * 60,
        sy: fromY + (Math.random() - 0.5) * 20,
        cx: (fromX + toX) / 2 + Math.cos(angle) * spread,
        cy: Math.min(fromY, toY) - 55 + Math.sin(angle) * spread * 0.4,
        ex: toX + (Math.random() - 0.5) * 16,
        ey: toY,
        startTime: now + Math.random() * 280,
        duration: 950 + Math.random() * 550,
        size: 2.5 + Math.random() * 4,
        color: PCOLORS[i % PCOLORS.length],
        sparkle: Math.random() > 0.4,
        x: fromX, y: fromY, opacity: 1, done: false,
      };
    });

    function tick(ts) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let any = false;

      for (const p of particlesRef.current) {
        if (p.done) continue;
        const elapsed = ts - p.startTime;
        if (elapsed < 0) { any = true; continue; }
        const t = Math.min(elapsed / p.duration, 1);
        const e = easeInOut(t);
        p.x = bezierPt(e, p.sx, p.cx, p.ex);
        p.y = bezierPt(e, p.sy, p.cy, p.ey);
        p.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
        if (t >= 1) { p.done = true; continue; }
        any = true;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 14;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        if (p.sparkle) {
          const s = p.size * 2.4;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x - s, p.y); ctx.lineTo(p.x + s, p.y);
          ctx.moveTo(p.x, p.y - s); ctx.lineTo(p.x, p.y + s);
          ctx.stroke();
        }
        ctx.restore();
      }

      if (any) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        onDoneRef.current?.();
      }
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function handleFeed() {
    if (!inputText.trim() || phase !== "idle" || !pos) return;
    const msg = getReframe(inputText);
    setReframeMsg(null);
    setInputText("");
    setPhase("animating");
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);

    let fromX = window.innerWidth / 2;
    let fromY = window.innerHeight - 140;
    if (inputBoxRef.current) {
      const r = inputBoxRef.current.getBoundingClientRect();
      fromX = r.left + r.width / 2;
      fromY = r.top + r.height / 2;
    }

    runParticles(fromX, fromY, pos.x, pos.y + CHAR_SIZE * 0.08, () => {
      setEyeState("eating");
      setPhase("eating");
      setTimeout(() => {
        setEyeState("glowing");
        setReframeMsg(msg);
        setPhase("done");
        const gain = 7 + Math.floor(Math.random() * 6);
        setLastGain(gain);
        setStabilityScore(prev => Math.min(100, prev + gain));
        resetTimerRef.current = setTimeout(() => {
          setEyeState("normal");
          setPhase("idle");
          setReframeMsg(null);
        }, 5500);
      }, 900);
    });
  }

  if (!pos) return <div style={{ minHeight: "100vh", background: "#FFF9F9" }}><AppBar /></div>;

  const isIdle = !isMoving && !squish && phase === "idle";
  const bubbleTop = Math.max(76, pos.y - CHAR_SIZE / 2 - 100);
  const isGlowing = eyeState === "eating" || eyeState === "glowing";

  return (
    <div
      style={{ minHeight: "100vh", background: "#FFF9F9", cursor: phase === "idle" ? "crosshair" : "default", overflow: "hidden" }}
      onClick={handleClick}
    >
      <AppBar />

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: "fixed", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 200 }}
      />

      {/* White room */}
      <div style={{
        position: "fixed", left: "50%", top: "64px", transform: "translateX(-50%)",
        width: "min(calc(100vw - 32px), 448px)", height: "calc(100vh - 80px)",
        background: "white", borderRadius: "32px", border: "4px solid #FFE4E8",
        boxShadow: "0 16px 48px rgba(251,113,133,0.10), 0 4px 16px rgba(0,0,0,0.05)",
        zIndex: 1, pointerEvents: "none",
      }} />

      {/* Stability meter */}
      <div style={{
        position: "fixed", left: "50%", top: "80px", transform: "translateX(-50%)",
        width: "min(calc(100vw - 64px), 392px)", zIndex: 10, pointerEvents: "none",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 11, color: "#C07088", fontWeight: 600, fontFamily: "Pretendard,sans-serif", whiteSpace: "nowrap" }}>
            정서·생리 안정도
          </span>
          <div style={{ flex: 1, height: 8, background: "#FFE4E8", borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              height: "100%", width: `${displayScore}%`,
              background: "linear-gradient(90deg, #FF85A2, #C084FC)",
              borderRadius: 999, transition: "width 0.3s ease",
              boxShadow: "0 0 8px rgba(255,133,162,0.5)",
            }} />
          </div>
          <span style={{ fontSize: 13, color: "#C07088", fontWeight: 700, fontFamily: "Pretendard,sans-serif", minWidth: 36, textAlign: "right" }}>
            {displayScore}%
          </span>
        </div>
      </div>

      {/* Speech bubble */}
      {reframeMsg && (
        <div style={{
          position: "fixed", left: "50%", top: bubbleTop,
          transform: "translateX(-50%)", zIndex: 100, pointerEvents: "none",
        }}>
          <div className="samari-bubble-inner" style={{
            maxWidth: 300, minWidth: 220,
            background: "white", borderRadius: 20, border: "2.5px solid #FFB3C1",
            padding: "14px 18px",
            boxShadow: "0 8px 24px rgba(251,113,133,0.20)",
            fontSize: 14, color: "#3D1A26", fontFamily: "Pretendard,sans-serif",
            lineHeight: 1.65, textAlign: "center", position: "relative",
          }}>
            {reframeMsg}
            <div style={{
              position: "absolute", bottom: -13, left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "11px solid transparent", borderRight: "11px solid transparent",
              borderTop: "13px solid #FFB3C1",
            }} />
            <div style={{
              position: "absolute", bottom: -9.5, left: "50%", transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "9px solid transparent", borderRight: "9px solid transparent",
              borderTop: "11px solid white",
            }} />
          </div>
        </div>
      )}

      {/* Character */}
      <div style={{
        position: "fixed",
        left: pos.x - CHAR_SIZE / 2,
        top: pos.y - CHAR_SIZE / 2,
        width: CHAR_SIZE, height: CHAR_SIZE,
        transition: `left ${TRAVEL_MS}ms cubic-bezier(0.34,1.56,0.64,1), top ${TRAVEL_MS}ms cubic-bezier(0.34,1.56,0.64,1)`,
        zIndex: 50, pointerEvents: "none",
      }}>
        <div className={isIdle ? "mallang-float" : ""} style={{ width: "100%", height: "100%" }}>
          <div style={{
            width: "100%", height: "100%",
            transform: squish ? "scaleX(1.28) scaleY(0.74)" : "scaleX(1) scaleY(1)",
            transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
            transformOrigin: "center bottom",
          }}>
            <div
              className={isIdle ? "mallang-squish" : ""}
              style={{
                width: "100%", height: "100%",
                background: "linear-gradient(135deg, #FFF0F2 0%, #FFE4E8 100%)",
                boxShadow: isGlowing
                  ? "inset -10px -10px 25px rgba(251,113,133,0.2), 0 20px 35px rgba(192,132,252,0.28), 0 0 45px rgba(255,133,162,0.28)"
                  : "inset -10px -10px 25px rgba(251,113,133,0.15), 0 20px 35px rgba(251,113,133,0.10)",
                borderRadius: "50% 50% 45% 55% / 55% 55% 45% 45%",
                position: "relative",
                transition: "box-shadow 0.6s ease",
              }}
            >
              <MallangFace state={eyeState} squish={squish} />
            </div>
          </div>
        </div>
      </div>

      {/* Input panel */}
      <div
        className="samal-input-panel"
        onClick={e => e.stopPropagation()}
        style={{
          position: "fixed", left: "50%", bottom: 24, transform: "translateX(-50%)",
          width: "min(calc(100vw - 48px), 400px)", zIndex: 150,
        }}
      >
        <div style={{
          background: "white", borderRadius: 24, border: "2.5px solid #FFE4E8",
          boxShadow: "0 8px 32px rgba(251,113,133,0.15)", padding: "16px 16px 12px",
        }}>
          <div style={{ fontSize: 12, color: "#C07088", fontFamily: "Pretendard,sans-serif", marginBottom: 9, fontWeight: 500 }}>
            지금 어떤 신체 감각이 느껴지나요?
          </div>
          <div ref={inputBoxRef} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <textarea
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleFeed(); } }}
              disabled={phase !== "idle"}
              placeholder="예: 심장이 너무 뛰어, 불안해서 집중이 안 돼..."
              rows={2}
              style={{
                flex: 1, resize: "none",
                border: "2px solid #FFE4E8", borderRadius: 16,
                padding: "10px 14px", fontSize: 14, color: "#3D1A26",
                fontFamily: "Pretendard,sans-serif", outline: "none",
                background: phase !== "idle" ? "#FFF5F7" : "white",
                lineHeight: 1.5, transition: "border-color 0.2s",
              }}
              onFocus={e => e.target.style.borderColor = "#FF85A2"}
              onBlur={e => e.target.style.borderColor = "#FFE4E8"}
            />
            <button
              onClick={handleFeed}
              disabled={!inputText.trim() || phase !== "idle"}
              style={{
                width: 48, height: 48, borderRadius: "50%", border: "none",
                background: !inputText.trim() || phase !== "idle"
                  ? "#FFE4E8"
                  : "linear-gradient(135deg, #FF85A2, #C084FC)",
                cursor: !inputText.trim() || phase !== "idle" ? "default" : "pointer",
                fontSize: 20, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                boxShadow: !inputText.trim() || phase !== "idle" ? "none" : "0 4px 12px rgba(255,133,162,0.4)",
                transition: "all 0.2s",
              }}
            >
              🌀
            </button>
          </div>

          <div style={{ height: 20, marginTop: 8, textAlign: "center", fontSize: 12, fontFamily: "Pretendard,sans-serif" }}>
            {phase === "animating" && <span style={{ color: "#C084FC" }}>별 가루로 변환 중... ✨</span>}
            {phase === "eating" && <span style={{ color: "#FF85A2" }}>사말이가 에너지를 흡수 중 🌟</span>}
            {phase === "done" && lastGain > 0 && (
              <span style={{ color: "#8B4058", fontWeight: 600 }}>정서·생리 안정도 +{lastGain}% 상승 ✨</span>
            )}
            {phase === "idle" && !inputText && (
              <span style={{ color: "#DDB8C4" }}>화면을 클릭하면 사말이가 이동해요</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
