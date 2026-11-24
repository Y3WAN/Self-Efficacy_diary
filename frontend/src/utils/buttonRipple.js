import { createButtonDent } from "./buttonDent";
import { FULL_PRESS_MS, TAP_DEPTH, pressDepth, pressRecoveryDuration, smoothStep } from "./surfacePress";
import { createPressTrail } from "./pressTrail";

const NAVIGATION_LINK = "a:is([data-ripple-navigation], .auth-btn, .calendar-day, .chart-link," +
  " .main-analysis-link, .reflection-mission-link)[href^='/']:not([href^='//'])";
// Record slide links use the same visuals but keep the carousel's native swipe/click handling.
const RIPPLE_CONTROL = "button:not(.mallang-body), a:is(.activity-write, .activity-diary), " + NAVIGATION_LINK;
const DISABLED_CONTROL = ":disabled, [aria-disabled='true'], [inert]";
const RIPPLE_DURATION = 525;
const MAX_RIPPLE_DIAMETER = 132;
const MAX_DENT_DIAMETER = 72;
const RIPPLE_EASING = "cubic-bezier(.2, .65, .3, 1)";

const contactDepth = (elapsed) => Math.max(TAP_DEPTH, pressDepth(elapsed));

function isPlainActivation(event) {
  return event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

export function installButtonRipple(root) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const layer = document.createElement("span");
  const ring = document.createElement("span");
  layer.className = "button-ripple";
  layer.setAttribute("aria-hidden", "true");
  ring.className = "button-ripple-ring";
  layer.append(ring);

  let anchor;
  let press;
  let dent;
  let surfaceFrame = null;
  let rippleAnimation;
  let surface;
  const trail = createPressTrail();

  function clearRipple() {
    press = undefined;
    surface = undefined;
    trail.clear();
    if (surfaceFrame !== null) cancelAnimationFrame(surfaceFrame);
    surfaceFrame = null;
    rippleAnimation?.cancel();
    rippleAnimation = undefined;
    layer.remove();
    anchor?.classList.remove("button-ripple-anchor", "button-surface-deforming");
    anchor = undefined;
  }

  function findControl(target) {
    if (reducedMotion.matches || !(target instanceof Element) || typeof ring.animate !== "function") return null;
    const control = target.closest(RIPPLE_CONTROL);
    if (!control || !root.contains(control) || control.closest(DISABLED_CONTROL)) return null;
    return control;
  }

  function placeRipple(control, point) {
    const { left, top, width, height } = control.getBoundingClientRect();
    if (!width || !height) return false;

    clearRipple();
    const x = point ? Math.max(0, Math.min(width, point.clientX - left)) : width / 2;
    const y = point ? Math.max(0, Math.min(height, point.clientY - top)) : height / 2;
    const edgeDiameter = 2 * Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
    const diameter = Math.min(edgeDiameter, Math.min(width, height) * 2.75, MAX_RIPPLE_DIAMETER);
    layer.style.setProperty("--ripple-x", x / width * 100 + "%");
    layer.style.setProperty("--ripple-y", y / height * 100 + "%");
    ring.style.width = diameter + "px";

    anchor = control;
    if (getComputedStyle(control).position === "static") {
      anchor.classList.add("button-ripple-anchor");
    }
    anchor.append(layer);
    return { x, y, width, height };
  }

  function playRelease(depth) {
    const strength = Math.max(TAP_DEPTH, depth);
    const animation = ring.animate([
      { transform: "translate(-50%, -50%) scale(0.06)", opacity: 0 },
      { transform: "translate(-50%, -50%) scale(0.20)", opacity: 0.28 + strength * 0.19, offset: 0.15 },
      { transform: "translate(-50%, -50%) scale(1)", opacity: 0 },
    ], { duration: RIPPLE_DURATION, easing: RIPPLE_EASING });
    rippleAnimation = animation;
    animation.onfinish = () => {
      if (rippleAnimation !== animation) return;
      rippleAnimation = undefined;
      if (surfaceFrame === null) clearRipple();
    };
  }

  function prepareIndentation({ x, y, width, height }) {
    const diameter = Math.min(MAX_DENT_DIAMETER, Math.min(width, height) * 1.12);
    dent ??= createButtonDent({ maxPull: 4 });
    surface = { width, height, diameter };
    const now = performance.now();
    trail.move(x, y, TAP_DEPTH, now);
    return now;
  }

  function drawIndentation(depth, recovery = 0) {
    if (!surface || !dent) return;
    const { width, height, diameter } = surface;
    const points = trail.samples(performance.now(), depth)
      .map((point) => ({ ...point, x: point.x / width, y: point.y / height }));
    const deepest = Math.max(depth, ...points.map((point) => point.depth));
    dent.trace(points, width, height,
      diameter * (0.42 + deepest * 0.58) * (1 - recovery * 0.25));
    anchor.classList.add("button-surface-deforming");
  }

  function animateSurface(duration, draw, onFinish, shouldContinue = () => true) {
    if (surfaceFrame !== null) cancelAnimationFrame(surfaceFrame);
    const startedAt = performance.now();
    function frame(now) {
      const elapsed = Math.max(0, Math.min(duration, now - startedAt));
      draw(elapsed);
      surfaceFrame = elapsed < duration && shouldContinue() ? requestAnimationFrame(frame) : null;
      if (elapsed === duration) onFinish?.();
    }
    surfaceFrame = requestAnimationFrame(frame);
  }

  function animatePress() {
    animateSurface(Infinity, () => drawIndentation(contactDepth(performance.now() - press.startedAt)),
      undefined, () => performance.now() - press.startedAt < FULL_PRESS_MS || trail.hasTail(performance.now()));
  }

  function handlePointerDown(event) {
    if (press || !event.isPrimary || !isPlainActivation(event) || event.defaultPrevented) return;
    const control = findControl(event.target);
    if (!control) return;
    const point = placeRipple(control, event);
    if (!point) return;

    press = { pointerId: event.pointerId, startedAt: prepareIndentation(point) };
    animatePress();
  }

  function handlePointerMove(event) {
    if (!anchor || press?.pointerId !== event.pointerId) return;
    const { left, top, width, height } = anchor.getBoundingClientRect();
    if (!width || !height) return;
    const x = Math.max(0, Math.min(width, event.clientX - left));
    const y = Math.max(0, Math.min(height, event.clientY - top));
    layer.style.setProperty("--ripple-x", x / width * 100 + "%");
    layer.style.setProperty("--ripple-y", y / height * 100 + "%");
    const now = performance.now();
    trail.move(x, y, contactDepth(now - press.startedAt), now);
    if (surfaceFrame === null) animatePress();
    if (event.clientX < left || event.clientX > left + width ||
        event.clientY < top || event.clientY > top + height) releasePress(false);
  }

  function preventNativeDrag(event) {
    if (press && anchor?.contains(event.target)) event.preventDefault();
  }

  function recoverIndentation(depth) {
    const duration = pressRecoveryDuration(depth);
    animateSurface(duration, (elapsed) => {
      const progress = smoothStep(elapsed / duration);
      drawIndentation(depth * (1 - progress), progress);
    }, () => {
      anchor?.classList.remove("button-surface-deforming");
      if (!rippleAnimation) clearRipple();
    });
  }

  function releasePress(showRipple) {
    const depth = contactDepth(Math.max(0, performance.now() - press.startedAt));
    press = undefined;
    recoverIndentation(depth);
    if (showRipple) playRelease(depth);
  }

  function handlePointerUp(event) {
    if (press?.pointerId !== event.pointerId) return;
    handlePointerMove(event);
    if (!press) return;
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    releasePress(findControl(hit) === anchor);
  }

  function cancelPress(event) {
    if (press?.pointerId === event.pointerId) clearRipple();
  }

  function handleClick(event) {
    if (event.defaultPrevented || !isPlainActivation(event)) return;
    const control = findControl(event.target);
    if (!control || control.hasAttribute("download") || (control.target && control.target !== "_self")) return;

    const isKeyboardClick = event.detail === 0;
    if (isKeyboardClick || anchor !== control || !rippleAnimation) {
      const point = placeRipple(control, isKeyboardClick ? null : event);
      if (!point) return;
      prepareIndentation(point);
      recoverIndentation(TAP_DEPTH);
      playRelease(TAP_DEPTH);
    }
  }

  function reset() {
    clearRipple();
  }

  function handleMotionPreferenceChange() {
    clearRipple();
  }

  root.addEventListener("pointerdown", handlePointerDown);
  root.addEventListener("dragstart", preventNativeDrag);
  root.addEventListener("click", handleClick, true);
  window.addEventListener("pointermove", handlePointerMove, true);
  window.addEventListener("pointerup", handlePointerUp, true);
  window.addEventListener("pointercancel", cancelPress, true);
  window.addEventListener("blur", reset);
  window.addEventListener("popstate", reset);
  reducedMotion.addEventListener("change", handleMotionPreferenceChange);
  return () => {
    root.removeEventListener("pointerdown", handlePointerDown);
    root.removeEventListener("dragstart", preventNativeDrag);
    root.removeEventListener("click", handleClick, true);
    window.removeEventListener("pointermove", handlePointerMove, true);
    window.removeEventListener("pointerup", handlePointerUp, true);
    window.removeEventListener("pointercancel", cancelPress, true);
    window.removeEventListener("blur", reset);
    window.removeEventListener("popstate", reset);
    reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
    reset();
    dent?.dispose();
  };
}
