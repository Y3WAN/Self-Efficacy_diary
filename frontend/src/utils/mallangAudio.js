import largeWaxClip from "../assets/wax-audio/large.mp3";
import mediumWaxClip from "../assets/wax-audio/medium.mp3";
import smallWaxClip from "../assets/wax-audio/small.mp3";

const VOLUME_KEY = "codemyworld.mallang.volume";
const DEFAULT_VOLUME = 60;
const SILENCE = 0.0001;
const MAX_CUE_WAIT_MS = 1200;
const MIN_CUE_GAP_SECONDS = 0.035;

const WAX_CLIPS = { waxLarge: largeWaxClip, waxMedium: mediumWaxClip, waxSmall: smallWaxClip };

export function readMallangVolume() {
  try {
    const stored = localStorage.getItem(VOLUME_KEY);
    if (stored === null || !Number.isFinite(Number(stored))) return DEFAULT_VOLUME;
    return Math.round(Math.min(100, Math.max(0, Number(stored))));
  } catch {
    return DEFAULT_VOLUME;
  }
}

export function saveMallangVolume(percent) {
  try {
    localStorage.setItem(VOLUME_KEY, String(percent));
  } catch {
    // Playback can still use the slider value for this visit.
  }
}

function vary(amount) {
  return 1 + (Math.random() * 2 - 1) * amount;
}

function envelope(context, destination, start, duration, level, attack, hasBounce = false) {
  const gain = context.createGain();
  gain.gain.setValueAtTime(SILENCE, start);
  gain.gain.exponentialRampToValueAtTime(level, start + attack);
  if (hasBounce) gain.gain.exponentialRampToValueAtTime(level * 0.28, start + duration * 0.55);
  gain.gain.exponentialRampToValueAtTime(SILENCE, start + duration);
  gain.connect(destination);
  return gain;
}

function createVoice(context, output) {
  const noise = context.createBuffer(1, Math.round(context.sampleRate * 0.7), context.sampleRate);
  const samples = noise.getChannelData(0);
  for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;

  function burst(start, duration, frequency, level, resonance = 0.8, attack = 0.003) {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = envelope(context, output, start, duration, level, attack);
    source.buffer = noise;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = resonance;
    source.connect(filter);
    filter.connect(gain);
    source.onended = () => {
      source.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
    source.start(start, Math.random() * (noise.duration - duration), duration);
  }

  function glide(start, duration, from, to, level, type = "sine", attack = 0.009, spring = 0) {
    const oscillator = context.createOscillator();
    const gain = envelope(context, output, start, duration, level, attack, spring > 0);
    oscillator.type = type;
    if (spring) {
      // The frequency bounces around its glide as the gel loses tension.
      const curve = Float32Array.from({ length: 48 }, (_, index) => {
        const progress = index / 47;
        const phase = (progress * (2.7 + 0.55 * progress) - 0.09) * Math.PI * 2;
        const wobble = spring * Math.sin(phase) * (1 - progress) ** 1.65;
        const glideProgress = 1 - (1 - progress) ** 1.35;
        return from * (to / from) ** glideProgress * (1 + wobble);
      });
      oscillator.frequency.setValueCurveAtTime(curve, start, duration);
    } else {
      oscillator.frequency.setValueAtTime(from, start);
      oscillator.frequency.exponentialRampToValueAtTime(to, start + duration * 0.85);
    }
    oscillator.connect(gain);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function boing(start, duration, from, to, level, spring, attack = 0.012) {
    // A soft lower note carries the weight while the higher bend stays audible on the rebound.
    glide(start, duration * 0.88, from * 0.64, to * 0.47, level, "sine", attack, spring * 0.24);
    glide(start + 0.012, duration, from, to, level * 0.73, "triangle", attack + 0.005, spring);
  }

  return { burst, glide, boing };
}

function playSound(voice, name, start, strength) {
  const { burst, glide, boing } = voice;
  const pitch = vary(0.12);
  const time = vary(0.14);
  const level = vary(0.1);
  switch (name) {
    case "press":
      boing(start, 0.16 * time, 282 * pitch, 335 * pitch, 0.21 * level, 0.39, 0.009);
      burst(start, 0.042 * time, 690 * pitch, 0.032 * level, 0.85, 0.005);
      break;
    case "refill": {
      const duration = (0.17 + strength * 0.16) * time;
      boing(start, duration, 276 * pitch, 428 * pitch, (0.15 + strength * 0.095) * level, 0.42, 0.017);
      if (strength > 0.52) {
        glide(start + duration * 0.58, 0.13 * time, 394 * pitch, 353 * pitch,
          0.05 * strength * level, "sine", 0.013, 0.19);
      }
      break;
    }
    case "stretch":
      boing(start, 0.28 * time, 244 * pitch, 465 * pitch, 0.17 * level, 0.34, 0.023);
      burst(start + 0.038, 0.12 * time, 1190 * pitch, 0.038 * level, 1.45, 0.024);
      break;
    case "retract": {
      const duration = (0.14 + strength * 0.14) * time;
      boing(start, duration, 418 * pitch, 318 * pitch, 0.17 * level, 0.33, 0.014);
      boing(start + duration * 0.67, 0.12 * time, 282 * pitch, 365 * pitch, 0.12 * level, 0.4, 0.006);
      break;
    }
    case "wall": {
      const hit = (0.34 + strength * 0.66) * level;
      boing(start, 0.16 * time, 248 * pitch, 383 * pitch, 0.25 * hit, 0.42, 0.005);
      burst(start, 0.046 * time, 1060 * pitch, 0.083 * hit, 1.2, 0.002);
      glide(start + 0.008, 0.092 * time, 642 * pitch, 610 * pitch, 0.047 * hit, "sine", 0.004);
      break;
    }
  }
}

export function createMallangAudio() {
  let context = null;
  let master;
  let voice;
  let volume = DEFAULT_VOLUME / 100;
  let nextOnset = 0;
  const waxClips = new Map();

  function unlock() {
    if (volume === 0 || !window.AudioContext) return null;
    if (!context) {
      try {
        context = new window.AudioContext();
      } catch {
        return null;
      }
      master = context.createGain();
      master.gain.value = volume ** 1.4;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.attack.value = 0.003;
      master.connect(compressor);
      compressor.connect(context.destination);
      voice = createVoice(context, master);
    }
    const active = context;
    return active.state === "running" ? Promise.resolve(active) : active.resume().then(() => active, () => null);
  }

  function loadWaxClip(active, name) {
    if (waxClips.has(name)) return waxClips.get(name);
    const loading = fetch(WAX_CLIPS[name])
      .then((response) => {
        if (!response.ok) throw new Error("Could not load " + name + ": " + response.status);
        return response.arrayBuffer();
      })
      .then((data) => active.decodeAudioData(data))
      .catch((error) => {
        if (active === context) {
          waxClips.delete(name);
          console.warn("왁뿌볼 효과음을 불러오지 못했습니다.", error);
        }
        return null;
      });
    waxClips.set(name, loading);
    return loading;
  }

  function playWaxClip(active, buffer, start, strength) {
    const source = active.createBufferSource();
    const gain = active.createGain();
    source.buffer = buffer;
    gain.gain.value = 0.8 + 0.2 * strength;
    source.connect(gain);
    gain.connect(master);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
    };
    source.start(start);
  }

  return {
    prepareWax() {
      unlock()?.then((active) => {
        if (!active || active !== context) return;
        for (const name of Object.keys(WAX_CLIPS)) void loadWaxClip(active, name);
      });
    },
    play(name, strength = 0.5, delay = 0) {
      const requestedAt = performance.now();
      unlock()?.then(async (active) => {
        if (!active || active !== context || !volume) return;
        const isWax = Object.hasOwn(WAX_CLIPS, name);
        const clip = isWax ? await loadWaxClip(active, name) : null;
        if ((isWax && !clip) || active !== context || !volume || performance.now() - requestedAt > MAX_CUE_WAIT_MS) return;
        const start = Math.max(nextOnset, active.currentTime + 0.012 + delay);
        nextOnset = start + MIN_CUE_GAP_SECONDS;
        if (clip) playWaxClip(active, clip, start, strength);
        else playSound(voice, name, start, strength);
      });
    },
    setVolume(percent) {
      volume = percent / 100;
      if (context) master.gain.setTargetAtTime(volume ** 1.4, context.currentTime, 0.012);
    },
    close() {
      const active = context;
      context = null;
      waxClips.clear();
      nextOnset = 0;
      void active?.close().catch(() => null);
    },
  };
}
