import { pressRecoveryDuration, smoothStep } from "./surfacePress.js";

const smooth = (value) => smoothStep(Math.max(0, Math.min(1, value)));
const WAVE_HEIGHT = 3.6;
const MAX_COMBINED_WAVE_HEIGHT = 5;
const WAVE_DECAY_PER_SECOND = 1.9;
const WAVE_FORMING_SECONDS = .14;
const WAVE_LAUNCH_RADIUS = 18;
const WAVE_SUPPORT_WIDTHS = 2.4;

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

  function stamp(point, depth) {
    if (depth <= 0) return;
    const { x, y } = point;
    const length = 19 + depth * 9, width = length * 1.18;
    const ux = point.ux ?? 1, uy = point.uy ?? 0;
    const extent = width * 1.85;
    const left = Math.max(0, Math.ceil((x - extent - origin) / step));
    const right = Math.min(size - 1, Math.floor((x + extent - origin) / step));
    const top = Math.max(0, Math.ceil((y - extent - origin) / step));
    const bottom = Math.min(size - 1, Math.floor((y + extent - origin) / step));
    for (let row = top; row <= bottom; row++) for (let col = left; col <= right; col++) {
      const dx = origin + col * step - x, dy = origin + row * step - y;
      const q = Math.hypot((dx * ux + dy * uy) / length, (dy * ux - dx * uy) / width);
      const index = row * size + col;
      depression[index] = Math.max(depression[index], depth * (1 - smooth(q)));
      const lift = smooth((q - .65) / .4) * (1 - smooth((q - 1.05) / .8));
      shoulder[index] = Math.max(shoulder[index], depth * lift);
    }
  }

  function update({ contact, trail, now, waves = [], bounds = null }) {
    depression.fill(0); shoulder.fill(0);
    for (const point of trail) {
      const remaining = 1 - smooth((now - point.leftAt) / pressRecoveryDuration(point.depth));
      stamp(point, point.depth * remaining);
    }
    if (contact) stamp(contact, contact.depth);
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

  return { height, waveHeight, update };
}
