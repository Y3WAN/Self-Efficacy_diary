const SURFACE_SIZE = 160;
const REFERENCE_RADII_PER_SECOND = 2;
const RING_WIDTH_RATIO = 0.19;
const RIM_FADE_START = 0.93;
const MAX_RINGS = 16;
const FULL_PRESS_MS = 760;
const TAP_DEPTH = 0.22;
const CONTACT_TILT = -0.23;
const CONTACT_FLATTENING = 0.87;
const PRESS_FADE_IN_MS = 65;

function ease(progress) {
  return progress ** 2 * (3 - 2 * progress);
}

function pressDepth(elapsed) {
  const progress = Math.min(1, elapsed / FULL_PRESS_MS);
  const depth = TAP_DEPTH + (1 - TAP_DEPTH) * (1 - (1 - progress) ** 1.65);
  return depth * ease(Math.min(1, elapsed / PRESS_FADE_IN_MS));
}

export const RIPPLE_SPEED_PERCENT = Object.freeze({ min: 40, max: 150, step: 5, initial: 45 });

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

export function createMallangSurface(canvas, bodyRadius, drawRim) {
  const context = canvas.getContext("2d");
  if (!context) return null;

  canvas.width = SURFACE_SIZE;
  canvas.height = SURFACE_SIZE;
  const center = SURFACE_SIZE / 2;
  const radius = bodyRadius * SURFACE_SIZE;
  const ringWidth = radius * RING_WIDTH_RATIO;
  const returnDistance = radius * 0.66;
  const rimMask = context.createRadialGradient(center, center, radius * RIM_FADE_START, center, center, radius);
  rimMask.addColorStop(0, "#000");
  rimMask.addColorStop(1, "transparent");

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const rings = [];
  const referenceSpeed = radius * REFERENCE_RADII_PER_SECOND;
  let speed = referenceSpeed * RIPPLE_SPEED_PERCENT.initial / 100;
  let colorStops = SLIME_STOPS;
  let indentation = null;
  let recovery = null;
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

  function pointOnSurface(x, y) {
    const dx = x * SURFACE_SIZE - center;
    const dy = y * SURFACE_SIZE - center;
    const distance = Math.hypot(dx, dy);
    const insetDistance = Math.min(distance, radius - ringWidth * 0.36);
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
    context.rotate(CONTACT_TILT);
    context.scale(1, flattening);
    const gradient = context.createRadialGradient(0, 0, inner, 0, 0, outer);
    for (const [offset, color] of colorStops) gradient.addColorStop(offset, color);
    context.fillStyle = gradient;
    context.globalAlpha = opacity;
    context.fillRect(-outer, -outer, outer * 2, outer * 2);
    context.restore();
  }

  function paintIndentation({ x, y }, depth, progress = 0) {
    const extent = radius * (0.19 + depth * 0.29);
    context.save();
    context.translate(x, y);
    context.rotate(CONTACT_TILT);
    context.scale(1, CONTACT_FLATTENING);
    context.globalAlpha = depth;
    const spread = 1 - 0.44 * ease(progress);
    context.scale(spread, spread);

    // The depression narrows as the gel rises toward the middle.
    const shade = context.createRadialGradient(-extent * 0.23, -extent * 0.28, extent * 0.07, 0, 0, extent);
    shade.addColorStop(0, "rgba(112, 44, 81, 0.51)");
    shade.addColorStop(0.32, "rgba(129, 52, 89, 0.33)");
    shade.addColorStop(0.68, "rgba(151, 68, 108, 0.15)");
    shade.addColorStop(1, "rgba(151, 68, 108, 0)");
    context.fillStyle = shade;
    context.fillRect(-extent, -extent, extent * 2, extent * 2);

    context.restore();
  }

  function paintRecovery(timestamp) {
    if (!recovery) return;
    const { point, depth, start, duration } = recovery;
    const progress = Math.max(0, Math.min(1, (timestamp - start) / duration));
    if (progress === 1) {
      recovery = null;
      return;
    }
    const remainingDepth = depth * (1 - ease(progress));
    paintIndentation(point, remainingDepth, progress);
    const sheen = Math.sin(Math.PI * progress) * depth;
    const outer = radius * (0.4 - 0.27 * ease(progress));
    const highlight = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, outer);
    highlight.addColorStop(0, "rgba(255, 245, 251, 0.63)");
    highlight.addColorStop(0.5, "rgba(255, 228, 244, 0.29)");
    highlight.addColorStop(1, "rgba(255, 228, 244, 0)");
    context.fillStyle = highlight;
    context.globalAlpha = sheen;
    context.fillRect(point.x - outer, point.y - outer, outer * 2, outer * 2);

  }

  function draw(timestamp) {
    context.clearRect(0, 0, SURFACE_SIZE, SURFACE_SIZE);
    context.save();
    let rimAmount = 0;
    let rimAngle = null;
    const isSlime = colorStops === SLIME_STOPS;
    for (const ring of rings) {
      if (ring.delay > 0) continue;
      const front = ring.launchRadius + ring.travel;
      if (front < ring.limit) {
        const fade = 1 - front / ring.limit;
        const forming = ease(Math.min(1, ring.travel / (ringWidth * 0.95)));
        const flattening = CONTACT_FLATTENING + (1 - CONTACT_FLATTENING) * forming;
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
    paintRecovery(timestamp);
    if (indentation) {
      const elapsed = Math.max(0, timestamp - indentation.start);
      paintIndentation(indentation.point, pressDepth(elapsed));
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = "destination-in";
    context.fillStyle = rimMask;
    context.fillRect(0, 0, SURFACE_SIZE, SURFACE_SIZE);
    context.restore();
    drawRim(rimAngle, rimAmount);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    rings.length = 0;
    indentation = null;
    recovery = null;
    context.clearRect(0, 0, SURFACE_SIZE, SURFACE_SIZE);
    drawRim(null, 0);
  }

  function animate(timestamp) {
    frame = null;
    if (reducedMotion.matches) {
      stop();
      return;
    }

    advance(timestamp);
    draw(timestamp);
    if (rings.length || recovery || (indentation && timestamp - indentation.start < FULL_PRESS_MS)) {
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
    recovery = { point, depth, start: now, duration: 140 + 270 * depth };
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
    const now = performance.now();
    indentation = { point: pointOnSurface(x, y), start: now };
    if (!reducedMotion.matches) requestFrame(now);
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

  function setSpeedPercent(percent) {
    if (!Number.isFinite(percent)) return;
    if (frame !== null) advance(performance.now());
    const { min, max } = RIPPLE_SPEED_PERCENT;
    speed = referenceSpeed * Math.max(min, Math.min(max, percent)) / 100;
  }

  return { addDrop, stop, setFlatStyle, setSpeedPercent, setIndentation, clearIndentation };
}
