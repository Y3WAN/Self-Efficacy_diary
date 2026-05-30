import { useState, useCallback, useRef } from "react";
import AppBar from "../components/AppBar";

const MESSAGES = [
  "말랑~! 🌀", "꾹꾹!", "앗 간지러워! 😆",
  "멈춰!!!! 😤", "또?? 😅", "히히히 😊",
  "아야! 😣", "나야 말랑이 🤖", "사이버 말랑이다! ⚡",
  "눌리는 중... 💫", "말랑말랑~ 🫧", "살살 눌러줘! 🥺",
  "좋아 좋아! 🎉", "뿌~~! 💨", "버퍼링 중... ⏳",
  "ERROR: 너무 귀여움 🚨", "재부팅 필요 🔄", "LOADING... ⌛",
  "데이터 처리 중 📡", "핑 999ms 😰", "배터리 부족 🔋",
  "아직도 눌러? 😑", "....", "으aaaa 🙈",
];

const MILESTONES = {
  10: "🎉 10번 눌렸어! 흑흑",
  30: "😱 30번?! 제발...",
  50: "💀 50번... 진짜야?",
  100: "🏆 100번!! 말랑이 마스터!",
  200: "👁️ 200번... 당신은 전설",
};

const MOODS = [
  [0, "궁금함 (curious)"],
  [1, "쑥스러움 (shy)"],
  [5, "즐거움 (happy)"],
  [15, "신남 (excited)"],
  [30, "지침 (tired)"],
  [50, "멘붕 (panic)"],
  [100, "초월 (transcended)"],
];

function getMood(count) {
  let mood = MOODS[0][1];
  for (const [threshold, label] of MOODS) {
    if (count >= threshold) mood = label;
  }
  return mood;
}

export default function MallangPage() {
  const [clickCount, setClickCount] = useState(0);
  const [squishState, setSquishState] = useState("idle");
  const [message, setMessage] = useState(null);
  const [msgKey, setMsgKey] = useState(0);
  const [eyeState, setEyeState] = useState("normal");
  const [particles, setParticles] = useState([]);
  const particleId = useRef(0);
  const msgTimer = useRef(null);
  const squishTimer = useRef(null);

  const handleClick = useCallback((e) => {
    const newCount = setClickCount((c) => {
      const next = c + 1;

      // Eye reaction
      if (next % 10 === 0) setEyeState("stars");
      else if (next % 5 === 0) setEyeState("dizzy");
      else setEyeState("squished");
      setTimeout(() => setEyeState("normal"), 500);

      // Message
      if (msgTimer.current) clearTimeout(msgTimer.current);
      const m = MILESTONES[next] ?? MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
      setMessage(m);
      setMsgKey((k) => k + 1);
      msgTimer.current = setTimeout(() => setMessage(null), 2200);

      return next;
    });

    // Squish
    if (squishTimer.current) clearTimeout(squishTimer.current);
    setSquishState("squish");
    squishTimer.current = setTimeout(() => setSquishState("bounce"), 130);
    setTimeout(() => setSquishState("idle"), 420);

    // Particles
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const emojis = ["✨", "⭐", "💫", "⚡", "🌟", "🫧"];
    const count = 6;
    const newParticles = Array.from({ length: count }, (_, i) => {
      particleId.current += 1;
      const angle = ((i / count) * 360 + Math.random() * 30) * (Math.PI / 180);
      const dist = 55 + Math.random() * 35;
      return {
        id: particleId.current,
        startX: cx,
        startY: cy,
        tx: Math.cos(angle) * dist,
        ty: Math.sin(angle) * dist,
        emoji: emojis[Math.floor(Math.random() * emojis.length)],
      };
    });
    setParticles((prev) => [...prev, ...newParticles]);
    setTimeout(() => {
      setParticles((prev) => prev.filter((p) => !newParticles.some((np) => np.id === p.id)));
    }, 750);
  }, []);

  const getTransform = () => {
    if (squishState === "squish") return "scaleX(1.38) scaleY(0.65)";
    if (squishState === "bounce") return "scaleX(0.9) scaleY(1.14)";
    return "scaleX(1) scaleY(1)";
  };

  const getMouthPath = () =>
    squishState === "squish"
      ? "M 72 132 Q 100 120 128 132"
      : "M 72 122 Q 100 140 128 122";

  const glowAlpha = Math.min(0.55, clickCount * 0.008);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <AppBar />

      <main style={{ maxWidth: 480, margin: "0 auto", padding: "28px 16px 80px", textAlign: "center" }}>
        {/* Title */}
        <h2 style={{
          fontSize: 22, fontWeight: 800, fontFamily: "monospace",
          color: "var(--orange)", letterSpacing: "0.04em", marginBottom: 4,
        }}>
          ⚡ 사이버 말랑이 ⚡
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 24 }}>
          눌러보세요~
        </p>

        {/* Counter badge */}
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 10,
          background: "var(--card)", border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)", padding: "8px 20px",
          fontFamily: "monospace", fontSize: 13, marginBottom: 28,
        }}>
          <span style={{ color: "var(--text-muted)" }}>눌린 횟수</span>
          <span style={{ color: "var(--orange)", fontWeight: 800, fontSize: 20, minWidth: 32 }}>
            {clickCount}
          </span>
        </div>

        {/* Message bubble */}
        <div style={{ height: 54, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          {message ? (
            <div
              key={msgKey}
              className="mallang-bubble"
              style={{
                background: "var(--card)",
                border: "2px solid var(--orange)",
                borderRadius: 20,
                padding: "10px 24px",
                fontSize: 15, fontWeight: 600,
                color: "var(--text)",
                boxShadow: "0 0 18px rgba(244,162,97,0.35)",
              }}
            >
              {message}
            </div>
          ) : (
            <span style={{ fontSize: 12, color: "var(--text-soft)", fontFamily: "monospace" }}>
              &gt; 대기 중...
            </span>
          )}
        </div>

        {/* Character area */}
        <div style={{ position: "relative", display: "inline-block" }}>
          {/* Glow ring */}
          <div style={{
            position: "absolute", inset: -16, borderRadius: "50%",
            background: `radial-gradient(circle, rgba(244,162,97,${glowAlpha}) 0%, transparent 70%)`,
            pointerEvents: "none",
            transition: "background 0.4s",
          }} />

          {/* Fixed particles */}
          {particles.map((p) => (
            <div
              key={p.id}
              className="mallang-particle"
              style={{
                position: "fixed",
                left: p.startX - 10,
                top: p.startY - 10,
                width: 20, height: 20,
                fontSize: 18,
                lineHeight: "20px",
                textAlign: "center",
                pointerEvents: "none",
                zIndex: 999,
                "--tx": `${p.tx}px`,
                "--ty": `${p.ty}px`,
              }}
            >
              {p.emoji}
            </div>
          ))}

          {/* The blob button */}
          <button
            onClick={handleClick}
            style={{
              width: 200, height: 200,
              border: "none", cursor: "pointer",
              background: "none", padding: 0, outline: "none",
              position: "relative",
              transform: getTransform(),
              transition:
                squishState === "squish"
                  ? "transform 0.1s cubic-bezier(0.4,0,1,1)"
                  : "transform 0.42s cubic-bezier(0.34,1.56,0.64,1)",
              userSelect: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <svg viewBox="0 0 200 200" width="200" height="200">
              <defs>
                <radialGradient id="mg-body" cx="38%" cy="32%" r="68%">
                  <stop offset="0%" stopColor="#FFF9F2" />
                  <stop offset="100%" stopColor="#FFD0A0" />
                </radialGradient>
                <filter id="mg-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Body */}
              <ellipse cx="100" cy="108" rx="76" ry="72"
                fill="url(#mg-body)" filter="url(#mg-glow)" />
              <ellipse cx="100" cy="108" rx="76" ry="72"
                fill="none" stroke="#F4A261" strokeWidth="2.5" opacity="0.65" />

              {/* Cyber scanlines */}
              <line x1="30" y1="76" x2="170" y2="76" stroke="#F4A261" strokeWidth="0.9" opacity="0.25" />
              <line x1="30" y1="108" x2="170" y2="108" stroke="#F4A261" strokeWidth="0.9" opacity="0.18" />
              <line x1="30" y1="140" x2="170" y2="140" stroke="#F4A261" strokeWidth="0.9" opacity="0.25" />

              {/* Eyes */}
              {eyeState === "squished" && (
                <>
                  <line x1="62" y1="90" x2="88" y2="90" stroke="#3D3530" strokeWidth="4.5" strokeLinecap="round" />
                  <line x1="112" y1="90" x2="138" y2="90" stroke="#3D3530" strokeWidth="4.5" strokeLinecap="round" />
                </>
              )}
              {eyeState === "stars" && (
                <>
                  <text x="75" y="100" textAnchor="middle" fontSize="22" fill="#F6C453">★</text>
                  <text x="125" y="100" textAnchor="middle" fontSize="22" fill="#F6C453">★</text>
                </>
              )}
              {eyeState === "dizzy" && (
                <>
                  <text x="75" y="100" textAnchor="middle" fontSize="20" fill="#6C8BAA">@</text>
                  <text x="125" y="100" textAnchor="middle" fontSize="20" fill="#6C8BAA">@</text>
                </>
              )}
              {eyeState === "normal" && (
                <>
                  <circle cx="75" cy="90" r="16" fill="white" />
                  <circle cx="125" cy="90" r="16" fill="white" />
                  <circle cx="79" cy="91" r="9" fill="#3D3530" />
                  <circle cx="129" cy="91" r="9" fill="#3D3530" />
                  <circle cx="82" cy="88" r="3.5" fill="white" />
                  <circle cx="132" cy="88" r="3.5" fill="white" />
                </>
              )}

              {/* Mouth */}
              <path d={getMouthPath()} stroke="#3D3530" strokeWidth="3.5" fill="none" strokeLinecap="round" />

              {/* Blush */}
              <ellipse cx="54" cy="115" rx="13" ry="7.5" fill="#F4A261" opacity="0.32" />
              <ellipse cx="146" cy="115" rx="13" ry="7.5" fill="#F4A261" opacity="0.32" />

              {/* Cyber label */}
              <text x="100" y="167" textAnchor="middle" fontSize="7" fill="#F4A261" opacity="0.45" fontFamily="monospace">
                MALLANG_v2.0 / 0x4D4C
              </text>
            </svg>
          </button>
        </div>

        {/* Status terminal */}
        <div style={{
          marginTop: 36,
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "16px 20px",
          fontFamily: "monospace",
          fontSize: 12,
          color: "var(--text-muted)",
          textAlign: "left",
          lineHeight: 2,
        }}>
          <div>&gt; STATUS:&nbsp;
            <span style={{ color: "var(--green)", fontWeight: 700 }}>ONLINE</span>
          </div>
          <div>&gt; POKE_COUNT:&nbsp;
            <span style={{ color: "var(--orange)", fontWeight: 700 }}>{clickCount}</span>
          </div>
          <div>&gt; MOOD:&nbsp;
            <span style={{ color: "var(--blue)", fontWeight: 700 }}>{getMood(clickCount)}</span>
          </div>
          <div style={{ color: "var(--text-soft)" }}>
            &gt; <span style={{ opacity: 0.6 }}>_ </span>
            <span className="mallang-cursor">|</span>
          </div>
        </div>
      </main>
    </div>
  );
}
