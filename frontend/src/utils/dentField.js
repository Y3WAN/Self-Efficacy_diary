import { roundDentPath } from "./dentPath.js";

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => { const t = clamp01(value); return t * t * (3 - 2 * t); };

// A fixed grid and one smooth height field keep lighting and distortion in agreement.
export function buildDentField(points, width, height, diameter, surfaceRadius = null, protectedCircle = null) {
  const margin = 24;
  const left = -margin;
  const top = -margin;
  const fieldWidth = width + margin * 2;
  const fieldHeight = height + margin * 2;
  const resolution = Math.min(1.5, 192 / Math.max(fieldWidth, fieldHeight));
  const columns = Math.max(32, Math.ceil(fieldWidth * resolution));
  const rows = Math.max(32, Math.ceil(fieldHeight * resolution));
  const stepX = fieldWidth / columns;
  const stepY = fieldHeight / rows;
  const radius = Math.max(1, diameter / 2);
  const samples = roundDentPath(points, width, height, Math.max(3, radius * 0.12))
    .map((point) => ({ ...point, depth: clamp01(point.depth) }));
  const segments = samples.map((end, index) => {
    const start = samples[Math.max(0, index - 1)];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return { start, dx, dy, lengthSquared: dx * dx + dy * dy, depthChange: end.depth - start.depth,
      minX: Math.min(start.x, end.x) - radius, maxX: Math.max(start.x, end.x) + radius,
      minY: Math.min(start.y, end.y) - radius, maxY: Math.max(start.y, end.y) + radius };
  });
  let depths = new Float32Array(columns * rows);
  const coverage = new Float32Array(depths.length);
  const bodyRadius = surfaceRadius && surfaceRadius * Math.min(width, height);
  const protection = protectedCircle && {
    x: protectedCircle.x * width, y: protectedCircle.y * height,
    radius: protectedCircle.radius * Math.min(width, height),
  };
  // The pulled tip merges back into the body instead of leaving a protected circular island.
  const protectionStrength = protection && bodyRadius
    ? smooth((Math.hypot(protection.x - width / 2, protection.y - height / 2) / bodyRadius - 0.65) / 0.35)
    : 1;

  for (let row = 0; row < rows; row++) {
    const y = top + (row + 0.5) * stepY;
    const rowSegments = segments.filter((segment) => y >= segment.minY && y <= segment.maxY);
    for (let column = 0; column < columns; column++) {
      const x = left + (column + 0.5) * stepX;
      const index = row * columns + column;
      let depth = 0;
      for (const segment of rowSegments) {
        if (x < segment.minX || x > segment.maxX) continue;
        const { start, dx, dy, lengthSquared, depthChange } = segment;
        const t = lengthSquared ? clamp01(((x - start.x) * dx + (y - start.y) * dy) / lengthSquared) : 0;
        const pressure = start.depth + depthChange * t;
        const localRadius = radius * (0.68 + 0.32 * Math.sqrt(pressure));
        const q = ((x - start.x - dx * t) ** 2 + (y - start.y - dy * t) ** 2) / localRadius ** 2;
        depth = Math.max(depth, pressure * Math.max(0, 1 - q) ** 3);
      }
      depths[index] = depth;
      let edge = bodyRadius
        ? smooth((bodyRadius - Math.hypot(x - width / 2, y - height / 2)) / (bodyRadius * 0.2))
        : smooth(Math.min(x, y, width - x, height - y) / 7);
      if (protection) {
        const outside = smooth((Math.hypot(x - protection.x, y - protection.y) - protection.radius) /
          Math.max(2, protection.radius * 0.35));
        edge *= 1 - protectionStrength * (1 - outside);
      }
      coverage[index] = edge;
    }
  }

  // Smooth the joins before taking derivatives; picking a segment's direction caused folds.
  for (let pass = 0; pass < 4; pass++) {
    const blurred = new Float32Array(depths.length);
    for (let row = 1; row < rows - 1; row++) {
      for (let column = 1; column < columns - 1; column++) {
        const i = row * columns + column;
        blurred[i] = (depths[i] * 4 + (depths[i - 1] + depths[i + 1] +
          depths[i - columns] + depths[i + columns]) * 2 + depths[i - columns - 1] +
          depths[i - columns + 1] + depths[i + columns - 1] + depths[i + columns + 1]) / 16;
      }
    }
    depths = blurred;
  }

  const displacement = new Uint8ClampedArray(depths.length * 4);
  const shade = new Uint8ClampedArray(displacement.length);
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      const pixel = index * 4;
      const dx = (depths[row * columns + Math.min(column + 1, columns - 1)] -
        depths[row * columns + Math.max(column - 1, 0)]) * radius / (2 * stepX);
      const dy = (depths[Math.min(row + 1, rows - 1) * columns + column] -
        depths[Math.max(row - 1, 0) * columns + column]) * radius / (2 * stepY);
      const slopeX = -dx * 0.55;
      const slopeY = -dy * 0.55;
      const normalX = slopeX / Math.sqrt(1 + slopeX * slopeX);
      const normalY = slopeY / Math.sqrt(1 + slopeY * slopeY);
      const edge = coverage[index];
      displacement[pixel] = 128 + 72 * normalX * edge;
      displacement[pixel + 1] = 128 + 72 * normalY * edge;
      displacement[pixel + 2] = 128;
      displacement[pixel + 3] = 255;
      const lighting = (normalX + normalY) * 0.707;
      const light = smooth((lighting - 0.04) / 0.55);
      shade[pixel] = 147 + 108 * light;
      shade[pixel + 1] = 71 + 174 * light;
      shade[pixel + 2] = 108 + 143 * light;
      // Restrained rose shading keeps the original body color visible inside the groove.
      const softSlope = Math.sqrt(lighting * lighting + 0.01) - 0.1;
      const intensity = 0.17 * depths[index] + softSlope * (lighting > 0 ? 0.38 : 0.22);
      shade[pixel + 3] = 255 * edge * intensity / Math.sqrt(1 + (intensity / 0.35) ** 2);
    }
  }
  return { columns, rows, left, top, width: fieldWidth, height: fieldHeight, displacement, shade, depths, coverage };
}

