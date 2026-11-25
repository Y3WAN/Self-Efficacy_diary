// Material coordinates: a 200-unit body; time: milliseconds; height: visual units.
import { MAX_TETHER_DISTANCE, pullExtension, softLimitDistance } from "./mallangPull.js";
import { FULL_PRESS_MS, TAP_DEPTH, pressDepth, pressRecoveryDuration, smoothStep } from "./surfacePress.js";

export const MATERIAL = Object.freeze({
  radius: 94, center: 100, grid: 57, extent: 224, origin: -12,
  maxDent: 15, spring: 900, damping: 47, coupling: 22,
  maxTrail: 72, spacing: 3, maxWaves: 12,
  waveSpeed: 75.2, waveWidth: 94 * 0.19 * 1.1, waveTravel: 195,
  rimExpansion: 14, rimFadeStart: 6, rimFadeEnd: 58,
  rimRegrabMs: 72, reliefLimitStart: 47, reliefLimit: 74, pullCrownDistance: 19, pullCrownRatio: .34,
});
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => smoothStep(clamp(x, 0, 1));
const N = MATERIAL.grid, STEP = MATERIAL.extent / (N - 1);
const BARE_TRAIL_DEPTH_RATIO = .3;
const MAX_BARE_TRAIL_INTERVAL_MS = 64;
const PULL_SHOULDER_FALLOFF = 6;
const MEMBRANE_SAMPLES = 96;
const MEMBRANE_DIRECTIONS = Array.from({ length: MEMBRANE_SAMPLES }, (_, index) => {
  const angle = index / MEMBRANE_SAMPLES * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
});

export function outwardWeight(distance) {
  return smooth((distance - MATERIAL.rimFadeStart) / (MATERIAL.rimFadeEnd - MATERIAL.rimFadeStart));
}

function radialProfile(angle, direction, falloff = 4) {
  // The shoulders flow back into the round body with zero slope and curvature.
  return Math.max(0, Math.cos(angle - direction)) ** falloff;
}

export function createMallangMaterial() {
  const height = new Float32Array(N * N), velocity = new Float32Array(N * N);
  const target = new Float32Array(N * N), dent = new Float32Array(N * N);
  const bulge = new Float32Array(N * N), coverage = new Float32Array(N * N);
  const nodes = [], waves = [];
  let releasedRim = null;
  const state = { height, velocity, target, coverage, nodes, waves, contact: null,
    time: 0, active: false, sloshX: 0, sloshY: 0, energy: 0,
    displaced: 0, raised: 0, signedHeight: 0, reducedMotion: false };

  // The surface grid also covers the region exposed by an outward press.
  const coverageRadius = MATERIAL.radius + MATERIAL.rimExpansion + STEP;
  const offset = MATERIAL.center - MATERIAL.origin;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    coverage[y * N + x] = smooth((coverageRadius - Math.hypot(x * STEP - offset, y * STEP - offset)) / 5);
  }

  function sample(x, y, field = height) {
    const gx = clamp((x - MATERIAL.origin) / STEP, 0, N - 1);
    const gy = clamp((y - MATERIAL.origin) / STEP, 0, N - 1);
    const ix = Math.min(N - 2, Math.floor(gx)), iy = Math.min(N - 2, Math.floor(gy));
    const fx = gx - ix, fy = gy - iy, i = iy * N + ix;
    return (field[i] * (1 - fx) + field[i + 1] * fx) * (1 - fy) +
      (field[i + N] * (1 - fx) + field[i + N + 1] * fx) * fy;
  }

  function depthOf(node, now) {
    if (node.leftAt === null) {
      const contact = state.contact;
      if (!contact) return pressDepth(node.dwell);
      return Math.max(TAP_DEPTH, pressDepth(contact.held), contact.inheritedDepth) * contact.pressure;
    }
    const t = clamp((now - node.leftAt) / pressRecoveryDuration(node.depth), 0, 1);
    return node.depth * (1 - smooth(t));
  }

  function rimLoad(now = state.time) {
    const contact = state.contact;
    if (!contact) {
      if (!releasedRim) return null;
      const recovery = smooth((now - releasedRim.time) / pressRecoveryDuration(releasedRim.depth));
      return { x: releasedRim.x, y: releasedRim.y, depth: releasedRim.depth * (1 - recovery),
        releasedAt: releasedRim.time };
    }
    const depth = depthOf(nodes.at(-1), now);
    if (!contact.rimStart) return { x: contact.x, y: contact.y, depth };
    const start = contact.rimStart;
    const blend = smooth((now - contact.startedAt) / MATERIAL.rimRegrabMs);
    return { x: start.x + (contact.x - start.x) * blend, y: start.y + (contact.y - start.y) * blend,
      depth: start.depth + (depth - start.depth) * blend };
  }

  function touch(x, y, now) {
    const previous = nodes.at(-1);
    const inheritedDepth = previous?.leftAt != null
      ? depthOf(previous, now) * (1 - smooth(Math.hypot(x - previous.x, y - previous.y) / 42)) : 0;
    const rim = rimLoad(state.time);
    const rimStart = rim?.depth > 0 ? rim : null;
    state.time = Math.max(state.time, now);
    state.contact = { x, y, anchorX: x, anchorY: y, lastAt: now, held: 0, pressure: 1,
      startedAt: now, inheritedDepth, rimStart };
    // Recovering presses retain their current height when the next press begins.
    nodes.push({ x, y, dwell: 0, depth: 0, leftAt: null });
    if (nodes.length > MATERIAL.maxTrail) nodes.shift();
    state.active = true;
  }

  function move(x, y, now, pressure = 1) {
    const contact = state.contact;
    if (!contact || !Number.isFinite(x + y + now)) return;
    const dx = x - contact.x, dy = y - contact.y, distance = Math.hypot(dx, dy);
    pressure = clamp(pressure, 0, 1);
    if (pressure !== contact.pressure) { contact.pressure = pressure; state.active = true; }
    if (distance < 0.01) return;
    const elapsed = Math.max(1, now - contact.lastAt);
    // Input position is exact. Only the liquid offset has a delayed response.
    state.sloshX = clamp(state.sloshX + dx / elapsed * 2, -12, 12);
    state.sloshY = clamp(state.sloshY + dy / elapsed * 2, -12, 12);
    let head = nodes.at(-1);
    if (head && Math.hypot(x - contact.anchorX, y - contact.anchorY) < MATERIAL.spacing) {
      head.x = x; head.y = y;
      state.contact = { ...contact, x, y, lastAt: now };
      state.active = true;
      return;
    }
    // A long hold at one spot does not age the path of the next drag before it is drawn.
    const trailElapsed = Math.min(elapsed, MAX_BARE_TRAIL_INTERVAL_MS);
    const steps = Math.max(1, Math.ceil(distance / MATERIAL.spacing));
    const count = Math.min(steps, MATERIAL.maxTrail);
    const initialDwell = head?.dwell ?? 0;
    for (let step = 1; step <= count; step++) {
      const t = step / count;
      if (head) {
        // Keep the departing path shallow while the held contact carries its full depth.
        head.depth = depthOf(head, now) * BARE_TRAIL_DEPTH_RATIO;
        head.leftAt = now - trailElapsed * (1 - t);
      }
      head = { x: contact.x + dx * t, y: contact.y + dy * t,
        dwell: initialDwell * Math.exp(-distance * t / 11) + Math.min(90, elapsed / count),
        depth: 0, leftAt: null };
      nodes.push(head);
    }
    if (nodes.length > MATERIAL.maxTrail) nodes.splice(0, nodes.length - MATERIAL.maxTrail);
    state.contact = { ...contact, x, y, anchorX: x, anchorY: y, lastAt: now };
    state.active = true;
  }

  function wave(x, y, strength, now, delay = 150, surfaceAnchor = null) {
    if (state.reducedMotion || strength < 0.08) return;
    if (waves.length >= MATERIAL.maxWaves) waves.shift();
    waves.push({ x, y, strength: clamp(strength, 0, 1), start: now + delay, surfaceAnchor });
    state.active = true;
  }

  function release(now, ripple = true, surfaceAnchor = null) {
    const head = nodes.at(-1);
    const strength = head && head.leftAt === null ? depthOf(head, now) : 0;
    if (head && head.leftAt === null) {
      const rim = rimLoad(state.time);
      if (rim) releasedRim = { ...rim, time: now };
      head.depth = strength; head.leftAt = now;
      if (ripple) wave(head.x, head.y, strength, now, pressRecoveryDuration(strength) * 0.4, surfaceAnchor);
    }
    state.contact = null;
    state.active = true;
    return strength;
  }

  function targets(now) {
    dent.fill(0); bulge.fill(0); target.fill(0);
    for (let n = nodes.length - 1; n >= 0; n--) {
      const node = nodes[n], depth = depthOf(node, now);
      if (depth < 0.0005 && node.leftAt !== null) { nodes.splice(n, 1); continue; }
      const radius = 17 + depth * 28, outer = radius * 1.85;
      const x0 = clamp(Math.floor((node.x - outer + 12) / STEP), 0, N - 1);
      const x1 = clamp(Math.ceil((node.x + outer + 12) / STEP), 0, N - 1);
      const y0 = clamp(Math.floor((node.y - outer + 12) / STEP), 0, N - 1);
      const y1 = clamp(Math.ceil((node.y + outer + 12) / STEP), 0, N - 1);
      // Overlapping contacts form one groove: max depth, never accumulated volume.
      for (let row = y0; row <= y1; row++) for (let col = x0; col <= x1; col++) {
        const i = row * N + col;
        if (!coverage[i]) continue;
        const dx = col * STEP - 12 - node.x, dy = row * STEP - 12 - node.y;
        const q = Math.hypot(dx, dy) / radius;
        const depression = depth * (1 - smooth(q));
        dent[i] = Math.max(dent[i], depression);
        const lagX = dx + state.sloshX, lagY = dy + state.sloshY;
        const bq = Math.hypot(lagX, lagY) / radius;
        const ring = smooth((bq - 0.45) / 0.5) * (1 - smooth((bq - 1) / 0.85));
        bulge[i] = Math.max(bulge[i], depth * ring);
      }
    }
    let removed = 0, positive = 0;
    for (let i = 0; i < dent.length; i++) {
      removed += dent[i] * coverage[i];
      // A broad reservoir still exists when a contact fills most of a small region.
      bulge[i] *= 1 - dent[i];
      positive += bulge[i] * coverage[i];
    }
    const ratio = positive ? removed / positive : 0;
    for (let i = 0; i < target.length; i++) {
      target[i] = MATERIAL.maxDent * (-dent[i] + bulge[i] * ratio);
    }
    for (let w = waves.length - 1; w >= 0; w--) {
      const ripple = waves[w], age = (now - ripple.start) / 1000;
      const travel = age * MATERIAL.waveSpeed;
      if (travel >= MATERIAL.waveTravel) { waves.splice(w, 1); continue; }
      if (age < 0) continue;
      const amplitude = ripple.strength * 1.1 * Math.exp(-age * 1.9) * smooth(age / 0.14);
      const front = 18 + travel, width = MATERIAL.waveWidth;
      for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
        const i = row * N + col;
        if (!coverage[i]) continue;
        const q = (Math.hypot(col * STEP - 12 - ripple.x, row * STEP - 12 - ripple.y) - front) / width;
        if (Math.abs(q) < 2.4) target[i] += amplitude * (1 - 2 * q * q) * Math.exp(-q * q * 2);
      }
    }
    // Keep the signed height integral balanced over the material grid.
    // Apply the same projection to target, height and velocity.
    project(target);
  }

  function project(field) {
    let sum = 0, weight = 0;
    for (let i = 0; i < field.length; i++) { sum += field[i] * coverage[i]; weight += coverage[i]; }
    const mean = sum / weight;
    for (let i = 0; i < field.length; i++) field[i] = coverage[i] ? field[i] - mean : 0;
  }

  function advance(now) {
    const wallElapsed = Math.max(0, now - state.time);
    const elapsed = Math.min(wallElapsed, 96);
    state.time = Math.max(state.time, now);
    const head = nodes.at(-1);
    if (state.contact && head) {
      head.dwell = Math.min(FULL_PRESS_MS, head.dwell + wallElapsed);
      state.contact.held = Math.min(FULL_PRESS_MS, state.contact.held + wallElapsed);
    }
    state.sloshX *= Math.exp(-wallElapsed / 230); state.sloshY *= Math.exp(-wallElapsed / 230);
    targets(now);
    let remaining = elapsed / 1000;
    const { spring, damping } = MATERIAL;
    while (remaining > 0) {
      const dt = Math.min(remaining, 1 / 120);
      const drag = Math.exp(-damping * dt);
      for (let row = 1; row < N - 1; row++) for (let col = 1; col < N - 1; col++) {
        const i = row * N + col;
        if (!coverage[i]) continue;
        // A free edge has no flat neighbour pulling it back to zero height.
        const lap = ((coverage[i - 1] ? height[i - 1] : height[i]) +
          (coverage[i + 1] ? height[i + 1] : height[i]) +
          (coverage[i - N] ? height[i - N] : height[i]) +
          (coverage[i + N] ? height[i + N] : height[i])) / 4 - height[i];
        velocity[i] += ((target[i] - height[i]) * spring + lap * MATERIAL.coupling) * dt;
        velocity[i] *= drag;
      }
      for (let i = 0; i < height.length; i++) height[i] += velocity[i] * dt;
      project(height); project(velocity);
      remaining -= dt;
    }
    let energy = 0, down = 0, up = 0, signed = 0;
    for (let i = 0; i < height.length; i++) {
      // A static field includes spatial coupling, so target-height is not zero
      // at equilibrium. Velocity determines whether it still needs frames.
      energy = Math.max(energy, Math.abs(velocity[i]) * 0.07);
      signed += height[i] * coverage[i];
      down += Math.max(0, -height[i]) * coverage[i] * STEP ** 2;
      up += Math.max(0, height[i]) * coverage[i] * STEP ** 2;
    }
    state.energy = energy; state.displaced = down; state.raised = up; state.signedHeight = signed * STEP ** 2;
    state.active = energy > 0.004 || waves.length > 0 || Math.hypot(state.sloshX, state.sloshY) > 0.01 ||
      nodes.some((node) => node.leftAt !== null || node.dwell < FULL_PRESS_MS) ||
      (!!releasedRim && !state.contact && rimLoad(now)?.depth > 0);
    if (!state.active && !state.contact) {
      height.fill(0); velocity.fill(0); target.fill(0);
      releasedRim = null;
      state.energy = state.displaced = state.raised = state.signedHeight = 0;
    }
    return state.active;
  }

  function impulse(x, y, strength, now) {
    wave(x, y, strength, now, 0);
    for (let row = 0; row < N; row++) for (let col = 0; col < N; col++) {
      const i = row * N + col;
      const q = Math.hypot(col * STEP - 12 - x, row * STEP - 12 - y) / 35;
      velocity[i] += strength * 15 * Math.exp(-q * q) * coverage[i];
    }
    project(velocity);
    state.active = true;
  }

  function reset(now = 0) {
    height.fill(0); velocity.fill(0); target.fill(0); nodes.length = 0; waves.length = 0;
    releasedRim = null;
    state.contact = null; state.active = false; state.time = now;
    state.sloshX = state.sloshY = state.energy = state.displaced = state.raised = state.signedHeight = 0;
  }

  return { state, sample, touch, move, release, advance, wave, impulse, reset, rimLoad,
    contactDepth: () => { const head = nodes.at(-1); return head ? depthOf(head, state.time) : 0; } };
}

// A smooth radial envelope carries the press and the stretched surface.
export function membraneRadii(material, pull = null, impact = null, load = material.rimLoad()) {
  const radii = new Float32Array(MEMBRANE_DIRECTIONS.length);
  const { center, radius, rimExpansion } = MATERIAL;
  const dx = load ? load.x - center : 0, dy = load ? load.y - center : 0;
  const pressAngle = Math.atan2(dy, dx);
  const expansion = rimExpansion * (load?.depth ?? 0) * outwardWeight(Math.hypot(dx, dy));
  for (let n = 0; n < radii.length; n++) {
    const angle = n / radii.length * Math.PI * 2;
    const flex = expansion * radialProfile(angle, pressAngle);
    let squash = 0;
    if (impact) {
      const worldAngle = angle + (impact.rotation ?? 0);
      const horizontal = Math.cos(worldAngle) ** 2, vertical = Math.sin(worldAngle) ** 2;
      squash = Math.abs(impact.x) * (3 * vertical - 7 * horizontal) +
        Math.abs(impact.y) * (3 * horizontal - 7 * vertical);
    }
    radii[n] = radius + flex + squash;
  }
  if (pull?.radius > 0) {
    const dx = pull.x - center, dy = pull.y - center;
    const direction = Math.atan2(dy, dx);
    const edgeRadius = pull.edgeRadius ?? membraneRadiusAt(radii, direction);
    const reach = pullExtension(Math.hypot(dx, dy) - edgeRadius);
    // The tether can take up slack quickly. The rounded surface gathers over
    // a longer distance so a normal mouse step cannot jump the lip forward.
    const crown = smooth(reach / MATERIAL.pullCrownDistance);
    const extension = reach + pull.radius * MATERIAL.pullCrownRatio * crown;
    for (let n = 0; n < radii.length; n++) {
      radii[n] += extension * radialProfile(n / radii.length * Math.PI * 2, direction, PULL_SHOULDER_FALLOFF);
    }
  }
  return radii;
}

export function retractMembraneCap(startRadii, bodyRadii, cap, progress) {
  if (progress === 0) return startRadii;
  const count = startRadii.length;
  const cx = cap.startX - MATERIAL.center, cy = cap.startY - MATERIAL.center;
  const tipX = cap.x - MATERIAL.center, tipY = cap.y - MATERIAL.center;
  const points = Array.from(startRadii, (radius, i) => {
    const ray = MEMBRANE_DIRECTIONS[i];
    const body = bodyRadii[i];
    const attachment = smooth((radius - MATERIAL.radius) / 28);
    const shoulder = radius + (body - radius) * progress;
    // The end moves and scales around its own center. The shoulder joins it to the body.
    const x = tipX + (ray.x * radius - cx) * cap.scale;
    const y = tipY + (ray.y * radius - cy) * cap.scale;
    return { x: ray.x * shoulder * (1 - attachment) + x * attachment,
      y: ray.y * shoulder * (1 - attachment) + y * attachment };
  });

  // Moving the cap changes the bearing of its vertices. Intersect the resulting
  // contour with the body's rays again so it shares the canvas clip and hit shape.
  return bodyRadii.map((radius, index) => {
    const ray = MEMBRANE_DIRECTIONS[index];
    for (let i = 0; i < count; i++) {
      const a = points[i], b = points[(i + 1) % count];
      const sideA = ray.x * a.y - ray.y * a.x, sideB = ray.x * b.y - ray.y * b.x;
      if (sideA === sideB || sideA * sideB > 0) continue;
      const t = sideA / (sideA - sideB);
      const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      radius = Math.max(radius, x * ray.x + y * ray.y);
    }
    return radius;
  });
}

export function membraneRadiusAt(radii, angle) {
  const index = ((angle / (Math.PI * 2) % 1 + 1) % 1) * radii.length;
  const left = Math.floor(index), blend = index - left;
  return radii[left] * (1 - blend) + radii[(left + 1) % radii.length] * blend;
}

export function bareSurfaceContact(raw) {
  const { center, reliefLimitStart, reliefLimit } = MATERIAL;
  const dx = raw.x - center, dy = raw.y - center;
  const distance = Math.hypot(dx, dy);
  const reach = softLimitDistance(distance, reliefLimitStart, reliefLimit, MAX_TETHER_DISTANCE);
  const scale = distance ? reach / distance : 1;
  return { x: center + dx * scale, y: center + dy * scale };
}

export function materialContact(material, raw, impact = null) {
  const dx = raw.x - 100, dy = raw.y - 100, distance = Math.hypot(dx, dy);
  // Resolve against the body alone, so the tip cannot feed back into its anchor.
  const radius = membraneRadiusAt(membraneRadii(material, null, impact), Math.atan2(dy, dx));
  const scale = distance > radius ? radius / distance : 1;
  return { x: 100 + dx * scale, y: 100 + dy * scale, radius };
}

export function membranePath(radii) {
  const points = Array.from(radii, (r, i) => ({ x: 100 + Math.cos(i / radii.length * Math.PI * 2) * r,
    y: 100 + Math.sin(i / radii.length * Math.PI * 2) * r }));
  const at = (i) => points[(i + points.length) % points.length];
  const f = (x) => x.toFixed(2);
  let path = `M ${f(points[0].x)} ${f(points[0].y)}`;
  for (let i = 0; i < points.length; i++) {
    const a = at(i - 1), b = at(i), c = at(i + 1), d = at(i + 2);
    path += `C ${f(b.x + (c.x - a.x) / 6)} ${f(b.y + (c.y - a.y) / 6)} ` +
      `${f(c.x - (d.x - b.x) / 6)} ${f(c.y - (d.y - b.y) / 6)} ${f(c.x)} ${f(c.y)}`;
  }
  return path + "Z";
}
