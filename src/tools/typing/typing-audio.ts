// Mechanical switch synthesizer, metronome, and cue sounds.
// Uses the browser's Web Audio API directly. Every sound is generated on
// the fly so the tool ships offline with zero audio assets or transport dependencies.

export type SwitchProfile = 'off' | 'mx-blue' | 'mx-red' | 'mx-brown' | 'holy-panda' | 'topre' | 'typewriter';

export type KeystrokeSound = 'correct' | 'incorrect' | 'space' | 'enter' | 'backspace';

export function classifyKeystrokeSound(
  key: string,
  expected: string | undefined,
  caseSensitive: boolean,
): KeystrokeSound | null {
  if (key === 'Backspace') return 'backspace';
  if (key === 'Enter') return expected === '\n' ? 'enter' : null;
  if (key.length !== 1 || expected === undefined) return null;
  const actualValue = caseSensitive ? key : key.toLocaleLowerCase();
  const expectedValue = caseSensitive ? expected : expected.toLocaleLowerCase();
  if (actualValue !== expectedValue) return 'incorrect';
  return key === ' ' ? 'space' : 'correct';
}

export interface AudioController {
  playKeystroke(kind: 'correct' | 'incorrect' | 'space' | 'enter' | 'backspace'): void;
  playMilestone(): void;
  playFail(): void;
  playCompletion(): void;
  setSwitch(profile: SwitchProfile): void;
  setVolume(v: number): void;
  startMetronome(bpm: number): void;
  stopMetronome(): void;
  dispose(): void;
}

interface RuntimeState {
  ctx: AudioContext | null;
  master: GainNode | null;
  profile: SwitchProfile;
  metronomeId: number | null;
  metronomeInterval: number | null;
  bpm: number;
}

function ensure(state: RuntimeState): { ctx: AudioContext; master: GainNode } | null {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return null;
  if (!state.ctx) {
    try {
      state.ctx = new AudioContext();
      state.master = state.ctx.createGain();
      state.master.gain.value = 0.35;
      state.master.connect(state.ctx.destination);
    } catch {
      return null;
    }
  }
  if (state.ctx && state.ctx.state === 'suspended') {
    void state.ctx.resume().catch(() => undefined);
  }
  if (!state.ctx || !state.master) return null;
  return { ctx: state.ctx, master: state.master };
}

function whiteNoise(ctx: AudioContext, durationMs: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * (durationMs / 1000));
  const buffer = ctx.createBuffer(1, Math.max(1, length), sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

interface SwitchShape {
  clickTone: number;
  clickDurationMs: number;
  bottomDurationMs: number;
  bottomTone: number;
  filterFreq: number;
  noise: number; // 0..1 mix
  volume: number;
}

const PROFILES: Record<Exclude<SwitchProfile, 'off'>, SwitchShape> = {
  'mx-blue':    { clickTone: 3200, clickDurationMs: 25, bottomTone: 1400, bottomDurationMs: 40, filterFreq: 4000, noise: 0.75, volume: 0.85 },
  'mx-red':     { clickTone: 900,  clickDurationMs: 12, bottomTone: 550,  bottomDurationMs: 30, filterFreq: 1800, noise: 0.35, volume: 0.55 },
  'mx-brown':   { clickTone: 1600, clickDurationMs: 18, bottomTone: 800,  bottomDurationMs: 32, filterFreq: 2800, noise: 0.5,  volume: 0.65 },
  'holy-panda': { clickTone: 2400, clickDurationMs: 22, bottomTone: 1100, bottomDurationMs: 38, filterFreq: 3600, noise: 0.6,  volume: 0.8 },
  'topre':      { clickTone: 700,  clickDurationMs: 15, bottomTone: 380,  bottomDurationMs: 45, filterFreq: 1400, noise: 0.25, volume: 0.5 },
  'typewriter': { clickTone: 4200, clickDurationMs: 40, bottomTone: 220,  bottomDurationMs: 90, filterFreq: 5200, noise: 0.9,  volume: 0.95 },
};

function playSwitch(state: RuntimeState, profile: SwitchProfile, kind: 'correct' | 'incorrect' | 'space' | 'enter' | 'backspace'): void {
  if (profile === 'off') return;
  const audio = ensure(state);
  if (!audio) return;
  const { ctx, master } = audio;
  const shape = PROFILES[profile];
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = shape.filterFreq;
  gain.gain.value = 0;
  gain.connect(master);
  filter.connect(gain);

  // Attack click: brief oscillator + noise burst.
  const osc = ctx.createOscillator();
  osc.type = kind === 'space' ? 'sawtooth' : 'triangle';
  const clickTone = kind === 'space' ? shape.bottomTone * 0.75 : shape.clickTone;
  const bottomTone = kind === 'incorrect' ? shape.bottomTone * 0.6 : shape.bottomTone;
  osc.frequency.setValueAtTime(clickTone, now);
  osc.frequency.exponentialRampToValueAtTime(bottomTone, now + shape.bottomDurationMs / 1000);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(shape.volume * 0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.0001, now + (shape.clickDurationMs + shape.bottomDurationMs) / 1000);
  osc.connect(oscGain);
  oscGain.connect(filter);

  const noiseBuf = whiteNoise(ctx, shape.clickDurationMs);
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(shape.volume * shape.noise * 0.5, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + shape.clickDurationMs / 1000);
  noiseSrc.connect(noiseGain);
  noiseGain.connect(filter);

  gain.gain.setValueAtTime(1, now);
  gain.gain.setTargetAtTime(0, now + (shape.clickDurationMs + shape.bottomDurationMs) / 1000, 0.05);

  osc.start(now);
  osc.stop(now + (shape.clickDurationMs + shape.bottomDurationMs) / 1000 + 0.02);
  noiseSrc.start(now);
  noiseSrc.stop(now + shape.clickDurationMs / 1000 + 0.02);

  // Cleanup: disconnect nodes shortly after playback ends.
  window.setTimeout(() => {
    try { gain.disconnect(); filter.disconnect(); oscGain.disconnect(); noiseGain.disconnect(); } catch { /* noop */ }
  }, shape.clickDurationMs + shape.bottomDurationMs + 200);
}

function playTone(state: RuntimeState, opts: { freq: number; durationMs: number; type?: OscillatorType; volume?: number; sweepTo?: number }): void {
  const audio = ensure(state);
  if (!audio) return;
  const { ctx, master } = audio;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(opts.freq, now);
  if (opts.sweepTo) osc.frequency.exponentialRampToValueAtTime(opts.sweepTo, now + opts.durationMs / 1000);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime((opts.volume ?? 0.5), now + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, now + opts.durationMs / 1000);
  osc.connect(g);
  g.connect(master);
  osc.start(now);
  osc.stop(now + opts.durationMs / 1000 + 0.05);
  window.setTimeout(() => { try { g.disconnect(); } catch { /* noop */ } }, opts.durationMs + 200);
}

export function createAudioController(initialProfile: SwitchProfile = 'off'): AudioController {
  const state: RuntimeState = {
    ctx: null,
    master: null,
    profile: initialProfile,
    metronomeId: null,
    metronomeInterval: null,
    bpm: 0,
  };
  return {
    playKeystroke(kind) {
      playSwitch(state, state.profile, kind);
    },
    playMilestone() {
      playTone(state, { freq: 660, durationMs: 120, type: 'triangle', volume: 0.4 });
      window.setTimeout(() => playTone(state, { freq: 990, durationMs: 160, type: 'triangle', volume: 0.4 }), 120);
    },
    playFail() {
      playTone(state, { freq: 220, durationMs: 200, type: 'square', volume: 0.4, sweepTo: 110 });
    },
    playCompletion() {
      playTone(state, { freq: 523, durationMs: 140, type: 'sine', volume: 0.5 });
      window.setTimeout(() => playTone(state, { freq: 659, durationMs: 140, type: 'sine', volume: 0.5 }), 140);
      window.setTimeout(() => playTone(state, { freq: 784, durationMs: 240, type: 'sine', volume: 0.5 }), 280);
    },
    setSwitch(profile) { state.profile = profile; },
    setVolume(v) {
      const clamped = Math.max(0, Math.min(1, v));
      const audio = ensure(state);
      if (audio) audio.master.gain.value = clamped;
    },
    startMetronome(bpm) {
      this.stopMetronome();
      if (bpm < 30 || bpm > 320) return;
      state.bpm = bpm;
      const intervalMs = Math.round(60000 / bpm);
      state.metronomeInterval = intervalMs;
      const tick = () => playTone(state, { freq: 1000, durationMs: 40, type: 'square', volume: 0.28 });
      tick();
      state.metronomeId = window.setInterval(tick, intervalMs);
    },
    stopMetronome() {
      if (state.metronomeId != null) {
        window.clearInterval(state.metronomeId);
        state.metronomeId = null;
        state.metronomeInterval = null;
      }
    },
    dispose() {
      this.stopMetronome();
      if (state.ctx) {
        try { state.ctx.close(); } catch { /* noop */ }
      }
      state.ctx = null;
      state.master = null;
    },
  };
}
