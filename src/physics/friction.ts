import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';

/**
 * Friction mean effective pressure (review, Fix 1 & 2; Sandoval–Heywood form):
 * FMEP = (97 + 15n + 5n²)(1 + max(0, 90 − T_o)/70) kPa, n = N/1000.
 * The second bracket roughly doubles friction for cold oil.
 */
export function fmep_kPa(rpm: number, oil_C: number, p: EngineProfile = PROFILE) {
  const { fmepA_kPa, fmepB_kPa, fmepC_kPa, coldRef_C, coldSpan_K } = p.friction;
  const n = rpm / 1000;
  const warm = fmepA_kPa + fmepB_kPa * n + fmepC_kPa * n * n;
  const coldFactor = 1 + Math.max(0, coldRef_C - oil_C) / coldSpan_K;
  return warm * coldFactor;
}

/** T_fric = FMEP · V_d / 4π (four-stroke) */
export function frictionTorque_Nm(fmep: number, p: EngineProfile = PROFILE) {
  return (fmep * 1000 * p.geometry.displacement_m3) / (4 * Math.PI);
}

export const frictionEquations = [
  defineEquation<{ N: number; T_o: number }>({
    id: 'friction.fmep',
    title: 'Friction mean effective pressure',
    subsystem: 'friction',
    latex: String.raw`FMEP = \left(97 + 15n + 5n^2\right)\left(1 + \frac{\max(0,\,90 - T_o)}{70}\right),\quad n = \frac{N}{1000}`,
    inputs: {
      N: { symbol: 'N', unit: 'rpm', label: 'engine speed' },
      T_o: { symbol: 'T_o', unit: '°C', label: 'oil temperature' },
    },
    output: { symbol: 'FMEP', unit: 'kPa', label: 'friction mean effective pressure' },
    compute: ({ N, T_o }) => fmep_kPa(N, T_o),
  }),
  defineEquation<{ FMEP: number }>({
    id: 'friction.torque',
    title: 'Friction torque',
    subsystem: 'friction',
    latex: String.raw`T_{fric} = \frac{FMEP \cdot V_d}{4\pi}`,
    inputs: { FMEP: { symbol: 'FMEP', unit: 'kPa', label: 'friction mean effective pressure' } },
    output: { symbol: 'T_{fric}', unit: 'N·m', label: 'friction torque' },
    compute: ({ FMEP }) => frictionTorque_Nm(FMEP),
  }),
];
