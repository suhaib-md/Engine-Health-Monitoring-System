import { PROFILE } from '../../engine/profile';
import {
  evaluateEngine,
  oilPressure_bar,
  rpmToRadps,
  stepThermal,
  type ThermalState,
} from '../../physics';

/**
 * In-app validation rows: the hand-calculated golden value beside what the model computes
 * right now. Mirrors the Vitest suites in src/physics/*.test.ts (CLAUDE.md "Golden numbers").
 */
export interface Check {
  check: string;
  expected: number;
  unit: string;
  decimals: number;
  phase: number;
  /** undefined until that phase's physics exists */
  model?: () => number;
}

const hot: ThermalState = { coolant_C: 90, oil_C: 100, fanOn: false };
const at3000 = { rpm: 3000, brakeTorque_Nm: 80, ambient_C: 30 };

function settleCoolant() {
  let s: ThermalState = { coolant_C: 90, oil_C: 95, fanOn: false };
  const dt = PROFILE.sim.slowDt_s;
  for (let i = 0; i < 7200 / dt; i++) s = stepThermal(s, at3000, dt);
  return s.coolant_C;
}

export const CHECKS: Check[] = [
  {
    check: 'ω at 3,000 rpm',
    expected: 314.16,
    unit: 'rad/s',
    decimals: 2,
    phase: 1,
    model: () => rpmToRadps(3000),
  },
  {
    check: 'Fuel power · 3,000 rpm / 80 N·m',
    expected: 110.8,
    unit: 'kW',
    decimals: 1,
    phase: 1,
    model: () => evaluateEngine(hot, at3000).fuelPower_W / 1e3,
  },
  {
    check: 'Coolant heat · 3,000 rpm / 80 N·m',
    expected: 31.9,
    unit: 'kW',
    decimals: 1,
    phase: 1,
    model: () => evaluateEngine(hot, at3000).coolantHeat_W / 1e3,
  },
  {
    check: 'Steady coolant · 3,000 rpm / 80 N·m',
    expected: 93,
    unit: '°C',
    decimals: 1,
    phase: 1,
    model: settleCoolant,
  },
  {
    check: 'Oil pressure · cold start 20 °C',
    expected: 2.54,
    unit: 'bar',
    decimals: 2,
    phase: 1,
    model: () => oilPressure_bar({ rpm: 800, oil_C: 20, pumpHealth: 1, bearingWear: 0 }),
  },
  {
    check: 'Oil pressure · pump 0.4, hot idle',
    expected: 0.56,
    unit: 'bar',
    decimals: 2,
    phase: 1,
    model: () => oilPressure_bar({ rpm: 800, oil_C: 100, pumpHealth: 0.4, bearingWear: 0 }),
  },
  {
    // review: 81,500 W / 100,000 J/K ≈ 0.8 K/s (0.815 unrounded)
    check: 'Max coolant heating rate',
    expected: 0.815,
    unit: 'K/s',
    decimals: 3,
    phase: 1,
    model: () =>
      evaluateEngine(hot, { rpm: 6000, brakeTorque_Nm: 999, ambient_C: 30 }).coolantHeat_W /
      PROFILE.cooling.thermalCapacity_JperK,
  },
  { check: 'F₂ peak at 3,000 rpm', expected: 2517, unit: 'N', decimals: 0, phase: 7 },
  { check: 'Misfire torque command', expected: 146, unit: 'N·m', decimals: 0, phase: 7 },
  { check: 'Cyl 3 misfire · 0.5× phase', expected: -45, unit: '°', decimals: 0, phase: 7 },
];

/** Same rule as the test suite: within 2 %. */
export const passes = (model: number, expected: number) =>
  Math.abs(model - expected) <= Math.abs(expected) * 0.02;
