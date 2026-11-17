export const PULL_TAUT_DISTANCE = 104;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function pullStretchProgress(target, center = 100, bodyRadius = 94, tautDistance = PULL_TAUT_DISTANCE) {
  // Geometry responds to stretch, not elapsed time since the latest click.
  // The tip must already be present when the tether begins moving the body.
  const startDistance = bodyRadius;
  const distance = Math.hypot(target.x - center, target.y - center);
  const progress = clamp01((distance - startDistance) / Math.max(1, tautDistance - startDistance));
  return progress * progress * (3 - 2 * progress);
}

export function blendPullTip(target, progress) {
  const blend = clamp01(progress);
  // The tip stays under the pointer; only its extent and visibility ease out of the rim.
  return { x: target.x, y: target.y, radius: target.radius * blend, blend };
}

export function tetherSpringDisplacement(offset, slack, position, bounds) {
  const distance = Math.hypot(offset.x, offset.y);
  const tension = distance > slack ? 1 - slack / distance : 0;
  // Visual appearance restarts on every grab. Physical tension depends only on the actual tether.
  const clamp = (value, limit) => Math.max(0, Math.min(limit, value));
  return {
    x: clamp(position.x + offset.x * tension, bounds.width) - position.x,
    y: clamp(position.y + offset.y * tension, bounds.height) - position.y,
  };
}
