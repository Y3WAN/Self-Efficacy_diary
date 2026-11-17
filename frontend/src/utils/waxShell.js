const FULL_TURN = Math.PI * 2;
const RIM_POINTS = 48;
const MIN_PIECE_AREA_RATIO = 0.032;
const MAX_CRACK_DEPTH = 4;
const SEAM_TOLERANCE = 3;

function cross(from, to, point) {
  return (to.x - from.x) * (point.y - from.y) - (to.y - from.y) * (point.x - from.x);
}

function clipToLeft(points, origin, ray) {
  const inside = [];
  let previous = points.at(-1);
  if (!previous) return inside;
  let previousSide = cross(origin, ray, previous);

  for (const point of points) {
    const side = cross(origin, ray, point);
    if ((side >= 0) !== (previousSide >= 0)) {
      const progress = previousSide / (previousSide - side);
      inside.push({
        x: previous.x + (point.x - previous.x) * progress,
        y: previous.y + (point.y - previous.y) * progress,
      });
    }
    if (side >= 0) inside.push(point);
    previous = point;
    previousSide = side;
  }
  return inside;
}

function createPiece(id, outline, depth) {
  let twiceArea = 0;
  let weightedX = 0;
  let weightedY = 0;
  let previous = outline.at(-1);
  for (const point of outline) {
    const weight = previous.x * point.y - point.x * previous.y;
    twiceArea += weight;
    weightedX += (previous.x + point.x) * weight;
    weightedY += (previous.y + point.y) * weight;
    previous = point;
  }
  if (twiceArea < 0.5) return null;

  const center = { x: weightedX / (3 * twiceArea), y: weightedY / (3 * twiceArea) };
  const scale = Math.max(0.75, 1 - depth * 0.024 - depth ** 2 * 0.016);
  const points = outline.map(({ x, y }) => ({
    x: center.x + (x - center.x) * scale,
    y: center.y + (y - center.y) * scale,
  }));
  return {
    id, center, depth, points,
    area: twiceArea / 2,
    svgPoints: points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" "),
  };
}

export function createWaxShell(center, radius) {
  const rim = Array.from({ length: RIM_POINTS }, (_, index) => {
    const angle = index * FULL_TURN / RIM_POINTS;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  });
  const whole = createPiece("shell", rim, 0);
  return { pieces: [whole], chips: [], wholeArea: whole.area, minArea: whole.area * MIN_PIECE_AREA_RATIO };
}

function distanceToSegment(point, from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx ** 2 + dy ** 2;
  const projection = lengthSquared
    ? Math.max(0, Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared))
    : 0;
  return Math.hypot(point.x - from.x - dx * projection, point.y - from.y - dy * projection);
}

function containsPoint(piece, point) {
  const { points } = piece;
  return points.every((to, index) => cross(points.at(index - 1), to, point) >= -0.001);
}

function findTappedPiece(pieces, point) {
  if (!point) {
    return pieces.reduce((largest, piece) => (!largest || piece.area > largest.area ? piece : largest), null);
  }

  let nearest;
  let nearestDistance = SEAM_TOLERANCE;
  for (const piece of pieces) {
    const { points } = piece;
    if (containsPoint(piece, point)) return piece;
    for (let index = 0; index < points.length; index++) {
      const distance = distanceToSegment(point, points.at(index - 1), points[index]);
      if (distance >= nearestDistance) continue;
      nearestDistance = distance;
      nearest = piece;
    }
  }
  return nearest;
}

function splitPiece(piece, point, randomValues) {
  // Pull an edge hit slightly inward so it can split the piece on both sides.
  const inset = containsPoint(piece, point) ? 0.045 : 0.2;
  const origin = {
    x: point.x + (piece.center.x - point.x) * inset,
    y: point.y + (piece.center.y - point.y) * inset,
  };
  const count = piece.depth ? 3 : 4 + Math.floor(randomValues[0] * 2);
  const rotation = randomValues[1] * FULL_TURN;
  const rays = Array.from({ length: count }, (_, index) => {
    const angle = rotation + (index + (randomValues[index + 2] - 0.5) * 0.44) * FULL_TURN / count;
    return { x: origin.x + Math.cos(angle), y: origin.y + Math.sin(angle) };
  });

  return rays.flatMap((ray, index) => {
    const nextRay = rays[(index + 1) % count];
    const reversedNextRay = { x: 2 * origin.x - nextRay.x, y: 2 * origin.y - nextRay.y };
    const sector = clipToLeft(clipToLeft(piece.points, origin, ray), origin, reversedNextRay);
    if (sector.length < 3) return [];
    const child = createPiece(`${piece.id}.${index}`, sector, piece.depth + 1);
    return child ? [child] : [];
  });
}

export function fractureWaxShell(shell, point, randomValues) {
  const target = findTappedPiece(shell.pieces, point);
  if (!target) return null;

  const children = splitPiece(target, point ?? target.center, randomValues);
  const pieces = shell.pieces.filter((piece) => piece !== target);
  const chips = [...shell.chips];
  if (children.length > 1) {
    for (const child of children) {
      if (child.area <= shell.minArea || child.depth >= MAX_CRACK_DEPTH) chips.push(child);
      else pieces.push(child);
    }
  } else {
    chips.push(target);
  }
  const areaRatio = target.area / shell.wholeArea;
  const sound = areaRatio >= 0.28 ? "waxLarge" : areaRatio >= 0.095 ? "waxMedium" : "waxSmall";
  return { shell: { ...shell, pieces, chips }, sound };
}
