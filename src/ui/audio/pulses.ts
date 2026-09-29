import { PROFILE } from '../../engine/profile';
import type { Rng } from '../../lib/rng';

/**
 * One loop of exhaust pressure at `refRpm`: `cycles` four-stroke cycles, a blowdown pulse per
 * firing in the order 1-3-4-2, scaled by that cylinder's measured firing strength. The player
 * pitches the loop to the real speed, which also shortens each pulse the way a real blowdown
 * shortens (it lasts a fixed crank angle, about 60°, not a fixed time).
 *
 * Pulse = gamma-shaped pressure rise and decay, then a rarefaction dip as the gas column
 * overshoots, with turbulent noise riding on the same envelope. Each firing varies a little in
 * size and timing (no two combustion events are identical), which is most of what makes a
 * synthetic engine sound less like a buzzer.
 */
export function exhaustLoop(
  sampleRate: number,
  strengths: Record<1 | 2 | 3 | 4, number>,
  rng: Rng,
  refRpm = 1500,
  cycles = 16,
): Float32Array {
  const cycle_s = 120 / refRpm; // 720° of crank
  const n = Math.round(cycle_s * cycles * sampleRate);
  const d = new Float32Array(n);
  const order = PROFILE.geometry.firingOrder;
  const blowdown_s = (60 / 360) * (60 / refRpm); // ≈ 60° of crank at refRpm
  const tau = blowdown_s / 3; // gamma peak at 2τ
  const len = Math.round(blowdown_s * 4 * sampleRate);
  let noiseLp = 0;
  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < 4; k++) {
      const s = strengths[order[k]!] ?? 1;
      if (s < 0.02) continue;
      const amp = s * (1 + 0.08 * (rng.next() * 2 - 1));
      const jitter = 0.03 * (cycle_s / 4) * (rng.next() * 2 - 1);
      const start = Math.round((c * cycle_s + (k * cycle_s) / 4 + jitter) * sampleRate);
      for (let i = 0; i < len; i++) {
        const t = i / sampleRate;
        const x = t / tau;
        const push = (x * x * Math.exp(2 - x)) / 4; // peak 1 at x = 2
        const xr = (t - 2.2 * blowdown_s) / (1.2 * tau);
        const dip = xr > 0 ? -0.35 * xr * Math.exp(1 - xr) : 0;
        noiseLp += 0.35 * (rng.next() * 2 - 1 - noiseLp); // lightly low-passed turbulence
        const env = push + Math.abs(dip);
        const j = (start + i + n) % n; // wrap, so the loop is seamless
        d[j]! += amp * (push + dip + 0.45 * env * noiseLp);
      }
    }
  }
  return d;
}

/**
 * Firing strength per cylinder from a MEASURED crank-speed window (the engine sound's source).
 * Sample 0 is cylinder 1's firing TDC; cylinders fire every 180° in the order 1-3-4-2. Between 45°
 * and 135° after its TDC only that cylinder pushes: the crank speeds up by ∝ ∫(A sin φ − T) dφ =
 * (πT/2)(√2 − 1) when it fires, and slows when it misfires. (From 0° to 90° the healthy rise is
 * exactly zero, so that span would measure only noise.)
 * The rise is averaged over the window's cycles (to beat sensor noise) and scaled so the strongest
 * cylinder is 1. This is the classic crank-acceleration misfire cue, and it is what you hear.
 */
export function firingStrengths(
  speed: ArrayLike<number>,
  samplesPerRev: number = PROFILE.crank.samplesPerRev,
): Record<1 | 2 | 3 | 4, number> {
  const seg = samplesPerRev / 2; // 180° per firing
  const firings = Math.floor(speed.length / seg);
  const order = PROFILE.geometry.firingOrder;
  const sum = [0, 0, 0, 0];
  const count = [0, 0, 0, 0];
  const avg = (from: number, n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += speed[from + i]!;
    return s / n;
  };
  const w = Math.max(1, Math.round(seg / 16)); // average a few samples at each end
  for (let k = 0; k < firings; k++) {
    const start = k * seg;
    const rise = avg(start + (3 * seg) / 4 - w / 2, w) - avg(start + seg / 4 - w / 2, w);
    const cyl = order[k % 4]!;
    sum[cyl - 1]! += rise;
    count[cyl - 1]!++;
  }
  const mean = sum.map((s, i) => (count[i] ? s / count[i]! : 0));
  const top = Math.max(...mean, 1e-9);
  const r = mean.map((m) => Math.max(0, m) / top);
  return { 1: r[0]!, 2: r[1]!, 3: r[2]!, 4: r[3]! };
}
