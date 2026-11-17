import { useState, useEffect, useId, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import AppBar from "../components/AppBar";
import WaxShell from "../components/WaxShell";
import { createMallangSurface } from "../utils/mallangSurface";
import { createWaxShell, fractureWaxShell, waxKeyboardPoint } from "../utils/waxShell";
import { createButtonDent } from "../utils/buttonDent";
import { FULL_PRESS_MS, PRESS_FLATTENING, pressDepth, pressRadiusRatio, pressRecoveryDuration } from "../utils/surfacePress";
import { pressureRimPath } from "../utils/mallangRim";
import { BLOB_CENTER, BODY_RADIUS, STOP_SPEED, MAX_TETHER_DISTANCE, positionFromPoint,
  followTether, pullTarget, pulledCircle, beginPull, retractCircle, springDisplacement, advanceMotion } from "../utils/mallangMotion";
import { createMallangAudio, readMallangVolume, saveMallangVolume } from "../utils/mallangAudio";

const MIN_DRAG_DISTANCE = 8;
const DRAG_SIZE_RATIO = 0.075;
const IMPACT_MS = 155;
const IMPACT_SOUND_GAP_MS = 85;
const TAP_REACTION_MS = 360;
const MIN_WAX_HOLD_MS = 190;
const WAX_DRAG_STEP = 18;
const RIM_SPAN = 0.44;
const MIN_RETRACT_MS = 175;
const MAX_RETRACT_MS = 315;
const WAX_MODE_KEY = "codemyworld.mallang.wax";
const IDLE_REACTIONS = [
  { expression: "blink", duration: 170 },
  { expression: "happy", duration: 720 },
  { expression: "curious", duration: 580 },
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function circularRim(radius) {
  const diameter = radius * 2;
  return `M ${BLOB_CENTER + radius} ${BLOB_CENTER} a ${radius} ${radius} 0 1 0 ${-diameter} 0 a ${radius} ${radius} 0 1 0 ${diameter} 0 Z`;
}

const RESTING_RIM = circularRim(BODY_RADIUS);

function flexedRim(angle, amount) {
  if (!amount) return RESTING_RIM;
  if (angle === null) return circularRim(BODY_RADIUS * (1 + amount * 0.45));

  const start = angle - RIM_SPAN;
  const end = angle + RIM_SPAN;
  const handle = BODY_RADIUS * RIM_SPAN / 3;
  function point(direction, radius, tangent = 0) {
    const x = BLOB_CENTER + Math.cos(direction) * radius - Math.sin(direction) * tangent;
    const y = BLOB_CENTER + Math.sin(direction) * radius + Math.cos(direction) * tangent;
    return `${x.toFixed(2)} ${y.toFixed(2)}`;
  }

  const crest = BODY_RADIUS * (1 + amount);
  return [
    `M ${point(end, BODY_RADIUS)} A ${BODY_RADIUS} ${BODY_RADIUS} 0 1 1 ${point(start, BODY_RADIUS)}`,
    `C ${point(start, BODY_RADIUS, handle)} ${point(angle, crest, -handle)} ${point(angle, crest)}`,
    `C ${point(angle, crest, handle)} ${point(end, BODY_RADIUS, -handle)} ${point(end, BODY_RADIUS)} Z`,
  ].join(" ");
}

function MallangSilhouette({ pull, bodyStyle, surfaceCanvas, rimRef, dentRef, appearance }) {
  const isGel = appearance === "3d";
  const id = useId();
  const left = Math.min(-100, (pull?.x ?? BLOB_CENTER) - 90);
  const top = Math.min(-100, (pull?.y ?? BLOB_CENTER) - 90);
  const width = Math.max(300, (pull?.x ?? BLOB_CENTER) + 90) - left;
  const height = Math.max(300, (pull?.y ?? BLOB_CENTER) + 90) - top;
  const body = <use href={`#${id}-outline`} className="mallang-main-circle" style={bodyStyle} />;
  const visibleShape = pull ? <rect x={left} y={top} width={width} height={height} /> : body;
  const bodyFill = appearance === "2d" ? "#ffcedf" : `url(#${id}-body)`;
  const pullOpacity = pull
    ? clamp((Math.hypot(pull.x - BLOB_CENTER, pull.y - BLOB_CENTER) - 48) / 53, 0, 1) * 0.54 * (pull.blend ?? 1)
    : 0;
  return (
    <svg className="mallang-silhouette" aria-hidden="true" viewBox="0 0 200 200">
      <defs>
        <path ref={rimRef} id={`${id}-outline`} d={RESTING_RIM} />
        <clipPath id={`${id}-resting-shape`}>{body}</clipPath>
        {appearance === "original" && (
          <radialGradient id={`${id}-body`} gradientUnits="userSpaceOnUse" cx="76" cy="64" r="143">
            <stop offset="0" stopColor="#faddea" />
            <stop offset=".48" stopColor="#f5cede" />
            <stop offset=".82" stopColor="#ebb4ce" />
            <stop offset="1" stopColor="#da97b9" />
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
            <radialGradient id={`${id}-pull-light`}>
              <stop offset="0" stopColor="#fff0f8" stopOpacity=".7" />
              <stop offset="1" stopColor="#fff0f8" stopOpacity="0" />
            </radialGradient>
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
              {body}
              <g filter={`url(#${id}-blend)`} opacity={pull.blend ?? 1}>
                {body}
                <line x1={BLOB_CENTER} y1={BLOB_CENTER} x2={pull.x} y2={pull.y}
                  stroke="black" strokeWidth={pull.radius * 2} strokeLinecap="round" />
                <circle className="mallang-pull" cx={pull.x} cy={pull.y} r={pull.radius} />
              </g>
            </mask>
          </>
        )}
      </defs>
      <g mask={pull ? `url(#${id}-shape)` : undefined}
        clipPath={pull ? undefined : `url(#${id}-resting-shape)`}>
        <g ref={dentRef}>
        <g fill={bodyFill}>{visibleShape}</g>
        {isGel && <g fill={`url(#${id}-shine)`}>{visibleShape}</g>}
        {pull && (
          <ellipse cx={pull.x - pull.radius * 0.16} cy={pull.y - pull.radius * 0.2}
            rx={pull.radius * 0.74} ry={pull.radius * 0.52} opacity={pullOpacity}
            fill={`url(#${id}-pull-light)`} />
        )}
        <foreignObject
          className="mallang-main-circle"
          style={bodyStyle}
          x={-BLOB_CENTER * 2}
          y={-BLOB_CENTER * 2}
          width={BLOB_CENTER * 6}
          height={BLOB_CENTER * 6}
        >
          <canvas ref={surfaceCanvas} className="mallang-surface" />
        </foreignObject>
        </g>
      </g>
    </svg>
  );
}

function MallangFace({ state, squish, appearance, dentFilter }) {
  const id = useId();
  const isGel = appearance === "3d";
  const isOriginal = appearance === "original";
  const blushFill = isGel ? `url(#${id}-blush)` : isOriginal ? "#d96789" : "#ed93ae";
  const blushOpacity = isOriginal ? (squish ? 0.49 : 0.32) : (squish ? 1 : 0.82);
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
      <g filter={`url(#${dentFilter})`}>
      {[62, 138].map(x => (
        <ellipse key={x} cx={x} cy="116"
          rx={isGel ? 24 : isOriginal ? 22 : 16}
          ry={isGel ? 16 : isOriginal ? 13 : 8}
          fill={blushFill} opacity={blushOpacity}
          filter={isOriginal ? `url(#${id}-blush-blur)` : undefined} />
      ))}

      {state === "squished" && (
        <>
          <path d="M 78 96 Q 86 101 94 94 M 106 94 Q 114 101 122 96"
            stroke="#6B2D40" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <ellipse cx="100" cy="117" rx="6" ry="2.7" fill="#8B4058" />
        </>
      )}
      {state === "blink" && (
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
      </g>
    </svg>
  );
}

function IdleMallangFace({ appearance, dentFilter }) {
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

  return <MallangFace state={expression} squish={false} appearance={appearance} dentFilter={dentFilter} />;
}

function endWaxHold(holdRef, contactRef) {
  const hold = holdRef.current;
  contactRef.current?.setAttribute("visibility", "hidden");
  if (!hold) return false;
  if (hold.frame !== null) cancelAnimationFrame(hold.frame);
  holdRef.current = null;
  return true;
}

function pointOnWax(button, clientX, clientY) {
  const { left, top, width, height } = button.getBoundingClientRect();
  if (!width || !height) return null;
  const x = (clientX - left) / width * BLOB_CENTER * 2;
  const y = (clientY - top) / height * BLOB_CENTER * 2;
  return Math.hypot(x - BLOB_CENTER, y - BLOB_CENTER) <= BODY_RADIUS ? { x, y } : null;
}

function paintWaxContact(contact, point, radius, depth) {
  if (!contact) return;
  if (!point) {
    contact.setAttribute("visibility", "hidden");
    return;
  }
  contact.setAttribute("transform", "translate(" + point.x + " " + point.y + ")");
  contact.setAttribute("opacity", depth.toFixed(3));
  contact.setAttribute("visibility", "visible");
  const ellipse = contact.firstElementChild;
  ellipse.setAttribute("rx", radius.toFixed(2));
  ellipse.setAttribute("ry", (radius * PRESS_FLATTENING).toFixed(2));
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
  const [volumePercent, setVolumePercent] = useState(readMallangVolume);
  const [audio] = useState(createMallangAudio);
  const [isWaxMode, setIsWaxMode] = useState(() => {
    try {
      return localStorage.getItem(WAX_MODE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [waxShell, setWaxShell] = useState(() => createWaxShell(BLOB_CENTER, BODY_RADIUS));
  const hasWaxShell = isWaxMode && waxShell.pieces.length > 0;
  const hasWaxMaterial = hasWaxShell || (isWaxMode && waxShell.chips.length > 0);
  const isBodyBusy = hasWaxMaterial && !hasWaxShell;
  const waxShellRef = useRef(waxShell);
  const waxHoldRef = useRef(null);
  const waxContactRef = useRef(null);
  const deformationRef = useRef(null);
  const faceRef = useRef(null);
  const dentId = useId();
  const volumeControlId = useId();
  const surfaceCanvas = useRef(null);
  const rimRef = useRef(null);
  const surface = useRef(null);
  const bounds = useRef(null);
  const character = useRef(null);
  const motionRef = useRef(null);
  const reactionTimer = useRef(null);

  const cancelInteraction = useCallback(() => {
    endWaxHold(waxHoldRef, waxContactRef);
    const motion = motionRef.current;
    clearTimeout(reactionTimer.current);
    if (motion?.frame != null) cancelAnimationFrame(motion.frame);
    motionRef.current = null;
    surface.current?.stop();
    setPull(null);
    setImpact(null);
    setPhase("idle");
  }, []);

  useEffect(() => {
    const dent = createButtonDent({ id: dentId, maxPull: 5, surfaceRadius: BODY_RADIUS / (BLOB_CENTER * 2),
      detailId: `${dentId}-face`, detailPull: 3.5 });
    const waveSurface = createMallangSurface(
      surfaceCanvas.current,
      BODY_RADIUS / (BLOB_CENTER * 2),
      (angle, amount, contacts = []) => {
        const rim = rimRef.current;
        const outline = contacts.length
          ? pressureRimPath(contacts, BLOB_CENTER, BODY_RADIUS, angle, amount)
          : flexedRim(angle, amount);
        if (rim && rim.getAttribute("d") !== outline) rim.setAttribute("d", outline);
      },
      (contact) => {
        const body = deformationRef.current;
        if (!body || !dent) return;
        if (!contact?.depth) {
          body.style.removeProperty("filter");
          dent.setDepth(0);
          faceRef.current?.style.removeProperty("transform");
          return;
        }
        const size = BLOB_CENTER * 2;
        const pull = motionRef.current?.pull;
        const protectedCircle = pull && {
          x: pull.x / (BLOB_CENTER * 2),
          y: pull.y / (BLOB_CENTER * 2),
          radius: (pull.radius + 2) / (BLOB_CENTER * 2),
        };
        dent.trace(contact.trail, size, size, contact.diameter * size, protectedCircle);
        body.style.filter = "url(#" + dentId + ")";
        // The face shares the surface field at a limited strength, with a small overall compression.
        const depth = contact.depth;
        const x = clamp((contact.x - 0.5) * 5 * depth, -1.8, 1.8);
        const y = clamp((contact.y - 0.5) * 5 * depth, -1.8, 1.8);
        if (faceRef.current) faceRef.current.style.transform =
          `translate(${x}px, ${y}px) scale(${1 - depth * 0.015}, ${1 - depth * 0.025})`;
      },
    );
    surface.current = waveSurface;

    function cancelInterruptedPointer(event) {
      if (waxHoldRef.current?.pointerId === event.pointerId || motionRef.current?.pointerId === event.pointerId) {
        cancelInteraction();
      }
    }

    function cancelWhenHidden() {
      if (document.visibilityState === "hidden") cancelInteraction();
    }

    window.addEventListener("blur", cancelInteraction);
    window.addEventListener("pointerup", cancelInterruptedPointer);
    window.addEventListener("pointercancel", cancelInterruptedPointer);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      window.removeEventListener("blur", cancelInteraction);
      window.removeEventListener("pointerup", cancelInterruptedPointer);
      window.removeEventListener("pointercancel", cancelInterruptedPointer);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      endWaxHold(waxHoldRef, waxContactRef);
      clearTimeout(reactionTimer.current);
      if (motionRef.current?.frame != null) cancelAnimationFrame(motionRef.current.frame);
      waveSurface?.dispose();
      dent?.dispose();
      surface.current = null;
    };
  }, [dentId, cancelInteraction]);

  useEffect(() => {
    surface.current?.setFlatStyle(appearance === "2d");
  }, [appearance]);

  useEffect(() => () => audio.close(), [audio]);

  useEffect(() => {
    audio.setVolume(volumePercent);
  }, [audio, volumePercent]);

  function changeVolume(event) {
    const percent = event.currentTarget.valueAsNumber;
    setVolumePercent(percent);
    saveMallangVolume(percent);
  }

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

  function reactAfterRefill(delay) {
    clearTimeout(reactionTimer.current);
    setPhase("refilling");
    reactionTimer.current = setTimeout(() => settle("happy", TAP_REACTION_MS), Math.max(0, delay));
  }

  function pointOnCharacter(clientX, clientY) {
    const { left, top, width, height } = character.current.getBoundingClientRect();
    if (!width || !height) return null;
    return { x: (clientX - left) / width, y: (clientY - top) / height };
  }

  function tapAt(clientX, clientY, pointerTarget) {
    if (isBodyBusy || hasWaxShell) return;
    const point = pointOnCharacter(clientX, clientY);
    if (!point) return;
    const strength = surface.current?.addDrop(point.x, point.y);
    const keyboardTap = !pointerTarget;
    if (keyboardTap) audio.play("press");
    audio.play("refill", strength, keyboardTap ? 0.065 : 0);
    reactAfterRefill(pressRecoveryDuration(strength ?? 0));
  }

  function beginWaxHold(point, input) {
    if (!point || waxHoldRef.current || motionRef.current?.pointerId != null) return false;
    if (motionRef.current?.frame != null) cancelAnimationFrame(motionRef.current.frame);
    motionRef.current = null;
    clearTimeout(reactionTimer.current);
    surface.current?.stop();
    setPull(null);
    setImpact(null);
    setPhase("pressingWax");
    audio.prepareWax();

    const hold = { ...input, point, startedAt: performance.now(), lastFracturePoint: null, pieceLimit: waxShellRef.current.nextPieceId, frame: null };
    waxHoldRef.current = hold;
    scheduleWaxHold(hold);
    return true;
  }

  function scheduleWaxHold(hold) {
    if (hold.frame === null) {
      hold.frame = requestAnimationFrame((timestamp) => advanceWaxHold(hold, timestamp));
    }
  }

  function advanceWaxHold(hold, timestamp, finishing = false) {
    if (waxHoldRef.current !== hold) return;
    hold.frame = null;
    const elapsed = Math.max(0, timestamp - hold.startedAt);
    const depth = pressDepth(elapsed);
    const radius = BODY_RADIUS * pressRadiusRatio(depth);
    const { point } = hold;
    paintWaxContact(waxContactRef.current, point, radius, depth);

    const ready = elapsed >= (finishing ? MIN_WAX_HOLD_MS : FULL_PRESS_MS);
    if (ready && point) {
      const previous = hold.lastFracturePoint;
      const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
      const steps = previous ? Math.floor(distance / WAX_DRAG_STEP) : 1;
      const includeEnd = finishing && distance > 2 && steps === 0;
      let shell = waxShellRef.current;
      let sound = null;
      for (let step = 1; step <= steps + (includeEnd ? 1 : 0); step++) {
        const progress = previous && !includeEnd ? Math.min(1, step * WAX_DRAG_STEP / distance) : 1;
        const sample = previous ? {
          x: previous.x + (point.x - previous.x) * progress,
          y: previous.y + (point.y - previous.y) * progress,
        } : point;
        hold.lastFracturePoint = sample;
        const fracture = fractureWaxShell(shell, sample, radius, hold.pieceLimit);
        if (!fracture) continue;
        shell = fracture.shell;
        if (!sound || fracture.strength > sound.strength) sound = fracture;
      }
      if (sound) {
        updateWaxShell(shell);
        audio.play(sound.sound, sound.strength);
        if (!shell.pieces.length) {
          finishWaxHold();
          return;
        }
      }
    }
    if (!finishing && elapsed < FULL_PRESS_MS) scheduleWaxHold(hold);
  }

  function finishWaxHold() {
    if (endWaxHold(waxHoldRef, waxContactRef)) settle("idle");
  }

  function startWaxKey(event) {
    if (!hasWaxShell || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    if (!event.repeat) beginWaxHold(waxKeyboardPoint(waxShellRef.current), { key: event.key });
  }

  function sampleFinalWaxPressure(hold) {
    if (hold.frame !== null) cancelAnimationFrame(hold.frame);
    advanceWaxHold(hold, performance.now(), true);
    finishWaxHold();
  }

  function releaseWaxKey(event) {
    const hold = waxHoldRef.current;
    if (hold?.key !== event.key) return;
    event.preventDefault();
    sampleFinalWaxPressure(hold);
  }

  function updateWaxShell(shell) {
    waxShellRef.current = shell;
    setWaxShell(shell);
  }

  function resetWaxShell() {
    cancelInteraction();
    updateWaxShell(createWaxShell(BLOB_CENTER, BODY_RADIUS));
  }

  function removeWaxChip(id) {
    const shell = waxShellRef.current;
    const chips = shell.chips.filter((chip) => chip.id !== id);
    if (chips.length === shell.chips.length) return;
    updateWaxShell({ ...shell, chips });

  }

  function toggleWaxMode() {
    const enabled = !isWaxMode;
    setIsWaxMode(enabled);
    if (enabled) audio.prepareWax();
    resetWaxShell();
    try {
      localStorage.setItem(WAX_MODE_KEY, String(enabled));
    } catch {
      // The switch still works for the current visit if browser storage is unavailable.
    }
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
      pressedAt: performance.now(),
      pointerId: null,
      frame: null,
      vx: previous?.vx ?? 0,
      vy: previous?.vy ?? 0,
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
    const { tetherMoving } = advanceMotion(motion, timestamp);
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
      followTether(motion);
      motion.pull = pulledCircle(motion);
      // Pressure follows the actual pointer, even while the visible tip is blending out of the rim.
      const target = pullTarget(motion);
      surface.current?.moveIndentation(target.x / (BLOB_CENTER * 2), target.y / (BLOB_CENTER * 2));
    } else if (motion.retraction) {
      motion.pull = retractCircle(motion.retraction, timestamp);
      if (!motion.pull) motion.retraction = null;
    }
    if (motion.impact && timestamp - motion.impact.time >= IMPACT_MS) motion.impact = null;
    if (motion.impact && motion.impact.time - (motion.lastImpactSound ?? -Infinity) >= IMPACT_SOUND_GAP_MS) {
      motion.lastImpactSound = motion.impact.time;
      audio.play("wall", Math.min(1, Math.hypot(motion.impact.x, motion.impact.y)));
    }
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
      reactAfterRefill((motion.refillUntil ?? 0) - performance.now());
    }
  }

  function press(event) {
    if (isBodyBusy || !event.isPrimary || event.button !== 0 || motionRef.current?.pointerId != null) return;
    if (hasWaxShell) {
      const point = pointOnWax(event.currentTarget, event.clientX, event.clientY);
      if (beginWaxHold(point, { pointerId: event.pointerId })) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }

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
    audio.play(catching ? "stretch" : "press");
    const point = pointOnCharacter(event.clientX, event.clientY);
    if (point) surface.current?.setIndentation(point.x, point.y);
    // Track the real tether from pointer down, including the first grab after release.
    beginPull(motion);
    setPull(motion.pull);
    schedule(motion, event.timeStamp);
  }

  function movePointer(event) {
    const hold = waxHoldRef.current;
    if (hold?.pointerId === event.pointerId) {
      hold.point = pointOnWax(event.currentTarget, event.clientX, event.clientY);
      if (!hold.point) hold.lastFracturePoint = null;
      scheduleWaxHold(hold);
      return;
    }

    const motion = motionRef.current;
    if (!motion || event.pointerId !== motion.pointerId) return;

    const previous = motion.pointer;
    if (event.clientX === previous.x && event.clientY === previous.y) return;
    motion.pointer = { x: event.clientX, y: event.clientY };
    const point = pointOnCharacter(event.clientX, event.clientY);
    if (!motion.hasMoved && point) surface.current?.moveIndentation(point.x, point.y);
    const distance = Math.hypot(event.clientX - motion.startX, event.clientY - motion.startY);
    const dragDistance = Math.max(MIN_DRAG_DISTANCE, motion.bodySize * DRAG_SIZE_RATIO);
    if (distance >= dragDistance) motion.target = null;
    readGeometry(motion);
    followTether(motion);
    const spring = springDisplacement(motion,
      motion.position.x / 100 * motion.rect.width, motion.position.y / 100 * motion.rect.height);
    if (!motion.hasMoved && Math.hypot(spring.x, spring.y) > 0.3) {
      motion.hasMoved = true;
      audio.play("stretch");
      setPhase("dragging");
    }
    schedule(motion, event.timeStamp);
  }

  function release(event) {
    const hold = waxHoldRef.current;
    if (hold?.pointerId === event.pointerId) {
      if (event.type === "pointerup") sampleFinalWaxPressure(hold);
      else finishWaxHold();
      return;
    }

    const motion = motionRef.current;
    if (!motion || event.pointerId !== motion.pointerId) return;
    const released = event.type === "pointerup";
    if (released && motion.hasMoved) {
      // Integrate the held force through release before coasting with that velocity.
      if (motion.frame !== null && !motion.reducedMotion) {
        advanceMotion(motion, event.timeStamp);
        motion.pull = pulledCircle(motion);
      }
      const pull = motion.pull;
      if (pull) {
        const stretch = clamp(Math.hypot(pull.x - BLOB_CENTER, pull.y - BLOB_CENTER) / MAX_TETHER_DISTANCE, 0, 1);
        audio.play("retract", stretch);
        if (!motion.reducedMotion) {
          motion.retraction = {
            start: event.timeStamp,
            duration: MIN_RETRACT_MS + (MAX_RETRACT_MS - MIN_RETRACT_MS) * stretch,
            from: pull,
          };
        }
      }
    }
    if (released && motion.hasMoved && !motion.reducedMotion) {
      surface.current?.clearIndentation();
      motion.refillUntil = performance.now() + pressRecoveryDuration(pressDepth(performance.now() - motion.pressedAt));
      motion.pointerId = null;
      if (!motion.retraction) motion.pull = null;
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
      tapAt(event.clientX, event.clientY, event.currentTarget);
    } else {
      surface.current?.clearIndentation();
      settle("idle");
    }
  }

  const squished = phase === "pressingWax" || !!impact;
  const dragging = phase === "dragging";
  const breathing = phase === "idle" && !isWaxMode;
  const eyeState = squished ? "squished" : phase === "happy" ? "happy" :
    phase === "releasing" ? "moving" : "normal";
  const impactX = Math.abs(impact?.x ?? 0);
  const impactY = Math.abs(impact?.y ?? 0);
  let bodyStyle;
  if (impact) {
    bodyStyle = {
      transform: `scale(${1 - 0.32 * impactX + 0.12 * impactY}, ${1 - 0.32 * impactY + 0.12 * impactX})`,
      transformOrigin: `${impact.x < 0 ? "left" : impact.x > 0 ? "right" : "center"} ${impact.y < 0 ? "top" : impact.y > 0 ? "bottom" : "center"}`,
      transitionDuration: "0ms",
    };
  }

  return (
    <div className={`mallang-page mallang-page--${appearance}`}>
      <AppBar />
      <main className="mallang-content">
        <h1>사이버 말랑이</h1>
        <p id="mallang-help" aria-live="polite">{isWaxMode
          ? (hasWaxShell ? "왁스를 길게 눌러 보세요. 같은 조각을 다시 누르면 더 잘게 갈라져요."
            : isBodyBusy ? "마지막 왁스 조각이 부스러지고 있어요."
              : "껍질 안에 있던 말랑이가 나왔어요.")
          : "말랑이를 길게 눌러 보세요. 잡아당겼다가 놓을 수도 있어요."}</p>
        <div className="mallang-controls">
          <button type="button" role="switch" aria-checked={isWaxMode} className="mallang-wax-toggle" onClick={toggleWaxMode}>
            왁뿌볼
            <span className="mallang-wax-track" aria-hidden="true" />
          </button>
          {isWaxMode && (
            <button type="button" className="mallang-wax-reset"
              disabled={waxShell.fractures === 0} onClick={resetWaxShell}>
              껍질 복원
            </button>
          )}
          <div className="mallang-range-control">
            <label htmlFor={volumeControlId}>효과음</label>
            <input
              id={volumeControlId}
              type="range"
              min="0"
              max="100"
              step="1"
              value={volumePercent}
              aria-valuetext={volumePercent === 0 ? "음소거" : `${volumePercent}%`}
              onChange={changeVolume}
            />
            <output htmlFor={volumeControlId}>{volumePercent}%</output>
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
              className={`mallang-character${dragging ? " mallang-character--dragging" : ""}${breathing ? " mallang-idle" : ""}`}
              style={{ left: `${position.x}%`, top: `${position.y}%` }}
            >
              <span className="mallang-ground-shadow" aria-hidden="true" />
              <div className="mallang-deformation">
                <MallangSilhouette pull={hasWaxMaterial ? null : pull} bodyStyle={bodyStyle}
                  surfaceCanvas={surfaceCanvas} rimRef={rimRef} dentRef={deformationRef} appearance={appearance} />
                <button
                  type="button"
                  draggable={false}
                  className={`mallang-body${dragging ? " mallang-dragging" : ""}`}
                  aria-label={hasWaxMaterial ? "왁스 껍질 길게 누르기" : "말랑이 누르기"}
                  aria-disabled={isBodyBusy || undefined}
                  aria-describedby="mallang-help"
                  onPointerDown={press}
                  onPointerMove={movePointer}
                  onPointerUp={release}
                  onPointerCancel={release}
                  onLostPointerCapture={release}
                  onKeyDown={startWaxKey}
                  onKeyUp={releaseWaxKey}
                  onBlur={cancelInteraction}
                  onClick={(event) => {
                    if (event.detail !== 0 || motionRef.current !== null) return;
                    const { left, top, width, height } = character.current.getBoundingClientRect();
                    tapAt(left + width / 2, top + height / 2);
                  }}
                  style={bodyStyle}
                >
                  <span ref={faceRef} className="mallang-face">
                  {phase === "idle" && !squished
                    ? <IdleMallangFace appearance={appearance} dentFilter={`${dentId}-face`} />
                    : <MallangFace state={eyeState} squish={squished} appearance={appearance} dentFilter={`${dentId}-face`} />}
                  </span>
                </button>
                {isWaxMode && <WaxShell shell={waxShell} center={BLOB_CENTER} radius={BODY_RADIUS}
                  contactRef={waxContactRef} onChipEnd={removeWaxChip} />}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
