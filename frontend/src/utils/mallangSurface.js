import { MATERIAL, membranePath, membraneRadii, membraneRadiusAt } from "./mallangMaterial.js";
import { MAX_VISUAL_TETHER_DISTANCE } from "./mallangMotion.js";
import { PULL_RIM_EASE_DISTANCE, softLimitDistance } from "./mallangPull.js";
import { pressRecoveryDuration, smoothStep } from "./surfacePress.js";
import { createMallangRelief } from "./mallangRelief.js";

const VIEW_ORIGIN = -100;
const VIEW_SIZE = 400;
const SHADE_STEP = 2;
const SHADE_GRID = VIEW_SIZE / SHADE_STEP + 1;
const PULLED_DENT_LIMIT = 136;
const INNER_DENT_LIMIT = 61;
const MAX_TRAIL_DEPARTURE_INTERVAL_MS = 64;
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
  const length = 19 + load.depth * 9;
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
  const dx = x - center, dy = y - center;
  const reach = Math.hypot(dx, dy);
  return { x, y, depth: load.depth, ux: reach ? dx / reach : 1, uy: reach ? dy / reach : 0,
    length, width: length * 1.18 };
}

function paintBarePixels(pixels, radii, height, flat, waveHeight) {
  const { center, radius: bodyRadius } = MATERIAL;
  const maxRadius = Math.max(...radii) + 2 * SHADE_STEP;
  const data = pixels.data;
  for (let row = 0; row < SHADE_GRID; row++) for (let col = 0; col < SHADE_GRID; col++) {
    const p = (row * SHADE_GRID + col) * 4;
    const x = VIEW_ORIGIN + col * SHADE_STEP, y = VIEW_ORIGIN + row * SHADE_STEP;
    const dx = x - center, dy = y - center;
    const distance = Math.hypot(dx, dy);
    if (distance > maxRadius) { data[p + 3] = 0; continue; }
    const angle = Math.atan2(dy, dx);
    const radius = membraneRadiusAt(radii, angle);
    if (distance > radius + 2 * SHADE_STEP) { data[p + 3] = 0; continue; }

    const index = row * SHADE_GRID + col;
    const hx = (height[row * SHADE_GRID + Math.min(SHADE_GRID - 1, col + 1)] -
      height[row * SHADE_GRID + Math.max(0, col - 1)]) / (2 * SHADE_STEP);
    const hy = (height[Math.min(SHADE_GRID - 1, row + 1) * SHADE_GRID + col] -
      height[Math.max(0, row - 1) * SHADE_GRID + col]) / (2 * SHADE_STEP);
    const lighting = (hx * .62 + hy * .78) / Math.sqrt(1 + hx * hx + hy * hy);
    const wx = (waveHeight[row * SHADE_GRID + Math.min(SHADE_GRID - 1, col + 1)] -
      waveHeight[row * SHADE_GRID + Math.max(0, col - 1)]) / (2 * SHADE_STEP);
    const wy = (waveHeight[Math.min(SHADE_GRID - 1, row + 1) * SHADE_GRID + col] -
      waveHeight[Math.max(0, row - 1) * SHADE_GRID + col]) / (2 * SHADE_STEP);
    const waveLight = (wx * .62 + wy * .78) / Math.sqrt(1 + wx * wx + wy * wy);
    const depth = Math.max(0, -height[index] / MATERIAL.maxDent);
    // Bring back directional relief without changing the current body palette
    // or adding a bright ring. The deepest part stays underneath the contact.
    const shadow = Math.max(0, Math.min(.72, depth * .6 - lighting * .26 * (1 - Math.min(1, depth)) ** 2 +
      Math.max(0, -waveLight) * RIPPLE_SHADOW_GAIN));
    // The contour can stretch while the underlying color stays fixed to the body.
    const edge = smooth((distance / bodyRadius - .35) / .69) ** 1.55;
    const ambient = Math.min(1, Math.max(-.42, (-dx - dy) / (bodyRadius * Math.SQRT2))) * (1 - .40 * edge);
    let red = flat ? 255 : 253 - 12 * edge;
    let green = flat ? 206 : 207 - 42 * edge + 13 * ambient;
    let blue = flat ? 223 : 233 - 27 * edge + 8 * ambient;
    red += (177 - red) * shadow;
    green += (79 - green) * shadow;
    blue += (127 - blue) * shadow;
    // A travelling slope catches the same upper-left light. This small sheen
    // belongs only to the wave, leaving the accepted dent and rest colors intact.
    const sheen = Math.max(0, Math.min(MAX_RIPPLE_SHEEN, waveLight * RIPPLE_SHEEN_GAIN));
    red += (255 - red) * sheen;
    green += (246 - green) * sheen;
    blue += (252 - blue) * sheen;
    data[p] = red; data[p + 1] = green; data[p + 2] = blue; data[p + 3] = 255;
  }
}

function paintWaxPixels(pixels, material, radii, slopeX, slopeY) {
  const { height, coverage } = material.state;
  const n = MATERIAL.grid, step = MATERIAL.extent / (n - 1);
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const i = row * n + col;
    const left = row * n + Math.max(0, col - 1), right = row * n + Math.min(n - 1, col + 1);
    const top = Math.max(0, row - 1) * n + col, bottom = Math.min(n - 1, row + 1) * n + col;
    // There is no flat material outside the free boundary.
    slopeX[i] = ((coverage[right] ? height[right] : height[i]) -
      (coverage[left] ? height[left] : height[i])) / (2 * step);
    slopeY[i] = ((coverage[bottom] ? height[bottom] : height[i]) -
      (coverage[top] ? height[top] : height[i])) / (2 * step);
  }
  for (let row = 0; row < n; row++) for (let col = 0; col < n; col++) {
    const i = row * n + col, p = i * 4;
    const dx = MATERIAL.origin + col * step - MATERIAL.center;
    const dy = MATERIAL.origin + row * step - MATERIAL.center;
    const distance = Math.hypot(dx, dy);
    const radius = membraneRadiusAt(radii, Math.atan2(dy, dx));
    const edge = smooth((distance - MATERIAL.waxRimLightStart) / (radius - MATERIAL.waxRimLightStart));
    const scale = distance > 0 ? 1 - (radius - MATERIAL.radius) * edge / distance : 1;
    const sx = MATERIAL.center + dx * scale, sy = MATERIAL.center + dy * scale;
    const hx = edge ? material.sample(sx, sy, slopeX) : slopeX[i];
    const hy = edge ? material.sample(sx, sy, slopeY) : slopeY[i];
    const h = edge ? material.sample(sx, sy) : height[i];
    const lighting = (hx * .62 + hy * .78) / Math.sqrt(1 + hx * hx + hy * hy);
    const bright = lighting > 0;
    pixels.data[p] = bright ? 255 : 122;
    pixels.data[p + 1] = bright ? 246 : 51;
    pixels.data[p + 2] = bright ? 252 : 88;
    pixels.data[p + 3] = Math.min(165, Math.abs(lighting) * 220 + Math.max(0, -h) * 1.1) *
      smooth((radius - distance) / 5);
  }
}

export function createMallangSurface(canvas, material, overlay = null) {
  const context = canvas.getContext("2d");
  if (!context) return null;
  const shadeCanvas = document.createElement("canvas");
  shadeCanvas.width = shadeCanvas.height = SHADE_GRID;
  const shadeContext = shadeCanvas.getContext("2d");
  if (!shadeContext) return null;
  const barePixels = shadeContext.createImageData(SHADE_GRID, SHADE_GRID);
  const reliefField = createMallangRelief({ size: SHADE_GRID, origin: VIEW_ORIGIN,
    step: SHADE_STEP, maxDepth: MATERIAL.maxDent,
    waveSettings: { speed: MATERIAL.waveSpeed, width: MATERIAL.waveWidth, travel: MATERIAL.waveTravel } });
  const trailPoints = [];
  let trailHead = null;
  let lastContactPose = null;
  let waveOrigins = new WeakMap();
  const surfaceWaves = [];
  const waveBounds = { left: 0, top: 0, right: 0, bottom: 0 };
  const fieldPixels = shadeContext.createImageData(MATERIAL.grid, MATERIAL.grid);
  const slopeX = new Float32Array(MATERIAL.grid ** 2), slopeY = new Float32Array(MATERIAL.grid ** 2);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.height = Math.round(VIEW_SIZE * dpr);
  const lightContext = overlay?.getContext("2d");
  if (overlay) overlay.width = overlay.height = canvas.width;
  const gradient = context.createRadialGradient(62, 43, 8, 95, 100, 145);
  gradient.addColorStop(0, "#ffe8f2"); gradient.addColorStop(.44, "#f6ccdf");
  gradient.addColorStop(.8, "#e7a5c4"); gradient.addColorStop(1, "#c97da6");
  const sheen = context.createRadialGradient(61, 49, 3, 61, 49, 61);
  sheen.addColorStop(0, "rgba(255,249,253,.58)"); sheen.addColorStop(1, "rgba(255,249,253,0)");
  let outline = "", path, flat = false;

  function clear(target) {
    target.setTransform(dpr, 0, 0, dpr, -VIEW_ORIGIN * dpr, -VIEW_ORIGIN * dpr);
    target.clearRect(VIEW_ORIGIN, VIEW_ORIGIN, VIEW_SIZE, VIEW_SIZE);
  }

  function drawWaxLighting(target, radii) {
    paintWaxPixels(fieldPixels, material, radii, slopeX, slopeY);
    shadeContext.putImageData(fieldPixels, 0, 0);
    target.drawImage(shadeCanvas, 0, 0, MATERIAL.grid, MATERIAL.grid,
      MATERIAL.origin, MATERIAL.origin, MATERIAL.extent, MATERIAL.extent);
  }

  function resetTrail() {
    trailPoints.length = 0;
    trailHead = null;
    lastContactPose = null;
    waveOrigins = new WeakMap();
    surfaceWaves.length = 0;
  }

  function mapWaves(radii) {
    surfaceWaves.length = 0;
    if (material.state.reducedMotion) return surfaceWaves;
    for (const wave of material.state.waves) {
      let source = waveOrigins.get(wave);
      if (!source) {
        const releasedHere = !material.state.contact && lastContactPose &&
          Math.hypot(wave.x - lastContactPose.x, wave.y - lastContactPose.y) < MATERIAL.spacing;
        // Release rings originate at the visible dent, including a stretched
        // neck. Other impulses retain their actual surface contact position.
        const point = releasedHere ? lastContactPose.relief : wave;
        const dx = point.x - MATERIAL.center, dy = point.y - MATERIAL.center;
        const angle = Math.atan2(dy, dx);
        source = { angle, fraction: Math.min(.96, Math.hypot(dx, dy) /
          membraneRadiusAt(releasedHere ? lastContactPose.radii : radii, angle)),
          x: point.x, y: point.y, strength: wave.strength, start: wave.start };
        waveOrigins.set(wave, source);
      }
      // A contracting neck carries its wave source back onto the membrane.
      const reach = source.fraction * membraneRadiusAt(radii, source.angle);
      source.x = MATERIAL.center + Math.cos(source.angle) * reach;
      source.y = MATERIAL.center + Math.sin(source.angle) * reach;
      surfaceWaves.push(source);
    }
    return surfaceWaves;
  }

  function recordTrail(relief, now, bodyX, bodyY) {
    while (trailPoints.length && now - trailPoints[0].leftAt >= pressRecoveryDuration(trailPoints[0].depth)) trailPoints.shift();
    if (!material.state.contact || !relief) {
      trailHead = null;
      return;
    }
    const next = { x: relief.x + bodyX, y: relief.y + bodyY, depth: relief.depth,
      ux: relief.ux, uy: relief.uy, time: now };
    if (!trailHead) {
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
    const steps = Math.min(MATERIAL.maxTrail, Math.ceil(distance / MATERIAL.spacing));
    const elapsed = Math.min(MAX_TRAIL_DEPARTURE_INTERVAL_MS, Math.max(0, now - trailHead.time));
    // Sample the displayed dent in world space, including when the whole body moves.
    for (let step = 0; step < steps; step++) {
      const progress = step / steps;
      trailPoints.push({ x: trailHead.x + dx * progress, y: trailHead.y + dy * progress,
        depth: trailHead.depth + (next.depth - trailHead.depth) * progress, leftAt: now - elapsed * (1 - progress),
        ux: trailHead.ux, uy: trailHead.uy });
    }
    if (trailPoints.length > MATERIAL.maxTrail) trailPoints.splice(0, trailPoints.length - MATERIAL.maxTrail);
    trailHead = next;
  }

  function draw(pull = null, impact = null, reliefTip = null, bodyOffset = null) {
    const { shell } = material.state;
    const load = material.rimLoad();
    const bodyRadii = membraneRadii(material, null, impact, load);
    const radii = pull ? membraneRadii(material, pull, impact, load) : bodyRadii;
    const next = membranePath(radii);
    if (next !== outline) { outline = next; path = new Path2D(next); }
    clear(context);
    if (lightContext) clear(lightContext);
    if (!shell) {
      context.save();
      // Cast the soft shadow from the current contour, including the drawn-out end.
      context.shadowColor = "rgba(117,50,91,.15)";
      context.shadowBlur = 17 * dpr;
      context.shadowOffsetY = 6 * dpr;
      context.fillStyle = "#f6c0df";
      context.fill(path);
      context.restore();
    }
    context.save(); context.clip(path);
    if (shell) {
      context.fillStyle = flat ? "#ffcedf" : gradient;
      context.fillRect(VIEW_ORIGIN, VIEW_ORIGIN, VIEW_SIZE, VIEW_SIZE);
      if (!flat) { context.fillStyle = sheen; context.fillRect(VIEW_ORIGIN, VIEW_ORIGIN, VIEW_SIZE, VIEW_SIZE); }
      const target = lightContext ?? context;
      if (lightContext) { target.save(); target.clip(path); }
      drawWaxLighting(target, radii);
      if (lightContext) target.restore();
    } else {
      const relief = contactRelief(load, reliefTip);
      const { time } = material.state;
      const bodyX = bodyOffset?.x ?? 0, bodyY = bodyOffset?.y ?? 0;
      recordTrail(relief, time, bodyX, bodyY);
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
      const height = reliefField.update({ contact: relief, trail: trailPoints, now: time, bodyX, bodyY,
        waves: mapWaves(radii), bounds: waveBounds });
      lastContactPose = material.state.contact && relief ? { x: load.x, y: load.y, relief, radii } : null;
      paintBarePixels(barePixels, radii, height, flat, reliefField.waveHeight);
      shadeContext.putImageData(barePixels, 0, 0);
      const origin = VIEW_ORIGIN - SHADE_STEP / 2, extent = SHADE_GRID * SHADE_STEP;
      context.drawImage(shadeCanvas, origin, origin, extent, extent);
    }
    context.restore();
    context.strokeStyle = shell ? "rgba(179,91,133,.24)" : "rgba(179,91,133,.10)";
    context.lineWidth = .7; context.stroke(path);
    return outline;
  }
  return { draw, resetTrail, get trailActive() { return trailPoints.length > 0; },
    setFlatStyle(value) { flat = value; },
    dispose() { clear(context); if (lightContext) clear(lightContext); } };
}
