import { blendPullTip, pullStretchProgress, tetherSpringDisplacement, PULL_TAUT_DISTANCE } from "./mallangPull.js";

const TETHER_SPRING_TIME_MS = 21;
const CATCH_SPRING_TIME_MS = 40;
const DRAG_MASS = 1.6;
const DRAG_DAMPING = 0.6;
const CATCH_DAMPING = 1.2;
const WALL_BOUNCE = 0.5;
const COAST_FRICTION = 0.0052;
export const STOP_SPEED = 0.03;
export const BLOB_CENTER = 100;
export const BODY_RADIUS = 94;
const PULL_RADIUS = 38;
export const MAX_TETHER_DISTANCE = 128;
const MAX_TETHER_ACCELERATION = 0.027;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function positionFromPoint(x, y, rect) {
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

export function followTether(motion) {
  const { rect, position, pointer } = motion;
  const x = position.x / 100 * rect.width;
  const y = position.y / 100 * rect.height;
  const offset = tetherOffset(motion, x, y, pointer);
  motion.tetherPoint = { x: rect.left + x + offset.x, y: rect.top + y + offset.y };
  return false;
}
export function pullTarget(motion) {
  const { rect, bodySize, position } = motion;
  const unitsPerPixel = BLOB_CENTER * 2 / bodySize;
  const offset = tetherOffset(motion, position.x / 100 * rect.width, position.y / 100 * rect.height);
  return {
    x: BLOB_CENTER + offset.x * unitsPerPixel,
    y: BLOB_CENTER + offset.y * unitsPerPixel,
    radius: PULL_RADIUS,
  };
}

export function pulledCircle(motion) {
  const target = pullTarget(motion);
  const progress = pullStretchProgress(target, BLOB_CENTER, BODY_RADIUS, PULL_TAUT_DISTANCE);
  return progress > 0 ? blendPullTip(target, progress) : null;
}

export function beginPull(motion) {
  followTether(motion);
  motion.pull = pulledCircle(motion);
}

export function retractCircle({ start, duration, from }, timestamp) {
  const progress = clamp((timestamp - start) / duration, 0, 1);
  if (progress === 1) return null;
  const distance = 1 - progress ** 1.55 * (2.55 - 1.55 * progress);
  const shrink = clamp((progress - 0.23) / 0.77, 0, 1);
  return {
    x: BLOB_CENTER + (from.x - BLOB_CENTER) * distance,
    y: BLOB_CENTER + (from.y - BLOB_CENTER) * distance,
    radius: from.radius * (1 - 0.95 * shrink ** 1.35),
    blend: from.blend ?? 1,
  };
}

export function springDisplacement(motion, x, y) {
  const { rect, target, bodySize } = motion;
  if (target) {
    return { x: target.x / 100 * rect.width - x, y: target.y / 100 * rect.height - y };
  }
  if (motion.mode !== "grab") return { x: 0, y: 0 };

  // A loose connection applies no force. Once taut, pull along the line to the small circle.
  const offset = tetherOffset(motion, x, y);
  const slack = PULL_TAUT_DISTANCE * bodySize / (BLOB_CENTER * 2);
  // Only the body hits the wall. Stop pulling on an axis once it reaches that edge.
  return tetherSpringDisplacement(offset, slack, { x, y }, rect);
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
      // The acceleration cap is immediate: a new grab must not wait for a per-grab force ramp.
      accelerationScale = springLength > 0 ? limitedAcceleration / springLength : 0;
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

export function advanceMotion(motion, timestamp) {
  const elapsed = clamp(timestamp - motion.lastFrame, 0, 48);
  motion.lastFrame = Math.max(motion.lastFrame, timestamp);
  const tetherMoving = motion.mode === "grab" && followTether(motion, elapsed);
  if (!motion.reducedMotion) stepMotion(motion, elapsed, timestamp);
  return { tetherMoving };
}

