import { useState, useEffect, useRef, useCallback } from "react";
import AppBar from "../components/AppBar";

const SIZE = 200;
const TRAVEL_MS = 500;
const SQUISH_MS = 300;

function MallangFace({ state }) {
  if (state === "squished") {
    return (
      <>
        <line x1="84" y1="98" x2="96" y2="98" stroke="#7A6878" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="104" y1="98" x2="116" y2="98" stroke="#7A6878" strokeWidth="2.5" strokeLinecap="round"/>
        <line x1="96" y1="112" x2="104" y2="112" stroke="#7A6878" strokeWidth="2" strokeLinecap="round"/>
      </>
    );
  }
  if (state === "happy") {
    return (
      <>
        <path d="M 84 100 Q 90 93 96 100" stroke="#7A6878" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M 104 100 Q 110 93 116 100" stroke="#7A6878" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
        <path d="M 92 112 Q 100 119 108 112" stroke="#7A6878" strokeWidth="2" fill="none" strokeLinecap="round"/>
      </>
    );
  }
  if (state === "moving") {
    return (
      <>
        <circle cx="90" cy="99" r="3.5" fill="#7A6878"/>
        <circle cx="110" cy="99" r="3.5" fill="#7A6878"/>
        <line x1="94" y1="112" x2="106" y2="112" stroke="#7A6878" strokeWidth="2" strokeLinecap="round"/>
      </>
    );
  }
  return (
    <>
      <circle cx="90" cy="99" r="4" fill="#7A6878"/>
      <circle cx="110" cy="99" r="4" fill="#7A6878"/>
      <line x1="95" y1="113" x2="105" y2="113" stroke="#7A6878" strokeWidth="2.2" strokeLinecap="round"/>
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

      {/* Position layer */}
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
        {/* Float layer */}
        <div
          className={isIdle ? "mallang-float" : ""}
          style={{ width: "100%", height: "100%" }}
        >
          {/* Squish layer */}
          <div
            style={{
              width: "100%",
              height: "100%",
              transform: squish ? "scaleX(1.30) scaleY(0.72)" : "scaleX(1) scaleY(1)",
              transition: "transform 0.38s cubic-bezier(0.34,1.56,0.64,1)",
              transformOrigin: "center bottom",
            }}
          >
            <svg viewBox="0 0 200 200" width={SIZE} height={SIZE}>
              <defs>
                <radialGradient id="mg-body" cx="42%" cy="36%" r="62%">
                  <stop offset="0%"   stopColor="#FFFFFF"/>
                  <stop offset="30%"  stopColor="#F7ECF4"/>
                  <stop offset="65%"  stopColor="#EDD4E8"/>
                  <stop offset="100%" stopColor="#DFC3D8"/>
                </radialGradient>

                <radialGradient id="mg-glow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%"   stopColor="#E8D0E4" stopOpacity="0.55"/>
                  <stop offset="100%" stopColor="#E8D0E4" stopOpacity="0"/>
                </radialGradient>
              </defs>

              {/* Soft outer glow */}
              <circle cx="100" cy="100" r="96" fill="url(#mg-glow)"/>

              {/* Body */}
              <circle cx="100" cy="100" r="78" fill="url(#mg-body)"/>

              {/* Face */}
              <MallangFace state={eyeState}/>
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
