import { useState, useEffect, useRef, useCallback } from "react";
import AppBar from "../components/AppBar";

const CHAR_SIZE = 210;
const TRAVEL_MS = 500;
const SQUISH_MS = 300;

function bezierPt(t, p0, p1, p2) {
  const m = 1 - t;
  return m * m * p0 + 2 * m * t * p1 + t * t * p2;
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function MallangFace({ state, squish }) {
  const blushAlpha = squish ? 0.52 : 0.34;
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

      {state === "happy" && (
        <>
          <path d="M 79 97 Q 86 89 93 97" stroke="#6B2D40" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 107 97 Q 114 89 121 97" stroke="#6B2D40" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M 89 114 Q 100 127 111 114" stroke="#8B4058" strokeWidth="2.5" fill="none" strokeLinecap="round" />
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

  if (!pos) return <div style={{ minHeight: "100vh", background: "#FFF9F9" }}><AppBar /></div>;

  const isIdle = !isMoving && !squish;

  return (
    <div
      style={{ minHeight: "100vh", background: "#FFF9F9", cursor: "crosshair", overflow: "hidden" }}
      onClick={handleClick}
    >
      <AppBar />

      {/* White room */}
      <div style={{
        position: "fixed", left: "50%", top: "64px", transform: "translateX(-50%)",
        width: "min(calc(100vw - 32px), 448px)", height: "calc(100vh - 80px)",
        background: "white", borderRadius: "32px", border: "4px solid #FFE4E8",
        boxShadow: "0 16px 48px rgba(251,113,133,0.10), 0 4px 16px rgba(0,0,0,0.05)",
        zIndex: 1, pointerEvents: "none",
      }} />

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
                boxShadow: "inset -10px -10px 25px rgba(251,113,133,0.15), 0 20px 35px rgba(251,113,133,0.10)",
                borderRadius: "50% 50% 45% 55% / 55% 55% 45% 45%",
                position: "relative",
              }}
            >
              <MallangFace state={eyeState} squish={squish} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
