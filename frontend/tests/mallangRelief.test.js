import test from "node:test";
import assert from "node:assert/strict";
import { createMallangRelief } from "../src/utils/mallangRelief.js";
import { MATERIAL } from "../src/utils/mallangMaterial.js";

const options = { size: 201, origin: -100, step: 2, maxDepth: 15 };
const point = (x, y, depth = 1) => ({ x, y, depth, ux: 1, uy: 0 });
function at(field, x, y) { return field[(y + 100) / 2 * 201 + (x + 100) / 2]; }

test("the restored dent has a depressed center and raised shoulders without accumulating overlap", () => {
  const relief = createMallangRelief(options), contact = point(100, 100);
  const field = relief.update({ contact, trail: [], now: 0 });
  assert.equal(at(field, 100, 100), -15);
  assert(at(field, 134, 100) > 0);
  assert(Math.abs(field.reduce((sum, value) => sum + value, 0)) < .01);
  const previous = Float32Array.from(field);
  relief.update({ contact, trail: Array.from({ length: 72 }, () => ({ ...contact, leftAt: 0 })), now: 0 });
  assert.deepEqual(field, previous, "overlap cannot deepen a held groove indefinitely");
  assert.equal(at(field, 170, 100), 0);
});

test("connected departed dents fill from the older end and disappear without moving the head", () => {
  const relief = createMallangRelief(options);
  const trail = Array.from({ length: 21 }, (_, index) => ({
    ...point(40 + index * 2, 100), leftAt: index * 16,
  }));
  const field = relief.update({ contact: point(140, 100), trail, now: 450 });
  assert(at(field, 42, 100) > at(field, 78, 100), "older departure has filled further");
  for (let x = 48; x <= 76; x += 2) assert(at(field, x, 100) < -1, "the groove stays connected");
  assert.equal(at(field, 140, 100), -15);
  relief.update({ contact: point(140, 100), trail, now: 1100 });
  assert.equal(at(field, 60, 100), 0);
  assert.equal(at(field, 140, 100), -15);
  relief.update({ contact: null, trail: [], now: 1200 });
  assert(field.every(value => value === 0));
});

test("departed dents use local surface positions and reused buffers", () => {
  const relief = createMallangRelief(options), buffer = relief.height;
  const trail = [{ ...point(140, 100), leftAt: 0 }];
  relief.update({ contact: point(160, 100), trail, now: 80 });
  assert(at(buffer, 140, 100) < -10);
  assert(at(buffer, 100, 100) >= 0);
  assert.equal(at(buffer, 160, 100), -15);
  relief.update({ contact: null, trail, now: 900 });
  assert.equal(relief.height, buffer);
  assert(buffer.every(Number.isFinite));
  assert(buffer.every(value => value === 0));
});

const waveOptions = { ...options, waveSettings: {
  speed: MATERIAL.waveSpeed, width: MATERIAL.waveWidth, travel: MATERIAL.waveTravel,
} };
const wave = (x = 100, start = 1000) => ({ x, y: 100, strength: 1, start });
function frontAt(field) {
  let peak = -Infinity, position = 0;
  for (let x = 102; x <= 298; x += 2) {
    const value = at(field, x, 100);
    if (value > peak) { peak = value; position = x - 100; }
  }
  return position;
}

test("ripples wait for recovery, expand at the existing speed and disappear completely", () => {
  const relief = createMallangRelief(waveOptions), waves = [wave()];
  relief.update({ contact: null, trail: [], waves, now: 999 });
  assert(relief.height.every(value => value === 0));
  relief.update({ contact: null, trail: [], waves, now: 1300 });
  const early = frontAt(relief.height), earlyPeak = Math.max(...relief.height);
  assert(Math.abs(early - (18 + MATERIAL.waveSpeed * .3)) <= 2);
  relief.update({ contact: null, trail: [], waves, now: 1600 });
  assert(Math.abs(frontAt(relief.height) - early - MATERIAL.waveSpeed * .3) <= 2);
  assert(Math.max(...relief.height) < earlyPeak, "amplitude damps while the front travels");
  relief.update({ contact: null, trail: [], waves, now: 3600 });
  assert(relief.height.every(value => value === 0));
  assert.equal(waves.length, 1, "the renderer must not mutate the material's event queue");
});

test("ripple width changes its band independently of travel speed", () => {
  const broad = createMallangRelief(waveOptions);
  const narrow = createMallangRelief({ ...waveOptions, waveSettings: { ...waveOptions.waveSettings,
    width: MATERIAL.waveWidth / 2 } });
  const input = { contact: null, trail: [], waves: [wave()], now: 1400 };
  broad.update(input); narrow.update(input);
  assert.equal(frontAt(broad.height), frontAt(narrow.height));
  function halfBand(field) {
    const peak = Math.max(...field); let count = 0;
    for (let x = 102; x <= 298; x += 2) if (at(field, x, 100) > peak / 2) count++;
    return count;
  }
  assert(halfBand(broad.height) > halfBand(narrow.height) * 1.5);
  assert.equal(MATERIAL.waveWidth, 94 * .19 * 1.1);
});

test("independent ripples coexist with a dent and overlap without growing unbounded", () => {
  const relief = createMallangRelief(waveOptions), a = wave(64, 1000), b = wave(146, 1150);
  const input = { contact: point(100, 150), trail: [], now: 1500 };
  relief.update({ ...input, waves: [a] }); const singleA = Float32Array.from(relief.height);
  relief.update({ ...input, waves: [b] }); const singleB = Float32Array.from(relief.height);
  relief.update({ ...input, waves: [a, b] });
  assert(relief.height.some((value, i) => Math.abs(value - singleA[i]) > .1));
  assert(relief.height.some((value, i) => Math.abs(value - singleB[i]) > .1));
  assert(at(relief.height, 100, 150) < -14, "adding waves must retain the pressed dent");
  relief.update({ contact: null, trail: [], waves: Array.from({ length: 12 }, () => a), now: 1500 });
  assert(relief.height.every(value => Math.abs(value) <= 5));
  relief.update({ contact: point(100, 150), trail: [], waves: [a, b], now: 6000 });
  const after = Float32Array.from(relief.height);
  relief.update({ contact: point(100, 150), trail: [], now: 6000 });
  assert.deepEqual(relief.height, after, "expired waves leave neither a ghost nor a changed dent");
});
