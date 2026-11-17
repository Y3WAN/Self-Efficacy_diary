const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t, depth: a.depth + (b.depth - a.depth) * t });

// Corner cutting stays inside the recorded path's hull, including sharp reversals.
export function roundDentPath(points, width, height, spacing = 4) {
  let path = [];
  for (const point of points) {
    const next = { x: point.x * width, y: point.y * height, depth: point.depth };
    const previous = path.at(-1);
    if (previous && Math.hypot(next.x - previous.x, next.y - previous.y) < 0.25) path[path.length - 1] = next;
    else path.push(next);
  }
  if (path.length < 3) return path;
  for (let pass = 0; pass < 2; pass++) {
    const rounded = [path[0]];
    for (let index = 1; index < path.length; index++) {
      rounded.push(mix(path[index - 1], path[index], 0.25), mix(path[index - 1], path[index], 0.75));
    }
    rounded.push(path.at(-1));
    path = rounded;
  }
  const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const step = Math.max(spacing, total / 128);
  const result = [path[0]];
  let distance = step;
  let traversed = 0;
  for (let index = 0; index < lengths.length; index++) {
    const length = lengths[index];
    while (length > 0 && distance < traversed + length) {
      result.push(mix(path[index], path[index + 1], (distance - traversed) / length));
      distance += step;
    }
    traversed += length;
  }
  result.push(path.at(-1));
  return result;
}
