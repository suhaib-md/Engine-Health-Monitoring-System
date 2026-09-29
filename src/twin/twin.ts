import { PROFILE, type EngineProfile } from '../engine/profile';
import type { Telemetry } from '../telemetry';
import {
  HEALTHY,
  evaluateEngine,
  healthyRipplePP_rpm,
  healthyVibRms_ms2,
  maxTorque_Nm,
  resistTorque_Nm,
  stepThermal,
  type OperatingPoint,
  type ThermalState,
} from '../physics';

/**
 * The Twin: a blind, healthy reference (CLAUDE.md rule 3). It runs the same physics as the
 * Plant with every health factor at 1, driven ONLY by measured RPM, load, ambient (and the fan
 * command). It never sees the Plant, its faults or its true temperatures. The gap between what
 * it expects and what the sensors read is the residual, the fault evidence.
 */

export interface TwinExpected {
  t: number;
  coolantC: number;
  oilC: number;
  oilPressBar: number;
  busV: number;
  fanOn: boolean;
  /** mean resisting torque of a healthy engine at this operating point, N·m */
  resistNm: number;
  /** governor command of a healthy engine (= resisting torque with all four cylinders firing), N·m */
  torqueCmdNm: number;
  /** RMS of the healthy vibration signal, m/s² */
  vibRmsMs2: number;
  /** peak-to-peak crank-speed ripple of a healthy engine, rpm */
  ripplePPRpm: number;
}

/** observer initialisation: ease toward measured temperatures while parked and just after start */
const ANCHOR_TAU_S = 3;
const ANCHOR_WINDOW_S = 10;

export class Twin {
  private state: ThermalState | null = null;
  private lastT: number | null = null;
  private runningSince: number | null = null;

  constructor(private readonly p: EngineProfile = PROFILE) {}

  reset() {
    this.state = null;
    this.lastT = null;
    this.runningSince = null;
  }

  /**
   * Idle deadband: a noisy load reading is clipped at 0, so at true zero load it averages
   * +0.4σ (+0.0016). Burnt by the Twin over a 25-minute warm-up that is a 0.4 °C lead on the
   * coolant, which CUSUM rightly flags. Readings below 3σ of the load sensor count as zero (Q-51).
   */
  private cleanLoad(load: number) {
    return load < 3 * this.p.sensors.load.sigma ? 0 : load;
  }

  /** The operating point implied by telemetry: torque = L · T_max(N). */
  private operatingPoint(tel: Telemetry): OperatingPoint {
    const rpm = Math.max(0, tel.rpm);
    return {
      rpm,
      brakeTorque_Nm: rpm > 0 ? this.cleanLoad(tel.load) * maxTorque_Nm(rpm, this.p) : 0,
      ambient_C: tel.ambientC,
    };
  }

  /**
   * Advance to the telemetry's timestamp and return what a healthy engine should read now.
   * On the first sample the Twin initialises its temperatures from the measured values (like a
   * real observer at key-on), falling back to ambient if a sensor is dropped. One sample carries
   * the sensor noise (±0.2 °C) into the Twin for good, so while the engine is off and for the first
   * 10 s after it starts the Twin also eases toward the measurements (τ 3 s), averaging the
   * noise out before it starts predicting on its own (Q-51).
   */
  update(tel: Telemetry): TwinExpected {
    const op = this.operatingPoint(tel);
    if (!this.state) {
      this.state = {
        coolant_C: tel.coolantC ?? tel.ambientC,
        oil_C: tel.oilC ?? tel.ambientC,
        fanOn: tel.fanOn ?? false,
      };
    } else {
      const dt = tel.t - (this.lastT ?? tel.t);
      if (dt > 0) {
        // Follow the measured fan command when known; otherwise run the Twin's own thermo-switch.
        this.state = stepThermal(this.state, op, dt, HEALTHY, this.p, tel.fanOn ?? undefined);
        const running = op.rpm > 0.8 * this.p.speed.idle_rpm;
        if (!running) this.runningSince = null;
        else this.runningSince ??= tel.t;
        const anchoring = this.runningSince == null || tel.t - this.runningSince < ANCHOR_WINDOW_S;
        if (anchoring) {
          const k = 1 - Math.exp(-dt / ANCHOR_TAU_S);
          if (tel.coolantC != null)
            this.state.coolant_C += k * (tel.coolantC - this.state.coolant_C);
          if (tel.oilC != null) this.state.oil_C += k * (tel.oilC - this.state.oil_C);
        }
      }
    }
    this.lastT = tel.t;

    const out = evaluateEngine(this.state, op, HEALTHY, this.p);
    const resist = resistTorque_Nm(out.brakeTorque_Nm, out.frictionTorque_Nm, op.rpm, this.p);
    return {
      t: tel.t,
      coolantC: this.state.coolant_C,
      oilC: this.state.oil_C,
      oilPressBar: out.oilPress_bar,
      busV: out.busV,
      fanOn: this.state.fanOn,
      resistNm: resist,
      torqueCmdNm: resist,
      vibRmsMs2: healthyVibRms_ms2(op.rpm, resist, this.p),
      ripplePPRpm: healthyRipplePP_rpm(op.rpm, resist, this.p),
    };
  }
}
