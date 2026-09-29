import { PROFILE } from '../../engine/profile';

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
