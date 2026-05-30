import { useState, useEffect, useRef, useCallback } from "react";
import AppBar from "../components/AppBar";

const SIZE = 210;
const TRAVEL_MS = 500;
const SQUISH_MS = 300;

function MallangFace({ state, squish }) {
  const blushAlpha = squish ? 0.62 : 0.44;

  return (
    <>
      {/* Blush */}
      <ellipse cx="64"  cy="112" rx="21" ry="13" fill="#F080A0" opacity={blushAlpha}/>
      <ellipse cx="136" cy="112" rx="21" ry="13" fill="#F080A0" opacity={blushAlpha}/>

      {/* Eyes */}
      {state === "squished" && (
        <>
          <line x1="80" y1="95" x2="92" y2="95" stroke="#8B4058" strokeWidth="3" strokeLinecap="round"/>
          <line x1="108" y1="95" x2="120" y2="95" stroke="#8B4058" strokeWidth="3" strokeLinecap="round"/>
        </>
      )}
      {state === "happy" && (
        <>
          <path d="M 80 97 Q 86 89 92 97" stroke="#8B4058" strokeWidth="3" fill="none" strokeLinecap="round"/>
          <path d="M 108 97 Q 114 89 120 97" stroke="#8B4058" strokeWidth="3" fill="none" strokeLinecap="round"/>
        </>
      )}
      {(state === "normal" || state === "moving") && (
        <>
          <circle cx="86"  cy="94" r={state === "moving" ? 3.8 : 5.5} fill="#8B4058"/>
          <circle cx="114" cy="94" r={state === "moving" ? 3.8 : 5.5} fill="#8B4058"/>
        </>
      )}

      {/* Mouth */}
      {state === "squished" && (
        <line x1="95" y1="116" x2="105" y2="116" stroke="#8B4058" strokeWidth="2.2" strokeLinecap="round"/>
      )}
      {state === "happy" && (
        <path d="M 89 114 Q 100 126 111 114" stroke="#8B4058" strokeWidth="2.2" fill="none" strokeLinecap="round"/>
      )}
      {(state === "normal" || state === "moving") && (
        /* w 입 */
        <path
          d="M 91 114 Q 94 121 97.5 115 Q 100 112 102.5 115 Q 106 121 109 114"
          stroke="#8B4058" strokeWidth="2.2" fill="none"
          strokeLinecap="round" strokeLinejoin="round"
        />
      )}
    </>
  );
}

export default function MallangPage() {
  const [pos, setPos] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  const [squish, setSquish] = useState(false);
  const [eyeState, setEyeState] = useState("normal");
  const arrivalTimer = useRef(null);

  useEffect(() => {
    setPos({ x: window.innerWidth / 2, y: window.innerHeight / 2 + 30 });
  }, []);

  const handleClick = useCallback((e) => {
    if (e.target.closest(".appbar")) return;

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
  }, []);

  if (!pos) {
    return <div style={{ minHeight: "100vh", background: "var(--bg)" }}><AppBar /></div>;
  }

  const isIdle = !isMoving && !squish;

  return (
    <div
      style={{ minHeight: "100vh", background: "var(--bg)", cursor: "crosshair", overflow: "hidden" }}
      onClick={handleClick}
    >
      <AppBar />

      {/* 위치 레이어 */}
      <div style={{
        position: "fixed",
        left: pos.x - SIZE / 2,
        top: pos.y - SIZE / 2,
        width: SIZE, height: SIZE,
        transition: `left ${TRAVEL_MS}ms cubic-bezier(0.34,1.56,0.64,1), top ${TRAVEL_MS}ms cubic-bezier(0.34,1.56,0.64,1)`,
        zIndex: 50,
        pointerEvents: "none",
      }}>
        {/* 둥둥 레이어 */}
        <div className={isIdle ? "mallang-float" : ""} style={{ width: "100%", height: "100%" }}>
          {/* 찌그러짐 레이어 */}
          <div style={{
            width: "100%", height: "100%",
            transform: squish ? "scaleX(1.28) scaleY(0.74)" : "scaleX(1) scaleY(1)",
            transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
            transformOrigin: "center bottom",
          }}>
            <svg viewBox="0 0 200 200" width={SIZE} height={SIZE}>
              <defs>
                <radialGradient id="mg-pink" cx="42%" cy="36%" r="62%">
                  <stop offset="0%"   stopColor="#FFF2F5"/>
                  <stop offset="30%"  stopColor="#FFD4E0"/>
                  <stop offset="68%"  stopColor="#FFBDD0"/>
                  <stop offset="100%" stopColor="#F8AABF"/>
                </radialGradient>

                <radialGradient id="mg-halo" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#FFC8D8" stopOpacity="0.40"/>
                  <stop offset="100%" stopColor="#FFC8D8" stopOpacity="0"/>
                </radialGradient>
              </defs>

              {/* 핑크 후광 */}
              <circle cx="100" cy="100" r="98" fill="url(#mg-halo)"/>

              {/* 몸통 */}
              <circle cx="100" cy="100" r="80" fill="url(#mg-pink)"/>

              {/* 흰 테두리 하이라이트 */}
              <circle cx="100" cy="100" r="80"
                fill="none" stroke="rgba(255,255,255,0.60)" strokeWidth="4"/>

              {/* 상단 내부 광택 */}
              <ellipse cx="78" cy="66" rx="28" ry="18"
                fill="rgba(255,255,255,0.30)"
                transform="rotate(-20,78,66)"/>

              <MallangFace state={eyeState} squish={squish}/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
