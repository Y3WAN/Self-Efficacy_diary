import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { setImmediate } from "node:timers/promises";

// Node does not load MP3 imports; only asset URLs are substituted, leaving the audio implementation intact.
const source = (await readFile(new URL("../src/utils/mallangAudio.js", import.meta.url), "utf8"))
  .replace(/^import (\w+) from "([^"]+\.mp3)";$/gm, (_, name, url) => `const ${name} = ${JSON.stringify(url)};`);
const { createMallangAudio, readMallangVolume, saveMallangVolume } =
  await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));

function audioHarness(t, options = {}) {
  const contexts = [], starts = [], fetches = [], warnings = [], storage = new Map();
  const automation = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {},
    setValueCurveAtTime() {}, setTargetAtTime(value) { this.value = value; } });
  class Context {
    constructor() { this.state = options.suspended ? "suspended" : "running";
      this.currentTime = 0; this.sampleRate = 1000; this.destination = {}; contexts.push(this); }
    createGain() { return { gain: automation(), connect() {}, disconnect() {} }; }
    createDynamicsCompressor() { return { threshold: {}, attack: {}, connect() {} }; }
    createBuffer(_, length) { return { duration: length / this.sampleRate, getChannelData: () => new Float32Array(length) }; }
    createBiquadFilter() { return { frequency: {}, Q: {}, connect() {}, disconnect() {} }; }
    createBufferSource() { return { connect() {}, disconnect() {}, start: (...args) => starts.push({ kind: "buffer", args }) }; }
    createOscillator() { return { frequency: automation(), connect() {}, disconnect() {}, stop() {},
      start: (...args) => starts.push({ kind: "oscillator", args }) }; }
    resume() { return options.resume ? options.resume(this) : Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({ duration: 0.2 }); }
    close() { this.state = "closed"; return Promise.resolve(); }
  }
  const originals = new Map();
  const values = { window: { AudioContext: Context }, localStorage: {
    getItem: (key) => { if (options.storageDenied) throw new Error("denied"); return storage.get(key) ?? null; },
    setItem: (key, value) => { if (options.storageDenied) throw new Error("denied"); storage.set(key, value); } },
    fetch: async (url) => { fetches.push(url); return { ok: !options.fetchFailed, status: 503,
      arrayBuffer: async () => new ArrayBuffer(8) }; } };
  for (const [key, value] of Object.entries(values)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  }
  t.mock.method(console, "warn", (...args) => warnings.push(args));
  t.after(() => { for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  } });
  return { contexts, starts, fetches, warnings, storage, options, flush: async () => { await setImmediate(); await setImmediate(); } };
}

test("volume defaults, clamping, invalid values and blocked storage are handled", (t) => {
  const h = audioHarness(t);
  assert.equal(readMallangVolume(), 60);
  for (const [stored, expected] of [["-5", 0], ["150", 100], ["30.8", 31], ["bad", 60]]) {
    h.storage.set("codemyworld.mallang.volume", stored); assert.equal(readMallangVolume(), expected);
  }
  saveMallangVolume(42); assert.equal(readMallangVolume(), 42);
  h.options.storageDenied = true;
  assert.equal(readMallangVolume(), 60); assert.doesNotThrow(() => saveMallangVolume(30));
});

test("mute avoids creating an audio context and ordinary cues share one context", async (t) => {
  const h = audioHarness(t), audio = createMallangAudio();
  audio.setVolume(0); audio.play("press"); await h.flush();
  assert.equal(h.contexts.length, 0); assert.equal(h.starts.length, 0);
  audio.setVolume(60);
  for (const name of ["press", "refill", "stretch", "retract", "wall"]) audio.play(name, 0.8);
  await h.flush(); assert.equal(h.contexts.length, 1); assert(h.starts.length > 5);
  audio.close(); assert.equal(h.contexts[0].state, "closed");
});

test("a pending unlock cannot play after close, and StrictMode-style reuse can reopen", async (t) => {
  let resume;
  const h = audioHarness(t, { suspended: true, resume: () => new Promise((resolve) => { resume = resolve; }) });
  const audio = createMallangAudio(); audio.play("press"); audio.close(); resume(); await h.flush();
  assert.equal(h.starts.length, 0);
  h.options.resume = null; audio.play("press"); await h.flush();
  assert.equal(h.contexts.length, 2); assert(h.starts.length > 0); audio.close();
});

test("wax assets are cached and cleared when the context closes", async (t) => {
  const h = audioHarness(t), audio = createMallangAudio();
  audio.prepareWax(); await h.flush(); assert.equal(h.fetches.length, 3);
  audio.play("waxLarge"); audio.play("waxMedium"); await h.flush();
  assert.equal(h.fetches.length, 3); assert.equal(h.starts.length, 2);
  audio.close(); audio.prepareWax(); await h.flush(); assert.equal(h.fetches.length, 6); audio.close();
});

test("failed wax downloads are reported, stay silent and can retry", async (t) => {
  const h = audioHarness(t, { fetchFailed: true }), audio = createMallangAudio();
  audio.play("waxLarge"); await h.flush();
  assert.equal(h.starts.length, 0); assert.equal(h.warnings.length, 1);
  h.options.fetchFailed = false; audio.play("waxLarge"); await h.flush();
  assert.equal(h.fetches.length, 2); assert.equal(h.starts.length, 1); audio.close();
});
