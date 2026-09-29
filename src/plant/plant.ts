import { PROFILE, type EngineProfile } from '../engine/profile';
import type { Lifecycle } from '../lifecycle';
import {
  HEALTHY,
  evaluateEngine,
  loadFraction,
  stepThermal,
  type HealthFactors,
  type ThermalState,
} from '../physics';
import { clamp } from '../lib/math';

/**
 * The Plant: the "real" engine. It owns hidden health factors that nothing downstream of the
 * telemetry boundary may read (CLAUDE.md rule 1). It advances at the 20 Hz slow-loop step.
 */

export type FanMode = 'auto' | 'on' | 'off';

/** Mechanical faults the Plant can develop (sensor faults live in the sensor model). */
export type PlantFaultId = 'cooling' | 'oilPump';
export type FaultOnset = 'gradual' | 'instant';

interface ActiveFault {
  target: number;
  onset: FaultOnset;
  startedAt_s: number;
}

export interface PlantControls {
  targetRpm: number;
  /** requested brake torque (dyno load) */
  torque_Nm: number;
  ambient_C: number;
  fanMode: FanMode;
}

/** True (noise-free) physical values; turned into Telemetry by the sensor model. */
export interface TrueSignals {
  t: number;
  rpm: number;
  load: number;
  ambientC: number;
  coolantC: number;
  oilC: number;
  oilPressBar: number;
  busV: number;
  fanOn: boolean;
}

export interface PlantState {
  t: number;
  lifecycle: Lifecycle;
  /** seconds spent in the current lifecycle state */
  stateTime_s: number;
  rpm: number;
  thermal: ThermalState;
}

export class Plant {
  state: PlantState;
  controls: PlantControls = {
    targetRpm: 3000,
    torque_Nm: 80,
    ambient_C: PROFILE.cooling.ambientRef_C,
    fanMode: 'auto',
  };
  /** Hidden fault state: health factors derived from the active faults every step. */
  health: HealthFactors = { ...HEALTHY };
  private faults = new Map<PlantFaultId, ActiveFault>();

  constructor(
    private readonly p: EngineProfile = PROFILE,
    ambient_C: number = PROFILE.cooling.ambientRef_C,
  ) {
    this.controls.ambient_C = ambient_C;
    this.state = {
      t: 0,
      lifecycle: 'OFF',
      stateTime_s: 0,
      rpm: 0,
      // cold engine at ambient
      thermal: { coolant_C: ambient_C, oil_C: ambient_C, fanOn: false },
    };
  }

  /**
   * Inject a fault with severity S ∈ [0,1] (draft §18–19). Gradual onset ramps S linearly to
   * the target over `faults.gradualRamp_s`; instant applies it at once.
   */
  injectFault(id: PlantFaultId, severity: number, onset: FaultOnset = 'gradual') {
    this.faults.set(id, {
      target: clamp(severity, 0, 1),
      onset,
      startedAt_s: this.state.t,
    });
    this.updateHealth();
  }

  clearFaults() {
    this.faults.clear();
    this.updateHealth();
  }

  /** Current severity of a fault (0 if not active). */
  severity(id: PlantFaultId): number {
    const f = this.faults.get(id);
    if (!f) return 0;
    if (f.onset === 'instant') return f.target;
    const ramp = this.p.faults.gradualRamp_s;
    return Math.min(f.target, (f.target * (this.state.t - f.startedAt_s)) / ramp);
  }

  private updateHealth() {
    const fp = this.p.faults;
    const pump = 1 - fp.pumpSeverityGain * this.severity('oilPump');
    this.health = {
      ...HEALTHY,
      cooling: 1 - fp.coolingSeverityGain * this.severity('cooling'),
      pump,
      lubeDegradation: clamp(fp.lubeFromPumpGain * (1 - pump), 0, 1),
    };
  }

  start() {
    if (this.state.lifecycle === 'OFF' || this.state.lifecycle === 'SHUTDOWN')
      this.setLifecycle('STARTING');
  }

  stop() {
    if (this.state.lifecycle !== 'OFF') this.setLifecycle('SHUTDOWN');
  }

  get running() {
    const l = this.state.lifecycle;
    return l === 'STARTING' || l === 'WARMUP' || l === 'RUNNING';
  }

  /** |rpm − target| beyond the band while running = TRANSIENT (draft §32) */
  get transient() {
    return (
      (this.state.lifecycle === 'WARMUP' || this.state.lifecycle === 'RUNNING') &&
      Math.abs(this.state.rpm - this.effectiveTarget()) > this.p.lifecycle.transientBand_rpm
    );
  }

  private setLifecycle(l: Lifecycle) {
    this.state.lifecycle = l;
    this.state.stateTime_s = 0;
  }

  private effectiveTarget() {
    return clamp(this.controls.targetRpm, this.p.speed.idle_rpm, this.p.speed.max_rpm);
  }

  private fanOverride(): boolean | undefined {
    const m = this.controls.fanMode;
    return m === 'on' ? true : m === 'off' ? false : undefined;
  }

  step(dt: number = this.p.sim.slowDt_s) {
    const s = this.state;
    const lc = this.p.lifecycle;
    s.t += dt;
    s.stateTime_s += dt;
    if (this.faults.size) this.updateHealth();

    // --- speed & lifecycle (draft §31–32) ---
    switch (s.lifecycle) {
      case 'OFF':
        s.rpm = 0;
        break;
      case 'STARTING':
        s.rpm = lc.crankingRpm;
        if (s.stateTime_s >= lc.crankingDuration_s) this.setLifecycle('WARMUP');
        break;
      case 'WARMUP':
      case 'RUNNING': {
        const target = this.effectiveTarget();
        s.rpm += (target - s.rpm) * (1 - Math.exp(-dt / lc.rpmTimeConst_s));
        const warm = s.thermal.coolant_C >= this.p.cooling.thermostatOpen_C;
        if (warm && s.lifecycle === 'WARMUP') this.setLifecycle('RUNNING');
        if (!warm && s.lifecycle === 'RUNNING') this.setLifecycle('WARMUP');
        break;
      }
      case 'SHUTDOWN':
        s.rpm *= Math.exp(-dt / lc.shutdownTimeConst_s);
        if (s.rpm < 10) {
          s.rpm = 0;
          this.setLifecycle('OFF');
        }
        break;
    }

    // --- thermal (shared physics, real health factors) ---
    s.thermal = stepThermal(
      s.thermal,
      this.operatingPoint(),
      dt,
      this.health,
      this.p,
      this.fanOverride(),
    );
  }

  private operatingPoint() {
    const firing = this.state.lifecycle === 'WARMUP' || this.state.lifecycle === 'RUNNING';
    return {
      rpm: this.state.rpm,
      // no dyno load while cranking or coasting down
      brakeTorque_Nm: firing ? this.controls.torque_Nm : 0,
      ambient_C: this.controls.ambient_C,
    };
  }

  /** Noise-free physical values at the current state. */
  truth(): TrueSignals {
    const s = this.state;
    const op = this.operatingPoint();
    const out = evaluateEngine(s.thermal, op, this.health, this.p);
    return {
      t: s.t,
      rpm: s.rpm,
      load: s.rpm > 0 ? loadFraction(out.brakeTorque_Nm, s.rpm, this.p) : 0,
      ambientC: op.ambient_C,
      coolantC: s.thermal.coolant_C,
      oilC: s.thermal.oil_C,
      oilPressBar: out.oilPress_bar,
      busV: out.busV,
      fanOn: s.thermal.fanOn,
    };
  }
}
