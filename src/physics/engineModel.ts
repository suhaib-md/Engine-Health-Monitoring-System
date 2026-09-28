import { PROFILE, type EngineProfile } from '../engine/profile';
import { rpmToRadps } from './basics';
import { loadFraction, maxTorque_Nm } from './torque';
import { fmep_kPa, frictionTorque_Nm } from './friction';
import { coolantHeatFraction, fuelPower_W, fuelRate_Lph, indicatedEfficiency } from './energy';
import {
  coolantRate_Kps,
  nextFanState,
  radiatorHeat_W,
  radiatorUA_WperK,
  thermostatOpening,
} from './cooling';
import { oilPressure_bar, oilTempRate_Kps } from './oil';
import { busVoltage_V } from './electrical';

/**
 * The slow (20 Hz) engine model: every Phase 1 equation composed into one pure evaluate/step
 * pair. The Plant calls it with real health factors; the Twin calls it with HEALTHY.
 * Pure: no state is kept here; the caller owns ThermalState.
 */

export interface ThermalState {
  coolant_C: number;
  oil_C: number;
  fanOn: boolean;
}

export interface OperatingPoint {
  rpm: number;
  /** requested brake torque; clamped to the full-load curve */
  brakeTorque_Nm: number;
  ambient_C: number;
}

/** Health factors: 1 = healthy for H_*, 0 = new for wear/degradation. */
export interface HealthFactors {
  cooling: number;
  pump: number;
  bearingWear: number;
  lubeDegradation: number;
  alternator: number;
}

export const HEALTHY: HealthFactors = Object.freeze({
  cooling: 1,
  pump: 1,
  bearingWear: 0,
  lubeDegradation: 0,
  alternator: 1,
});

export interface EngineOutputs {
  omega_radps: number;
  maxTorque_Nm: number;
  brakeTorque_Nm: number;
  load: number;
  brakePower_W: number;
  fmep_kPa: number;
  frictionTorque_Nm: number;
  frictionPower_W: number;
  etaIndicated: number;
  fuelPower_W: number;
  fuelRate_Lph: number;
  coolantHeat_W: number;
  thermostat: number;
  radiatorUA_WperK: number;
  radiatorHeat_W: number;
  coolantRate_Kps: number;
  oilRate_Kps: number;
  oilPress_bar: number;
  busV: number;
}

export function evaluateEngine(
  state: ThermalState,
  op: OperatingPoint,
  health: HealthFactors = HEALTHY,
  p: EngineProfile = PROFILE,
): EngineOutputs {
  const running = op.rpm > 0;
  const omega = rpmToRadps(op.rpm);
  const tMax = maxTorque_Nm(op.rpm, p);
  const torque = running ? Math.min(Math.max(op.brakeTorque_Nm, 0), tMax) : 0;
  const load = running ? loadFraction(torque, op.rpm, p) : 0;
  const brakePower = torque * omega;

  const fmep = running ? fmep_kPa(op.rpm, state.oil_C, p) : 0;
  const tFric = frictionTorque_Nm(fmep, p);
  const frictionPower = tFric * omega;

  const eta = indicatedEfficiency(load, p);
  const fuel = running ? fuelPower_W(brakePower, frictionPower, load, p) : 0;
  const coolantHeat = coolantHeatFraction(load, p) * fuel;

  const thermostat = thermostatOpening(state.coolant_C, p);
  const ua = radiatorUA_WperK(health.cooling, thermostat, state.fanOn, p);
  const qRad = radiatorHeat_W(ua, state.coolant_C, op.ambient_C);

  return {
    omega_radps: omega,
    maxTorque_Nm: tMax,
    brakeTorque_Nm: torque,
    load,
    brakePower_W: brakePower,
    fmep_kPa: fmep,
    frictionTorque_Nm: tFric,
    frictionPower_W: frictionPower,
    etaIndicated: eta,
    fuelPower_W: fuel,
    fuelRate_Lph: fuelRate_Lph(fuel, p),
    coolantHeat_W: coolantHeat,
    thermostat,
    radiatorUA_WperK: ua,
    radiatorHeat_W: qRad,
    coolantRate_Kps: coolantRate_Kps(coolantHeat, qRad, p),
    oilRate_Kps: oilTempRate_Kps(
      {
        frictionPower_W: frictionPower,
        lubeDegradation: health.lubeDegradation,
        coolant_C: state.coolant_C,
        oil_C: state.oil_C,
        ambient_C: op.ambient_C,
      },
      p,
    ),
    oilPress_bar: oilPressure_bar(
      {
        rpm: op.rpm,
        oil_C: state.oil_C,
        pumpHealth: health.pump,
        bearingWear: health.bearingWear,
      },
      p,
    ),
    busV: busVoltage_V(op.rpm, health.alternator, p),
  };
}

/** One explicit-Euler step of the thermal states (dt in simulated seconds), then the fan update. */
export function stepThermal(
  state: ThermalState,
  op: OperatingPoint,
  dt: number,
  health: HealthFactors = HEALTHY,
  p: EngineProfile = PROFILE,
): ThermalState {
  const out = evaluateEngine(state, op, health, p);
  const coolant_C = state.coolant_C + out.coolantRate_Kps * dt;
  const oil_C = state.oil_C + out.oilRate_Kps * dt;
  return { coolant_C, oil_C, fanOn: nextFanState(state.fanOn, coolant_C, p) };
}
