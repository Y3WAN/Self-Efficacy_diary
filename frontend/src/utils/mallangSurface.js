import { MATERIAL, membranePath, membraneRadii, membraneRadiusAt, retractMembraneCap } from "./mallangMaterial.js";
import { MAX_VISUAL_TETHER_DISTANCE } from "./mallangMotion.js";
import { PULL_RIM_EASE_DISTANCE, softLimitDistance } from "./mallangPull.js";
import { smoothStep } from "./surfacePress.js";
import { createMallangRelief, trailDepthAt, trailProfileAt } from "./mallangRelief.js";
import { getMallangPalette, rgbColor } from "./mallangTheme.js";

const VIEW_ORIGIN = -100;
const VIEW_SIZE = 400;
const SHADE_STEP = 2;
const SHADE_GRID = VIEW_SIZE / SHADE_STEP + 1;
const PULLED_DENT_FRONT_GAP = 30;
const PULLED_DENT_LIMIT = MAX_VISUAL_TETHER_DISTANCE - PULLED_DENT_FRONT_GAP;
const INNER_DENT_LIMIT = 61;
const PULLED_RELEASE_MS = 340;
const FAST_SWIPE_RELEASE_MS = 430;
const RELEASE_SPEED_START = 420;
const RELEASE_SPEED_END = 1400;
const CAP_MERGE_REACH = 72;
const OUTER_TRAIL_MERGE_REACH = 84;
const TRAIL_SAMPLE_SPACING = 6;
const MAX_TRAIL_DEPARTURE_INTERVAL_MS = 64;
const TRAIL_SPEED_THRESHOLD = 80;
const TRAIL_SPEED_PER_RECOVERY_STEP = 200;
const MAX_TRAIL_RECOVERY_RATE = 11;
const RIPPLE_SHADOW_GAIN = .35;
const RIPPLE_SHEEN_GAIN = 1.6;
const MAX_RIPPLE_SHEEN = .22;
const smooth = (t) => smoothStep(Math.max(0, Math.min(1, t)));

function innerDentReach(distance) {
  return softLimitDistance(distance, MATERIAL.reliefLimitStart, INNER_DENT_LIMIT, MATERIAL.reliefLimit);
}

function contactRelief(load, tip) {
  if (!load?.depth) return null;
  const { center } = MATERIAL;
  const loadX = load.x - center, loadY = load.y - center;
  const distance = Math.hypot(loadX, loadY);
  const innerReach = innerDentReach(distance);
  const innerScale = distance ? innerReach / distance : 0;
  let x = center + loadX * innerScale, y = center + loadY * innerScale;
  if (tip) {
    const tipX = tip.x - center, tipY = tip.y - center;
    const tipDistance = Math.hypot(tipX, tipY);
    const start = (tip.edgeRadius ?? MATERIAL.radius) - PULL_RIM_EASE_DISTANCE;
    const blend = smooth((tipDistance - start) / (MAX_VISUAL_TETHER_DISTANCE - start));
    const scale = tipDistance ? PULLED_DENT_LIMIT / tipDistance : 0;
    x += (center + tipX * scale - x) * blend;
    y += (center + tipY * scale - y) * blend;
  }
  return reliefPoint(x, y, load.depth);
}

function reliefPoint(x, y, depth) {
  const dx = x - MATERIAL.center, dy = y - MATERIAL.center;
  const reach = Math.hypot(dx, dy);
  return { x, y, depth, ux: reach ? dx / reach : 1, uy: reach ? dy / reach : 0 };
}

function stretchAt(point) {
  if (!point) return 0;
  const reach = Math.hypot(point.x - MATERIAL.center, point.y - MATERIAL.center);
  return smooth((reach - INNER_DENT_LIMIT) / (MATERIAL.radius - INNER_DENT_LIMIT));
}

function moveWithCap(point, cap, attachment) {
  const x = cap.x + (point.x - cap.startX) * cap.scale;
  const y = cap.y + (point.y - cap.startY) * cap.scale;
  return { x: point.x + (x - point.x) * attachment, y: point.y + (y - point.y) * attachment };
}

function blendRadii(from, to, progress) {
  return to.map((radius, index) => from[index] + (radius - from[index]) * progress);
}

function waveAnchor(point, radii) {
  const dx = point.x - MATERIAL.center, dy = point.y - MATERIAL.center;
  const angle = Math.atan2(dy, dx);
  const reach = Math.hypot(dx, dy);
  const innerReach = Math.min(reach, INNER_DENT_LIMIT);
  // The inner surface travels with the body as-is. The outer surface stretches with the rim.
  const outerFraction = radii && reach > innerReach
    ? Math.min(.96, (reach - innerReach) / (membraneRadiusAt(radii, angle) - innerReach)) : 0;
  return { angle, innerReach, outerFraction };
}

function createBareSamples({ skin, skinEdge, skinLight }) {
  const size = SHADE_GRID ** 2;
  const distances = new Float64Array(size), angles = new Float64Array(size);
  const colors = new Float64Array(size * 3);
  const { center, radius: bodyRadius } = MATERIAL;
  for (let row = 0; row < SHADE_GRID; row++) for (let col = 0; col < SHADE_GRID; col++) {
    const index = row * SHADE_GRID + col;
    const dx = VIEW_ORIGIN + col * SHADE_STEP - center, dy = VIEW_ORIGIN + row * SHADE_STEP - center;
    const distance = Math.hypot(dx, dy);
    distances[index] = distance;
    angles[index] = Math.atan2(dy, dx);
    // The silhouette can stretch, while the base palette stays in material space.
    const edge = smooth((distance / bodyRadius - .35) / .69) ** 1.55;
    const ambient = Math.min(1, Math.max(-.42, (-dx - dy) / (bodyRadius * Math.SQRT2))) * (1 - .40 * edge);
    const color = index * 3;
    for (let channel = 0; channel < 3; channel++) {
      const base = skin[channel];
      colors[color + channel] = base + (skinEdge[channel] - base) * edge + (skinLight[channel] - base) * ambient;
    }
  }
  return { distances, angles, colors };
}

function paintBarePixels(pixels, radii, reliefField, samples, flat, grooveOnly, palette) {
  const { height, waveHeight, grooveDepth } = reliefField;
  const { distances, angles, colors } = samples;
  const { flat: flatColor, groove, gloss } = palette;
  const maxRadius = Math.max(...radii) + 2 * SHADE_STEP;
  const data = pixels.data;
  for (let row = 0; row < SHADE_GRID; row++) for (let col = 0; col < SHADE_GRID; col++) {
    const index = row * SHADE_GRID + col, p = index * 4;
    const distance = distances[index];
    if (distance > maxRadius || distance > membraneRadiusAt(radii, angles[index]) + 2 * SHADE_STEP) {
      data[p + 3] = 0;
      continue;
    }
    // During a drag only groove depth casts a shadow. Shoulder and wave slopes would draw extra bands.
    let shadow = grooveDepth[index] * .6;
    let sheen = 0;
    if (!grooveOnly) {
      const left = row * SHADE_GRID + Math.max(0, col - 1);
      const right = row * SHADE_GRID + Math.min(SHADE_GRID - 1, col + 1);
      const top = Math.max(0, row - 1) * SHADE_GRID + col;
      const bottom = Math.min(SHADE_GRID - 1, row + 1) * SHADE_GRID + col;
      const hx = (height[right] - height[left]) / (2 * SHADE_STEP);
      const hy = (height[bottom] - height[top]) / (2 * SHADE_STEP);
      const lighting = (hx * .62 + hy * .78) / Math.sqrt(1 + hx * hx + hy * hy);
      const wx = (waveHeight[right] - waveHeight[left]) / (2 * SHADE_STEP);
      const wy = (waveHeight[bottom] - waveHeight[top]) / (2 * SHADE_STEP);
      const waveLight = (wx * .62 + wy * .78) / Math.sqrt(1 + wx * wx + wy * wy);
      const depth = Math.max(0, -height[index] / MATERIAL.maxDent);
      shadow = Math.max(0, Math.min(.72, depth * .6 - lighting * .26 * (1 - Math.min(1, depth)) ** 2 +
        Math.max(0, -waveLight) * RIPPLE_SHADOW_GAIN));
      sheen = Math.max(0, Math.min(MAX_RIPPLE_SHEEN, waveLight * RIPPLE_SHEEN_GAIN));
    }
    const color = index * 3;
    let red = flat ? flatColor[0] : colors[color];
    let green = flat ? flatColor[1] : colors[color + 1];
    let blue = flat ? flatColor[2] : colors[color + 2];
    red += (groove[0] - red) * shadow;
    green += (groove[1] - green) * shadow;
    blue += (groove[2] - blue) * shadow;
    red += (gloss[0] - red) * sheen;
    green += (gloss[1] - green) * sheen;
    blue += (gloss[2] - blue) * sheen;
    data[p] = red; data[p + 1] = green; data[p + 2] = blue; data[p + 3] = 255;
  }
}

function createSurfacePaint(palette) {
  return {
    shadow: rgbColor(palette.castShadow, .15),
    fill: rgbColor(palette.edgeFill),
    stroke: rgbColor(palette.edgeStroke, .10),
  };
}

export function createMallangSurface(canvas, material, palette = getMallangPalette()) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const shadeCanvas = document.createElement("canvas");
  shadeCanvas.width = shadeCanvas.height = SHADE_GRID;
  const shadeContext = shadeCanvas.getContext("2d");
  if (!shadeContext) return null;
  const barePixels = shadeContext.createImageData(SHADE_GRID, SHADE_GRID);
  let bareSamples = createBareSamples(palette);
  const reliefField = createMallangRelief({ size: SHADE_GRID, origin: VIEW_ORIGIN,
    step: SHADE_STEP, maxDepth: MATERIAL.maxDent,
    waveSettings: { speed: MATERIAL.waveSpeed, width: MATERIAL.waveWidth, travel: MATERIAL.waveTravel } });
  const trailPoints = [];
  let trailHead = null;
  let lastTrailUpdate = null;
  let lastContactPose = null;
  let retraction = null;
  let regrab = null;
  let waveOrigins = new WeakMap();
  const surfaceWaves = [];
  const waveBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(VIEW_SIZE * dpr);
  let paint = createSurfacePaint(palette);
  let outline = "", path, renderedRadii = null, flat = false;

  function clear() {
    context.setTransform(dpr, 0, 0, dpr, -VIEW_ORIGIN * dpr, -VIEW_ORIGIN * dpr);
    context.clearRect(VIEW_ORIGIN, VIEW_ORIGIN, VIEW_SIZE, VIEW_SIZE);
  }

  function reset() {
    trailPoints.length = 0;
    trailHead = null;
    lastTrailUpdate = null;
    lastContactPose = null;
    retraction = null;
    regrab = null;
    waveOrigins = new WeakMap();
    surfaceWaves.length = 0;
  }

  function releaseWaveAnchor() {
    const { contact } = material.state;
    if (!contact) return null;
    if (lastContactPose?.startedAt === contact.startedAt) {
      return waveAnchor(lastContactPose.relief, lastContactPose.radii);
    }
    // An input can begin and end between paints, even while an older dent is still visible.
    const relief = contactRelief({ x: contact.x, y: contact.y, depth: material.contactDepth() }, null);
    return relief && waveAnchor(relief);
  }

  function mapWaves(radii) {
    surfaceWaves.length = 0;
    if (material.state.reducedMotion) return surfaceWaves;
    for (const wave of material.state.waves) {
      let source = waveOrigins.get(wave);
      if (!source) {
        const anchor = wave.surfaceAnchor ?? waveAnchor(wave, radii);
        source = { ...anchor, x: 0, y: 0, strength: wave.strength, start: wave.start };
        waveOrigins.set(wave, source);
      }
      const rim = membraneRadiusAt(radii, source.angle);
      const reach = source.innerReach + source.outerFraction * (rim - source.innerReach);
      source.x = MATERIAL.center + Math.cos(source.angle) * reach;
      source.y = MATERIAL.center + Math.sin(source.angle) * reach;
      surfaceWaves.push(source);
    }
    return surfaceWaves;
  }

  function recordDentTrail(relief, now, dragSpeed) {
    const excessSpeed = Math.max(0, dragSpeed - TRAIL_SPEED_THRESHOLD);
    const recoveryRate = Math.min(MAX_TRAIL_RECOVERY_RATE, 1 + excessSpeed / TRAIL_SPEED_PER_RECOVERY_STEP);
    const frameTime = Math.max(0, now - (lastTrailUpdate ?? now));
    lastTrailUpdate = now;
    let remaining = 0;
    for (const point of trailPoints) {
      // Once a swipe speeds up recovery, pausing or releasing cannot lengthen it again.
      point.recoveryRate = Math.max(point.recoveryRate, recoveryRate);
      point.recoveryStartedAt -= frameTime * (point.recoveryRate - 1);
      if (trailDepthAt(point, now) > 0) trailPoints[remaining++] = point;
    }
    trailPoints.length = remaining;
    const { contact } = material.state;
    if (!contact || !relief) {
      trailHead = null;
      return;
    }
    const next = { ...relief, time: now, startedAt: contact.startedAt };
    if (trailHead?.startedAt !== contact.startedAt) {
      trailHead = next;
      return;
    }
    const dx = next.x - trailHead.x, dy = next.y - trailHead.y;
    const distance = Math.hypot(dx, dy);
    if (distance < MATERIAL.spacing) {
      trailHead.depth = next.depth;
      trailHead.time = now;
      return;
    }

    // Overlapping stamps keep the local path continuous through a fast turn.
    const steps = Math.min(MATERIAL.maxTrail, Math.ceil(distance / TRAIL_SAMPLE_SPACING));
    const elapsed = Math.min(MAX_TRAIL_DEPARTURE_INTERVAL_MS, Math.max(0, now - trailHead.time));
    // The canvas moves with the body, so only a change in the local dent adds to the trail.
    for (let step = 0; step < steps; step++) {
      const progress = step / steps;
      const x = trailHead.x + dx * progress, y = trailHead.y + dy * progress;
      const point = reliefPoint(x, y, trailHead.depth + (next.depth - trailHead.depth) * progress);
      const reach = Math.hypot(x - MATERIAL.center, y - MATERIAL.center);
      trailPoints.push({ ...point, stretch: stretchAt(point),
        recoveryTravel: Math.max(0, reach - OUTER_TRAIL_MERGE_REACH),
        recoveryStartedAt: now - elapsed * (1 - progress) * recoveryRate, recoveryRate });
    }
    if (trailPoints.length > MATERIAL.maxTrail) trailPoints.splice(0, trailPoints.length - MATERIAL.maxTrail);
    trailHead = next;
  }

  function setReleaseSpeed(pointerSpeed) {
    const { contact } = material.state;
    if (!lastContactPose || lastContactPose.startedAt !== contact?.startedAt) return;
    const swipe = smooth((pointerSpeed - RELEASE_SPEED_START) / (RELEASE_SPEED_END - RELEASE_SPEED_START));
    // Capture once at pointer-up so further pointer movement or a delayed paint cannot change recovery.
    lastContactPose.releaseDuration = PULLED_RELEASE_MS + (FAST_SWIPE_RELEASE_MS - PULLED_RELEASE_MS) * swipe;
  }

  function updateRetraction(contact, load) {
    if (contact) {
      if (retraction?.remaining > 0) {
        regrab = { startedAt: contact.startedAt, radii: retraction.radii, relief: { ...retraction.relief } };
      }
      retraction = null;
      if (regrab?.startedAt !== contact.startedAt) regrab = null;
      return;
    }
    regrab = null;
    if (lastContactPose?.stretched && load?.releasedAt != null) {
      const { radii, relief } = lastContactPose;
      const trailOrigins = new Map();
      for (const point of trailPoints) {
        const position = trailProfileAt(point, lastContactPose.time);
        trailOrigins.set(point, { x: position.x, y: position.y,
          attachment: point.stretch, strength: point.releaseStrength ?? 1, scale: point.releaseScale ?? 1 });
        // The release transform takes over from ordinary trail recovery at the shown location.
        point.recoveryTravel = 0;
      }
      retraction = { startedAt: load.releasedAt, duration: lastContactPose.releaseDuration ?? PULLED_RELEASE_MS,
        startRadii: radii, radii, startRelief: relief, relief, trailOrigins, remaining: 1 };
    }
  }

  function retract(bodyRadii, now) {
    const remaining = 1 - smooth((now - retraction.startedAt) / retraction.duration);
    if (!remaining) {
      trailPoints.length = 0;
      retraction.remaining = 0;
      return { radii: bodyRadii, relief: null };
    }
    const start = retraction.startRelief;
    const progress = 1 - remaining;
    const { center } = MATERIAL;
    const reach = Math.hypot(start.x - center, start.y - center);
    const distance = Math.max(0, reach - CAP_MERGE_REACH) * progress;
    const cap = { startX: start.x, startY: start.y, x: start.x - start.ux * distance,
      y: start.y - start.uy * distance, scale: remaining ** 1.3 };
    const radii = retractMembraneCap(retraction.startRadii, bodyRadii, cap, progress);
    for (const point of trailPoints) {
      const origin = retraction.trailOrigins.get(point);
      const { x, y } = moveWithCap(origin, cap, origin.attachment);
      point.x = x; point.y = y;
      point.releaseStrength = origin.strength * remaining ** 2;
      point.releaseScale = origin.scale * (1 + (cap.scale - 1) * origin.attachment);
      const reach = Math.hypot(x - center, y - center);
      if (reach) { point.ux = (x - center) / reach; point.uy = (y - center) / reach; }
    }
    const relief = { ...start, x: cap.x, y: cap.y, depth: start.depth * remaining,
      sizeDepth: start.sizeDepth ?? start.depth, scale: (start.scale ?? 1) * cap.scale };
    retraction.relief = relief;
    retraction.radii = radii;
    retraction.remaining = remaining;
    return { radii, relief };
  }

  function radiusAt(angle) {
    return renderedRadii && membraneRadiusAt(renderedRadii, angle);
  }
  const rim = { center: MATERIAL.center, radiusAt };

  function draw(pull = null, impact = null, reliefTip = null, dragSpeed = 0) {
    const { contact, time } = material.state;
    const load = material.rimLoad();
    let relief = contactRelief(load, reliefTip);
    updateRetraction(contact, load);
    let catchProgress = 1;
    if (regrab) {
      catchProgress = smooth((time - regrab.startedAt) / MATERIAL.rimRegrabMs);
      if (catchProgress === 1) regrab = null;
      else if (relief) {
        const start = regrab.relief;
        relief = { ...reliefPoint(start.x + (relief.x - start.x) * catchProgress,
          start.y + (relief.y - start.y) * catchProgress, start.depth + (relief.depth - start.depth) * catchProgress),
          scale: (start.scale ?? 1) + (1 - (start.scale ?? 1)) * catchProgress,
          sizeDepth: (start.sizeDepth ?? start.depth) * (1 - catchProgress) + relief.depth * catchProgress };
      }
    }
    recordDentTrail(relief, time, dragSpeed);
    let radii = retraction ? membraneRadii(material, null, impact, null)
      : membraneRadii(material, pull, impact, load);
    if (retraction) ({ radii, relief } = retract(radii, time));
    const stretched = !!pull?.radius || !!regrab;
    if (regrab) radii = blendRadii(regrab.radii, radii, catchProgress);
    renderedRadii = radii;
    const next = membranePath(radii);
    if (next !== outline) { outline = next; path = new Path2D(next); }
    clear();
    context.save();
    // Cast the soft shadow from the current contour, including the drawn-out end.
    context.shadowColor = paint.shadow;
    context.shadowBlur = 17 * dpr;
    context.shadowOffsetY = 6 * dpr;
    context.fillStyle = paint.fill;
    context.fill(path);
    context.restore();
    context.save(); context.clip(path);
    waveBounds.left = waveBounds.top = Infinity;
    waveBounds.right = waveBounds.bottom = -Infinity;
    for (let index = 0; index < radii.length; index++) {
      const angle = index / radii.length * Math.PI * 2;
      const x = MATERIAL.center + Math.cos(angle) * radii[index];
      const y = MATERIAL.center + Math.sin(angle) * radii[index];
      waveBounds.left = Math.min(waveBounds.left, x - SHADE_STEP * 2);
      waveBounds.right = Math.max(waveBounds.right, x + SHADE_STEP * 2);
      waveBounds.top = Math.min(waveBounds.top, y - SHADE_STEP * 2);
      waveBounds.bottom = Math.max(waveBounds.bottom, y + SHADE_STEP * 2);
    }
    reliefField.update({ contact: relief, trail: trailPoints, now: time,
      waves: mapWaves(radii), bounds: waveBounds, rim });
    const grooveOnly = trailPoints.length > 0 || retraction?.remaining > 0 ||
      !!(contact && (stretched || (lastContactPose?.startedAt === contact.startedAt && lastContactPose.grooveOnly)));
    lastContactPose = contact && relief ? { startedAt: contact.startedAt, time, relief, radii, stretched, grooveOnly } : null;
    paintBarePixels(barePixels, radii, reliefField, bareSamples, flat, grooveOnly, palette);
    shadeContext.putImageData(barePixels, 0, 0);
    const origin = VIEW_ORIGIN - SHADE_STEP / 2, extent = SHADE_GRID * SHADE_STEP;
    context.drawImage(shadeCanvas, origin, origin, extent, extent);
    context.restore();
    context.strokeStyle = paint.stroke;
    context.lineWidth = .7; context.stroke(path);
    return outline;
  }
  return { draw, releaseWaveAnchor, reset, setReleaseSpeed, sampleHeight: reliefField.sample,
    radiusAt,
    get recovering() { return trailPoints.length > 0 || (retraction?.remaining ?? 0) > 0; },
    get hasStretchedContact() {
      return !!lastContactPose?.stretched && lastContactPose.startedAt === material.state.contact?.startedAt;
    },
    setFlatStyle(value) { flat = value; },
    setPalette(nextPalette) {
      if (palette === nextPalette) return;
      palette = nextPalette;
      bareSamples = createBareSamples(palette);
      paint = createSurfacePaint(palette);
    },
    dispose: clear };
}
