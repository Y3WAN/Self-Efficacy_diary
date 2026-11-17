export const FULL_PRESS_MS = 760;
export const TAP_DEPTH = 0.22;
export const PRESS_TILT = -0.23;
export const PRESS_FLATTENING = 0.87;
const PRESS_FADE_IN_MS = 65;

export function smoothStep(progress) {
  return progress ** 2 * (3 - 2 * progress);
}

export function pressDepth(elapsed) {
  const progress = Math.min(1, elapsed / FULL_PRESS_MS);
  const depth = TAP_DEPTH + (1 - TAP_DEPTH) * (1 - (1 - progress) ** 1.65);
  return depth * smoothStep(Math.min(1, elapsed / PRESS_FADE_IN_MS));
}

export function pressRadiusRatio(depth) {
  return 0.19 + depth * 0.29;
}

export function pressRecoveryDuration(depth) {
  return 260 + 420 * depth;
}
