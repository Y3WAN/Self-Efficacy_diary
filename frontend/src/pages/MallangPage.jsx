import { useState, useEffect, useRef, useCallback } from "react";
import AppBar from "../components/AppBar";

const SIZE = 150;
const TRAVEL_MS = 480;
const SQUISH_MS = 290;

function Eyes({ state }) {
  if (state === "squished") {
    return (
      <>
        <line x1="46" y1="64" x2="70" y2="78" stroke="#1A1410" strokeWidth="5" strokeLinecap="round"/>
        <line x1="70" y1="64" x2="46" y2="78" stroke="#1A1410" strokeWidth="5" strokeLinecap="round"/>
        <line x1="90" y1="64" x2="114" y2="78" stroke="#1A1410" strokeWidth="5" strokeLinecap="round"/>
        <line x1="114" y1="64" x2="90" y2="78" stroke="#1A1410" strokeWidth="5" strokeLinecap="round"/>
      </>
    );
  }
  if (state === "happy") {
    return (
      <>
        <path d="M 43 74 Q 58 56 73 74" stroke="#1A1410" strokeWidth="5" fill="none" strokeLinecap="round"/>
        <path d="M 87 74 Q 102 56 117 74" stroke="#1A1410" strokeWidth="5" fill="none" strokeLinecap="round"/>
      </>
    );
  }
  if (state === "moving") {
    return (
      <>
        <ellipse cx="58" cy="70" rx="15" ry="10" fill="white"/>
        <ellipse cx="102" cy="70" rx="15" ry="10" fill="white"/>
        <circle cx="62" cy="71" r="7" fill="#1A1410"/>
        <circle cx="106" cy="71" r="7" fill="#1A1410"/>
        <circle cx="64" cy="69" r="2.5" fill="white"/>
        <circle cx="108" cy="69" r="2.5" fill="white"/>
        <line x1="43" y1="60" x2="73" y2="63" stroke="#1A1410" strokeWidth="3" strokeLinecap="round"/>
        <line x1="87" y1="63" x2="117" y2="60" stroke="#1A1410" strokeWidth="3" strokeLinecap="round"/>
      </>
    );
  }
  return (
    <>
      <ellipse cx="58" cy="70" rx="19" ry="22" fill="white"/>
      <ellipse cx="102" cy="70" rx="19" ry="22" fill="white"/>
      <circle cx="61" cy="72" r="12.5" fill="#1A1410"/>
      <circle cx="105" cy="72" r="12.5" fill="#1A1410"/>
      <circle cx="65" cy="67" r="5" fill="white"/>
      <circle cx="109" cy="67" r="5" fill="white"/>
      <circle cx="58" cy="76" r="2" fill="white" opacity="0.5"/>
      <circle cx="102" cy="76" r="2" fill="white" opacity="0.5"/>
    </>
  );
}

function Mouth({ state }) {
  const d =
    state === "squished" ? "M 68 108 Q 80 98 92 108" :
    state === "happy"    ? "M 62 103 Q 80 122 98 103" :
                           "M 65 104 Q 80 116 95 104";
  return <path d={d} stroke="#1A1410" strokeWidth="3.5" fill="none" strokeLinecap="round"/>;
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
        setTimeout(() => setEyeState("normal"), 550);
      }, SQUISH_MS + 60);
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

      {/* Layer 1 — position */}
      <div
        style={{
          position: "fixed",
          left: pos.x - SIZE / 2,
          top: pos.y - SIZE / 2,
          width: SIZE,
          height: SIZE,
          transition: `left ${TRAVEL_MS}ms cubic-bezier(0.34,1.56,0.64,1), top ${TRAVEL_MS}ms cubic-bezier(0.34,1.56,0.64,1)`,
          zIndex: 50,
          pointerEvents: "none",
        }}
      >
        {/* Layer 2 — idle float */}
        <div
          className={isIdle ? "mallang-float" : ""}
          style={{ width: "100%", height: "100%" }}
        >
          {/* Layer 3 — squish */}
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: squish ? "scaleX(1.36) scaleY(0.68)" : "scaleX(1) scaleY(1)",
              transition: "transform 0.36s cubic-bezier(0.34,1.56,0.64,1)",
              transformOrigin: "center bottom",
            }}
          >
            <svg viewBox="0 0 160 160" width={SIZE} height={SIZE}>
              <defs>
                <radialGradient id="mg-g" cx="36%" cy="27%" r="70%">
                  <stop offset="0%" stopColor="#FFF4E6"/>
                  <stop offset="55%" stopColor="#FFD09E"/>
                  <stop offset="100%" stopColor="#F4A261"/>
                </radialGradient>
              </defs>

              {/* Ground shadow */}
              <ellipse cx="80" cy="156" rx="46" ry="6" fill="rgba(61,53,48,0.09)"/>

              {/* Body */}
              <path
                d="M80,18 C114,14 145,42 144,78 C143,114 118,150 82,151 C46,152 15,126 15,92 C15,58 46,22 80,18 Z"
                fill="url(#mg-g)"
                style={{ filter: "drop-shadow(0 10px 22px rgba(244,162,97,0.28))" }}
              />

              <Eyes state={eyeState}/>
              <Mouth state={eyeState}/>

              {/* Blush */}
              <ellipse cx="36" cy="100" rx="15" ry="8.5" fill="#F4A261" opacity="0.26"/>
              <ellipse cx="124" cy="100" rx="15" ry="8.5" fill="#F4A261" opacity="0.26"/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
