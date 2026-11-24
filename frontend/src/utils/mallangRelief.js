import { pressRecoveryDuration, smoothStep } from "./surfacePress.js";

const smooth = (value) => smoothStep(Math.max(0, Math.min(1, value)));
const WAVE_HEIGHT = 3.6;
const MAX_COMBINED_WAVE_HEIGHT = 5;
const WAVE_DECAY_PER_SECOND = 1.9;
const WAVE_FORMING_SECONDS = .14;
const WAVE_LAUNCH_RADIUS = 18;
const WAVE_SUPPORT_WIDTHS = 2.4;
const TRAIL_DURATION_SCALE = 2;
const TRAIL_REFILL_START = .42;
const CONTACT_SHOULDER_EXTENT = 1.85;
const TRAIL_SHOULDER_EXTENT = 1.25;
const TRAIL_FINAL_DEPTH = .14;

export function dentDimensions(depth) {
  const length = 19 + depth * 9;
  return { length, width: length * 1.18 };
}

function trailProgress(point, now) {
  const duration = pressRecoveryDuration(point.depth) * TRAIL_DURATION_SCALE;
  return Math.max(0, Math.min(1, (now - point.recoveryStartedAt) / duration));
}

function trailDepth(point, progress) {
  const refill = 1 - smooth((progress - TRAIL_REFILL_START) / (1 - TRAIL_REFILL_START));
  return point.depth * refill * (1 - (point.stretch ?? 0) * progress) * (point.releaseStrength ?? 1);
}

export function trailDepthAt(point, now) {
  return trailDepth(point, trailProgress(point, now));
}

export function trailProfileAt(point, now) {
  const progress = trailProgress(point, now);
  // Start narrowing while the groove is still deep, and reach zero width at expiry.
  const remainingSize = (1 - progress) * Math.sqrt(1 + 2 * progress);
  const scale = remainingSize * (point.releaseScale ?? 1);
  const travel = (point.recoveryTravel ?? 0) * (1 - remainingSize);
  const { length, width } = dentDimensions(point.depth);
  const depth = trailDepth(point, progress);
  return { x: point.x - (point.ux ?? 1) * travel, y: point.y - (point.uy ?? 0) * travel,
    depth, length: length * scale, width: width * scale,
    shoulderExtent: TRAIL_SHOULDER_EXTENT, scale, rimSupport: smooth(depth / TRAIL_FINAL_DEPTH) };
}

// Visual height in material units. The current controller still owns input,
// outlines and motion; this field restores the dent's relief and filling trail.
export function createMallangRelief({ size, origin, step, maxDepth, waveSettings = null }) {
  const height = new Float32Array(size * size);
  const depression = new Float32Array(height.length);
  const shoulder = new Float32Array(height.length);
  const waveHeight = new Float32Array(height.length);

  function addWaves(waves, now, bounds) {
    waveHeight.fill(0);
    if (!waveSettings || !waves.length) return;
    const { speed, width, travel: travelLimit } = waveSettings;
    for (const wave of waves) {
      const age = (now - wave.start) / 1000;
      const travel = age * speed;
      if (age <= 0 || travel >= travelLimit) continue;
      // The material owns emission, timing and lifetime. Only its relief is
      // amplified here so a light tap stays visible against the matte body.
      const strength = .42 + .58 * Math.max(0, Math.min(1, wave.strength));
      const amplitude = WAVE_HEIGHT * strength * Math.exp(-age * WAVE_DECAY_PER_SECOND) * smooth(age / WAVE_FORMING_SECONDS);
      const front = WAVE_LAUNCH_RADIUS + travel;
      const outer = front + width * WAVE_SUPPORT_WIDTHS;
      const innerSquared = Math.max(0, front - width * WAVE_SUPPORT_WIDTHS) ** 2;
      const outerSquared = outer ** 2;
      const left = Math.max(0, Math.ceil((Math.max(wave.x - outer, bounds?.left ?? origin) - origin) / step));
      const right = Math.min(size - 1, Math.floor((Math.min(wave.x + outer, bounds?.right ?? Infinity) - origin) / step));
      const top = Math.max(0, Math.ceil((Math.max(wave.y - outer, bounds?.top ?? origin) - origin) / step));
      const bottom = Math.min(size - 1, Math.floor((Math.min(wave.y + outer, bounds?.bottom ?? Infinity) - origin) / step));
      for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
        const distanceSquared = (origin + col * step - wave.x) ** 2 + (origin + row * step - wave.y) ** 2;
        if (distanceSquared < innerSquared || distanceSquared > outerSquared) continue;
        const q = (Math.sqrt(distanceSquared) - front) / width;
        waveHeight[row * size + col] += amplitude * (1 - 2 * q * q) * Math.exp(-2 * q * q);
      }
    }
    for (let i = 0; i < height.length; i++) {
      // Keep overlapping waves soft without resetting or deleting older ones.
      waveHeight[i] = MAX_COMBINED_WAVE_HEIGHT * Math.tanh(waveHeight[i] / MAX_COMBINED_WAVE_HEIGHT);
      height[i] += waveHeight[i];
    }
  }

  function rimShadeWeight(rim, x, y) {
    // A fixed trail center can end up outside the rim in its final, faint frames.
    const dx = x - rim.center, dy = y - rim.center;
    const clearance = rim.radiusAt(Math.atan2(dy, dx)) - Math.hypot(dx, dy);
    return smooth(clearance / (2 * step));
  }

  function stamp(point, { depth, length, width, shoulderExtent }, rim = null) {
    if (depth <= 0) return;
    const { x, y } = point;
    const ux = point.ux ?? 1, uy = point.uy ?? 0;
    const extent = width * shoulderExtent;
    const shoulderFalloff = shoulderExtent - 1.05;
    const left = Math.max(0, Math.ceil((x - extent - origin) / step));
    const right = Math.min(size - 1, Math.floor((x + extent - origin) / step));
    const top = Math.max(0, Math.ceil((y - extent - origin) / step));
    const bottom = Math.min(size - 1, Math.floor((y + extent - origin) / step));
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const px = origin + col * step, py = origin + row * step;
      const dx = px - x, dy = py - y;
      const q = Math.hypot((dx * ux + dy * uy) / length, (dy * ux - dx * uy) / width);
      const strength = rim ? depth * rimShadeWeight(rim, px, py) : depth;
      const index = row * size + col;
      depression[index] = Math.max(depression[index], strength * (1 - smooth(q)));
      const lift = smooth((q - .65) / .4) *
        (1 - smooth((q - 1.05) / shoulderFalloff));
      shoulder[index] = Math.max(shoulder[index], strength * lift);
    }
  }

  function update({ contact, trail, now, waves = [], bounds = null, rim = null }) {
    depression.fill(0); shoulder.fill(0);
    for (const point of trail) {
      const profile = trailProfileAt(point, now);
      stamp({ x: profile.x, y: profile.y, ux: point.ux, uy: point.uy }, profile,
        profile.rimSupport < 1 || point.releaseStrength < 1 ? rim : null);
    }
    if (contact) {
      const { length, width } = dentDimensions(contact.sizeDepth ?? contact.depth);
      const scale = contact.scale ?? 1;
      stamp(contact, { depth: contact.depth, length: length * scale, width: width * scale,
        shoulderExtent: CONTACT_SHOULDER_EXTENT }, scale < 1 ? rim : null);
    }
    let down = 0, up = 0;
    for (let i = 0; i < height.length; i++) {
      shoulder[i] *= 1 - depression[i];
      down += depression[i]; up += shoulder[i];
    }
    // Equal signed-height contributions are a visual redistribution proxy,
    // not a claim about 3D volume. Overlapping paths never sum their dents.
    const ratio = up ? down / up : 0;
    for (let i = 0; i < height.length; i++) {
      height[i] = maxDepth * (-depression[i] + shoulder[i] * ratio);
    }
    addWaves(waves, now, bounds);
    return height;
  }

  function sample(x, y) {
    const gridX = Math.max(0, Math.min(size - 1, (x - origin) / step));
    const gridY = Math.max(0, Math.min(size - 1, (y - origin) / step));
    const col = Math.min(size - 2, Math.floor(gridX)), row = Math.min(size - 2, Math.floor(gridY));
    const u = gridX - col, v = gridY - row, index = row * size + col;
    const top = height[index] * (1 - u) + height[index + 1] * u;
    const bottom = height[index + size] * (1 - u) + height[index + size + 1] * u;
    return top * (1 - v) + bottom * v;
  }

  return { height, grooveDepth: depression, waveHeight, update, sample };
}
