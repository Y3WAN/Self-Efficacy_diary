const SEGMENTS = 96;
export const MAX_PRESS_BULGE = 18;
const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

export function pressureRimRadii(points, center = 100, radius = 94, waveAngle = null, waveAmount = 0) {
  const contacts = points.map((point) => {
    const x = (point.x - 0.5) * center * 2;
    const y = (point.y - 0.5) * center * 2;
    return { angle: Math.atan2(y, x), depth: point.depth,
      edge: smooth((Math.hypot(x, y) / radius - 0.65) / 0.35) };
  }).filter((point) => point.edge > 0 && point.depth > 0);
  return Array.from({ length: SEGMENTS }, (_, index) => {
    const angle = index / SEGMENTS * Math.PI * 2;
    let weightSum = 0;
    let depthSum = 0;
    let strongest = 0;
    for (const point of contacts) {
      const difference = Math.atan2(Math.sin(angle - point.angle), Math.cos(angle - point.angle));
      const weight = Math.exp(-((difference / 0.4) ** 2)) * point.edge;
      weightSum += weight;
      depthSum += weight * point.depth;
      strongest = Math.max(strongest, weight);
    }
    const pressure = weightSum ? depthSum / weightSum * strongest : 0;
    const waveDifference = waveAngle === null ? 0 : Math.atan2(Math.sin(angle - waveAngle), Math.cos(angle - waveAngle));
    const wave = waveAmount * radius * (waveAngle === null ? 0.45 : Math.exp(-((waveDifference / 0.42) ** 2)));
    return radius + MAX_PRESS_BULGE * clamp01(pressure) + Math.max(0, wave);
  });
}

export function pressureRimPath(points, center = 100, radius = 94, waveAngle = null, waveAmount = 0) {
  const radii = pressureRimRadii(points, center, radius, waveAngle, waveAmount);
  const vertices = radii.map((r, i) => ({ x: center + Math.cos(i / SEGMENTS * Math.PI * 2) * r,
    y: center + Math.sin(i / SEGMENTS * Math.PI * 2) * r }));
  const at = (index) => vertices[(index + SEGMENTS) % SEGMENTS];
  const format = (value) => value.toFixed(3);
  let path = `M ${format(vertices[0].x)} ${format(vertices[0].y)}`;
  for (let i = 0; i < SEGMENTS; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    path += ` C ${format(b.x + (c.x - a.x) / 6)} ${format(b.y + (c.y - a.y) / 6)}` +
      ` ${format(c.x - (d.x - b.x) / 6)} ${format(c.y - (d.y - b.y) / 6)} ${format(c.x)} ${format(c.y)}`;
  }
  return path + " Z";
}
