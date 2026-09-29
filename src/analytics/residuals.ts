import { PROFILE } from '../engine/profile';
import { oilPressure_bar } from '../physics';
import type { Telemetry } from '../telemetry';
import type { TwinExpected } from '../twin';
import { ANALYTICS } from './config';

/**
 * Residuals and features (draft §16–17): r = y − ŷ, filtered with an EMA, normalised
 * z = r̄ / σ_r, plus rates of change and persistence. Inputs are ONLY telemetry and the
 * Twin's expectation (CLAUDE.md rule 1).
 *
 * Oil pressure is compared with the expectation at the MEASURED oil temperature
 * (draft §17.3 context normalisation, Q-32): hot oil from a cooling problem thins the oil
 * and lowers pressure, which is not a pump fault.
 */

export type ResidualChannel = 'coolantC' | 'oilC' | 'oilPressBar' | 'busV';
export const RESIDUAL_CHANNELS: readonly ResidualChannel[] = [
  'coolantC',
  'oilC',
  'oilPressBar',
  'busV',
];

export interface ChannelFeature {
  measured: number | null;
  expected: number;
  /** filtered residual, physical units */
  r: number;
  /** filtered residual in σ_r units */
  z: number;
  /** rate of change of the filtered residual, units per minute */
  ratePerMin: number;
  /** seconds the filtered residual has stayed above +zWarn / below −zWarn */
  persistHigh_s: number;
  persistLow_s: number;
  sigma: number;
  valid: boolean;
}

export interface Features {
  t: number;
  rpm: number;
  load: number;
  fanOn: boolean | null;
  channels: Record<ResidualChannel, ChannelFeature>;
  /** filtered measured / expected oil pressure */
  pressRatio: number;
  /** oil running hotter than the coolant residual explains, in σ_oil units */
  oilExcessZ: number;
  /** channels currently reporting null */
  dropped: ResidualChannel[];
}

export const residualSigma = (c: ResidualChannel) =>
  Math.hypot(PROFILE.sensors[c].sigma, ANALYTICS.modelSigma[c]);

interface ChannelState {
  r: number;
  history: { t: number; r: number }[];
  persistHigh_s: number;
  persistLow_s: number;
  initialised: boolean;
  lastMeasured: number | null;
}

export class ResidualTracker {
  private st = new Map<ResidualChannel, ChannelState>();
  private pressRatio = 1;

  constructor() {
    for (const c of RESIDUAL_CHANNELS)
      this.st.set(c, {
        r: 0,
        history: [],
        persistHigh_s: 0,
        persistLow_s: 0,
        initialised: false,
        lastMeasured: null,
      });
  }

  /** Expected values the residuals are taken against. */
  private expectations(tel: Telemetry, exp: TwinExpected): Record<ResidualChannel, number> {
    return {
      coolantC: exp.coolantC,
      oilC: exp.oilC,
      oilPressBar: oilPressure_bar({
        rpm: tel.rpm,
        oil_C: tel.oilC ?? exp.oilC,
        pumpHealth: 1,
        bearingWear: 0,
      }),
      busV: exp.busV,
    };
  }

  update(tel: Telemetry, exp: TwinExpected, dt: number): Features {
    const alpha = 1 - Math.exp(-dt / ANALYTICS.emaTau_s);
    const expected = this.expectations(tel, exp);
    const channels = {} as Record<ResidualChannel, ChannelFeature>;
    const dropped: ResidualChannel[] = [];

    for (const c of RESIDUAL_CHANNELS) {
      const s = this.st.get(c)!;
      const y = tel[c];
      const sigma = residualSigma(c);
      if (y == null) {
        dropped.push(c);
      } else {
        const raw = y - expected[c];
        s.r = s.initialised ? s.r + alpha * (raw - s.r) : raw;
        s.initialised = true;
        s.lastMeasured = y;
      }
      // rate over the window
      s.history.push({ t: tel.t, r: s.r });
      while (s.history.length > 2 && tel.t - s.history[0]!.t > ANALYTICS.rateWindow_s)
        s.history.shift();
      const first = s.history[0]!;
      const span = tel.t - first.t;
      const ratePerMin = span > 1 ? ((s.r - first.r) / span) * 60 : 0;

      const z = s.r / sigma;
      s.persistHigh_s = z > ANALYTICS.zWarn ? s.persistHigh_s + dt : 0;
      s.persistLow_s = z < -ANALYTICS.zWarn ? s.persistLow_s + dt : 0;

      channels[c] = {
        measured: y,
        expected: expected[c],
        r: s.r,
        z,
        ratePerMin,
        persistHigh_s: s.persistHigh_s,
        persistLow_s: s.persistLow_s,
        sigma,
        valid: y != null,
      };
    }

    const p = channels.oilPressBar;
    if (p.measured != null && p.expected > 0.3) {
      this.pressRatio += alpha * (p.measured / p.expected - this.pressRatio);
    } else if (p.expected <= 0.3) {
      this.pressRatio = 1; // engine stopped: the ratio means nothing
    }

    return {
      t: tel.t,
      rpm: tel.rpm,
      load: tel.load,
      fanOn: tel.fanOn ?? null,
      channels,
      pressRatio: this.pressRatio,
      oilExcessZ: (channels.oilC.r - channels.coolantC.r) / channels.oilC.sigma,
      dropped,
    };
  }
}
