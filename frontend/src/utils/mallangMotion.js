import { blendPullTip, pullStretchProgress, softLimitDistance, tetherSpringDisplacement,
  MAX_TETHER_DISTANCE, PULL_RIM_EASE_DISTANCE, PULL_TAUT_DISTANCE } from "./mallangPull.js";

const TETHER_SPRING_TIME_MS = 43;
const CATCH_SPRING_TIME_MS = 40;
const TIP_FOLLOW_TIME_MS = 8;
const TIP_LIMIT_EASE_RANGE = 12;
const TENSION_EASE_DISTANCE = 8;
export const MAX_VISUAL_TETHER_DISTANCE = 166;
const TIP_RETURN_TIME_MS = 70;
const TIP_MERGE_RADIUS_RATIO = 0.55;
const DRAG_MASS = 1.6;
const DRAG_DAMPING = 0.95;
const CATCH_DAMPING = 1.2;
const WALL_BOUNCE = 0.5;
const COAST_FRICTION = 0.0052;
export const STOP_SPEED = 0.015;
export const BLOB_CENTER = 100;
export const BODY_RADIUS = 94;
export const PULL_RADIUS = 22;
const MAX_TETHER_ACCELERATION = 0.012;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function positionFromPoint(x, y, rect) {
  return {
    x: clamp((x - rect.left) / rect.width * 100, 0, 100),
    y: clamp((y - rect.top) / rect.height * 100, 0, 100),
  };
}

function tetherOffset(motion, x, y, limit = MAX_TETHER_DISTANCE) {
  const { rect, bodySize } = motion;
  const point = motion.tetherPoint ?? motion.pointer;
  const dx = point.x - rect.left - x;
  const dy = point.y - rect.top - y;
  const distance = Math.hypot(dx, dy);
  const maxDistance = limit * bodySize / (BLOB_CENTER * 2);
  const scale = distance > maxDistance ? maxDistance / distance : 1;
  return { x: dx * scale, y: dy * scale };
}

function tetherGoal(motion, x, y) {
  const { rect, pointer, bodySize } = motion;
  const centerX = rect.left + x, centerY = rect.top + y;
  if (motion.mode !== "grab") {
    const tip = motion.tetherPoint;
    if (!tip) return { x: centerX, y: centerY };
    const dx = tip.x - centerX, dy = tip.y - centerY;
    const distance = Math.hypot(dx, dy);
    // Stop pulling once the tip is well inside the body to soften the merge at the rim.
    const mergeRadius = BODY_RADIUS * TIP_MERGE_RADIUS_RATIO * bodySize / (BLOB_CENTER * 2);
    const scale = distance > mergeRadius ? mergeRadius / distance : 1;
    return { x: centerX + dx * scale, y: centerY + dy * scale };
  }

  const dx = pointer.x - centerX, dy = pointer.y - centerY;
  const distance = Math.hypot(dx, dy);
  const unitsPerPixel = BLOB_CENTER * 2 / bodySize;
  // Give the visible tip room to follow a fast hand after the body's spring is fully taut.
  const reach = softLimitDistance(distance * unitsPerPixel, MAX_VISUAL_TETHER_DISTANCE - TIP_LIMIT_EASE_RANGE,
    MAX_VISUAL_TETHER_DISTANCE, MAX_VISUAL_TETHER_DISTANCE + TIP_LIMIT_EASE_RANGE);
  const scale = distance ? reach / (distance * unitsPerPixel) : 1;
  return { x: centerX + dx * scale, y: centerY + dy * scale };
}

function stepTether(motion, x, y, elapsed) {
  const goal = tetherGoal(motion, x, y);
  if (!motion.tetherPoint) motion.tetherPoint = goal;
  const time = motion.mode === "grab" ? TIP_FOLLOW_TIME_MS : TIP_RETURN_TIME_MS;
  const decay = Math.exp(-elapsed / time);
  for (const axis of ["x", "y"]) {
    const distance = motion.tetherPoint[axis] - goal[axis];
    const speed = motion.tetherSpeed[axis];
    const slope = speed + distance / time;
    // Critically damped position and velocity carry over when the target changes.
    motion.tetherPoint[axis] = goal[axis] + (distance + slope * elapsed) * decay;
    motion.tetherSpeed[axis] = (speed - slope * elapsed / time) * decay;
  }
}

export function pullTarget(motion) {
  const { rect, bodySize, position } = motion;
  const unitsPerPixel = BLOB_CENTER * 2 / bodySize;
  const offset = tetherOffset(motion, position.x / 100 * rect.width, position.y / 100 * rect.height,
    MAX_VISUAL_TETHER_DISTANCE);
  return {
    x: BLOB_CENTER + offset.x * unitsPerPixel,
    y: BLOB_CENTER + offset.y * unitsPerPixel,
    radius: PULL_RADIUS,
  };
}

export function pulledCircle(motion, bodyRadius = BODY_RADIUS) {
  const target = pullTarget(motion);
  const transitionStart = bodyRadius - PULL_RIM_EASE_DISTANCE;
  const transitionEnd = bodyRadius + PULL_RIM_EASE_DISTANCE;
  const progress = pullStretchProgress(target, BLOB_CENTER, transitionStart, transitionEnd);
  if (progress === 0) return null;
  return { ...blendPullTip(target, progress), edgeRadius: bodyRadius };
}

export function updatePull(motion, bodyRadius = BODY_RADIUS) {
  motion.pull = pulledCircle(motion, bodyRadius);
  motion.pullStartRadius = bodyRadius;
}

export function beginPull(motion, bodyRadius = BODY_RADIUS) {
  const { position, rect } = motion;
  motion.tetherPoint ??= tetherGoal(motion, position.x / 100 * rect.width, position.y / 100 * rect.height);
  motion.tetherSpeed ??= { x: 0, y: 0 };
  updatePull(motion, bodyRadius);
}

export function springDisplacement(motion, x, y) {
  const { rect, target, bodySize } = motion;
  if (target) {
    return { x: target.x / 100 * rect.width - x, y: target.y / 100 * rect.height - y };
  }
  if (motion.mode !== "grab") return { x: 0, y: 0 };

  const offset = tetherOffset(motion, x, y);
  const pixelsPerUnit = bodySize / (BLOB_CENTER * 2);
  const slackRadius = Math.max(PULL_TAUT_DISTANCE - TENSION_EASE_DISTANCE / 2, motion.pullStartRadius ?? BODY_RADIUS);
  return tetherSpringDisplacement(offset, slackRadius * pixelsPerUnit, TENSION_EASE_DISTANCE * pixelsPerUnit,
    { x, y }, rect);
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

export function advanceMotion(motion, timestamp) {
  let elapsed = clamp(timestamp - motion.lastFrame, 0, 96);
  motion.lastFrame = Math.max(motion.lastFrame, timestamp);
  const { rect, bodySize } = motion;
  const springTime = motion.target ? CATCH_SPRING_TIME_MS : TETHER_SPRING_TIME_MS;
  const frequency = motion.mode === "grab" ? 1 / (springTime * Math.sqrt(DRAG_MASS)) : 0;
  const stiffness = frequency ** 2;
  const maxAcceleration = MAX_TETHER_ACCELERATION * bodySize / (BLOB_CENTER * 2);
  let x = motion.position.x * rect.width / 100;
  let y = motion.position.y * rect.height / 100;
  motion.tetherSpeed ??= { x: 0, y: 0 };
  // Small substeps keep the tether, body and wall response stable on slow frames.
  while (elapsed > 0) {
    const step = Math.min(elapsed, 8);
    stepTether(motion, x, y, step);
    elapsed -= step;
    if (motion.reducedMotion) continue;
    const spring = springDisplacement(motion, x, y);
    const length = Math.hypot(spring.x, spring.y);
    const accelerationScale = motion.target ? stiffness
      : stiffness * maxAcceleration / Math.hypot(maxAcceleration, length * stiffness);
    const springDamping = motion.target ? CATCH_DAMPING : DRAG_DAMPING * clamp(length / (bodySize * 0.04), 0, 1);
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
  }
  motion.position = { x: x / rect.width * 100, y: y / rect.height * 100 };
  if (motion.mode !== "grab" || !motion.tetherPoint) return false;
  const goal = tetherGoal(motion, x, y);
  return Math.hypot(goal.x - motion.tetherPoint.x, goal.y - motion.tetherPoint.y) > 0.1 ||
    Math.hypot(motion.tetherSpeed.x, motion.tetherSpeed.y) > 0.01;
}
