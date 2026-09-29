import { PROFILE } from '../engine/profile';
import { maxCoolantRate_Kps, maxOilRate_Kps } from '../physics';
import type { Telemetry } from '../telemetry';
import type { TwinExpected } from '../twin';
import { ANALYTICS } from './config';
import { RESIDUAL_CHANNELS, residualSigma, type ResidualChannel } from './residuals';

/**
 * Sensor sanity (review, "Proving a sensor fault with physics"; draft §15, §39). Runs BEFORE the
 * residuals, so a reading that physics says is impossible never reaches the diagnosis:
 *
 *   implausible  a temperature jumped faster than the engine can heat or cool. The coolant can
 *                gain at most Q̇_cool,max / C_th ≈ 0.8 K/s (all heat, no cooling, redline, full
 *                load), so +25 °C in 0.1 s is 250 K/s: the sensor failed, not the engine.
 *   stuck        the reading repeats exactly. A live sensor with noise never does.
 *   dropout      readings are missing.
 *   drift        cross-check: a real coolant rise must warm the oil through the jacket
 *                (C_o dΔ/dt = K_co (r_c − Δ) − UA_o Δ, τ ≈ 57 s). If the coolant reads high and the oil
 *                does not follow, the coolant sensor is suspect.
 * Rejected readings are treated like missing ones by the residuals (valid = false).
 */

export type SensorState = 'ok' | 'implausible' | 'stuck' | 'dropout' | 'drift';

export interface ChannelSanity {
  state: SensorState;
  /** evidence that this sensor, not the engine, is at fault: 0..1 */
  risk: number;
  /** one line with the live numbers, for the explanation card */
  reason: string;
  /** reject this sample (it must not feed residuals or diagnosis) */
  reject: boolean;
}

export interface SanityState {
  channels: Record<ResidualChannel, ChannelSanity>;
  rejected: ReadonlySet<ResidualChannel>;
  /** worst channel, if any sensor is in doubt */
  worst: ResidualChannel | null;
  /** physical rate limits used, K/s */
  limits: { coolantC: number; oilC: number };
}

export const CHANNEL_LABEL: Record<ResidualChannel, string> = {
  coolantC: 'Coolant',
  oilC: 'Oil-temperature',
  oilPressBar: 'Oil-pressure',
  busV: 'Voltage',
};
const UNIT: Record<ResidualChannel, string> = {
  coolantC: '°C',
  oilC: '°C',
  oilPressBar: 'bar',
  busV: 'V',
};

const COOLANT_MAX = maxCoolantRate_Kps();
const OIL_MAX = maxOilRate_Kps();
/** channels with thermal inertia, where a rate limit means something */
const RATE_LIMIT: Partial<Record<ResidualChannel, number>> = {
  coolantC: COOLANT_MAX,
  oilC: OIL_MAX,
};

interface ChannelMemory {
  trusted: number | null;
  trustedT: number;
  lastValue: number | null;
  repeats: number;
  nulls: boolean[];
  /** has this channel ever reported? (a source may simply not have the sensor) */
  seen: boolean;
  /** share of readings that differ from the previous one (EMA), and its value when a repeat run began */
  changeRate: number;
  rateAtRunStart: number;
  /** latched rate violation, for the evidence (the reading itself may be back to normal) */
  violation: { t: number; jump: number; dt: number } | null;
  quarantined: boolean;
}

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const sgn = (x: number) => (x >= 0 ? '+' : '−');

export class SensorSanity {
  private mem = new Map<ResidualChannel, ChannelMemory>();
  /** coolant/oil residual filters and the predicted oil response to the coolant residual */
  private rc = 0;
  private ro = 0;
  private dPred = 0;
  private driftFor_s = 0;
  private driftClear_s = 0;
  private drifting = false;
  private init = false;

  constructor() {
    for (const c of RESIDUAL_CHANNELS)
      this.mem.set(c, {
        trusted: null,
        trustedT: 0,
        lastValue: null,
        repeats: 0,
        seen: false,
        changeRate: 0,
        rateAtRunStart: 0,
        nulls: [],
        violation: null,
        quarantined: false,
      });
  }

  update(tel: Telemetry, exp: TwinExpected, dt: number): SanityState {
    const cfg = ANALYTICS.sanity;
    const channels = {} as Record<ResidualChannel, ChannelSanity>;
    const rejected = new Set<ResidualChannel>();
    const t = tel.t;
    const expected: Record<ResidualChannel, number> = {
      coolantC: exp.coolantC,
      oilC: exp.oilC,
      oilPressBar: exp.oilPressBar,
      busV: exp.busV,
    };

    for (const c of RESIDUAL_CHANNELS) {
      const m = this.mem.get(c)!;
      const y = tel[c];
      const sigma = PROFILE.sensors[c].sigma;
      let out: ChannelSanity = { state: 'ok', risk: 0, reason: '', reject: false };

      // --- dropout: share of missing readings over the window
      if (y != null) m.seen = true;
      m.nulls.push(y == null);
      if (m.nulls.length > cfg.dropoutWindow) m.nulls.shift();
      const nullShare = m.nulls.filter(Boolean).length / m.nulls.length;

      // --- stuck: exact repeats, but only from a sensor that was visibly noisy before (a coarse
      // sensor, like OBD-II coolant in whole °C, legitimately repeats on a steady engine)
      if (y != null) {
        const changed = m.lastValue == null || y !== m.lastValue;
        if (!changed && m.repeats === 0) m.rateAtRunStart = m.changeRate;
        m.changeRate +=
          (1 - Math.exp(-dt / cfg.changeRateTau_s)) * ((changed ? 1 : 0) - m.changeRate);
      }
      if (y != null && m.lastValue != null && y === m.lastValue) m.repeats++;
      else m.repeats = 0;
      if (y != null) m.lastValue = y;

      // --- rate limit against the last trusted reading
      const limit = RATE_LIMIT[c];
      if (y != null && limit != null && m.trusted != null) {
        const span = Math.max(dt, t - m.trustedT);
        const allowed = limit * span + cfg.noiseAllowanceSigma * Math.SQRT2 * sigma;
        const jump = y - m.trusted;
        if (Math.abs(jump) > allowed) {
          if (!m.quarantined) m.violation = { t, jump, dt: span };
          m.quarantined = true;
        } else {
          m.quarantined = false;
        }
      } else if (y != null) {
        m.quarantined = false;
      }

      if (y != null && !m.quarantined && m.repeats < cfg.stuckSamples) {
        m.trusted = y;
        m.trustedT = t;
      }

      const recent = m.violation && t - m.violation.t <= cfg.violationLatch_s;
      if (!recent) m.violation = null;

      if (m.quarantined || recent) {
        const v = m.violation!;
        const rate = Math.abs(v.jump) / v.dt;
        out = {
          state: 'implausible',
          risk: 1,
          reject: m.quarantined,
          reason: `${CHANNEL_LABEL[c]} reading jumped ${sgn(v.jump)}${f1(Math.abs(v.jump))} ${UNIT[c]} in ${f2(v.dt)} s (${rate.toFixed(0)} K/s); the energy balance allows at most ${f2(limit!)} K/s`,
        };
      } else if (m.repeats >= cfg.stuckSamples && m.rateAtRunStart >= cfg.stuckNoisyShare) {
        out = {
          state: 'stuck',
          risk: 1,
          reject: true,
          reason: `${CHANNEL_LABEL[c]} reading frozen at ${f2(m.lastValue!)} ${UNIT[c]} for ${(m.repeats * dt).toFixed(1)} s; a live sensor with σ ${sigma} ${UNIT[c]} never repeats exactly`,
        };
      } else if (m.seen && nullShare >= cfg.dropoutWarn) {
        out = {
          state: 'dropout',
          risk: Math.min(1, (nullShare - cfg.dropoutWarn) / (cfg.dropoutCrit - cfg.dropoutWarn)),
          reject: y == null,
          reason: `${CHANNEL_LABEL[c]} readings missing (${(nullShare * 100).toFixed(0)} % of the last ${(cfg.dropoutWindow * dt).toFixed(0)} s)`,
        };
      }
      channels[c] = out;
    }

    this.crossCheck(tel, expected, dt, channels);

    for (const c of RESIDUAL_CHANNELS) if (channels[c].reject) rejected.add(c);
    let worst: ResidualChannel | null = null;
    for (const c of RESIDUAL_CHANNELS)
      if (channels[c].risk > 0 && (!worst || channels[c].risk > channels[worst].risk)) worst = c;
    return { channels, rejected, worst, limits: { coolantC: COOLANT_MAX, oilC: OIL_MAX } };
  }

  /**
   * Coolant drift cross-check. Filter the coolant and oil residuals (τ 10 s), predict how much the
   * oil should have followed a real coolant rise, and flag the coolant sensor when the oil clearly
   * did not follow for long enough. A lubrication fault makes the oil HOTTER than predicted, a real
   * cooling fault makes it follow; only a lying coolant sensor leaves it behind.
   */
  private crossCheck(
    tel: Telemetry,
    exp: Record<ResidualChannel, number>,
    dt: number,
    channels: Record<ResidualChannel, ChannelSanity>,
  ) {
    const cfg = ANALYTICS.sanity;
    const l = PROFILE.lubrication;
    const c = tel.coolantC;
    const o = tel.oilC;
    if (c == null || o == null || channels.coolantC.reject || channels.oilC.reject) return;
    const a = 1 - Math.exp(-dt / cfg.crossCheckTau_s);
    const rc = c - exp.coolantC;
    const ro = o - exp.oilC;
    if (!this.init) {
      this.rc = rc;
      this.ro = ro;
      this.init = true;
    }
    this.rc += a * (rc - this.rc);
    this.ro += a * (ro - this.ro);
    // C_o dΔ/dt = K_co (r_c − Δ) − UA_o Δ
    this.dPred +=
      (dt *
        (l.oilCoolantCoupling_WperK * (this.rc - this.dPred) - l.oilAmbientUA_WperK * this.dPred)) /
      l.oilThermalCapacity_JperK;

    const sc = residualSigma('coolantC');
    const so = residualSigma('oilC');
    const suspicious =
      this.rc > cfg.driftCoolantSigma * sc && this.dPred - this.ro > cfg.driftGapSigma * so;
    this.driftFor_s = suspicious ? this.driftFor_s + dt : 0;
    this.driftClear_s = suspicious ? 0 : this.driftClear_s + dt;
    if (this.driftFor_s >= cfg.driftHold_s) this.drifting = true;
    if (this.driftClear_s >= cfg.driftHold_s) this.drifting = false;

    if (this.drifting && channels.coolantC.state === 'ok')
      channels.coolantC = {
        state: 'drift',
        risk: 1,
        reject: true,
        reason: `Coolant reads ${sgn(this.rc)}${f1(Math.abs(this.rc))} °C against the Twin, but the oil did not follow (a real rise would have warmed it ${sgn(this.dPred)}${f1(Math.abs(this.dPred))} °C; measured ${sgn(this.ro)}${f1(Math.abs(this.ro))} °C)`,
      };
  }
}
