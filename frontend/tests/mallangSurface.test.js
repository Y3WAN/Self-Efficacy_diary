import test from "node:test";
import assert from "node:assert/strict";
import { createMallangSurface } from "../src/utils/mallangSurface.js";

function harness(t) {
  let now = 0, nextFrame = 0, contact;
  const frames = new Map(), listeners = new Set();
  const media = { matches: false, addEventListener: (_, fn) => listeners.add(fn),
    removeEventListener: (_, fn) => listeners.delete(fn) };
  const originals = new Map();
  const globals = { performance: { now: () => now }, window: { matchMedia: () => media },
    requestAnimationFrame: (fn) => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id) };
  for (const [name, value] of Object.entries(globals)) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  t.after(() => { for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  } });
  const noop = () => {};
  const context = { translate: noop, rotate: noop, scale: noop, save: noop, restore: noop,
    clearRect: noop, fillRect: noop, createRadialGradient: () => ({ addColorStop: noop }) };
  const canvas = { getContext: () => context };
  const surface = createMallangSurface(canvas, 0.47, noop, (value) => { contact = value; });
  const tick = (time) => { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn(now)); };
  return { surface, frames, media, listeners, tick, contact: () => contact,
    time: (value) => { now = value; }, preference: (value) => { media.matches = value; listeners.forEach((fn) => fn()); } };
}

test("a keyboard tap creates a dent at its own point even without a prior pointer press", (t) => {
  const h = harness(t);
  h.surface.addDrop(0.25, 0.5);
  h.tick(16);
  assert(h.contact().trail.length > 0);
  assert.equal(h.contact().trail.at(-1).x, 0.25);
});

test("a keyboard tap after a pointer press does not reuse the old pointer location", (t) => {
  const h = harness(t);
  h.surface.setIndentation(0.8, 0.5); h.tick(760);
  h.surface.clearIndentation();
  for (let now = 800; now <= 5000; now += 50) h.tick(now);
  h.surface.addDrop(0.25, 0.5); h.tick(5016);
  assert.equal(h.contact().trail.at(-1).x, 0.25);
});

test("hold, move, release and stop schedule a single frame and finish cleanly", (t) => {
  const h = harness(t);
  h.surface.setIndentation(0.5, 0.5); h.tick(380);
  assert(h.contact().depth > 0 && h.contact().depth < 1);
  h.tick(760); assert.equal(h.contact().depth, 1); assert.equal(h.frames.size, 0);
  h.time(800); h.surface.moveIndentation(0.7, 0.5); h.tick(816);
  assert(h.contact().trail.length > 1); assert(h.frames.size <= 1);
  h.surface.clearIndentation();
  for (let now = 850; now <= 3000; now += 50) h.tick(now);
  assert.equal(h.contact(), undefined); assert.equal(h.frames.size, 0);
  h.surface.setIndentation(0.4, 0.5); h.tick(3800); h.surface.stop();
  assert.equal(h.contact(), undefined); assert.equal(h.frames.size, 0);
});

test("reduced-motion preference clears a stationary hold without waiting for another input", (t) => {
  const h = harness(t);
  h.surface.setIndentation(0.5, 0.5); h.tick(760);
  assert.equal(h.frames.size, 0); assert.equal(h.contact().depth, 1);
  h.preference(true);
  assert.equal(h.contact(), undefined);
  h.surface.dispose(); assert.equal(h.listeners.size, 0);
});

test("rapid repeated taps and style changes leave no stale contact or queued animation", (t) => {
  const h = harness(t);
  for (let i = 0; i < 200; i++) { h.time(i * 5); h.surface.addDrop(0.5, 0.5); }
  assert(h.frames.size <= 1);
  for (let now = 1000; now < 10000; now += 50) h.tick(now);
  assert.equal(h.frames.size, 0);
  h.surface.setIndentation(0.5, 0.5); h.tick(10760);
  h.surface.setFlatStyle(true); assert.equal(h.contact(), undefined);
  assert.equal(h.frames.size, 0);
});
