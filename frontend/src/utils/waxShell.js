const FULL_TURN = 2 * Math.PI;
const RIM_POINTS = 84;
const MIN_CRUMB_EDGE = 6;

function mix(from, to, fraction) {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

function pathOf(points) {
  return "M" + points.map(({ x, y }) => x.toFixed(3) + "," + y.toFixed(3)).join("L");
}

function makePiece(id, points, center, opening) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const from = points.at(index - 1), to = points[index];
    twiceArea += from.x * to.y - to.x * from.y;
  }
  return {
    id, points, center, opening, area: twiceArea / 2, path: pathOf(points) + "Z",
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

export function createWaxShell(center, radius, seed = Math.floor(Math.random() * 0xffffffff)) {
  const rim = Array.from({ length: RIM_POINTS }, (_, index) => {
    const angle = index / RIM_POINTS * FULL_TURN;
    return { x: center + radius * Math.cos(angle), y: center + radius * Math.sin(angle) };
  });
  const intact = makePiece(0, rim, { x: center, y: center });
  return { center, radius, seed, intact, pieces: [intact], chips: [], fractures: 0, preview: null };
}

function randomSites(shell, point, random) {
  const { center, radius } = shell;
  const distance = Math.hypot(point.x - center, point.y - center);
  const reach = distance > radius * .88 ? radius * .88 / distance : 1;
  // Give the finger its own plate, with clear space around it before the nearest seam.
  const sites = [mix(shell.intact.center, point, reach)];
  const count = 7 + Math.floor(random() * 2);
  while (sites.length < count) {
    let best, clearance = -Infinity;
    for (let attempt = 0; attempt < 20; attempt++) {
      const angle = random() * FULL_TURN;
      const distance = Math.sqrt(random()) * radius * .86;
      const candidate = { x: center + Math.cos(angle) * distance, y: center + Math.sin(angle) * distance };
      const spacing = Math.min(...sites.map((site) => Math.hypot(candidate.x - site.x, candidate.y - site.y)));
      if (spacing > clearance) {
        clearance = spacing;
        best = candidate;
      }
    }
    sites.push(best);
  }
  return sites;
}

function cutCell(points, site, neighbor) {
  const middle = mix(site, neighbor, .5);
  const dx = neighbor.x - site.x, dy = neighbor.y - site.y;
  const distance = (point) => (point.x - middle.x) * dx + (point.y - middle.y) * dy;
  const result = [];
  let previous = points.at(-1);
  let previousDistance = distance(previous);
  for (const point of points) {
    const nextDistance = distance(point);
    if ((previousDistance > 0) !== (nextDistance > 0)) {
      result.push(mix(previous, point, previousDistance / (previousDistance - nextDistance)));
    }
    if (nextDistance <= 0) result.push(point);
    previous = point;
    previousDistance = nextDistance;
  }
  return result;
}

function projectToEdge(point, start, end) {
  const dx = end.x - start.x, dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  const fraction = length ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / length ** 2)) : 0;
  const closest = mix(start, end, fraction);
  return { length, fraction, distance: Math.hypot(point.x - closest.x, point.y - closest.y) };
}

function waxEdges(cells, random) {
  const allEdges = new Map();
  const keyOf = ({ x, y }) => x.toFixed(5) + "," + y.toFixed(5);
  const edgesByCell = cells.map((points) => points.map((end, index) => {
    const start = points.at(index - 1);
    const startKey = keyOf(start), endKey = keyOf(end);
    const forward = startKey < endKey;
    const key = forward ? startKey + " " + endKey : endKey + " " + startKey;
    let edge = allEdges.get(key);
    if (!edge) {
      const [from, to] = forward ? [start, end] : [end, start];
      edge = { from, to, uses: 0, points: [from, to] };
      allEdges.set(key, edge);
    }
    edge.uses++;
    return { edge, forward };
  }));

  // Adjacent plates reuse the same chipped seam in opposite directions.
  const edges = [...allEdges.values()];
  const seams = edges.filter((edge) => edge.uses === 2);
  for (const edge of seams) {
    const { from, to } = edge;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length < 3) continue;
    const normal = { x: (from.y - to.y) / length, y: (to.x - from.x) / length };
    const bends = [0.22 + random() * .14, .44 + random() * .16, .72 + random() * .13].map((fraction) => {
      const point = mix(from, to, fraction);
      const clearance = Math.min(...edges.filter((other) => other !== edge)
        .map((other) => projectToEdge(point, other.from, other.to).distance));
      const wobble = Math.min(length * .13, 6.5, clearance * .36) * (random() > .5 ? 1 : -1);
      return { x: point.x + normal.x * wobble, y: point.y + normal.y * wobble };
    });
    edge.points = [from, ...bends, to];
  }
  return { edgesByCell, seams };
}

export function markWaxShell(shell, point) {
  if (shell.preview || shell.fractures) return shell;
  let seed = shell.seed;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const sites = randomSites(shell, point, random);
  const cells = sites.map((site) => sites.reduce((points, neighbor) =>
    neighbor === site ? points : cutCell(points, site, neighbor), shell.intact.points));
  const { edgesByCell, seams } = waxEdges(cells, random);
  const pieces = edgesByCell.map((edges, index) => {
    const outline = edges.flatMap(({ edge, forward }) => forward
      ? edge.points.slice(0, -1) : edge.points.slice(1).reverse());
    const shardCenter = sites[index];
    const bearing = Math.atan2(shardCenter.y - shell.center, shardCenter.x - shell.center);
    const lift = index === 0 ? .12 : .15 + random() * .82;
    const gap = index === 0 ? .3 : .85 + 1.7 * lift;
    const opening = {
      x: Math.cos(bearing) * gap, y: Math.sin(bearing) * gap,
      turn: (random() > .5 ? 1 : -1) * (0.35 + 2 * lift),
      scale: index === 0 ? .991 : .963 - .013 * lift, lift,
    };
    return makePiece(index + 1, outline, shardCenter, opening);
  });

  const startingSeams = seams.filter(({ points }) => points.length > 2)
    .map((edge) => ({ edge, distance: projectToEdge(point, edge.from, edge.to).distance }))
    .sort((a, b) => b.distance - a.distance)
    .slice(0, 2).map(({ edge }) => edge);
  const hairlines = startingSeams.map(({ points }) =>
    pathOf([mix(points[1], points[2], .25), points[2], mix(points[2], points[3], .57)]));
  const traces = seams.map((edge) => ({
    path: pathOf(edge.points), delay: startingSeams.includes(edge) ? 0 : 24 + Math.round(random() * 104),
  }));
  return { ...shell, preview: { pieces, hairlines, traces } };
}

export function containsWaxPiece(piece, x, y) {
  let inside = false;
  for (let index = 0; index < piece.points.length; index++) {
    const a = piece.points.at(index - 1), b = piece.points[index];
    if ((a.y > y) !== (b.y > y) && x < a.x + (b.x - a.x) * (y - a.y) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

function distanceToPiece(piece, point) {
  let nearest = Infinity;
  for (let index = 0; index < piece.points.length; index++) {
    const { distance } = projectToEdge(point, piece.points.at(index - 1), piece.points[index]);
    nearest = Math.min(nearest, distance);
  }
  return nearest;
}

function side(start, end, point) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function edgesCross(a, b, c, d) {
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function splitCrumbs(piece, edge) {
  const { start, end, length, fraction, index } = edge;
  const half = Math.min(.40, 10.5 / length);
  const middle = Math.max(half + .025, Math.min(1 - half - .025, fraction));
  const before = mix(start, end, middle - half);
  const after = mix(start, end, middle + half);
  const base = mix(before, after, .58);
  const normal = { x: (start.y - end.y) / length, y: (end.x - start.x) / length };

  // The notch and its crumbs partition a real patch of the plate.
  for (let depth = Math.min(14, length * half * 1.9); depth >= 2; depth *= .65) {
    const tip = { x: base.x + normal.x * depth, y: base.y + normal.y * depth };
    if (!containsWaxPiece(piece, tip.x, tip.y) || piece.points.some((to, other) => {
      if (other === index) return false;
      const from = piece.points.at(other - 1);
      return edgesCross(before, tip, from, to) || edgesCross(tip, after, from, to);
    })) continue;
    const split = mix(before, after, .42);
    const loose = makePiece(piece.id, [...piece.points.slice(0, index), before, tip, after,
      ...piece.points.slice(index)], piece.center, piece.opening);
    const crumbs = [[before, split, tip], [split, after, tip]].map((points, number) => ({
      ...makePiece(piece.id + "-crumb-" + number, points, piece.center, piece.opening),
      isCrumb: true,
      drift: number === 0 ? -13 : 12,
    }));
    return { loose, crumbs };
  }
  return null;
}

function chipWaxEdge(piece, point) {
  const edges = piece.points.map((end, index) => {
    const start = piece.points.at(index - 1);
    return { start, end, index, ...projectToEdge(point, start, end) };
  }).filter(({ length }) => length >= MIN_CRUMB_EDGE).sort((a, b) => a.distance - b.distance);
  for (const edge of edges) {
    const result = splitCrumbs(piece, edge);
    if (result) return result;
  }
  return { loose: piece, crumbs: [] };
}

export function fractureWaxShell(shell, point) {
  if (!shell.pieces.length || Math.hypot(point.x - shell.center, point.y - shell.center) > shell.radius * 1.11) return null;
  if (!shell.fractures) {
    if (!shell.preview) return null;
    const { pieces, traces, hairlines } = shell.preview;
    return {
      shell: { ...shell, pieces, preview: null, fractures: 1 },
      traces, hairlines, sound: "waxLarge", strength: 1,
    };
  }

  const protectedPiece = shell.pieces.length > 1 && shell.pieces.find((piece) =>
    containsWaxPiece(piece, point.x, point.y));
  let nearest = Infinity, selected;
  for (const piece of shell.pieces) {
    if (piece === protectedPiece) continue;
    const distance = distanceToPiece(piece, point);
    if (distance < nearest) {
      nearest = distance;
      selected = piece;
    }
  }
  const areaRatio = selected.area / shell.intact.area;
  return {
    shell: { ...shell, pieces: shell.pieces.filter((piece) => piece !== selected), fractures: shell.fractures + 1 },
    ...chipWaxEdge(selected, point),
    sound: areaRatio < .1 ? "waxSmall" : "waxMedium",
    strength: Math.min(1, .5 + areaRatio * 2),
  };
}

export function waxKeyboardPoint(shell) {
  const largest = shell.pieces.reduce((best, piece) => !best || piece.area > best.area ? piece : best, null);
  return largest?.center ?? null;
}
