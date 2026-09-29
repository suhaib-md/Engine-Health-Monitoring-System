import { PROFILE, type EngineProfile } from '../engine/profile';
import { HERO_SEED } from '../lib/rng';
import type { Telemetry } from '../telemetry';
import { SimSource } from '../sources';
import { Twin, type TwinExpected } from '../twin';
import { Analytics, ANALYTICS, type AnalyticsState } from '../analytics';
import type { Command, FaultEvent, SimSettings, Snapshot, Warp } from './protocol';

/**
 * The simulation loop, free of any Worker/DOM API so it can be unit-tested in Node.
 * source (Plant → sensors) → Telemetry → Twin. Analytics join in Phase 3.
 * Time: fixed 0.05 s simulated steps; wall time × warp decides how many steps to run.
 */
export class SimLoop {
  source!: SimSource;
  private twin!: Twin;
  private analytics!: Analytics;
  analyticsState: AnalyticsState | null = null;
  faultEvents: FaultEvent[] = [];
  private stepCount = 0;
  private seed = HERO_SEED;
  private accum_s = 0;
  paused = false;
  settings: SimSettings = {
    targetRpm: 3000,
    torque_Nm: 80,
    ambient_C: PROFILE.cooling.ambientRef_C,
    fanMode: 'auto',
    warp: 60,
  };
  telemetry!: Telemetry;
  expected!: TwinExpected;
  private simRate = 0;

  constructor(
    seed: number = HERO_SEED,
    private readonly p: EngineProfile = PROFILE,
  ) {
    this.reset(seed);
  }

  reset(seed: number = this.seed) {
    this.seed = seed;
    this.source = new SimSource(seed, this.p, this.settings.ambient_C);
    this.source.setControls(this.plantControls());
    this.twin = new Twin(this.p);
    this.analytics = new Analytics();
    this.analyticsState = null;
    this.faultEvents = [];
    this.stepCount = 0;
    this.accum_s = 0;
    this.stepOnce(0);
  }

  private plantControls() {
    const { targetRpm, torque_Nm, ambient_C, fanMode } = this.settings;
    return { targetRpm, torque_Nm, ambient_C, fanMode };
  }

  handle(cmd: Command) {
    switch (cmd.type) {
      case 'start':
        this.source.plant.start();
        break;
      case 'stop':
        this.source.plant.stop();
        break;
      case 'pause':
        this.paused = cmd.paused;
        break;
      case 'set':
        this.settings = { ...this.settings, ...cmd.settings };
        this.source.setControls(this.plantControls());
        break;
      case 'reset':
        this.reset(cmd.seed);
        break;
      case 'injectFault': {
        this.source.plant.injectFault(cmd.fault, cmd.severity, cmd.onset);
        const name = cmd.fault === 'oilPump' ? 'PUMP FAULT' : 'COOLING FAULT';
        this.faultEvents = [...this.faultEvents, { t: this.telemetry.t, label: name }].slice(-20);
        break;
      }
      case 'clearFaults':
        this.source.plant.clearFaults();
        this.faultEvents = [...this.faultEvents, { t: this.telemetry.t, label: 'REPAIRED' }].slice(
          -20,
        );
        break;
    }
  }

  private stepOnce(dt: number) {
    this.telemetry =
      dt > 0 ? this.source.step(dt) : this.source.sensors.measure(this.source.plant.truth());
    this.expected = this.twin.update(this.telemetry);
    // Analytics at 10 Hz: it sees only telemetry + the Twin's expectation.
    if (dt > 0 && ++this.stepCount % ANALYTICS.everyNSteps === 0) {
      this.analyticsState = this.analytics.update(
        this.telemetry,
        this.expected,
        dt * ANALYTICS.everyNSteps,
      );
    }
  }

  /** Run whole fixed steps covering `sim_s` simulated seconds (remainder carried over). */
  advanceSim(sim_s: number) {
    const dt = this.p.sim.slowDt_s;
    this.accum_s += sim_s;
    let n = 0;
    while (this.accum_s >= dt - 1e-9) {
      this.stepOnce(dt);
      this.accum_s -= dt;
      n++;
    }
    return n;
  }

  /** Advance by elapsed wall-clock milliseconds, scaled by the time-warp. */
  advanceWall(wall_ms: number) {
    if (this.paused) {
      this.simRate = 0;
      return 0;
    }
    // Guard against a backgrounded tab handing us a huge gap: cap at 1 s of wall time.
    const wall_s = Math.min(wall_ms, 1000) / 1000;
    const steps = this.advanceSim(wall_s * this.settings.warp);
    this.simRate = wall_s > 0 ? (steps * this.p.sim.slowDt_s) / wall_s : 0;
    return steps;
  }

  snapshot(): Snapshot {
    const plant = this.source.plant;
    return {
      seed: this.seed,
      paused: this.paused,
      warp: this.settings.warp as Warp,
      lifecycle: plant.state.lifecycle,
      transient: plant.transient,
      telemetry: this.telemetry,
      expected: this.expected,
      simRate: this.simRate,
      analytics: this.analyticsState,
      faultEvents: this.faultEvents,
    };
  }
}
