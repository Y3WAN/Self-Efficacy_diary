import { useState, useEffect, useId, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import AppBar from "../components/AppBar";
import WaxShell from "../components/WaxShell";
import { bareSurfaceContact, createMallangMaterial, materialContact, membraneRadii, membraneRadiusAt } from "../utils/mallangMaterial";
import { createMallangSurface } from "../utils/mallangSurface";
import { createWaxShell, fractureWaxShell, waxKeyboardPoint } from "../utils/waxShell";
import { pressRadiusRatio } from "../utils/surfacePress";
import { BLOB_CENTER, BODY_RADIUS, PULL_RADIUS, STOP_SPEED, advanceMotion, beginPull, positionFromPoint,
  pullTarget, springDisplacement, updatePull } from "../utils/mallangMotion";
import { createMallangAudio, readMallangVolume, saveMallangVolume } from "../utils/mallangAudio";

const WAX_MODE_KEY = "codemyworld.mallang.wax";
const RETURNING_TIP_HIT_PADDING = 6;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function readWaxMode() {
  try { return localStorage.getItem(WAX_MODE_KEY) === "true"; } catch { return false; }
}

function MallangFace() {
  return <svg aria-hidden="true" viewBox="0 0 200 200">
    <ellipse cx="63" cy="115" rx="19" ry="10" fill="#db789b" opacity=".3" />
    <ellipse cx="137" cy="115" rx="19" ry="10" fill="#db789b" opacity=".3" />
    <circle cx="86" cy="94" r="6.2" fill="#492032" />
    <circle cx="114" cy="94" r="6.2" fill="#492032" />
    <circle cx="84" cy="92" r="1.8" fill="#fff6fb" />
    <circle cx="112" cy="92" r="1.8" fill="#fff6fb" />
    <path d="M90 113 Q89 122 96 121 Q100 121 100 115 Q100 122 105 121 Q112 122 110 113"
      stroke="#91465f" strokeWidth="2.5" fill="none" strokeLinecap="round" />
  </svg>;
}

export default function MallangPage() {
  const [params, setParams] = useSearchParams();
  const appearance = import.meta.env.DEV && params.get("style") === "2d" ? "2d" : "original";
  const runtime = useRef(null);
  const [audio] = useState(createMallangAudio);
  const [isWaxMode, setIsWaxMode] = useState(readWaxMode);
  const [waxShell, setWaxShell] = useState(() => createWaxShell(BLOB_CENTER, BODY_RADIUS));
  const initial = useRef({ shell: waxShell, mode: isWaxMode });
  const [volume, setVolume] = useState(readMallangVolume);
  const canvas = useRef(null), overlay = useRef(null), character = useRef(null), bounds = useRef(null);
  const face = useRef(null), shellElement = useRef(null), control = useRef(null), controller = useRef(null);
  const inspect = useRef(null);
  const volumeId = useId();

  useEffect(() => {
    const r = { material: createMallangMaterial(), audio, shell: initial.current.shell,
      mode: initial.current.mode, frame: null, motion: null, input: null, pressFollowsTether: false, records: [], costs: [], frames: 0 };
    runtime.current = r;
    const material = r.material;
    const surface = createMallangSurface(canvas.current, material, overlay.current);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => media.matches;
    let disposed = false;
    r.material.state.reducedMotion = reduced();
    material.reset(performance.now());
    material.setShell(r.mode ? r.shell : null);
    r.surface = surface;

    function updateShell(shell, topology = true) {
      r.shell = shell;
      if (topology) material.setShell(r.mode ? shell : null);
      setWaxShell(shell);
    }
    function request() {
      if (!disposed && r.frame === null) r.frame = requestAnimationFrame(frame);
    }
    function point(clientX, clientY) {
      const rect = character.current.getBoundingClientRect();
      return { x: (clientX - rect.left) / rect.width * 200, y: (clientY - rect.top) / rect.height * 200 };
    }
    function contactPoint(raw) {
      return materialContact(material, raw, r.impactPaint);
    }
    function geometry(motion) {
      motion.rect = bounds.current.getBoundingClientRect();
      motion.bodySize = character.current.getBoundingClientRect().width;
    }
    function hit(raw) {
      const pull = r.motion?.pull;
      const radii = membraneRadii(material, pull, r.impactPaint);
      const dx = raw.x - BLOB_CENTER, dy = raw.y - BLOB_CENTER;
      const angle = Math.atan2(dy, dx);
      // A returning tip moves between the displayed frame and the incoming press.
      const nearReturningTip = pull && r.motion.mode === "coast" &&
        Math.hypot(raw.x - pull.x, raw.y - pull.y) <= RETURNING_TIP_HIT_PADDING;
      return nearReturningTip || Math.hypot(dx, dy) <= membraneRadiusAt(radii, angle);
    }
    function paint() {
      if (disposed || !face.current || !character.current) return;
      const motion = r.motion;
      const reliefTip = r.pressFollowsTether ? motion?.pull : null;
      const unitsPerPercent = motion ? 2 / motion.bodySize : 0;
      const bodyOffset = motion && {
        x: motion.position.x * motion.rect.width * unitsPerPercent,
        y: motion.position.y * motion.rect.height * unitsPerPercent,
      };
      surface?.draw(motion?.pull, r.impactPaint, reliefTip, bodyOffset);
      if (r.motion) {
        character.current.style.left = r.motion.position.x + "%";
        character.current.style.top = r.motion.position.y + "%";
      }
      const hx = (material.sample(106, 100) - material.sample(94, 100)) / 12;
      const hy = (material.sample(100, 106) - material.sample(100, 94)) / 12;
      const h = material.sample(100, 100);
      face.current.style.transform = "translate(" + clamp(-hx * 1.3, -1.5, 1.5) + "px," +
        clamp(h * 0.11 - hy, -2, 2) + "px) scale(" + (1 + clamp(hx * 0.018, -.025, .025)) +
        "," + (1 + clamp(h * 0.0015, -.025, .025)) + ")";
      for (const node of shellElement.current?.querySelectorAll("[data-piece-id]") ?? []) {
        const piece = r.shell.pieces.find((p) => String(p.id) === node.dataset.pieceId);
        if (!piece?.depth) continue;
        const z = material.sample(piece.center.x, piece.center.y);
        node.setAttribute("transform", "translate(0 " + (z * .16).toFixed(3) + ")");
      }
    }
    r.paint = paint;
    function record(cost) {
      if (!import.meta.env.DEV) return;
      r.frames++; r.costs.push(cost); if (r.costs.length > 240) r.costs.shift();
      const state = material.state;
      const rim = membraneRadii(material), rimMax = Math.max(...rim);
      const dent = state.contact ?? state.nodes.at(-1);
      const bearing = dent && Math.atan2(dent.y - BLOB_CENTER, dent.x - BLOB_CENTER);
      r.records.push({ time: state.time, contact: state.contact && { x: state.contact.x, y: state.contact.y },
        depth: material.contactDepth(), center: material.sample(100, 100), energy: state.energy,
        pressure: state.contact?.pressure ?? 0,
        contactHeight: state.contact ? material.sample(state.contact.x, state.contact.y) : 0,
        dentHeight: dent ? material.sample(dent.x, dent.y) : 0,
        rimMin: Math.min(...rim), rimMax,
        rimPeakAngle: rimMax > BODY_RADIUS ? rim.indexOf(rimMax) / rim.length * 360 : null,
        rimAtContact: dent ? membraneRadiusAt(rim, bearing) : BODY_RADIUS,
        rimOpposite: dent ? membraneRadiusAt(rim, bearing + Math.PI) : BODY_RADIUS,
        displaced: state.displaced, raised: state.raised, signedHeight: state.signedHeight,
        trail: state.nodes.length, waves: state.waves.length, pieces: r.mode ? r.shell.pieces.length : 0,
        chips: r.shell.chips.length, tip: r.motion?.pull ?? null, relief: material.rimLoad(),
        motionMode: r.motion?.mode ?? null,
        x: r.motion?.position.x, y: r.motion?.position.y, vx: r.motion?.vx ?? 0, vy: r.motion?.vy ?? 0 });
      if (r.records.length > 300) r.records.shift();
      if (inspect.current) inspect.current.textContent = JSON.stringify({
        active: material.state.active || !!moving(), frames: r.frames,
        costs: r.costs, records: r.records, mode: r.mode, seed: r.shell.seed,
      });
    }
    function fracture(now) {
      const input = r.input;
      if (!input?.wax || !r.shell.pieces.length || !material.state.contact) return;
      const contact = material.state.contact, depth = material.contactDepth();
      // The press and release paths use precisely the same stress test.
      const indentation = Math.max(0, -material.sample(contact.x, contact.y)) / 15;
      const stress = depth * .8 + indentation * .4;
      if (stress < .59) return;
      const radius = BODY_RADIUS * pressRadiusRatio(depth);
      const previous = input.fracturedAt;
      if (previous && Math.hypot(previous.x - contact.x, previous.y - contact.y) < 15 &&
        radius - previous.radius < 9) return;
      input.fracturedAt = { x: contact.x, y: contact.y, radius };
      const broken = fractureWaxShell(r.shell, contact, radius, input.pieceLimit);
      if (!broken) return;
      const chips = broken.shell.chips.map((chip) => chip.expiresAt ? chip : { ...chip, expiresAt: now + chip.fadeMs });
      updateShell({ ...broken.shell, chips });
      // Lost support releases the same local liquid field under the remaining shards.
      material.impulse(contact.x, contact.y, broken.strength * .2, now);
      audio.play(broken.sound, broken.strength);
    }
    function advance(now) {
      material.state.reducedMotion = reduced();
      const motion = r.motion;
      const grabbing = motion?.mode === "grab";
      if (motion) {
        motion.tetherMoving = advanceMotion(motion, now);
        if (grabbing) {
          const contact = bareSurfaceContact(pullTarget(motion));
          material.move(contact.x, contact.y, now);
        }
      }
      material.advance(now);
      if (motion) {
        if (grabbing || motion.pull) updatePull(motion, contactPoint(pullTarget(motion)).radius);
        if (grabbing) {
          character.current.classList.toggle("mallang-character--dragging", !!motion.pull);
          if (motion.pull?.radius > 3 && !r.input?.stretched) {
            if (r.input) r.input.stretched = true;
            audio.play("stretch", Math.min(1, motion.pull.radius / PULL_RADIUS));
          }
        }
        if (motion.impact && motion.impact.time !== r.lastImpact) {
          r.lastImpact = motion.impact.time;
          const strength = Math.hypot(motion.impact.x, motion.impact.y);
          r.impact = { ...motion.impact };
          const p = { x: 100 + Math.sign(motion.impact.x) * 88, y: 100 + Math.sign(motion.impact.y) * 88 };
          material.impulse(p.x, p.y, strength * .65, now);
          audio.play("wall", Math.min(1, strength));
        }
      }
      if (r.impact) {
        const left = Math.max(0, 1 - (now - r.impact.time) / 210);
        r.impactPaint = { x: r.impact.x * left * left, y: r.impact.y * left * left };
        if (!left) { r.impact = null; r.impactPaint = null; }
      }
      if (r.input && !r.input.wax && !r.input.sounded && material.contactDepth() >= .12) {
        r.input.sounded = true; audio.play("press", material.contactDepth());
      }
      fracture(now);
      if (r.shell.chips.some((chip) => chip.expiresAt <= now)) {
        updateShell({ ...r.shell, chips: r.shell.chips.filter((chip) => chip.expiresAt > now) }, false);
      }
    }
    function moving() {
      const motion = r.motion;
      if (!motion) return false;
      const speed = Math.hypot(motion.vx, motion.vy);
      if (motion.mode === "coast" && speed <= STOP_SPEED) motion.vx = motion.vy = 0;
      if (speed > STOP_SPEED || motion.tetherMoving || (motion.mode === "coast" && motion.pull)) return true;
      if (motion.mode !== "grab" || !motion.pull) return false;
      const spring = springDisplacement(motion, motion.position.x * motion.rect.width / 100,
        motion.position.y * motion.rect.height / 100);
      return Math.hypot(spring.x, spring.y) > .3;
    }
    function frame(now) {
      r.frame = null;
      const started = performance.now();
      advance(now);
      paint();
      record(performance.now() - started);
      if (moving() || material.state.active || surface?.trailActive || r.impact || r.shell.chips.length) request();
    }
    function cancel(reason) {
      const captured = r.input?.id;
      if (r.frame !== null) cancelAnimationFrame(r.frame);
      r.frame = null; r.input = null; r.motion = null; r.impact = null; r.impactPaint = null;
      r.pressFollowsTether = false;
      r.cancelReason = reason?.type ?? "reset";
      if (captured !== undefined && control.current?.hasPointerCapture(captured)) control.current.releasePointerCapture(captured);
      material.reset(performance.now());
      surface?.resetTrail();
      audio.stop();
      if (!disposed && r.shell.chips.length) updateShell({ ...r.shell, chips: [] }, false);
      character.current?.classList.remove("mallang-character--dragging");
      paint();
      if (!disposed) record(0);
    }
    function down(event) {
      if (r.input || event.button !== 0 || !event.isPrimary) return;
      if (r.mode && !r.shell.pieces.length && r.shell.chips.length) return;
      const raw = point(event.clientX, event.clientY);
      if (!hit(raw)) return;
      const now = performance.now();
      const previousMotion = r.motion;
      const wasReturning = !!previousMotion?.pull;
      audio.prepare();
      const wax = r.mode && r.shell.pieces.length > 0;
      const local = wax ? contactPoint(raw) : bareSurfaceContact(wasReturning ? pullTarget(previousMotion) : raw);
      r.pressFollowsTether = !wax;
      r.input = { id: event.pointerId, wax, pieceLimit: r.shell.nextPieceId, fracturedAt: null };
      if (!control.current.contains(event.target)) event.preventDefault();
      control.current.setPointerCapture(event.pointerId);
      material.touch(local.x, local.y, now);
      if (wax) { audio.prepareWax(); r.motion = null; }
      else {
        const body = character.current.getBoundingClientRect();
        const motion = { mode: "grab", vx: previousMotion?.vx ?? 0, vy: previousMotion?.vy ?? 0,
          position: previousMotion?.position, pointer: { x: event.clientX, y: event.clientY },
          lastFrame: now, pull: previousMotion?.pull ?? null, pullStartRadius: contactPoint(raw).radius,
          tetherPoint: wasReturning ? previousMotion.tetherPoint : null,
          tetherSpeed: wasReturning ? previousMotion.tetherSpeed : null };
        geometry(motion);
        motion.position ??= positionFromPoint(body.left + body.width / 2, body.top + body.height / 2, motion.rect);
        if (!wasReturning) beginPull(motion, motion.pullStartRadius);
        r.motion = motion;
      }
      request();
    }
    function move(event) {
      if (r.input?.id !== event.pointerId) return;
      const now = performance.now();
      if (r.motion?.mode === "grab") {
        r.motion.pointer = { x: event.clientX, y: event.clientY };
      } else {
        const raw = point(event.clientX, event.clientY);
        if (Math.hypot(raw.x - BLOB_CENTER, raw.y - BLOB_CENTER) > 96) {
          material.release(now, false);
        } else {
          const local = contactPoint(raw);
          if (material.state.contact) material.move(local.x, local.y, now);
          else material.touch(local.x, local.y, now);
        }
      }
      request();
    }
    function end(event) {
      if (!r.input || (event.pointerId !== undefined ? r.input.id !== event.pointerId : r.input.key !== event.key)) return;
      if (event.type === "pointercancel" || event.type === "lostpointercapture") { cancel(); return; }
      audio.prepare();
      const now = performance.now();
      const motion = r.motion;
      if (motion?.mode !== "grab") advance(now);
      const strength = material.release(now, !reduced());
      if (!r.input.wax) audio.play("refill", strength);
      r.input = null;
      if (motion?.mode === "grab") {
        if (motion.pull) audio.play("retract", motion.pull.radius / PULL_RADIUS);
        // Start recovery from the last painted pose and keep both velocities.
        motion.mode = "coast";
        motion.lastFrame = now;
        motion.tetherMoving = false;
      }
      character.current.classList.remove("mallang-character--dragging");
      request();
    }
    function keyDown(event) {
      if (event.key !== " " && event.key !== "Enter") return;
      event.preventDefault();
      if (event.repeat || r.input || (r.mode && !r.shell.pieces.length && r.shell.chips.length)) return;
      const wax = r.mode && r.shell.pieces.length > 0;
      const local = wax ? waxKeyboardPoint(r.shell) : { x: 100, y: 100 };
      r.pressFollowsTether = false;
      r.input = { key: event.key, wax, pieceLimit: r.shell.nextPieceId };
      audio.prepare();
      material.touch(local.x, local.y, performance.now());
      if (wax) audio.prepareWax();
      request();
    }
    function hidden() { if (document.visibilityState === "hidden") cancel(); }
    function preference() {
      material.state.reducedMotion = reduced();
      if (reduced()) material.state.waves.length = 0;
      request();
    }
    const resize = new ResizeObserver(() => { if (r.input || moving()) cancel(); else paint(); });
    resize.observe(bounds.current);
    controller.current = { down, move, end, keyDown, cancel,
      mode(enabled) { cancel(); r.mode = enabled; material.setShell(enabled ? r.shell : null); request(); },
      reset() { cancel(); updateShell(createWaxShell(100, 94)); request(); },
      chip(id) { if (r.shell.chips.some((c) => c.id === id)) {
        updateShell({ ...r.shell, chips: r.shell.chips.filter((c) => c.id !== id) }, false); request();
      } } };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    media.addEventListener("change", preference);
    if (import.meta.env.DEV) window.__mallangInspect = () => ({
      active: r.frame !== null, records: r.records.slice(), costs: r.costs.slice(), frames: r.frames,
      mode: r.mode, seed: r.shell.seed, shellPieces: r.shell.pieces.length,
      waxTarget: waxKeyboardPoint(r.shell),
      contact: material.state.contact, reducedMotion: material.state.reducedMotion });
    paint();
    return () => {
      disposed = true; cancel(); resize.disconnect(); surface?.dispose(); audio.close();
      window.removeEventListener("blur", cancel); document.removeEventListener("visibilitychange", hidden);
      media.removeEventListener("change", preference);
      if (import.meta.env.DEV) delete window.__mallangInspect;
      controller.current = null;
    };
  }, [audio]);

  useEffect(() => { audio.setVolume(volume); }, [audio, volume]);
  useEffect(() => { runtime.current?.surface?.setFlatStyle(appearance === "2d"); runtime.current?.paint(); }, [appearance]);

  function toggle() {
    const enabled = !isWaxMode;
    if (enabled) audio.prepareWax();
    controller.current.mode(enabled); setIsWaxMode(enabled);
    try { localStorage.setItem(WAX_MODE_KEY, String(enabled)); } catch { /* Current visit remains usable. */ }
  }
  const busy = isWaxMode && !waxShell.pieces.length && waxShell.chips.length > 0;
  return <div className={`mallang-page mallang-page--${appearance}`}>
    <AppBar />
    <main className="mallang-content">
      {import.meta.env.DEV && params.has("inspect") && <output ref={inspect} id="mallang-inspect" hidden />}
      <h1>사이버 말랑이</h1>
      <p id="mallang-help" aria-live="polite">{isWaxMode
        ? waxShell.pieces.length ? "왁스를 길게 누르고 문질러 보세요. 다시 누르면 더 잘게 갈라져요."
          : busy ? "마지막 왁스 조각이 부스러지고 있어요." : "껍질 안의 말랑이가 나왔어요. 자유롭게 만져 보세요."
        : "길게 누르고 문질러 보세요. 가장자리에서 바깥으로 잡아당길 수도 있어요."}</p>
      <div className="mallang-controls">
        <button type="button" role="switch" aria-checked={isWaxMode} className="mallang-wax-toggle" onClick={toggle}>
          왁뿌볼<span className="mallang-wax-track" aria-hidden="true" />
        </button>
        {isWaxMode && <button type="button" className="mallang-wax-reset" disabled={!waxShell.fractures}
          onClick={() => controller.current.reset()}>껍질 복원</button>}
        <div className="mallang-range-control">
          <label htmlFor={volumeId}>효과음</label>
          <input id={volumeId} type="range" min="0" max="100" step="1" value={volume}
            aria-valuetext={volume === 0 ? "음소거" : volume + "%"}
            onChange={(event) => { const value = event.currentTarget.valueAsNumber; setVolume(value); saveMallangVolume(value); }} />
          <output htmlFor={volumeId}>{volume}%</output>
        </div>
        {import.meta.env.DEV && params.has("style") && <div className="mallang-style-preview">
          {["original", "2d"].map((style) => <button key={style} type="button" aria-pressed={appearance === style}
            onClick={() => { const next = new URLSearchParams(params); next.set("style", style); setParams(next, { replace: true }); }}>
            {style === "2d" ? "2D" : "기본"}</button>)}
        </div>}
      </div>
      <section className="mallang-room" aria-label="말랑이 놀이터" onPointerDown={(e) => controller.current.down(e)}>
        <div ref={bounds} className="mallang-bounds">
          <div ref={character} className="mallang-character" style={{ left: "50%", top: "50%" }}>
            {isWaxMode && waxShell.pieces.length > 0 && <span className="mallang-ground-shadow" aria-hidden="true" />}
            <div className="mallang-deformation">
              <canvas ref={canvas} className="mallang-material-canvas" aria-hidden="true" />
              <button ref={control} type="button" draggable={false} className="mallang-body"
                aria-label={isWaxMode && waxShell.pieces.length ? "왁스 껍질 길게 누르기" : "말랑이 누르기"}
                aria-disabled={busy || undefined} aria-describedby="mallang-help"
                onPointerMove={(e) => controller.current.move(e)}
                onPointerUp={(e) => controller.current.end(e)} onPointerCancel={(e) => controller.current.end(e)}
                onLostPointerCapture={(e) => controller.current.end(e)}
                onKeyDown={(e) => controller.current.keyDown(e)} onKeyUp={(e) => controller.current.end(e)}
                onClick={() => audio.prepare()}
                onBlur={() => controller.current.cancel({ type: "control-blur" })}>
                <span ref={face} className="mallang-face"><MallangFace /></span>
              </button>
              {isWaxMode && <WaxShell shell={waxShell} center={100} radius={94}
                shellRef={shellElement} onChipEnd={(id) => controller.current?.chip(id)} />}
              <canvas ref={overlay} className="mallang-material-canvas mallang-material-light" aria-hidden="true" />
            </div>
          </div>
        </div>
      </section>
    </main>
  </div>;
}
