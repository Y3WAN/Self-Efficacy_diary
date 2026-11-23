export const PULL_TAUT_DISTANCE = 104;
export const MAX_TETHER_DISTANCE = 128;
export const PULL_RIM_EASE_DISTANCE = 12;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function softLimitDistance(distance, start, limit, end) {
  if (distance <= start) return distance;
  const progress = clamp01((distance - start) / (end - start));
  const span = limit - start;
  // Unit slope at the start and zero slope at the cap.
  return limit - span * (1 - progress) ** ((end - start) / span);
}

export function pullStretchProgress(target, center = 100, startDistance = 94, endDistance = PULL_TAUT_DISTANCE) {
  // Geometry responds to stretch, not elapsed time since the latest click.
  // The tip must already be present when the tether begins moving the body.
  const distance = Math.hypot(target.x - center, target.y - center);
  const progress = clamp01((distance - startDistance) / Math.max(1, endDistance - startDistance));
  return progress * progress * (3 - 2 * progress);
}

export function pullExtension(distanceFromRim) {
  const ease = PULL_RIM_EASE_DISTANCE;
  if (distanceFromRim <= -ease) return 0;
  if (distanceFromRim >= ease) return distanceFromRim;
  // Match the stationary rim at the start and the tether's speed at the end.
  return (distanceFromRim + ease) ** 2 / (4 * ease);
}

export function blendPullTip(target, progress) {
  const blend = clamp01(progress);
  // The visible extent grows while the center follows the tether.
  return { x: target.x, y: target.y, radius: target.radius * blend, blend };
}

export function tetherSpringDisplacement(offset, slack, easeDistance, position, bounds) {
  const distance = Math.hypot(offset.x, offset.y);
  const extension = distance - slack;
  if (extension <= 0) return { x: 0, y: 0 };
  // Match the zero slope at slack and the spring's full slope at the end of the ramp.
  const tension = (extension < easeDistance ? extension ** 2 / (2 * easeDistance) : extension - easeDistance / 2) / distance;
  const clamp = (value, limit) => Math.max(0, Math.min(limit, value));
  return {
    x: clamp(position.x + offset.x * tension, bounds.width) - position.x,
    y: clamp(position.y + offset.y * tension, bounds.height) - position.y,
  };
}
