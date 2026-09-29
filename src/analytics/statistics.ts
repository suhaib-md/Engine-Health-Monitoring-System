import { cholesky, choleskySolve, meanCov } from '../lib/linalg';
import { ANALYTICS } from './config';
import type { Features } from './residuals';
import type { SpectralFeatures } from './spectral';

/**
 * Statistical layer (review, "Detection, AI and RUL"):
 *
 * Mahalanobis D². During the first 60 s of armed running the monitor learns the mean μ and
 * covariance Σ of the raw normalised residual vector z (k = 5: coolant, oil temp, oil pressure,
 * voltage, vibration RMS; Q-17). Then every tick D² = (z − μ)ᵀ Σ⁻¹ (z − μ), which for healthy data
 * follows χ² with 5 degrees of freedom: the 99 % limit 15.09 comes from a table, not a guess.
 * Each signal's share of D² answers "why is it anomalous?". The vibration channel updates only
 * once a second and barely varies within a point, so its variance is floored (Σ_ii ≥ 0.25) to stop
 * a tiny model offset between operating points from dominating.
 *
 * CUSUM. Once per simulated second, on each EMA-filtered residual in σ units:
 *   S⁺ = max(0, S⁺ + z − κ),  S⁻ = max(0, S⁻ − z − κ),  alarm when either exceeds h (κ 0.5, h 5).
 * A residual sitting at 1σ never crosses a fixed 3σ limit, but CUSUM flags it after ~10 s.
 */

export const STAT_CHANNELS = ['coolantC', 'oilC', 'oilPressBar', 'busV', 'vib'] as const;
export type StatChannel = (typeof STAT_CHANNELS)[number];
export const STAT_LABEL: Record<StatChannel, string> = {
  coolantC: 'coolant',
  oilC: 'oil temperature',
  oilPressBar: 'oil pressure',
  busV: 'voltage',
  vib: 'vibration',
};

export interface StatsState {
  phase: 'waiting' | 'learning' | 'monitoring';
  /** 0..1 while learning the baseline */
  progress: number;
  /** null while not monitoring, or a sensor is invalid */
  d2: number | null;
  limit: number;
  /** each signal's share of D² (positive parts), largest first */
  contributions: { channel: StatChannel; share: number }[];
  /** D² above the limit for the hold time */
  d2Alarm: boolean;
  cusum: Record<StatChannel, { pos: number; neg: number }>;
  cusumMax: number;
  cusumAlarm: StatChannel[];
  h: number;
}

const zero = () =>
  Object.fromEntries(STAT_CHANNELS.map((c) => [c, { pos: 0, neg: 0 }])) as Record<
    StatChannel,
    { pos: number; neg: number }
  >;

export class Statistics {
  private samples: number[][] = [];
  private mean: number[] | null = null;
  private chol: number[][] | null = null;
  private above_s = 0;
  private below_s = 0;
  private d2Alarm = false;
  private cusum = zero();
  private cusumAlarm = new Set<StatChannel>();
  private sinceCusum = 0;

  /**
   * `warm`: coolant has reached operating temperature; `steady`: engine speed has held within a
   * band for the last 10 s. The baseline is learned only warm and steady, and the statistics only
   * judge in steady running (draft §32: transients are not evidence).
   */
  update(
    f: Features,
    s: SpectralFeatures | null,
    armed: boolean,
    dt: number,
    ctx: { warm: boolean; steady: boolean } = { warm: true, steady: true },
  ): StatsState {
    const cfg = ANALYTICS.stats;
    const need = Math.round(cfg.baseline_s / dt);
    const valid = STAT_CHANNELS.every((c) => (c === 'vib' ? !!s : f.channels[c].valid));
    const vibZ = s ? (s.ratios.rms - 1) / cfg.vibSigmaRel : 0;
    const zRaw = STAT_CHANNELS.map((c) => (c === 'vib' ? vibZ : f.channels[c].zRaw));

    // --- baseline
    if (!this.chol && armed && valid && ctx.warm && ctx.steady) {
      this.samples.push(zRaw);
      if (this.samples.length >= need) this.learn();
    }

    // --- D²
    let d2: number | null = null;
    let contributions: StatsState['contributions'] = [];
    if (this.chol && this.mean && armed && valid) {
      const y = zRaw.map((z, i) => z - this.mean![i]!);
      const w = choleskySolve(this.chol, y);
      const parts = y.map((yi, i) => yi * w[i]!);
      d2 = parts.reduce((a, b) => a + b, 0);
      const pos = parts.map((p) => Math.max(0, p));
      const tot = pos.reduce((a, b) => a + b, 0) || 1;
      contributions = STAT_CHANNELS.map((channel, i) => ({ channel, share: pos[i]! / tot })).sort(
        (a, b) => b.share - a.share,
      );
      if (!ctx.steady) {
        this.above_s = 0; // hold the alarm state through a transient
      } else if (d2 > cfg.chi2Limit) {
        this.above_s += dt;
        this.below_s = 0;
      } else {
        this.below_s += dt;
        this.above_s = 0;
      }
      if (this.above_s >= cfg.d2Hold_s) this.d2Alarm = true;
      if (this.below_s >= cfg.d2Clear_s) this.d2Alarm = false;
    } else if (!armed) {
      this.above_s = 0;
      this.d2Alarm = false;
    }

    // --- CUSUM, once per simulated second on the filtered residuals
    if (!armed) {
      this.cusum = zero();
      this.cusumAlarm.clear();
      this.sinceCusum = 0;
    } else {
      this.sinceCusum += dt;
      if (this.sinceCusum >= cfg.cusumEvery_s - 1e-9 && ctx.steady) {
        this.sinceCusum = 0;
        for (const c of STAT_CHANNELS) {
          const ok = c === 'vib' ? !!s : f.channels[c].valid;
          if (!ok) continue;
          const z = c === 'vib' ? vibZ : f.channels[c].z;
          const st = this.cusum[c];
          st.pos = Math.min(cfg.cusumCap, Math.max(0, st.pos + z - cfg.cusumKappa));
          st.neg = Math.min(cfg.cusumCap, Math.max(0, st.neg - z - cfg.cusumKappa));
          const m = Math.max(st.pos, st.neg);
          if (m > cfg.cusumH) this.cusumAlarm.add(c);
          else if (m < cfg.cusumH / 2) this.cusumAlarm.delete(c);
        }
      }
    }

    const cusumMax = Math.max(
      ...STAT_CHANNELS.map((c) => Math.max(this.cusum[c].pos, this.cusum[c].neg)),
    );
    return {
      phase: this.chol ? 'monitoring' : this.samples.length ? 'learning' : 'waiting',
      progress: this.chol ? 1 : this.samples.length / need,
      d2,
      limit: cfg.chi2Limit,
      contributions,
      d2Alarm: this.d2Alarm,
      cusum: Object.fromEntries(
        STAT_CHANNELS.map((c) => [c, { ...this.cusum[c] }]),
      ) as StatsState['cusum'],
      cusumMax,
      cusumAlarm: STAT_CHANNELS.filter((c) => this.cusumAlarm.has(c)),
      h: cfg.cusumH,
    };
  }

  private learn() {
    const { mean, cov } = meanCov(this.samples);
    for (let i = 0; i < cov.length; i++)
      cov[i]![i] = Math.max(cov[i]![i]!, ANALYTICS.stats.minVarZ);
    this.mean = mean;
    this.chol = cholesky(cov);
    this.samples = [];
  }
}
