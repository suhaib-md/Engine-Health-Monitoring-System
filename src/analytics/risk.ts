import { clamp } from '../lib/math';

/** Draft §21: risk rises from 0 at the warning boundary W to 1 at the critical boundary C. */
export const riskHigh = (x: number, warn: number, crit: number) =>
  clamp((x - warn) / (crit - warn), 0, 1);

/** Low side: C < W. */
export const riskLow = (x: number, warn: number, crit: number) =>
  clamp((warn - x) / (warn - crit), 0, 1);

export const riskBand = (x: number, lo: [number, number], hi: [number, number]) =>
  Math.max(riskLow(x, lo[0], lo[1]), riskHigh(x, hi[0], hi[1]));
