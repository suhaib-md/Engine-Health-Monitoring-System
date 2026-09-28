import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';

/** Relative viscosity μ_rel = e^(−0.015 (T_o − 90)) (draft §10.1) */
export function viscosityRatio(oil_C: number, p: EngineProfile = PROFILE) {
  const l = p.lubrication;
  return Math.exp(-l.viscosityTempCoeff_perK * (oil_C - l.viscosityRef_C));
}

export interface OilPressureInputs {
  rpm: number;
  oil_C: number;
  /** H_pump, 1 = healthy */
  pumpHealth: number;
  /** W_b, 0 = new */
  bearingWear: number;
}

/**
 * Oil pressure, the review's form (Fix 3): health and wear scale the WHOLE pressure, so a
 * weak pump shows at idle.
 *   P̂_o = min[P_relief, (P_idle + K_N(N − N_idle)) · μ_rel^0.5 · H_pump / (1 + K_c W_b)]
 * Below idle speed the pump-speed term ramps linearly to 0 at N = 0, so a stopped engine
 * reads 0 bar gauge (calibration.md).
 */
export function oilPressure_bar(
  { rpm, oil_C, pumpHealth, bearingWear }: OilPressureInputs,
  p: EngineProfile = PROFILE,
) {
  const l = p.lubrication;
  const idle = p.speed.idle_rpm;
  if (rpm <= 0) return 0;
  const speedTerm =
    rpm >= idle
      ? l.pressureIdle_bar + l.speedGain_barPerRpm * (rpm - idle)
      : l.pressureIdle_bar * (rpm / idle);
  const pressure =
    (speedTerm * viscosityRatio(oil_C, p) ** l.viscosityExponent * pumpHealth) /
    (1 + l.wearSensitivity * bearingWear);
  return Math.min(l.pressureRelief_bar, pressure);
}

export interface OilTempInputs {
  frictionPower_W: number;
  /** D_lube, 0 = healthy lubrication */
  lubeDegradation: number;
  coolant_C: number;
  oil_C: number;
  ambient_C: number;
}

/**
 * Oil-temperature balance (draft §10.3):
 *   C_o dT_o/dt = s·Q̇_fric(1 + K_f D_lube) + K_co (T_c − T_o) − UA_o (T_o − T_amb)
 * s = share of friction power that heats the oil. One-way coupling: the coolant balance is
 * NOT charged for this exchange, because the review's coolant heat fraction already
 * includes it (open-questions Q-03).
 */
export function oilTempRate_Kps(i: OilTempInputs, p: EngineProfile = PROFILE) {
  const l = p.lubrication;
  const q =
    l.oilFrictionHeatShare * i.frictionPower_W * (1 + l.lubeFrictionGain * i.lubeDegradation) +
    l.oilCoolantCoupling_WperK * (i.coolant_C - i.oil_C) -
    l.oilAmbientUA_WperK * (i.oil_C - i.ambient_C);
  return q / l.oilThermalCapacity_JperK;
}

export const oilEquations = [
  defineEquation<{ T_o: number }>({
    id: 'oil.viscosity',
    title: 'Relative oil viscosity',
    subsystem: 'lubrication',
    latex: String.raw`\mu_{rel} = e^{-0.015\,(T_o - 90)}`,
    inputs: { T_o: { symbol: 'T_o', unit: '°C', label: 'oil temperature' } },
    output: { symbol: String.raw`\mu_{rel}`, unit: '', label: 'relative viscosity' },
    compute: ({ T_o }) => viscosityRatio(T_o),
  }),
  defineEquation<{ N: number; T_o: number; H_pump: number; W_b: number }>({
    id: 'oil.pressure',
    title: 'Oil pressure',
    subsystem: 'lubrication',
    latex: String.raw`\hat P_o = \min\left[P_{relief},\ \left(P_{idle} + K_N(N - N_{idle})\right)\,\mu_{rel}^{0.5}\,\frac{H_{pump}}{1 + K_c W_b}\right]`,
    inputs: {
      N: { symbol: 'N', unit: 'rpm', label: 'engine speed' },
      T_o: { symbol: 'T_o', unit: '°C', label: 'oil temperature' },
      H_pump: { symbol: 'H_{pump}', unit: '', label: 'oil-pump health' },
      W_b: { symbol: 'W_b', unit: '', label: 'bearing wear' },
    },
    output: { symbol: String.raw`\hat P_o`, unit: 'bar', label: 'oil pressure' },
    compute: ({ N, T_o, H_pump, W_b }) =>
      oilPressure_bar({ rpm: N, oil_C: T_o, pumpHealth: H_pump, bearingWear: W_b }),
  }),
];
