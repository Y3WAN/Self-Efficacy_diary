const EFFECTS_VOLUME = .6;
const SILENCE = 0.0001;
const MAX_CUE_WAIT_MS = 180;
const MIN_CUE_GAP_SECONDS = 0.035;

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

function createVoice(context, output, track) {
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
    track(source);
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
    track(oscillator);
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
  let voice;
  let nextOnset = 0;
  let generation = 0;
  const sources = new Set();
  const lastCue = new Map();

  function track(source) {
    if (sources.size >= 24) {
      const oldest = sources.values().next().value;
      oldest.stop?.(); sources.delete(oldest);
    }
    sources.add(source);
    const ended = source.onended;
    source.onended = () => { sources.delete(source); ended?.(); };
  }

  function stop() {
    generation++;
    for (const source of sources) { try { source.stop?.(); } catch (error) {
      if (error.name !== "InvalidStateError") console.warn("효과음 중단 실패", error);
    } }
    sources.clear(); lastCue.clear(); nextOnset = 0;
  }

  function unlock() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!context) {
      try {
        context = new AudioContext();
      } catch {
        return null;
      }
      const master = context.createGain();
      master.gain.value = EFFECTS_VOLUME ** 1.4;
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.attack.value = 0.003;
      master.connect(compressor);
      compressor.connect(context.destination);
      voice = createVoice(context, master, track);
    }
    const active = context;
    return active.state === "running" ? Promise.resolve(active) : active.resume().then(() => active, () => null);
  }

  return {
    // Called directly by a trusted pointer/key handler, before any RAF or await.
    // Safari can require this timing even though the cue itself is state-driven.
    prepare() { void unlock(); },
    play(name, strength = 0.5, delay = 0) {
      const requestedAt = performance.now();
      const requestedGeneration = generation;
      unlock()?.then((active) => {
        if (!active || requestedGeneration !== generation || active !== context ||
          performance.now() - requestedAt > MAX_CUE_WAIT_MS) return;
        if (active.currentTime - (lastCue.get(name) ?? -Infinity) < 0.09) return;
        if (nextOnset - active.currentTime > 0.15) return;
        const start = Math.max(nextOnset, active.currentTime + 0.012 + delay);
        nextOnset = start + MIN_CUE_GAP_SECONDS;
        lastCue.set(name, active.currentTime);
        playSound(voice, name, start, strength);
      });
    },
    stop,
    close() {
      stop();
      const active = context;
      context = null;
      nextOnset = 0;
      void active?.close().catch(() => null);
    },
  };
}
