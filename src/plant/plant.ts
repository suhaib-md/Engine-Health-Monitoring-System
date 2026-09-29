import { PROFILE, type EngineProfile } from '../engine/profile';
import type { Lifecycle } from '../lifecycle';
import {
  HEALTHY,
  evaluateEngine,
  governorCommand_Nm,
  loadFraction,
  oilPressure_bar,
  resistTorque_Nm,
  stepThermal,
  type CombustionHealth,
  type CrankInput,
  type HealthFactors,
  type ThermalState,
} from '../physics';
import { clamp } from '../lib/math';

const rampUp = (x: number, w: number, c: number) => clamp((x - w) / (c - w), 0, 1);
const rampDown = (x: number, w: number, c: number) => clamp((w - x) / (w - c), 0, 1);

/**
 * The Plant: the "real" engine. It owns hidden health factors that nothing downstream of the
 * telemetry boundary may read (CLAUDE.md rule 1). It advances at the 20 Hz slow-loop step.
 */

export type FanMode = 'auto' | 'on' | 'off';

/** Mechanical faults the Plant can develop (sensor faults live in the sensor model). */
export type MisfireFaultId = 'misfire1' | 'misfire2' | 'misfire3' | 'misfire4';
export type PlantFaultId = 'cooling' | 'oilPump' | 'bearing' | 'alternator' | MisfireFaultId;
const MISFIRE_IDS: readonly MisfireFaultId[] = ['misfire1', 'misfire2', 'misfire3', 'misfire4'];
/**
 * instant: S = target at once. gradual: S ramps 0 → target over `gradualRamp_s`, then holds.
 * progressive: S starts at target and keeps growing under operating stress (draft §19.3; bearing
 * wear follows its own law, §18.3), so load changes how fast it fails. This is the RUL demo mode.
 */
export type FaultOnset = 'gradual' | 'instant' | 'progressive';

interface ActiveFault {
  target: number;
  onset: FaultOnset;
  startedAt_s: number;
  /** integrated severity for progressive faults */
  s: number;
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
  /** speed-governor torque command (null while not firing) */
  torqueCmdNm: number | null;
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
    const target = clamp(severity, 0, 1);
    this.faults.set(id, { target, onset, startedAt_s: this.state.t, s: target });
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
    if (f.onset === 'progressive') return f.s;
    const ramp = this.p.faults.gradualRamp_s;
    return Math.min(f.target, (f.target * (this.state.t - f.startedAt_s)) / ramp);
  }

  private updateHealth() {
    const fp = this.p.faults;
    const pump = 1 - fp.pumpSeverityGain * this.severity('oilPump');
    // S = 1 is a complete misfire of that cylinder: H_comb,i = 1 − S (draft §13.1)
    const combustion = MISFIRE_IDS.map(
      (id) => 1 - this.severity(id),
    ) as unknown as CombustionHealth;
    this.health = {
      ...HEALTHY,
      cooling: 1 - fp.coolingSeverityGain * this.severity('cooling'),
      pump,
      lubeDegradation: clamp(fp.lubeFromPumpGain * (1 - pump), 0, 1),
      bearingWear: this.severity('bearing'),
      alternator: 1 - fp.alternatorSeverityGain * this.severity('alternator'),
      combustion,
    };
  }

  /** Stress multiplier of draft §19.3 at the current operating point (1 = unstressed). */
  stressFactor() {
    const g = this.p.faults.progression;
    const L = this.truthLoad();
    const RT = rampUp(this.state.thermal.coolant_C, g.coolantRisk_C.warn, g.coolantRisk_C.crit);
    return (1 + g.kL * L) * (1 + g.kT * RT) * (1 + (g.kN * this.state.rpm) / this.p.speed.max_rpm);
  }

  /** Bearing wear rate of draft §18.3 at the current operating point, per second. */
  bearingWearRate() {
    const b = this.p.faults.bearingWear;
    const L = this.truthLoad();
    const RT = rampUp(this.state.thermal.oil_C, b.oilRisk_C.warn, b.oilRisk_C.crit);
    const op = { rpm: this.state.rpm, oil_C: this.state.thermal.oil_C };
    const healthy = oilPressure_bar({ ...op, pumpHealth: 1, bearingWear: 0 }, this.p);
    const actual = oilPressure_bar(
      { ...op, pumpHealth: this.health.pump, bearingWear: this.health.bearingWear },
      this.p,
    );
    const RP = healthy > 0 ? rampDown(actual / healthy, b.pressRisk.warn, b.pressRisk.crit) : 0;
    return b.kw_perS * L ** b.loadExponent * (1 + b.kT * RT) * (1 + b.kP * RP);
  }

  private truthLoad() {
    const out = evaluateEngine(this.state.thermal, this.operatingPoint(), this.health, this.p);
    return this.state.rpm > 0 ? loadFraction(out.brakeTorque_Nm, this.state.rpm, this.p) : 0;
  }

  /** Advance progressive faults (only while the engine fires: a parked engine does not wear). */
  private progress(dt: number) {
    if (!this.firing) return;
    for (const [id, f] of this.faults) {
      if (f.onset !== 'progressive' || f.s >= 1) continue;
      const rate =
        id === 'bearing'
          ? this.bearingWearRate()
          : this.p.faults.progression.k0_perS * this.stressFactor();
      f.s = Math.min(1, f.s + rate * dt);
    }
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
    if (this.faults.size) {
      this.progress(dt);
      this.updateHealth();
    }

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

  /** True while the engine fires (cranking and coasting down produce no combustion windows). */
  get firing() {
    return this.state.lifecycle === 'WARMUP' || this.state.lifecycle === 'RUNNING';
  }

  /** Mean resisting torque at the current operating point: brake + friction + accessories. */
  private resistTorque() {
    const out = evaluateEngine(this.state.thermal, this.operatingPoint(), this.health, this.p);
    return resistTorque_Nm(out.brakeTorque_Nm, out.frictionTorque_Nm, this.state.rpm, this.p);
  }

  /** Input for the crank-angle model; null unless the engine is firing above the running speed. */
  crankInput(): CrankInput | null {
    if (!this.firing || this.state.rpm < 0.8 * this.p.speed.idle_rpm) return null;
    return {
      rpm: this.state.rpm,
      resist_Nm: this.resistTorque(),
      health: this.health.combustion,
    };
  }

  /** Noise-free physical values at the current state. */
  truth(): TrueSignals {
    const s = this.state;
    const op = this.operatingPoint();
    const out = evaluateEngine(s.thermal, op, this.health, this.p);
    const cmdOk = this.firing && s.rpm >= 0.8 * this.p.speed.idle_rpm;
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
      torqueCmdNm: cmdOk
        ? governorCommand_Nm(
            resistTorque_Nm(out.brakeTorque_Nm, out.frictionTorque_Nm, s.rpm, this.p),
            this.health.combustion,
          )
        : null,
    };
  }
}
