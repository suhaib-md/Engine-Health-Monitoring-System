import { createRng } from '../../lib/rng';
import { PROFILE } from '../../engine/profile';
import { useSim, useWindows } from '../sim/simClient';
import { firingStrengths } from './pulses';

/**
 * Engine sound (Phase 10), built from what the monitor measures, not from the hidden fault: each
 * cylinder's exhaust pulse is as loud as its measured power stroke (crank-speed rise), fired in the
 * order 1-3-4-2 at the REAL engine speed (the 3D view is slowed, the sound is not). A misfiring
 * cylinder's pulse goes missing, so the engine audibly stumbles once every two revolutions.
 */

const CYCLES_PER_BUFFER = 8;
const REBUILD_MIN_MS = 400;

class EngineSound {
  private ctx: AudioContext | null = null;
  private out: AudioNode | null = null;
  private current: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private lastBuild = 0;
  private lastKey = '';
  private unsub: (() => void)[] = [];
  private rng = createRng(0x51d);

  get enabled() {
    return this.ctx != null;
  }

  /** Must be called from a click (browsers only start audio after a user gesture). */
  start() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 1600;
    const out = ctx.createGain();
    out.gain.value = 0.6;
    lowpass.connect(out).connect(ctx.destination);
    this.ctx = ctx;
    this.out = lowpass;
    const kick = () => this.refresh();
    this.unsub.push(useWindows.subscribe(kick), useSim.subscribe(kick));
    this.refresh(true);
  }

  stop() {
    for (const u of this.unsub) u();
    this.unsub = [];
    void this.ctx?.close();
    this.ctx = null;
    this.out = null;
    this.current = null;
    this.lastKey = '';
  }

  private refresh(force = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    const snap = useSim.getState().snapshot;
    const rpm = snap?.telemetry.rpm ?? 0;
    const firing = snap?.lifecycle === 'WARMUP' || snap?.lifecycle === 'RUNNING';
    const win = useWindows.getState().windows;
    const now = performance.now();
    if (!force && now - this.lastBuild < REBUILD_MIN_MS) return;

    if (!firing || rpm < 300) {
      if (this.current) this.fadeOut(this.current);
      this.current = null;
      this.lastKey = 'off';
      return;
    }
    const strengths = win
      ? firingStrengths(win.speed)
      : ({ 1: 1, 2: 1, 3: 1, 4: 1 } as Record<1 | 2 | 3 | 4, number>);
    const key = `${Math.round(rpm / 25)}|${[1, 2, 3, 4].map((c) => strengths[c as 1].toFixed(1)).join(',')}`;
    if (key === this.lastKey && !force) return;
    this.lastKey = key;
    this.lastBuild = now;
    this.play(this.build(ctx, rpm, strengths));
  }

  /** CYCLES_PER_BUFFER four-stroke cycles of exhaust pulses at `rpm`, loopable. */
  private build(ctx: AudioContext, rpm: number, s: Record<1 | 2 | 3 | 4, number>) {
    const sr = ctx.sampleRate;
    const cycle_s = 120 / rpm; // 720° of crank
    const n = Math.round(cycle_s * CYCLES_PER_BUFFER * sr);
    const buf = ctx.createBuffer(1, n, sr);
    const d = buf.getChannelData(0);
    const order = PROFILE.geometry.firingOrder;
    const tauNoise = 0.004;
    const tauThump = 0.009;
    const body = 70 + rpm / 60; // chest thump rises a little with speed
    const len = Math.round(0.03 * sr);
    for (let c = 0; c < CYCLES_PER_BUFFER; c++) {
      for (let k = 0; k < 4; k++) {
        const amp = s[order[k]!] ?? 1;
        if (amp < 0.02) continue;
        const start = Math.round((c * cycle_s + (k * cycle_s) / 4) * sr);
        for (let i = 0; i < len && start + i < n; i++) {
          const t = i / sr;
          const pop = (this.rng.next() * 2 - 1) * Math.exp(-t / tauNoise);
          const thump = Math.sin(2 * Math.PI * body * t) * Math.exp(-t / tauThump);
          d[start + i]! += 0.35 * amp * (0.55 * pop + thump);
        }
      }
    }
    return buf;
  }

  private play(buf: AudioBuffer) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.08);
    src.connect(gain).connect(this.out!);
    src.start();
    if (this.current) this.fadeOut(this.current);
    this.current = { src, gain };
  }

  private fadeOut(v: { src: AudioBufferSourceNode; gain: GainNode }) {
    const ctx = this.ctx;
    if (!ctx) return;
    v.gain.gain.cancelScheduledValues(ctx.currentTime);
    v.gain.gain.setValueAtTime(v.gain.gain.value, ctx.currentTime);
    v.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.08);
    v.src.stop(ctx.currentTime + 0.1);
  }
}

export const engineSound = new EngineSound();
