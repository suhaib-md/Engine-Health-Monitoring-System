import { PROFILE, type EngineProfile } from '../engine/profile';
import type { Telemetry } from '../telemetry';
import {
  HEALTHY,
  evaluateEngine,
  maxTorque_Nm,
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
}

export class Twin {
  private state: ThermalState | null = null;
  private lastT: number | null = null;

  constructor(private readonly p: EngineProfile = PROFILE) {}

  reset() {
    this.state = null;
    this.lastT = null;
  }

  /** The operating point implied by telemetry: torque = L · T_max(N). */
  private operatingPoint(tel: Telemetry): OperatingPoint {
    const rpm = Math.max(0, tel.rpm);
    return {
      rpm,
      brakeTorque_Nm: rpm > 0 ? tel.load * maxTorque_Nm(rpm, this.p) : 0,
      ambient_C: tel.ambientC,
    };
  }

  /**
   * Advance to the telemetry's timestamp and return what a healthy engine should read now.
   * On the first sample the Twin initialises its temperatures from the measured values (like a
   * real observer at key-on), falling back to ambient if a sensor is dropped.
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
      }
    }
    this.lastT = tel.t;

    const out = evaluateEngine(this.state, op, HEALTHY, this.p);
    return {
      t: tel.t,
      coolantC: this.state.coolant_C,
      oilC: this.state.oil_C,
      oilPressBar: out.oilPress_bar,
      busV: out.busV,
      fanOn: this.state.fanOn,
    };
  }
}
