/**
 * Seeded pseudo-random numbers. ALL randomness in IgniSense goes through here so a given
 * seed replays the exact same run (the hero demo must look identical every time).
 */
export interface Rng {
  /** uniform in [0, 1) */
  next(): number;
  /** standard normal N(0, 1) */
  gaussian(): number;
  /** normal with given mean and standard deviation */
  normal(mean: number, sd: number): number;
  /** uniform in [min, max) */
  uniform(min: number, max: number): number;
}

/** mulberry32: tiny, fast 32-bit generator; plenty for simulation noise. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: number): Rng {
  const uniform01 = mulberry32(seed);
  // Box–Muller produces normals in pairs; cache the spare one.
  let spare: number | null = null;

  const gaussian = (): number => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    let u = 0;
    while (u === 0) u = uniform01();
    const v = uniform01();
    const mag = Math.sqrt(-2 * Math.log(u));
    spare = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };

  return {
    next: uniform01,
    gaussian,
    normal: (mean, sd) => mean + sd * gaussian(),
    uniform: (min, max) => min + (max - min) * uniform01(),
  };
}

/** Default seed for the hero scenario. */
export const HERO_SEED = 20260928;
