import { useState, useEffect, useId, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import AppBar from "../components/AppBar";
import WaxShell from "../components/WaxShell";
import Icon from "../components/Icon";
import MallangFace from "../components/MallangFace";
import MallangCustomizer from "../components/MallangCustomizer";
import { applySavedMallangTheme, readMallangCustomization, saveMallangCustomization } from "../utils/mallangCustomization";
import { bareSurfaceContact, createMallangMaterial, materialContact, membraneRadii, membraneRadiusAt } from "../utils/mallangMaterial";
import { createMallangSurface } from "../utils/mallangSurface";
import { getMallangPalette } from "../utils/mallangTheme";
import { createWaxShell, fractureWaxShell, markWaxShell, waxKeyboardPoint } from "../utils/waxShell";
import { BLOB_CENTER, BODY_RADIUS, PULL_RADIUS, STOP_SPEED, advanceMotion, beginPull, dragRotationDelta, positionFromPoint,
  pullTarget, springDisplacement, updatePull } from "../utils/mallangMotion";
import { createMallangAudio } from "../utils/mallangAudio";

const WAX_MODE_KEY = "codemyworld.mallang.wax";
const RETURNING_TIP_HIT_PADDING = 6;
const GRAB_REST_SPEED = 0.001;
const GRAB_REST_DISPLACEMENT = 0.04;
const POINTER_SPEED_WINDOW_MS = 40;
const POINTER_SPEED_SMOOTHING_MS = 24;
const POINTER_SPEED_DECAY_MS = 60;
const FACE_SAMPLE_DISTANCE = 6;
const FACE_SLOPE_PULL = 3.8;
const FACE_DEPTH_OFFSET = 0.22;
const WAX_MARK_LEAD_MS = 70;
const WAX_BREAK_HOLD_MS = 720;
const WAX_SHED_HOLD_MS = 540;
const WAX_OPENING_MS = 345;
const WAX_FALL_MS = 590;
const WAX_CRUMB_FALL_MS = 320;
const WAX_RUB_DISTANCE = 28;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function pointerSpeedAt(motion, now) {
  return motion ? motion.pointerSpeed *
    Math.exp(-Math.max(0, now - motion.pointerMovedAt) / POINTER_SPEED_DECAY_MS) : 0;
}

function readWaxMode() {
  try { return localStorage.getItem(WAX_MODE_KEY) === "true"; } catch { return false; }
}

function projectFacePoint(sample, x, y) {
  const distance = FACE_SAMPLE_DISTANCE;
  const height = sample(x, y);
  const slopeX = (sample(x + distance, y) - sample(x - distance, y)) / (2 * distance);
  const slopeY = (sample(x, y + distance) - sample(x, y - distance)) / (2 * distance);
  const pull = FACE_SLOPE_PULL / Math.hypot(1, slopeX, slopeY);
  return { x: x - slopeX * pull, y: y - slopeY * pull - height * FACE_DEPTH_OFFSET, height };
}

function paintFace(parts, sample) {
  for (const part of parts) {
    const { element, x, y } = part;
    const distance = FACE_SAMPLE_DISTANCE;
    const center = projectFacePoint(sample, x, y);
    const left = projectFacePoint(sample, x - distance, y), right = projectFacePoint(sample, x + distance, y);
    const top = projectFacePoint(sample, x, y - distance), bottom = projectFacePoint(sample, x, y + distance);
    // Each mark bends with its own patch of material, including the slope around the mark.
    const a = (right.x - left.x) / (2 * distance), b = (right.y - left.y) / (2 * distance);
    const c = (bottom.x - top.x) / (2 * distance), d = (bottom.y - top.y) / (2 * distance);
    const values = [a, b, c, d, center.x - a * x - c * y, center.y - b * x - d * y]
      .map((value) => value.toFixed(3)).join(" ");
    if (part.transform !== values) {
      element.setAttribute("transform", "matrix(" + values + ")");
      part.transform = values;
    }
    const brightness = clamp(1 + center.height * 0.017, 0.74, 1).toFixed(3);
    if (part.brightness !== brightness) {
      element.style.filter = brightness === "1.000" ? "" : "brightness(" + brightness + ")";
      part.brightness = brightness;
    }
  }
}

export default function MallangPage() {
  const [params, setParams] = useSearchParams();
  const appearance = import.meta.env.DEV && params.get("style") === "2d" ? "2d" : "original";
  const runtime = useRef(null);
  const [audio] = useState(createMallangAudio);
  const [isWaxMode, setIsWaxMode] = useState(readWaxMode);
  const [waxShell, setWaxShell] = useState(() => createWaxShell(BLOB_CENTER, BODY_RADIUS));
  const initial = useRef({ shell: waxShell, mode: isWaxMode });
  const [look, setLook] = useState(readMallangCustomization);
  const [customizing, setCustomizing] = useState(false);
  const canvas = useRef(null), overlay = useRef(null), character = useRef(null), bounds = useRef(null);
  const deformation = useRef(null), face = useRef(null), shellElement = useRef(null), control = useRef(null), controller = useRef(null);
  const inspect = useRef(null);
  const customizeButton = useRef(null);
  const customizerId = useId();

  useEffect(() => {
    const r = { material: createMallangMaterial(), audio, shell: initial.current.shell,
      mode: initial.current.mode, frame: null, motion: null, input: null, pressFollowsTether: false,
      rotation: 0, waxMark: null, records: [], costs: [], frames: 0 };
    runtime.current = r;
    const material = r.material;
    const palette = getMallangPalette(readMallangCustomization().theme);
    const surface = createMallangSurface(canvas.current, material, overlay.current, palette);
    const faceParts = Array.from(face.current.querySelectorAll("[data-surface-point]"), (element) => {
      const [x, y] = element.dataset.surfacePoint.split(" ").map(Number);
      return { element, x, y };
    });
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
    function bodyPoint(point) {
      if (!point || !r.rotation) return point;
      // Undo the visual rotation so a room-space drag still reaches the pointer.
      const dx = point.x - BLOB_CENTER, dy = point.y - BLOB_CENTER;
      const cos = Math.cos(r.rotation), sin = Math.sin(r.rotation);
      return { ...point, x: BLOB_CENTER + dx * cos + dy * sin, y: BLOB_CENTER - dx * sin + dy * cos };
    }
    function contactPoint(raw) {
      return materialContact(material, raw, r.impactPaint);
    }
    function geometry(motion) {
      motion.rect = bounds.current.getBoundingClientRect();
      motion.bodySize = character.current.getBoundingClientRect().width;
    }
    function hit(raw) {
      const pull = bodyPoint(r.motion?.pull);
      const dx = raw.x - BLOB_CENTER, dy = raw.y - BLOB_CENTER;
      const angle = Math.atan2(dy, dx);
      const radius = surface?.radiusAt(angle) ?? membraneRadiusAt(membraneRadii(material, pull, r.impactPaint), angle);
      // A returning tip moves between the displayed frame and the incoming press.
      const nearReturningTip = pull && r.motion.mode === "coast" &&
        Math.hypot(raw.x - pull.x, raw.y - pull.y) <= RETURNING_TIP_HIT_PADDING;
      return nearReturningTip || Math.hypot(dx, dy) <= radius;
    }
    function paint() {
      if (disposed || !face.current || !character.current) return;
      const motion = r.motion;
      const pull = bodyPoint(motion?.pull);
      surface?.draw(pull, r.impactPaint, r.pressFollowsTether ? pull : null, pointerSpeedAt(motion, material.state.time));
      deformation.current.style.transform = "rotate(" + r.rotation + "rad)";
      if (r.motion) {
        character.current.style.left = r.motion.position.x + "%";
        character.current.style.top = r.motion.position.y + "%";
      }
      const sampleFaceHeight = material.state.reducedMotion ? () => 0
        : material.state.shell ? material.sample : surface?.sampleHeight ?? material.sample;
      paintFace(faceParts, sampleFaceHeight);
      for (const node of shellElement.current?.querySelectorAll("[data-piece-id]") ?? []) {
        const piece = r.shell.pieces.find((p) => String(p.id) === node.dataset.pieceId);
        if (!piece?.opening) continue;
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
        motionMode: r.motion?.mode ?? null, rotation: r.rotation,
        x: r.motion?.position.x, y: r.motion?.position.y, vx: r.motion?.vx ?? 0, vy: r.motion?.vy ?? 0 });
      if (r.records.length > 300) r.records.shift();
      if (inspect.current) inspect.current.textContent = JSON.stringify({
        active: material.state.active || !!moving(), frames: r.frames,
        costs: r.costs, records: r.records, mode: r.mode, seed: r.shell.seed,
      });
    }
    function breakWax(point, now) {
      const broken = fractureWaxShell(r.shell, point);
      if (!broken) return;
      const shell = broken.shell;
      const animate = !reduced();
      if (broken.traces && animate) {
        shell.opening = { traces: broken.traces, hairlines: broken.hairlines, expiresAt: now + WAX_OPENING_MS };
      }
      if (broken.loose && animate) {
        const loose = { ...broken.loose, fadeMs: WAX_FALL_MS, expiresAt: now + WAX_FALL_MS };
        const crumbs = broken.crumbs.map((crumb) => ({ ...crumb, fadeMs: WAX_CRUMB_FALL_MS,
          expiresAt: now + WAX_CRUMB_FALL_MS }));
        shell.chips = [...shell.chips, loose, ...crumbs];
      }
      updateShell(shell);
      material.impulse(point.x, point.y, broken.strength * .2, now);
      audio.play(broken.sound, broken.strength);
    }
    function startWaxPress(point, now) {
      audio.prepareWax();
      if (!r.shell.preview && !r.shell.fractures && !r.waxMark) r.waxMark = { point, at: now + WAX_MARK_LEAD_MS };
      r.input.waxPress = {
        point, lastShed: null, nextBreakAt: now + (r.shell.fractures ? WAX_SHED_HOLD_MS : WAX_BREAK_HOLD_MS),
      };
    }
    function advanceWax(now) {
      if (r.waxMark && now >= r.waxMark.at) {
        updateShell(markWaxShell(r.shell, r.waxMark.point), false);
        r.waxMark = null;
        audio.play("waxSmall", .2);
        return;
      }
      const opening = r.shell.opening;
      if (opening && now >= opening.expiresAt) updateShell({ ...r.shell, opening: null }, false);
      if (r.shell.chips.some((chip) => chip.expiresAt <= now)) {
        updateShell({ ...r.shell, chips: r.shell.chips.filter((chip) => chip.expiresAt > now) }, false);
      }
      const press = r.input?.waxPress;
      if (!press?.point || r.shell.opening || !r.shell.pieces.length || now < press.nextBreakAt) return;
      if (press.lastShed && Math.hypot(press.point.x - press.lastShed.x,
        press.point.y - press.lastShed.y) < WAX_RUB_DISTANCE) return;
      // After splitting the plate network, a held press can loosen one neighboring plate.
      // More shedding requires a new hold or moving across the cracks.
      if (r.shell.fractures) press.lastShed = press.point;
      press.nextBreakAt = now + WAX_SHED_HOLD_MS;
      breakWax(press.point, now);
    }
    function advance(now) {
      material.state.reducedMotion = reduced();
      const motion = r.motion;
      const grabbing = motion?.mode === "grab";
      if (motion) {
        motion.tetherMoving = advanceMotion(motion, now);
        if (grabbing) {
          const contact = bareSurfaceContact(bodyPoint(pullTarget(motion)));
          material.move(contact.x, contact.y, now);
        }
      }
      material.advance(now);
      if (motion) {
        if (grabbing || motion.pull) updatePull(motion, contactPoint(bodyPoint(pullTarget(motion))).radius);
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
          const p = bodyPoint({ x: 100 + Math.sign(motion.impact.x) * 88, y: 100 + Math.sign(motion.impact.y) * 88 });
          material.impulse(p.x, p.y, strength * .65, now);
          audio.play("wall", Math.min(1, strength));
        }
      }
      if (r.impact) {
        const left = Math.max(0, 1 - (now - r.impact.time) / 210);
        r.impactPaint = { x: r.impact.x * left * left, y: r.impact.y * left * left, rotation: r.rotation };
        if (!left) { r.impact = null; r.impactPaint = null; }
      }
      if (r.input && !r.input.wax && !r.input.sounded && material.contactDepth() >= .12) {
        r.input.sounded = true; audio.play("press", material.contactDepth());
      }
    }
    function moving() {
      const motion = r.motion;
      if (!motion) return false;
      const speed = Math.hypot(motion.vx, motion.vy);
      if (motion.mode === "coast") {
        if (speed <= STOP_SPEED) motion.vx = motion.vy = 0;
        return speed > STOP_SPEED || !!motion.pull;
      }
      if (speed > GRAB_REST_SPEED || motion.tetherMoving) return true;
      const spring = springDisplacement(motion, motion.position.x * motion.rect.width / 100,
        motion.position.y * motion.rect.height / 100);
      return Math.hypot(spring.x, spring.y) > GRAB_REST_DISPLACEMENT;
    }
    function frame(now) {
      r.frame = null;
      const started = performance.now();
      advance(now);
      if (r.mode) advanceWax(now);
      paint();
      record(performance.now() - started);
      if (moving() || material.state.active || surface?.recovering || r.impact ||
        r.waxMark || r.input?.waxPress?.point || r.shell.opening || r.shell.chips.length) request();
    }
    function cancel(reason) {
      const captured = r.input?.id;
      if (r.frame !== null) cancelAnimationFrame(r.frame);
      r.frame = null; r.input = null; r.motion = null; r.impact = null; r.impactPaint = null;
      r.pressFollowsTether = false;
      r.waxMark = null;
      r.cancelReason = reason?.type ?? "reset";
      if (captured !== undefined && control.current?.hasPointerCapture(captured)) control.current.releasePointerCapture(captured);
      material.reset(performance.now());
      surface?.reset();
      audio.stop();
      if (!disposed && (r.shell.opening || r.shell.chips.length)) {
        updateShell({ ...r.shell, opening: null, chips: [] }, false);
      }
      character.current?.classList.remove("mallang-character--dragging");
      paint();
      if (!disposed) record(0);
    }
    function down(event) {
      if (r.input || event.button !== 0 || !event.isPrimary) return;
      if (r.mode && !r.shell.pieces.length && r.shell.chips.length) return;
      const raw = bodyPoint(point(event.clientX, event.clientY));
      if (!hit(raw)) return;
      const now = performance.now();
      const previousMotion = r.motion;
      const wasReturning = !!previousMotion?.pull;
      audio.prepare();
      const wax = r.mode && r.shell.pieces.length > 0;
      const local = wax ? contactPoint(raw) : bareSurfaceContact(wasReturning ? bodyPoint(pullTarget(previousMotion)) : raw);
      r.pressFollowsTether = !wax;
      r.input = { id: event.pointerId, wax };
      if (!control.current.contains(event.target)) event.preventDefault();
      control.current.setPointerCapture(event.pointerId);
      material.touch(local.x, local.y, now);
      if (wax) { startWaxPress(local, now); r.motion = null; }
      else {
        const body = character.current.getBoundingClientRect();
        const motion = { mode: "grab", vx: previousMotion?.vx ?? 0, vy: previousMotion?.vy ?? 0,
          position: previousMotion?.position, pointer: { x: event.clientX, y: event.clientY },
          pointerSpeed: 0, pointerMovedAt: now,
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
      const motion = r.motion;
      if (motion?.mode === "grab") {
        const pointer = { x: event.clientX, y: event.clientY };
        if (!reduced()) {
          const { rect, position, bodySize } = motion;
          const center = { x: rect.left + position.x / 100 * rect.width,
            y: rect.top + position.y / 100 * rect.height };
          const radius = BODY_RADIUS * bodySize / (BLOB_CENTER * 2);
          r.rotation = (r.rotation + dragRotationDelta(motion.pointer, pointer, center, radius)) % (2 * Math.PI);
        }
        const dx = pointer.x - motion.pointer.x, dy = pointer.y - motion.pointer.y;
        const elapsed = Math.max(1, now - motion.pointerMovedAt);
        const speed = 1000 * Math.hypot(dx, dy) / Math.min(elapsed, POINTER_SPEED_WINDOW_MS);
        const weight = Math.exp(-elapsed / POINTER_SPEED_SMOOTHING_MS);
        motion.pointerSpeed = motion.pointerSpeed * weight + speed * (1 - weight);
        motion.pointerMovedAt = now;
        motion.pointer = pointer;
      } else {
        const raw = bodyPoint(point(event.clientX, event.clientY));
        if (Math.hypot(raw.x - BLOB_CENTER, raw.y - BLOB_CENTER) > 96) {
          r.input.waxPress.point = null;
          material.release(now, false);
        } else {
          const local = contactPoint(raw);
          const press = r.input.waxPress;
          if (!press.point) {
            press.nextBreakAt = now + (r.shell.fractures ? WAX_SHED_HOLD_MS : WAX_BREAK_HOLD_MS);
            press.lastShed = null;
          }
          press.point = local;
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
      if (r.input.wax) advanceWax(now);
      surface?.setReleaseSpeed(motion?.mode === "grab" ? pointerSpeedAt(motion, now) : 0);
      const ripple = !reduced() && !surface?.hasStretchedContact;
      const strength = material.release(now, ripple, ripple ? surface?.releaseWaveAnchor() : null);
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
      const local = wax ? waxKeyboardPoint(r.shell) : { x: BLOB_CENTER, y: BLOB_CENTER };
      r.pressFollowsTether = false;
      r.input = { key: event.key, wax };
      audio.prepare();
      const now = performance.now();
      material.touch(local.x, local.y, now);
      if (wax) startWaxPress(local, now);
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
      reset() { cancel(); updateShell(createWaxShell(BLOB_CENTER, BODY_RADIUS)); request(); } };
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

  useEffect(applySavedMallangTheme, []);
  useEffect(() => {
    runtime.current?.surface?.setFlatStyle(appearance === "2d");
    runtime.current?.surface?.setPalette(getMallangPalette(look.theme));
    runtime.current?.paint();
  }, [appearance, look.theme]);

  function toggle() {
    const enabled = !isWaxMode;
    if (enabled) audio.prepareWax();
    controller.current.mode(enabled); setIsWaxMode(enabled);
    try { localStorage.setItem(WAX_MODE_KEY, String(enabled)); } catch { /* Current visit remains usable. */ }
  }
  function updateLook(change) {
    setLook(saveMallangCustomization({ ...look, ...change }));
  }
  function closeCustomizer() {
    setCustomizing(false);
    customizeButton.current?.focus();
  }

  const isShellBroken = isWaxMode && waxShell.pieces.length === 0;
  const busy = isShellBroken && waxShell.chips.length > 0;
  return <div className={`mallang-page mallang-page--${appearance}`}>
    <AppBar />
    <main className={customizing ? "mallang-content mallang-content--customizing" : "mallang-content"}>
      {import.meta.env.DEV && params.has("inspect") && <output ref={inspect} id="mallang-inspect" hidden />}
      <h1>마음 쉬기</h1>
      <p className="mallang-intro">속상하거나 긴장될 때 말랑이를 꾹꾹 눌러 보세요.</p>
      <div className="mallang-controls">
        <button type="button" role="switch" aria-checked={isWaxMode} className="mallang-wax-toggle" onClick={toggle}>
          껍질 깨기<span className="mallang-wax-track" aria-hidden="true" />
        </button>
        {isWaxMode && <button type="button" className="mallang-wax-reset" disabled={!waxShell.preview && !waxShell.fractures}
          onClick={() => controller.current.reset()}>껍질 다시 씌우기</button>}
        {import.meta.env.DEV && params.has("style") && <div className="mallang-style-preview">
          {["original", "2d"].map((style) => <button key={style} type="button" aria-pressed={appearance === style}
            onClick={() => { const next = new URLSearchParams(params); next.set("style", style); setParams(next, { replace: true }); }}>
            {style === "2d" ? "2D" : "기본"}</button>)}
        </div>}
        <button ref={customizeButton} type="button" className="mallang-customize-toggle"
          aria-label="말랑이 꾸미기" aria-expanded={customizing} aria-controls={customizing ? customizerId : undefined}
          onClick={() => setCustomizing((open) => !open)}>
          <Icon name="pencil" />
        </button>
      </div>
      <p className="mallang-status" role="status">
        {isShellBroken && !busy && "말랑이가 나왔어요."}
      </p>
      <div className="mallang-play-area">
        <section className="mallang-room" aria-label="말랑이 놀이터" onPointerDown={(e) => controller.current.down(e)}>
          <div ref={bounds} className="mallang-bounds">
            <div ref={character} className="mallang-character" style={{ left: "50%", top: "50%" }}>
              {isWaxMode && !waxShell.fractures && <span className="mallang-ground-shadow" aria-hidden="true" />}
              <div ref={deformation} className="mallang-deformation">
                <canvas ref={canvas} className="mallang-material-canvas" aria-hidden="true" />
                <button ref={control} type="button" draggable={false} className="mallang-body"
                  aria-label={isWaxMode && waxShell.pieces.length ? "껍질 길게 누르기" : "말랑이 누르기"}
                  aria-disabled={busy || undefined}
                  onPointerMove={(e) => controller.current.move(e)}
                  onPointerUp={(e) => controller.current.end(e)} onPointerCancel={(e) => controller.current.end(e)}
                  onLostPointerCapture={(e) => controller.current.end(e)}
                  onKeyDown={(e) => controller.current.keyDown(e)} onKeyUp={(e) => controller.current.end(e)}
                  onClick={() => audio.prepare()}
                  onBlur={() => controller.current.cancel({ type: "control-blur" })}>
                  <span ref={face} className="mallang-face"><MallangFace look={look} /></span>
                </button>
                {isWaxMode && <WaxShell shell={waxShell} themeId={look.theme} shellRef={shellElement} />}
                <canvas ref={overlay} className="mallang-material-canvas mallang-material-light" aria-hidden="true" />
              </div>
            </div>
          </div>
        </section>
        {customizing && <MallangCustomizer id={customizerId} look={look} onChange={updateLook} onClose={closeCustomizer} />}
      </div>
    </main>
  </div>;
}
