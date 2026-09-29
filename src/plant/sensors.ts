import { PROFILE, type EngineProfile } from '../engine/profile';
import type { Rng } from '../lib/rng';
import type { Telemetry } from '../telemetry';
import type { TrueSignals } from './plant';

/**
 * Sensor model (draft §15): y = x + b + d(t) + ε, ε ~ N(0, σ²), plus fault modes.
 * All randomness comes from the injected seeded RNG, so a given seed replays exactly.
 * Sensor faults live here, on the Plant side: analytics must detect them from the data alone.
 */

export type Channel = 'rpm' | 'load' | 'ambientC' | 'coolantC' | 'oilC' | 'oilPressBar' | 'busV';
export const CHANNELS: readonly Channel[] = [
  'rpm',
  'load',
  'ambientC',
  'coolantC',
  'oilC',
  'oilPressBar',
  'busV',
];

export type SensorFault =
  /** constant offset b */
  | { kind: 'bias'; amount: number }
  /** d(t) grows linearly: rate per simulated second */
  | { kind: 'drift'; ratePerS: number }
  /** reading frozen at the value it had when the fault began */
  | { kind: 'stuck' }
  /** a one-sample jump added once (e.g. +25 °C coolant spike) */
  | { kind: 'spike'; amount: number }
  /** each sample is lost with this probability; 1 = sensor dead */
  | { kind: 'dropout'; probability: number };

interface ChannelState {
  fault: SensorFault | null;
  faultStart_s: number;
  stuckValue: number | null;
  spikePending: boolean;
}

export class SensorModel {
  private ch = new Map<Channel, ChannelState>();

  constructor(
    private readonly rng: Rng,
    private readonly p: EngineProfile = PROFILE,
  ) {
    for (const c of CHANNELS)
      this.ch.set(c, { fault: null, faultStart_s: 0, stuckValue: null, spikePending: false });
  }

  inject(channel: Channel, fault: SensorFault | null, now_s: number) {
    this.ch.set(channel, {
      fault,
      faultStart_s: now_s,
      stuckValue: null,
      spikePending: fault?.kind === 'spike',
    });
  }

  clear(channel?: Channel) {
    for (const c of channel ? [channel] : CHANNELS) this.inject(c, null, 0);
  }

  private read(channel: Channel, x: number, t: number): number | null {
    const st = this.ch.get(channel)!;
    const sigma = this.p.sensors[channel].sigma;
    // Always draw the noise so every channel consumes the RNG identically, fault or not.
    const noise = sigma * this.rng.gaussian();
    const u = this.rng.next();
    let y = x + noise;
    const f = st.fault;
    if (!f) return y;
    switch (f.kind) {
      case 'bias':
        y += f.amount;
        break;
      case 'drift':
        y += f.ratePerS * (t - st.faultStart_s);
        break;
      case 'stuck':
        st.stuckValue ??= y;
        y = st.stuckValue;
        break;
      case 'spike':
        if (st.spikePending) {
          y += f.amount;
          st.spikePending = false;
        }
        break;
      case 'dropout':
        if (u < f.probability) return null;
        break;
    }
    return y;
  }

  measure(truth: TrueSignals): Telemetry {
    const t = truth.t;
    const read = (c: Channel) => this.read(c, truth[c], t);
    // rpm, load and ambient are required (non-null) in Telemetry: a dropout holds 0 / last value
    // is not allowed, so these channels only support noise, bias, drift, stuck and spike.
    const rpm = Math.max(0, read('rpm') ?? truth.rpm);
    const load = Math.min(1, Math.max(0, read('load') ?? truth.load));
    const ambientC = read('ambientC') ?? truth.ambientC;
    return {
      t,
      rpm: truth.rpm === 0 ? 0 : rpm, // a stopped crank-speed sensor reads exactly 0
      load: truth.rpm === 0 ? 0 : load,
      ambientC,
      coolantC: read('coolantC'),
      oilC: read('oilC'),
      oilPressBar: read('oilPressBar'),
      busV: read('busV'),
      fanOn: truth.fanOn,
    };
  }
}
