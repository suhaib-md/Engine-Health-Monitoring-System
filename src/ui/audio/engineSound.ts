import { createRng } from '../../lib/rng';
import { useSim, useWindows } from '../sim/simClient';
import { exhaustLoop, firingStrengths } from './pulses';

/**
 * Engine sound (Phase 10), built from what the monitor measures, not from the hidden fault: each
 * cylinder's exhaust pulse is as loud as its measured power stroke (crank-speed rise), fired in the
 * order 1-3-4-2 at the REAL engine speed (the 3D view is slowed, the sound is not). A misfiring
 * cylinder's pulse goes missing, so the engine audibly stumbles once every two revolutions.
 *
 * Signal chain (a small model of an exhaust system):
 *   pulse loop (built at REF_RPM, pitched to the measured rpm)
 *   → soft saturation (growl; drive rises with load)
 *   → pipe resonance: feedback comb at c/2L ≈ 500 m/s / (2 × 2 m) ≈ 125 Hz
 *   → muffler body (peaking boost) → low-pass that opens with speed and load
 *   → level (rises with load) → compressor → speakers
 * The loop is rebuilt only when the firing strengths change (a misfire); speed changes are smooth
 * pitch ramps, so revving has no clicks. Demo sound design, not a recording of a real engine.
 */

const REF_RPM = 1500;
const REBUILD_MIN_MS = 400;
const RAMP_S = 0.06;

interface Chain extends ReturnType<typeof buildChain> {
  ctx: AudioContext;
}

/** The exhaust-system chain, ending at the context's speakers (or an offline render). */
export function buildChain(ctx: BaseAudioContext) {
  const input = ctx.createGain();
  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';

  // exhaust pipe: a pressure wave reflects off the open end and returns 2L/c later
  const pipeSum = ctx.createGain();
  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = 0.008;
  const fb = ctx.createGain();
  fb.gain.value = 0.42;
  const fbDamp = ctx.createBiquadFilter(); // the returning wave loses its highs
  fbDamp.type = 'lowpass';
  fbDamp.frequency.value = 1400;

  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 110;
  body.Q.value = 1.1;
  body.gain.value = 7;

  const highpass = ctx.createBiquadFilter(); // nothing useful below ~25 Hz, only speaker strain
  highpass.type = 'highpass';
  highpass.frequency.value = 25;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.Q.value = 0.8;

  const level = ctx.createGain();
  level.gain.value = 0;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;

  input.connect(shaper).connect(pipeSum);
  pipeSum.connect(delay).connect(fbDamp).connect(fb).connect(pipeSum);
  pipeSum.connect(body).connect(highpass).connect(lowpass).connect(level);
  level.connect(comp).connect(ctx.destination);
  return { input, shaper, lowpass, level };
}

/** How the exhaust sounds at a speed and load: brighter, louder and grittier as they rise. */
function tone(rpm: number, load: number) {
  return {
    cutoff_Hz: 500 + rpm * 0.35 + 1800 * load,
    // more pulses per second carry more energy: scale it back so revving gets louder, not deafening
    level: 0.26 * Math.pow(800 / Math.max(rpm, 400), 0.55) * (1 + 1.4 * load),
    drive: 1.2 + 2.5 * load,
  };
}

/** tanh saturation curve, normalised so full scale stays full scale */
function driveCurve(drive: number) {
  const curve = new Float32Array(1024);
  const norm = Math.tanh(drive);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(drive * x) / norm;
  }
  return curve;
}

/**
 * Renders `seconds` of steady engine sound offline (no speakers): the same loop, chain and tone as
 * the live sound. For checking levels and for listening to a setting without running the sim.
 */
export async function renderEngineSound(
  rpm: number,
  load: number,
  strengths: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 1, 3: 1, 4: 1 },
  seconds = 3,
  sampleRate = 44100,
) {
  const ctx = new OfflineAudioContext(1, Math.round(seconds * sampleRate), sampleRate);
  const ch = buildChain(ctx);
  const tn = tone(rpm, load);
  ch.lowpass.frequency.value = tn.cutoff_Hz;
  ch.level.gain.value = tn.level;
  ch.shaper.curve = driveCurve(tn.drive);
  const data = exhaustLoop(sampleRate, strengths, createRng(0x51d), REF_RPM);
  const buf = ctx.createBuffer(1, data.length, sampleRate);
  buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = rpm / REF_RPM;
  src.connect(ch.input);
  src.start();
  return (await ctx.startRendering()).getChannelData(0);
}

class EngineSound {
  private chain: Chain | null = null;
  private current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private lastBuild = 0;
  private lastKey = '';
  private lastDrive = -1;
  private unsub: (() => void)[] = [];
  private rng = createRng(0x51d);

  get enabled() {
    return this.chain != null;
  }

  /** Must be called from a click (browsers only start audio after a user gesture). */
  start() {
    if (this.chain) return;
    const ctx = new AudioContext();

    this.chain = { ctx, ...buildChain(ctx) };
    const kick = () => this.refresh();
    this.unsub.push(useWindows.subscribe(kick), useSim.subscribe(kick));
    this.refresh(true);
  }

  stop() {
    for (const u of this.unsub) u();
    this.unsub = [];
    void this.chain?.ctx.close();
    this.chain = null;
    this.current = null;
    this.lastKey = '';
    this.lastDrive = -1;
  }

  private refresh(force = false) {
    const ch = this.chain;
    if (!ch) return;
    const snap = useSim.getState().snapshot;
    const rpm = snap?.telemetry.rpm ?? 0;
    const load = Math.max(0, Math.min(1, snap?.telemetry.load ?? 0));
    const firing = snap?.lifecycle === 'WARMUP' || snap?.lifecycle === 'RUNNING';

    if (!firing || rpm < 300) {
      if (this.current) this.fadeOut(this.current);
      this.current = null;
      this.lastKey = 'off';
      return;
    }

    // continuous: speed and load only move parameters, they never rebuild the loop
    const t = ch.ctx.currentTime;
    this.current?.src.playbackRate.setTargetAtTime(rpm / REF_RPM, t, RAMP_S);
    const tn = tone(rpm, load);
    ch.lowpass.frequency.setTargetAtTime(tn.cutoff_Hz, t, RAMP_S);
    ch.level.gain.setTargetAtTime(tn.level, t, RAMP_S);
    this.setDrive(tn.drive);

    const now = performance.now();
    if (!force && now - this.lastBuild < REBUILD_MIN_MS) return;
    const win = useWindows.getState().windows;
    const strengths = win
      ? firingStrengths(win.speed)
      : ({ 1: 1, 2: 1, 3: 1, 4: 1 } as Record<1 | 2 | 3 | 4, number>);
    const key = [1, 2, 3, 4].map((c) => strengths[c as 1].toFixed(1)).join(',');
    if (key === this.lastKey && !force && this.current) return;
    this.lastKey = key;
    this.lastBuild = now;
    const data = exhaustLoop(ch.ctx.sampleRate, strengths, this.rng, REF_RPM);
    const buf = ch.ctx.createBuffer(1, data.length, ch.ctx.sampleRate);
    buf.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
    this.play(buf, rpm / REF_RPM);
  }

  /** tanh saturation; the curve is rebuilt only when the drive moves noticeably */
  private setDrive(drive: number) {
    if (Math.abs(drive - this.lastDrive) < 0.1 || !this.chain) return;
    this.lastDrive = drive;
    this.chain.shaper.curve = driveCurve(drive);
  }

  private play(buf: AudioBuffer, rate: number) {
    const { ctx, input } = this.chain!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.playbackRate.value = rate;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.12);
    src.connect(gain).connect(input);
    src.start();
    if (this.current) this.fadeOut(this.current);
    this.current = { src, gain };
  }

  private fadeOut(v: { src: AudioBufferSourceNode; gain: GainNode }) {
    const ctx = this.chain?.ctx;
    if (!ctx) return;
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(v.gain.gain.value, ctx.currentTime);
    v.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
    v.src.stop(ctx.currentTime + 0.15);
  }
}

export const engineSound = new EngineSound();
