import { ANALYTICS } from './config';
import type { SubsystemHealth, SubsystemId } from './types';

/**
 * Remaining useful life (review, "Remaining useful life"; draft §25, §46; Q-19). Once per
 * simulated second each subsystem's health index (0–100) is logged; a straight line is fitted over
 * the last 120 s. With current health H, failure threshold H_fail and slope b (standard error s_b):
 *   RUL = (H − H_fail)/|b|,   band = (H − H_fail)/(|b| ± 2 s_b)
 * shown only when the slope is negative and |b| > 2 s_b; otherwise "trend not significant".
 * Times are SIMULATED (they scale with the time-warp). The fit assumes the current load continues:
 * raise the load and a stress-dependent fault wears faster, so the RUL shrinks.
 */

export interface RulEstimate {
  subsystem: SubsystemId;
  name: string;
  health: number;
  /** health points per simulated minute (negative = degrading) */
  slopePerMin: number;
  significant: boolean;
  rul_s: number | null;
  low_s: number | null;
  high_s: number | null;
  /** one line for the UI */
  text: string;
}

const RUL_SUBSYSTEMS: readonly SubsystemId[] = [
  'lubrication',
  'thermal',
  'electrical',
  'combustion',
  'vibration',
];

/** "~23 min", "~2.4 h", "40 s" (simulated time). */
export function formatSim(s: number) {
  if (s < 120) return `${s.toFixed(0)} s`;
  if (s < 2 * 3600) return `${(s / 60).toFixed(0)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export class RulEstimator {
  private hist = new Map<SubsystemId, { t: number; h: number }[]>();
  private lastT = -Infinity;
  private latest: RulEstimate[] = [];

  update(t: number, subsystems: SubsystemHealth[], running: boolean): RulEstimate[] {
    const cfg = ANALYTICS.rul;
    if (!running) {
      this.hist.clear();
      this.latest = [];
      return this.latest;
    }
    if (t - this.lastT < cfg.every_s - 1e-9) return this.latest;
    this.lastT = t;
    this.latest = [];
    for (const id of RUL_SUBSYSTEMS) {
      const sub = subsystems.find((s) => s.id === id);
      if (!sub || sub.health == null) {
        this.hist.delete(id);
        continue;
      }
      const h = this.hist.get(id) ?? [];
      h.push({ t, h: sub.health });
      while (h.length && t - h[0]!.t > cfg.window_s) h.shift();
      this.hist.set(id, h);
      this.latest.push(fit(id, sub.name, h));
    }
    return this.latest;
  }
}

function fit(id: SubsystemId, name: string, pts: { t: number; h: number }[]): RulEstimate {
  const cfg = ANALYTICS.rul;
  const n = pts.length;
  const H = pts[n - 1]!.h;
  const base = { subsystem: id, name, health: H };
  const span = n > 1 ? pts[n - 1]!.t - pts[0]!.t : 0;
  if (n < 3 || span < cfg.minSpan_s)
    return {
      ...base,
      slopePerMin: 0,
      significant: false,
      rul_s: null,
      low_s: null,
      high_s: null,
      text: 'collecting trend data',
    };

  const mt = pts.reduce((a, p) => a + p.t, 0) / n;
  const mh = pts.reduce((a, p) => a + p.h, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of pts) {
    sxx += (p.t - mt) ** 2;
    sxy += (p.t - mt) * (p.h - mh);
  }
  const b = sxy / sxx;
  let sse = 0;
  for (const p of pts) sse += (p.h - (mh + b * (p.t - mt))) ** 2;
  const sb = Math.sqrt(sse / (n - 2) / sxx);
  const perMin = b * 60;
  const significant = b < 0 && Math.abs(b) > 2 * sb && -perMin >= cfg.minSlopePerMin;

  if (!significant)
    return {
      ...base,
      slopePerMin: perMin,
      significant: false,
      rul_s: null,
      low_s: null,
      high_s: null,
      text: 'trend not significant',
    };

  const margin = H - cfg.failHealth;
  if (margin <= 0)
    return {
      ...base,
      slopePerMin: perMin,
      significant: true,
      rul_s: 0,
      low_s: 0,
      high_s: 0,
      text: `at the failure threshold (health ${cfg.failHealth})`,
    };
  const rul = margin / -b;
  const low = margin / (-b + 2 * sb);
  const high = margin / (-b - 2 * sb);
  return {
    ...base,
    slopePerMin: perMin,
    significant: true,
    rul_s: rul,
    low_s: low,
    high_s: high,
    text: `~${formatSim(rul)} (${formatSim(low)}–${formatSim(high)}) simulated, at the current load`,
  };
}
