import { FULL_PRESS_MS, PRESS_FLATTENING, PRESS_TILT, TAP_DEPTH, pressDepth, pressRadiusRatio, pressRecoveryDuration, smoothStep } from "./surfacePress.js";
import { createPressTrail } from "./pressTrail.js";

const SURFACE_SIZE = 160;
const REFERENCE_RADII_PER_SECOND = 2;
const RIPPLE_SPEED_RATIO = 0.4;
const RING_WIDTH_RATIO = 0.19;
const MAX_RINGS = 16;

const FLAT_STOPS = [
  [0, "rgba(208, 104, 148, 0)"],
  [0.42, "rgba(208, 104, 148, 0.16)"],
  [0.73, "rgba(208, 104, 148, 0.46)"],
  [1, "rgba(208, 104, 148, 0)"],
];
const SLIME_STOPS = [
  [0, "rgba(159, 63, 105, 0)"],
  [0.28, "rgba(159, 63, 105, 0.09)"],
  [0.56, "rgba(159, 63, 105, 0.27)"],
  [0.74, "rgba(182, 80, 123, 0.28)"],
  [0.9, "rgba(222, 144, 177, 0.12)"],
  [1, "rgba(222, 144, 177, 0)"],
];

export function createMallangSurface(canvas, bodyRadius, drawRim, drawDent) {
  const context = canvas.getContext("2d");
  if (!context) return null;

  canvas.width = SURFACE_SIZE * 3;
  canvas.height = SURFACE_SIZE * 3;
  context.translate(SURFACE_SIZE, SURFACE_SIZE);
  const center = SURFACE_SIZE / 2;
  const radius = bodyRadius * SURFACE_SIZE;
  const ringWidth = radius * RING_WIDTH_RATIO;
  const returnDistance = radius * 0.66;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rings = [];
  const speed = radius * REFERENCE_RADII_PER_SECOND * RIPPLE_SPEED_RATIO;
  let colorStops = SLIME_STOPS;
  let indentation = null;
  let recovery = null;
  const trail = createPressTrail();
  let frame = null;
  let lastTime = 0;

  function advance(timestamp) {
    const elapsed = Math.max(0, timestamp - lastTime);
    lastTime = Math.max(lastTime, timestamp);

    for (let index = rings.length - 1; index >= 0; index--) {
      const ring = rings[index];
      const activeTime = Math.max(0, elapsed - ring.delay);
      ring.delay = Math.max(0, ring.delay - elapsed);
      ring.travel += speed * activeTime / 1000;
      if (ring.launchRadius + ring.travel >= Math.max(ring.limit, ring.edgeDistance + returnDistance)) {
        rings.splice(index, 1);
      }
    }
  }

  function pointOnSurface(x, y, clampToRim = true) {
    const dx = x * SURFACE_SIZE - center;
    const dy = y * SURFACE_SIZE - center;
    const distance = Math.hypot(dx, dy);
    const insetDistance = clampToRim ? Math.min(distance, radius - ringWidth * 0.36) : distance;
    const scale = distance ? insetDistance / distance : 1;
    const hasDirection = distance > ringWidth * 0.25;
    return {
      x: center + dx * scale,
      y: center + dy * scale,
      angle: hasDirection ? Math.atan2(dy, dx) : null,
      edgeX: hasDirection ? center + dx / distance * radius : center,
      edgeY: hasDirection ? center + dy / distance * radius : center,
      edgeDistance: radius - insetDistance,
      limit: radius + insetDistance + ringWidth * 0.36,
    };
  }

  function paintRing(x, y, distance, opacity, flattening = 1) {
    const inner = Math.max(0, distance - ringWidth * 0.72);
    const outer = distance + ringWidth * 0.28;
    context.save();
    context.translate(x, y);
    context.rotate(PRESS_TILT);
    context.scale(1, flattening);
    const gradient = context.createRadialGradient(0, 0, inner, 0, 0, outer);
    for (const [offset, color] of colorStops) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.globalAlpha = opacity;
    context.fillRect(-outer, -outer, outer * 2, outer * 2);
    context.restore();
  }

  function visibleTrail(timestamp, depth) {
    return trail.samples(timestamp, depth).map((sample) => ({
      x: sample.x / SURFACE_SIZE,
      y: sample.y / SURFACE_SIZE,
      depth: sample.depth,
    }));
  }

  function paintRecovery(timestamp) {
    if (!recovery) return;
    const { point, depth, start, duration } = recovery;
    const progress = Math.max(0, Math.min(1, (timestamp - start) / duration));
    if (progress === 1) {
      recovery = null;
      return;
    }
    const remainingDepth = depth * (1 - smoothStep(progress));
    const sheen = Math.sin(Math.PI * progress) * depth;
    const outer = radius * (0.4 - 0.27 * smoothStep(progress));
    const highlight = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, outer);
    highlight.addColorStop(0, "rgba(255, 245, 251, 0.19)");
    highlight.addColorStop(0.5, "rgba(255, 228, 244, 0.08)");
    highlight.addColorStop(1, "rgba(255, 228, 244, 0)");
    context.fillStyle = highlight;
    context.globalAlpha = sheen;
    context.fillRect(point.x - outer, point.y - outer, outer * 2, outer * 2);

    return { point, depth: remainingDepth, progress };
  }

  function draw(timestamp) {
    context.clearRect(-SURFACE_SIZE, -SURFACE_SIZE, SURFACE_SIZE * 3, SURFACE_SIZE * 3);
    context.save();
    let rimAmount = 0;
    let rimAngle = null;
    const isSlime = colorStops === SLIME_STOPS;
    for (const ring of rings) {
      if (ring.delay > 0) continue;
      const front = ring.launchRadius + ring.travel;
      if (front < ring.limit) {
        const fade = 1 - front / ring.limit;
        const forming = smoothStep(Math.min(1, ring.travel / (ringWidth * 0.95)));
        const flattening = PRESS_FLATTENING + (1 - PRESS_FLATTENING) * forming;
        paintRing(ring.x, ring.y, front, ring.strength * fade ** 0.85 * forming, flattening);
      }

      if (!isSlime) continue;
      // Let the outward wave form before the nearest rim sends back a reflection.
      const rebound = front - Math.max(ring.edgeDistance, ring.launchRadius + ringWidth * 0.7);
      if (rebound < 0 || rebound >= returnDistance) continue;
      const progress = rebound / returnDistance;
      const opacity = Math.min(1, progress * 8) * (1 - progress) ** 2;
      const reflectedRadius = ring.angle === null ? radius - rebound : rebound;
      paintRing(ring.edgeX, ring.edgeY, reflectedRadius, 0.12 * opacity * ring.strength);
      const flex = rebound / (ringWidth * 1.2);
      const bulge = flex < 1 ? Math.sin(Math.PI * flex) * (1 - flex) * 0.035 * ring.strength : 0;
      if (bulge > rimAmount) {
        rimAmount = bulge;
        rimAngle = ring.angle;
      }
    }
    let contact = paintRecovery(timestamp);
    if (indentation) {
      const elapsed = Math.max(0, timestamp - indentation.start);
      const depth = pressDepth(elapsed);
      contact = { point: indentation.point, depth, progress: 0 };
    }
    const contacts = contact ? visibleTrail(timestamp, contact.depth) : [];
    drawDent(contact && {
      x: contact.point.x / SURFACE_SIZE,
      y: contact.point.y / SURFACE_SIZE,
      depth: contact.depth,
      diameter: bodyRadius * 2 * pressRadiusRatio(contact.depth) * (1 - 0.44 * smoothStep(contact.progress)),
      dragX: contact.point.dragX ?? 0,
      dragY: contact.point.dragY ?? 0,
      trail: contacts,
    });
    context.globalAlpha = 1;
    context.restore();
    drawRim(rimAngle, rimAmount, contacts);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    rings.length = 0;
    indentation = null;
    recovery = null;
    trail.clear();
    context.clearRect(-SURFACE_SIZE, -SURFACE_SIZE, SURFACE_SIZE * 3, SURFACE_SIZE * 3);
    drawRim(null, 0);
    drawDent();
  }

  function handleMotionPreferenceChange() {
    stop();
  }
  reducedMotion.addEventListener("change", handleMotionPreferenceChange);

  function animate(timestamp) {
    frame = null;
    if (reducedMotion.matches) {
      stop();
      return;
    }

    advance(timestamp);
    draw(timestamp);
    if (rings.length || recovery || (indentation &&
        (timestamp - indentation.start < FULL_PRESS_MS || trail.hasTail(timestamp)))) {
      frame = requestAnimationFrame(animate);
    }
  }

  function requestFrame(now) {
    if (frame !== null) return;
    lastTime = now;
    frame = requestAnimationFrame(animate);
  }

  function releaseIndentation(now, point, depth) {
    indentation = null;
    recovery = { point, depth, start: now, duration: pressRecoveryDuration(depth) };
    requestFrame(now);
  }

  function addDrop(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return TAP_DEPTH;
    const now = performance.now();
    const depth = indentation ? pressDepth(now - indentation.start) : TAP_DEPTH;
    const strength = Math.max(TAP_DEPTH, depth);
    if (reducedMotion.matches) {
      stop();
      return strength;
    }

    if (frame !== null) advance(now);
    const origin = indentation?.point ?? pointOnSurface(x, y);
    if (!indentation) {
      trail.clear();
      trail.move(origin.x, origin.y, depth, now);
    }
    releaseIndentation(now, origin, depth);
    if (rings.length === MAX_RINGS) rings.shift();
    rings.push({
      ...origin,
      delay: recovery.duration * (0.38 + strength * 0.24),
      launchRadius: radius * (0.19 + strength * 0.07),
      travel: 0,
      strength: 0.42 + strength * 0.58,
    });
    return strength;
  }

  function setIndentation(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (reducedMotion.matches) {
      stop();
      return;
    }
    const now = performance.now();
    trail.clear();
    recovery = null;
    const point = pointOnSurface(x, y);
    trail.move(point.x, point.y, 0, now);
    indentation = { point, start: now, startX: x, startY: y };
    if (!reducedMotion.matches) requestFrame(now);
  }

  function moveIndentation(x, y) {
    if (!indentation || !Number.isFinite(x) || !Number.isFinite(y) || reducedMotion.matches) return;
    const now = performance.now();
    const next = pointOnSurface(x, y, false);
    trail.move(next.x, next.y, pressDepth(now - indentation.start), now);
    indentation.point = {
      ...pointOnSurface(x, y, false),
      dragX: x - indentation.startX,
      dragY: y - indentation.startY,
    };
    requestFrame(performance.now());
  }

  function clearIndentation() {
    if (!indentation) return;
    const now = performance.now();
    if (reducedMotion.matches) {
      stop();
      return;
    }
    releaseIndentation(now, indentation.point, pressDepth(now - indentation.start));
  }

  function setFlatStyle(enabled) {
    const next = enabled ? FLAT_STOPS : SLIME_STOPS;
    if (next === colorStops) return;
    stop();
    colorStops = next;
  }

  function dispose() {
    stop();
    reducedMotion.removeEventListener("change", handleMotionPreferenceChange);
  }

  return { addDrop, stop, dispose, setFlatStyle, setIndentation, moveIndentation, clearIndentation };
}
