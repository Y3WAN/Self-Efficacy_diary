import { pressRecoveryDuration, smoothStep } from "./surfacePress.js";

const MAX_TRAIL_POINTS = 40;
const MIN_TRAIL_DISTANCE = 1;

// A departed point keeps the depth it had when the pointer left it.
export function createPressTrail() {
  let points = [];
  let head = null;
  let anchor = null;

  function move(x, y, depth, now) {
    if (anchor && Math.hypot(x - anchor.x, y - anchor.y) >= MIN_TRAIL_DISTANCE) {
      points.push({ ...anchor, depth, time: now, duration: pressRecoveryDuration(depth) });
      if (points.length > MAX_TRAIL_POINTS) points.shift();
      anchor = { x, y };
    }
    head = { x, y };
    anchor ??= head;
  }

  function samples(now, depth) {
    points = points.filter((point) => now - point.time < point.duration);
    const result = points.map((point) => ({
      x: point.x,
      y: point.y,
      depth: point.depth * (1 - smoothStep(Math.max(0, (now - point.time) / point.duration))),
    }));
    if (head) result.push({ ...head, depth });
    return result;
  }

  function clear() {
    points = [];
    head = null;
    anchor = null;
  }

  const hasTail = (now) => points.some((point) => now - point.time < point.duration);
  return { move, samples, clear, hasTail };
}

