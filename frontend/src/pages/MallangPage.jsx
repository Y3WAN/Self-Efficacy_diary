import { useState, useEffect, useId, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import AppBar from "../components/AppBar";
import { createMallangSurface, RIPPLE_WIDTH_PERCENT } from "../utils/mallangSurface";

const DRAG_THRESHOLD = 6;
const TETHER_SPRING_TIME_MS = 21;
const CATCH_SPRING_TIME_MS = 40;
const DRAG_MASS = 1.6;
const DRAG_DAMPING = 0.6;
const CATCH_DAMPING = 1.2;
const WALL_BOUNCE = 0.5;
const COAST_FRICTION = 0.0052;
const STOP_SPEED = 0.03;
const IMPACT_MS = 155;
const TAP_REACTION_MS = 360;
const BLOB_CENTER = 100;
const BODY_RADIUS = 94;
const PULL_RADIUS = 38;
const TETHER_LENGTH = 104; // SVG units before the small circle starts pulling the body
const MAX_TETHER_DISTANCE = 128;
const TETHER_FOLLOW_SPEED = 1.65; // SVG units per millisecond
const MAX_TETHER_ACCELERATION = 0.027; // CSS pixels per millisecond squared
const TETHER_FORCE_RISE_MS = 30;
const IDLE_REACTIONS = [
  { expression: "blink", duration: 170 },
  { expression: "happy", duration: 720 },
  { expression: "curious", duration: 580 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positionFromPoint(x, y, rect) {
  return {
    x: clamp((x - rect.left) / rect.width * 100, 0, 100),
    y: clamp((y - rect.top) / rect.height * 100, 0, 100),
  };
}

function tetherOffset(motion, x, y, point = motion.tetherPoint) {
  const { rect, bodySize } = motion;
  const dx = point.x - rect.left - x;
  const dy = point.y - rect.top - y;
  const distance = Math.hypot(dx, dy);
  const maxDistance = MAX_TETHER_DISTANCE * bodySize / (BLOB_CENTER * 2);
  const scale = distance > maxDistance ? maxDistance / distance : 1;
  return { x: dx * scale, y: dy * scale };
}

function followTether(motion, elapsed) {
  const { rect, position, bodySize, pointer, tetherPoint } = motion;
  const x = position.x / 100 * rect.width;
  const y = position.y / 100 * rect.height;
  const offset = tetherOffset(motion, x, y, pointer);
  const target = { x: rect.left + x + offset.x, y: rect.top + y + offset.y };
  if (!tetherPoint || motion.reducedMotion) {
    motion.tetherPoint = target;
    return false;
  }

  const dx = target.x - tetherPoint.x;
  const dy = target.y - tetherPoint.y;
  const distance = Math.hypot(dx, dy);
  const travel = TETHER_FOLLOW_SPEED * bodySize / (BLOB_CENTER * 2) * elapsed;
  if (distance <= travel) {
    motion.tetherPoint = target;
    return false;
  }
  const progress = travel / distance;
  motion.tetherPoint = { x: tetherPoint.x + dx * progress, y: tetherPoint.y + dy * progress };
  return true;
}

function pulledCircle(motion) {
  const { rect, bodySize, position } = motion;
  const unitsPerPixel = BLOB_CENTER * 2 / bodySize;
  const offset = tetherOffset(motion, position.x / 100 * rect.width, position.y / 100 * rect.height);
  return {
    x: BLOB_CENTER + offset.x * unitsPerPixel,
    y: BLOB_CENTER + offset.y * unitsPerPixel,
  };
}

function springDisplacement(motion, x, y) {
  const { rect, target, bodySize } = motion;
  if (target) {
    return { x: target.x / 100 * rect.width - x, y: target.y / 100 * rect.height - y };
  }
  if (motion.mode !== "grab") return { x: 0, y: 0 };

  // A loose connection applies no force. Once taut, pull along the line to the small circle.
  const offset = tetherOffset(motion, x, y);
  const distance = Math.hypot(offset.x, offset.y);
  const slack = TETHER_LENGTH * bodySize / (BLOB_CENTER * 2);
  const tension = distance > slack ? 1 - slack / distance : 0;
  // Only the body hits the wall. Stop pulling on an axis once it reaches that edge.
  return {
    x: clamp(x + offset.x * tension, 0, rect.width) - x,
    y: clamp(y + offset.y * tension, 0, rect.height) - y,
  };
}

function stepAxis(position, speed, acceleration, limit, damping, elapsed) {
  speed = speed * Math.exp(-damping * elapsed) + acceleration * elapsed;

  const next = position + speed * elapsed;
  const wall = next < 0 ? -1 : next > limit ? 1 : 0;
  return {
    position: clamp(next, 0, limit),
    speed: wall ? -speed * WALL_BOUNCE : speed,
    impact: wall && Math.abs(speed) > 0.1 ? wall * Math.min(1, Math.abs(speed) / 0.8) : 0,
  };
}

function stepMotion(motion, elapsed, timestamp) {
  const { rect, bodySize } = motion;
  const springTime = motion.target ? CATCH_SPRING_TIME_MS : TETHER_SPRING_TIME_MS;
  const frequency = motion.mode === "grab" ? 1 / (springTime * Math.sqrt(DRAG_MASS)) : 0;
  const stiffness = frequency ** 2;
  let x = motion.position.x * rect.width / 100;
  let y = motion.position.y * rect.height / 100;
  // Small time steps keep fast wall hits and the spring stable on slower frames.
  while (elapsed > 0) {
    const step = Math.min(elapsed, 8);
    const spring = springDisplacement(motion, x, y);
    const springLength = Math.hypot(spring.x, spring.y);
    let accelerationScale = stiffness;
    if (!motion.target) {
      const rawAcceleration = springLength * stiffness;
      const limitedAcceleration = MAX_TETHER_ACCELERATION * rawAcceleration /
        Math.hypot(MAX_TETHER_ACCELERATION, rawAcceleration);
      // Limit how quickly a distant pull can add force, without cutting existing velocity.
      motion.tetherAcceleration = Math.min(
        limitedAcceleration,
        motion.tetherAcceleration + MAX_TETHER_ACCELERATION * step / TETHER_FORCE_RISE_MS
      );
      accelerationScale = springLength > 0 ? motion.tetherAcceleration / springLength : 0;
    }
    // With slack, the body keeps its velocity and slows through friction alone.
    const springDamping = motion.target
      ? CATCH_DAMPING
      : DRAG_DAMPING * clamp(springLength / (bodySize * 0.04), 0, 1);
    const damping = COAST_FRICTION + frequency * springDamping;
    const horizontal = stepAxis(x, motion.vx, spring.x * accelerationScale, rect.width, damping, step);
    const vertical = stepAxis(y, motion.vy, spring.y * accelerationScale, rect.height, damping, step);
    x = horizontal.position;
    y = vertical.position;
    motion.vx = horizontal.speed;
    motion.vy = vertical.speed;
    if (horizontal.impact || vertical.impact) {
      motion.impact = { x: horizontal.impact, y: vertical.impact, time: timestamp };
    }
    elapsed -= step;
  }
  motion.position = { x: x / rect.width * 100, y: y / rect.height * 100 };
}

function advanceMotion(motion, timestamp) {
  const elapsed = clamp(timestamp - motion.lastFrame, 0, 48);
  motion.lastFrame = Math.max(motion.lastFrame, timestamp);
  const tetherMoving = motion.mode === "grab" && followTether(motion, elapsed);
  if (!motion.reducedMotion) stepMotion(motion, elapsed, timestamp);
  return { elapsed, tetherMoving };
}

function MallangSilhouette({ pull, bodyStyle, surfaceCanvas, appearance }) {
  const isGel = appearance === "3d";
  const id = useId();
  const left = Math.min(-100, (pull?.x ?? BLOB_CENTER) - 90);
  const top = Math.min(-100, (pull?.y ?? BLOB_CENTER) - 90);
  const width = Math.max(300, (pull?.x ?? BLOB_CENTER) + 90) - left;
  const height = Math.max(300, (pull?.y ?? BLOB_CENTER) + 90) - top;
  const body = <circle className="mallang-main-circle" cx={BLOB_CENTER} cy={BLOB_CENTER} r={BODY_RADIUS} style={bodyStyle} />;
  const visibleShape = pull ? <rect x={left} y={top} width={width} height={height} /> : body;
  const bodyFill = appearance === "2d" ? "#ffcedf" : `url(#${id}-body)`;
  return (
    <svg className="mallang-silhouette" aria-hidden="true" viewBox="0 0 200 200">
      <defs>
        {appearance === "original" && (
          <radialGradient id={`${id}-body`} gradientUnits="userSpaceOnUse" cx="86" cy="82" r="123">
            <stop offset="0" stopColor="#fff6fa" />
            <stop offset="0.49" stopColor="#ffe7f0" />
            <stop offset="0.83" stopColor="#f8cedf" />
            <stop offset="1" stopColor="#efb4ca" />
          </radialGradient>
        )}
        {isGel && (
          <>
            <radialGradient id={`${id}-body`} gradientUnits="userSpaceOnUse" cx="65" cy="51" r="158">
              <stop offset="0" stopColor="#fff3f9" />
              <stop offset="0.42" stopColor="#ffd0e6" />
              <stop offset="0.76" stopColor="#ee9ac4" />
              <stop offset="0.93" stopColor="#cc6a9e" />
              <stop offset="1" stopColor="#c05892" />
            </radialGradient>
            <radialGradient id={`${id}-shine`} gradientUnits="userSpaceOnUse" cx="58" cy="48" r="55"
              gradientTransform="rotate(-30 58 48) translate(0 24) scale(1 .5)">
              <stop offset="0" stopColor="#fff9fd" stopOpacity="0.95" />
              <stop offset="0.44" stopColor="#fff9fd" stopOpacity="0.63" />
              <stop offset="1" stopColor="#fff9fd" stopOpacity="0" />
            </radialGradient>
          </>
        )}
        {pull && (
          <>
            <filter
              id={`${id}-blend`}
              filterUnits="userSpaceOnUse"
              x={left} y={top} width={width} height={height}
            >
              <feGaussianBlur stdDeviation="24" />
              <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 18 -8" />
            </filter>
            <mask
              id={`${id}-shape`}
              maskUnits="userSpaceOnUse"
              x={left} y={top} width={width} height={height}
              style={{ maskType: "alpha" }}
            >
              <g filter={`url(#${id}-blend)`}>
                {body}
                <line x1={BLOB_CENTER} y1={BLOB_CENTER} x2={pull.x} y2={pull.y}
                  stroke="black" strokeWidth="76" strokeLinecap="round" />
                <circle className="mallang-pull" cx={pull.x} cy={pull.y} r={PULL_RADIUS} />
              </g>
            </mask>
          </>
        )}
      </defs>
      <g mask={pull ? `url(#${id}-shape)` : undefined}>
        <g fill={bodyFill}>{visibleShape}</g>
        {isGel && <g fill={`url(#${id}-shine)`}>{visibleShape}</g>}
        <foreignObject
          className="mallang-main-circle"
          style={bodyStyle}
          width={BLOB_CENTER * 2}
          height={BLOB_CENTER * 2}
        >
          <canvas ref={surfaceCanvas} className="mallang-surface" />
        </foreignObject>
      </g>
    </svg>
  );
}

function MallangFace({ state, squish, appearance }) {
  const id = useId();
  const isGel = appearance === "3d";
  const isOriginal = appearance === "original";
  const blushFill = isGel ? `url(#${id}-blush)` : isOriginal ? "#fb7185" : "#ed93ae";
  const blushOpacity = isOriginal ? (squish ? 0.52 : 0.34) : (squish ? 1 : 0.82);
  const eyeFill = isGel ? `url(#${id}-eye)` : isOriginal ? "#3D1A26" : "#582438";
  return (
    <svg aria-hidden="true" viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
      {isOriginal && (
        <defs>
          <filter id={`${id}-blush-blur`} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" />
          </filter>
        </defs>
      )}
      {isGel && (
        <defs>
          <radialGradient id={`${id}-blush`} cx="43%" cy="42%">
            <stop offset="0" stopColor="#eb699c" stopOpacity="0.63" />
            <stop offset="1" stopColor="#eb699c" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`${id}-eye`} cx="30%" cy="28%" r="74%">
            <stop offset="0" stopColor="#97516b" />
            <stop offset="1" stopColor="#351321" />
          </radialGradient>
        </defs>
      )}
      {[62, 138].map(x => (
        <ellipse key={x} cx={x} cy="116"
          rx={isGel ? 24 : isOriginal ? 22 : 16}
          ry={isGel ? 16 : isOriginal ? 13 : 8}
          fill={blushFill} opacity={blushOpacity}
          filter={isOriginal ? `url(#${id}-blush-blur)` : undefined} />
      ))}

      {(state === "squished" || state === "blink") && (
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

      {(state === "normal" || state === "moving" || state === "curious") && (
        <>
          <circle cx="86" cy="94" r={state === "moving" ? 3.8 : 6.2} fill={eyeFill} />
          <circle cx="114" cy="94" r={state === "moving" ? 3.8 : 6.2} fill={eyeFill} />
          {appearance !== "2d" && [86, 114].map(x => (
            <circle key={x} cx={x + (isGel ? -2.3 : 3.5)} cy={isGel ? 91.5 : 90.5}
              r={state === "moving" ? 1 : isGel ? 1.8 : 1.9} fill={isGel ? "#fff4fb" : "white"} />
          ))}
          {state === "curious" ? (
            <>
              <path d="M 106 82 Q 113 76 121 82" stroke="#6B2D40" strokeWidth="2.3" fill="none" strokeLinecap="round" />
              <ellipse cx="100" cy="117" rx="4" ry="5" fill="#8B4058" />
            </>
          ) : (
            <text x="100" y="123" textAnchor="middle" fontSize="20" fill="#8B4058" fontWeight="800"
              fontFamily="system-ui,sans-serif" style={{ userSelect: "none" }}>ω</text>
          )}
        </>
      )}
    </svg>
  );
}

function IdleMallangFace({ appearance }) {
  const [expression, setExpression] = useState("normal");

  useEffect(() => {
    let timer;

    function waitForReaction() {
      timer = setTimeout(() => {
        const reaction = IDLE_REACTIONS[Math.floor(Math.random() * IDLE_REACTIONS.length)];
        setExpression(reaction.expression);
        timer = setTimeout(() => {
          setExpression("normal");
          waitForReaction();
        }, reaction.duration);
      }, 2800 + Math.random() * 3600);
    }

    waitForReaction();
    return () => clearTimeout(timer);
  }, []);

  return <MallangFace state={expression} squish={false} appearance={appearance} />;
}

export default function MallangPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const previewStyle = searchParams.get("style");
  const showComparison = import.meta.env.DEV && (previewStyle === "2d" || previewStyle === "3d");
  const appearance = showComparison ? previewStyle : "original";
  const isGel = appearance === "3d";
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [phase, setPhase] = useState("idle");
  const [pull, setPull] = useState(null);
  const [impact, setImpact] = useState(null);
  const [widthPercent, setWidthPercent] = useState(RIPPLE_WIDTH_PERCENT.initial);
  const widthControlId = useId();
  const surfaceCanvas = useRef(null);
  const surface = useRef(null);
  const bounds = useRef(null);
  const character = useRef(null);
  const motionRef = useRef(null);
  const reactionTimer = useRef(null);

  useEffect(() => {
    const waveSurface = createMallangSurface(surfaceCanvas.current, BODY_RADIUS / (BLOB_CENTER * 2));
    surface.current = waveSurface;
    return () => {
      clearTimeout(reactionTimer.current);
      if (motionRef.current?.frame != null) cancelAnimationFrame(motionRef.current.frame);
      waveSurface?.stop();
      surface.current = null;
    };
  }, []);

  useEffect(() => {
    surface.current?.setGelStyle(isGel);
  }, [isGel]);

  useEffect(() => {
    surface.current?.setWidthPercent(widthPercent);
  }, [widthPercent]);

  function selectPreviewStyle(style) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("style", style);
    setSearchParams(nextParams, { replace: true });
  }

  function settle(nextPhase, duration) {
    clearTimeout(reactionTimer.current);
    setPhase(nextPhase);
    if (nextPhase !== "idle") {
      reactionTimer.current = setTimeout(() => setPhase("idle"), duration);
    }
  }

  function tapAt(clientX, clientY) {
    const { left, top, width, height } = surfaceCanvas.current.getBoundingClientRect();
    if (width > 0 && height > 0) {
      surface.current?.addDrop((clientX - left) / width, (clientY - top) / height);
    }
    settle("tapped", TAP_REACTION_MS);
  }

  function readGeometry(motion) {
    motion.rect = bounds.current.getBoundingClientRect();
    motion.bodySize = character.current.getBoundingClientRect().width;
  }

  function startGrab() {
    const previous = motionRef.current;
    if (previous?.frame != null) cancelAnimationFrame(previous.frame);
    clearTimeout(reactionTimer.current);
    const body = character.current.getBoundingClientRect();
    const motion = {
      mode: "grab",
      pointerId: null,
      frame: null,
      vx: previous?.vx ?? 0,
      vy: previous?.vy ?? 0,
      tetherAcceleration: 0,
      reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      centerX: body.left + body.width / 2,
      centerY: body.top + body.height / 2,
      tetherPoint: null,
      pull: null,
      impact: null,
    };
    readGeometry(motion);
    motion.position = positionFromPoint(motion.centerX, motion.centerY, motion.rect);
    motion.target = null;
    motionRef.current = motion;
    setPull(null);
    setImpact(null);
    return motion;
  }

  function schedule(motion, timestamp) {
    if (motion.frame !== null) return;
    motion.lastFrame = timestamp;
    motion.frame = requestAnimationFrame((time) => animate(motion, time));
  }

  function animate(motion, timestamp) {
    motion.frame = null;
    const { elapsed, tetherMoving } = advanceMotion(motion, timestamp);
    const held = motion.mode === "grab";
    const coasting = motion.mode === "coast";
    const { rect, position } = motion;
    const spring = springDisplacement(motion, position.x * rect.width / 100, position.y * rect.height / 100);
    const tension = Math.hypot(spring.x, spring.y);
    if (motion.reducedMotion) {
      motion.position = {
        x: clamp(position.x + spring.x / rect.width * 100, 0, 100),
        y: clamp(position.y + spring.y / rect.height * 100, 0, 100),
      };
    }
    if (held) {
      motion.pull = pulledCircle(motion);
    } else if (motion.pull) {
      const blend = Math.exp(-elapsed / 34);
      const x = (motion.pull.x - BLOB_CENTER) * blend;
      const y = (motion.pull.y - BLOB_CENTER) * blend;
      motion.pull = Math.hypot(x, y) > BODY_RADIUS - PULL_RADIUS
        ? { x: BLOB_CENTER + x, y: BLOB_CENTER + y }
        : null;
    }
    if (motion.impact && timestamp - motion.impact.time >= IMPACT_MS) motion.impact = null;
    const squash = motion.impact && (1 - (timestamp - motion.impact.time) / IMPACT_MS) ** 2;
    setPull(motion.pull);
    setImpact(motion.impact && { x: motion.impact.x * squash, y: motion.impact.y * squash });

    const moving = Math.hypot(motion.vx, motion.vy) > STOP_SPEED;
    if (!moving && !coasting && tension < 0.3) {
      if (motion.target) motion.position = motion.target;
      motion.vx = 0;
      motion.vy = 0;
    }
    setPosition(motion.position);
    if (moving || (!coasting && !motion.reducedMotion && tension >= 0.3) ||
      tetherMoving || motion.impact || (coasting && motion.pull)) {
      motion.frame = requestAnimationFrame((time) => animate(motion, time));
    } else if (!held) {
      motionRef.current = null;
      settle("happy", 280);
    }
  }

  function press(event) {
    if (!event.isPrimary || event.button !== 0 || motionRef.current?.pointerId != null) return;
    const motion = startGrab();
    const catching = Math.hypot(motion.vx, motion.vy) > STOP_SPEED;
    motion.pointerId = event.pointerId;
    motion.pointer = { x: event.clientX, y: event.clientY };
    motion.startX = event.clientX;
    motion.startY = event.clientY;
    if (catching) motion.target = motion.position;
    motion.hasMoved = catching;
    event.currentTarget.setPointerCapture(event.pointerId);
    setPhase(catching ? "dragging" : "pressed");
    if (catching) {
      followTether(motion, 0);
      motion.pull = pulledCircle(motion);
      setPull(motion.pull);
      schedule(motion, event.timeStamp);
    }
  }

  function movePointer(event) {
    const motion = motionRef.current;
    if (!motion || event.pointerId !== motion.pointerId) return;

    const previous = motion.pointer;
    if (event.clientX === previous.x && event.clientY === previous.y) return;
    motion.pointer = { x: event.clientX, y: event.clientY };
    const distance = Math.hypot(event.clientX - motion.startX, event.clientY - motion.startY);
    if (distance >= DRAG_THRESHOLD) motion.target = null;
    if (!motion.hasMoved) {
      if (distance < DRAG_THRESHOLD) return;
      motion.hasMoved = true;
      setPhase("dragging");
    }
    readGeometry(motion);
    if (!motion.tetherPoint) {
      followTether(motion, 0);
      motion.pull = pulledCircle(motion);
      setPull(motion.pull);
    }
    schedule(motion, event.timeStamp);
  }

  function release(event) {
    const motion = motionRef.current;
    if (!motion || event.pointerId !== motion.pointerId) return;
    const released = event.type === "pointerup";
    if (released && motion.hasMoved && !motion.reducedMotion) {
      // Integrate the held force through the release time, then coast with that velocity.
      if (motion.frame !== null) {
        advanceMotion(motion, event.timeStamp);
        motion.pull = pulledCircle(motion);
      }
      motion.pointerId = null;
      motion.mode = "coast";
      motion.target = null;
      setPhase("releasing");
      schedule(motion, event.timeStamp);
      return;
    }
    if (motion.frame != null) cancelAnimationFrame(motion.frame);
    motionRef.current = null;
    setPull(null);
    setImpact(null);
    if (released && !motion.hasMoved) {
      tapAt(event.clientX, event.clientY);
    } else {
      settle("idle");
    }
  }

  const squished = phase === "pressed" || !!impact;
  const dragging = phase === "dragging";
  const tapped = phase === "tapped";
  const eyeState = squished ? "squished" : phase === "happy" || tapped ? "happy" :
    phase === "releasing" ? "moving" : "normal";
  const impactX = Math.abs(impact?.x ?? 0);
  const impactY = Math.abs(impact?.y ?? 0);
  const bodyStyle = impact ? {
    transform: `scale(${1 - 0.32 * impactX + 0.12 * impactY}, ${1 - 0.32 * impactY + 0.12 * impactX})`,
    transformOrigin: `${impact.x < 0 ? "left" : impact.x > 0 ? "right" : "center"} ${impact.y < 0 ? "top" : impact.y > 0 ? "bottom" : "center"}`,
    transitionDuration: "0ms",
  } : {
    transform: squished ? "scale(1.06, 0.94)" : undefined,
    transitionDuration: squished ? "75ms" : undefined,
  };

  return (
    <div className={`mallang-page mallang-page--${appearance}`}>
      <AppBar />
      <main className="mallang-content">
        <h1>사이버 말랑이</h1>
        <p id="mallang-help">말랑이를 여러 번 톡톡 눌러 보세요. 잡아당기거나 빠르게 밀 수도 있어요.</p>
        <div className="mallang-controls">
          <div className="mallang-width-control">
            <label htmlFor={widthControlId}>물결 고리 폭</label>
            <input
              id={widthControlId}
              type="range"
              min={RIPPLE_WIDTH_PERCENT.min}
              max={RIPPLE_WIDTH_PERCENT.max}
              step={RIPPLE_WIDTH_PERCENT.step}
              value={widthPercent}
              aria-valuetext={`${widthPercent}%`}
              onChange={(event) => setWidthPercent(event.currentTarget.valueAsNumber)}
            />
            <output htmlFor={widthControlId}>{widthPercent}%</output>
          </div>
          {showComparison && (
            <div className="mallang-style-preview" role="group" aria-label="말랑이 그림체 비교">
              <button type="button" aria-pressed={!isGel} onClick={() => selectPreviewStyle("2d")}>2D</button>
              <button type="button" aria-pressed={isGel} onClick={() => selectPreviewStyle("3d")}>3D</button>
            </div>
          )}
        </div>
        <section className="mallang-room" aria-label="말랑이 놀이터">
          <div ref={bounds} className="mallang-bounds">
            <div
              ref={character}
              className={`mallang-character${dragging ? " mallang-character--dragging" : ""}${phase === "idle" ? " mallang-idle" : ""}`}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
            >
              <MallangSilhouette pull={pull} bodyStyle={bodyStyle} surfaceCanvas={surfaceCanvas} appearance={appearance} />
              <button
                type="button"
                draggable={false}
                className={`mallang-body${dragging ? " mallang-dragging" : ""}`}
                aria-label="말랑이 누르기"
                aria-describedby="mallang-help"
                onPointerDown={press}
                onPointerMove={movePointer}
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
                onClick={(event) => {
                  if (event.detail !== 0 || motionRef.current !== null) return;
                  const { left, top, width, height } = character.current.getBoundingClientRect();
                  tapAt(left + width / 2, top + height / 2);
                }}
                style={bodyStyle}
              >
                {phase === "idle" ? <IdleMallangFace appearance={appearance} /> : <MallangFace state={eyeState} squish={squished} appearance={appearance} />}
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
