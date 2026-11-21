import { PRESS_FLATTENING, PRESS_TILT } from "./surfacePress.js";

const FULL_TURN = Math.PI * 2;
const RIM_POINTS = 64;
const CONTACT_SIDES = 14;
const MIN_REGION_AREA = 0.5;
// A crumb must occupy at most 1.2% of the original shell's projected area.
const CRUMBLE_AREA_RATIO = 0.012;

function sideOfEdge(start, end, point) {
  return (end.x - start.x) * (point.y - start.y) - (end.y - start.y) * (point.x - start.x);
}

function areaOf(points) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const from = points.at(index - 1);
    const to = points[index];
    twiceArea += from.x * to.y - to.x * from.y;
  }
  return twiceArea / 2;
}

function outlinePath(points) {
  return "M" + points.map(({ x, y }) => x.toFixed(3) + "," + y.toFixed(3)).join("L") + "Z";
}

function regionOf(points) {
  const area = areaOf(points);
  if (area < MIN_REGION_AREA) return null;
  return {
    points,
    area,
    path: outlinePath(points),
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

function ellipsePoints(center, radius, sides, flattening = 1, rotation = 0) {
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return Array.from({ length: sides }, (_, index) => {
    const angle = index * FULL_TURN / sides;
    const x = radius * Math.cos(angle);
    const y = radius * flattening * Math.sin(angle);
    return { x: center.x + x * cosine - y * sine, y: center.y + x * sine + y * cosine };
  });
}

function regionCenter(region) {
  const { points } = region;
  return {
    x: points.reduce((total, point) => total + point.x, 0) / points.length,
    y: points.reduce((total, point) => total + point.y, 0) / points.length,
  };
}

function pieceOf(id, depth, regions, fractured = false) {
  const area = regions.reduce((total, region) => total + region.area, 0);
  const path = regions.map((region) => region.path).join("");
  const center = regions.reduce((sum, region) => {
    const point = regionCenter(region);
    return { x: sum.x + point.x * region.area / area, y: sum.y + point.y * region.area / area };
  }, { x: 0, y: 0 });
  const inset = fractured ? Math.min(3, Math.sqrt(area) * 0.055) : 0;
  const scale = 1 - inset / Math.sqrt(area);
  // The outside of a contact may contain several convex regions. Render it as one shell piece.
  const transform = inset ? "translate(" + center.x + " " + center.y + ") scale(" + scale +
    ") translate(" + -center.x + " " + -center.y + ")" : undefined;
  return { id, depth, regions, area, path, transform, center };
}

export function createWaxShell(center, radius, seed = Math.floor(Math.random() * 0xffffffff)) {
  const whole = regionOf(ellipsePoints({ x: center, y: center }, radius, RIM_POINTS));
  return { pieces: [pieceOf(0, 0, [whole])], chips: [], wholeArea: whole.area, fractures: 0, nextPieceId: 1, seed };
}

function splitAlongEdge(points, start, end) {
  const inside = [];
  const outside = [];
  let previous = points.at(-1);
  let previousSide = sideOfEdge(start, end, previous);
  for (const point of points) {
    const side = sideOfEdge(start, end, point);
    if ((side >= 0) !== (previousSide >= 0)) {
      const progress = previousSide / (previousSide - side);
      const intersection = {
        x: previous.x + (point.x - previous.x) * progress,
        y: previous.y + (point.y - previous.y) * progress,
      };
      inside.push(intersection);
      outside.push(intersection);
    }
    (side >= 0 ? inside : outside).push(point);
    previous = point;
    previousSide = side;
  }
  return { inside, outside };
}

function cutContact(piece, boundary) {
  let inside = piece.points;
  const remainder = [];
  for (let index = 0; index < boundary.length; index++) {
    const split = splitAlongEdge(inside, boundary.at(index - 1), boundary[index]);
    if (split.inside.length < 3) return null;
    const outerPiece = regionOf(split.outside);
    if (outerPiece) remainder.push(outerPiece);
    inside = split.inside;
  }
  const chip = regionOf(inside);
  return chip ? { chip, remainder } : null;
}

function splitRegions(regions, point, turn) {
  const angle = turn * 2.39996;
  const end = { x: point.x + Math.cos(angle), y: point.y + Math.sin(angle) };
  const halves = [[], []];
  for (const region of regions) {
    const split = splitAlongEdge(region.points, point, end);
    const first = regionOf(split.inside);
    const second = regionOf(split.outside);
    if (first) halves[0].push(first);
    if (second) halves[1].push(second);
  }
  return halves.filter((half) => half.length > 0);
}
function contactWithPiece(piece, point, radius, boundary) {
  const touched = [];
  const remainder = [];
  for (const region of piece.regions) {
    const overlaps = point.x + radius >= region.left && point.x - radius <= region.right &&
      point.y + radius >= region.top && point.y - radius <= region.bottom;
    const cut = overlaps && cutContact(region, boundary);
    if (!cut) {
      remainder.push(region);
      continue;
    }
    touched.push(cut.chip);
    remainder.push(...cut.remainder);
  }
  return { touched, remainder };
}

export function fractureWaxShell(shell, point, radius, pieceLimit = Infinity) {
  const randomTurn = ((shell.seed * 1664525 + shell.fractures * 1013904223) >>> 0) / 0x100000000;
  const boundary = ellipsePoints(point, radius, CONTACT_SIDES, PRESS_FLATTENING, PRESS_TILT + randomTurn * 0.28);
  const pieces = [];
  const chips = [...shell.chips];
  let nextPieceId = shell.nextPieceId;
  let largestBreakArea = 0;

  for (const piece of shell.pieces) {
    // New fragments get their next fracture on a later press, even while the contact is dragged.
    if (piece.id >= pieceLimit) {
      pieces.push(piece);
      continue;
    }
    const { touched, remainder } = contactWithPiece(piece, point, radius, boundary);
    if (!touched.length) {
      pieces.push(piece);
      continue;
    }
    const area = touched.reduce((total, region) => total + region.area, 0);
    largestBreakArea = Math.max(largestBreakArea, area);
    const depth = piece.depth + 1;
    const crumbles = depth >= 3 && area / shell.wholeArea <= CRUMBLE_AREA_RATIO;
    if (remainder.length) pieces.push(pieceOf(piece.id, piece.depth, remainder));

    if (crumbles) {
      for (const region of touched) chips.push({ id: nextPieceId++, path: region.path, area: region.area, fadeMs: 190 });
      continue;
    }

    // Convex partitions describe the contact boundary, while each visible shard can include several partitions.
    // Repeated edge presses must still subdivide a large shard. Cutting through
    // a touched convex region's center prevents an unchanged shard gaining depth.
    const splitPoint = depth > 1
      ? regionCenter(touched.reduce((best, region) => region.area > best.area ? region : best))
      : point;
    const fragments = splitRegions(touched, splitPoint, nextPieceId + randomTurn * 6);
    if (depth === 1 && fragments.length === 2 && area / shell.wholeArea > 0.05) {
      const areaOfGroup = (regions) => regions.reduce((total, region) => total + region.area, 0);
      const largest = areaOfGroup(fragments[0]) >= areaOfGroup(fragments[1]) ? 0 : 1;
      const group = fragments[largest];
      const origin = regionCenter(group.reduce((best, region) => region.area > best.area ? region : best));
      fragments.splice(largest, 1, ...splitRegions(group, origin, nextPieceId + 1 + randomTurn * 6));
    }
    for (const regions of fragments) pieces.push(pieceOf(nextPieceId++, depth, regions, true));
  }
  if (!largestBreakArea) return null;
  const areaRatio = largestBreakArea / shell.wholeArea;
  const sound = areaRatio >= 0.06 ? "waxLarge" : areaRatio >= 0.017 ? "waxMedium" : "waxSmall";
  return {
    shell: { ...shell, pieces, chips, fractures: shell.fractures + 1, nextPieceId },
    sound,
    strength: Math.min(1, Math.sqrt(areaRatio / 0.06)),
  };
}
export function waxKeyboardPoint(shell) {
  let largest = null;
  for (const piece of shell.pieces) {
    for (const region of piece.regions) {
      if (!largest || region.area > largest.area) largest = region;
    }
  }
  return largest ? regionCenter(largest) : null;
}
