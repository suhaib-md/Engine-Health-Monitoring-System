import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';

/** Indicated efficiency η_i = 0.38 (0.70 + 0.30 L) (review, Fix 2) */
export function indicatedEfficiency(load: number, p: EngineProfile = PROFILE) {
  const e = p.energy;
  return e.etaIndicatedBase * (e.etaIndicatedOffset + e.etaIndicatedLoadSlope * load);
}

/**
 * Fuel power covers brake + friction + accessory power (review, Fix 2):
 * Q̇_fuel = (P_b + T_fric·ω + P_acc) / η_i.
 * This is what lets an idling engine (P_b = 0) still warm up.
 */
export function fuelPower_W(
  brakePower_W: number,
  frictionPower_W: number,
  load: number,
  p: EngineProfile = PROFILE,
) {
  return (
    (brakePower_W + frictionPower_W + p.energy.accessoryPower_W) / indicatedEfficiency(load, p)
  );
}

/** Share of fuel power rejected to coolant: 0.34 − 0.12 L (review) */
export function coolantHeatFraction(load: number, p: EngineProfile = PROFILE) {
  return p.energy.coolantFracA - p.energy.coolantFracB * load;
}

/** Fuel volume flow in L/h from fuel power (LHV 43 MJ/kg, 0.74 kg/L, draft §8.3) */
export function fuelRate_Lph(fuelPower: number, p: EngineProfile = PROFILE) {
  return (fuelPower / (p.energy.fuelLhv_Jperkg * p.energy.fuelDensity_kgperL)) * 3600;
}

export const energyEquations = [
  defineEquation<{ L: number }>({
    id: 'energy.etaIndicated',
    title: 'Indicated efficiency',
    subsystem: 'energy',
    latex: String.raw`\eta_i = 0.38\,(0.70 + 0.30L)`,
    inputs: { L: { symbol: 'L', unit: '', label: 'load fraction' } },
    output: { symbol: String.raw`\eta_i`, unit: '', label: 'indicated efficiency' },
    compute: ({ L }) => indicatedEfficiency(L),
    substitute: (s) => String.raw`0.38\left(0.70 + 0.30 \cdot ${s.v('L')}\right)`,
  }),
  defineEquation<{ P_b: number; P_f: number; L: number }>({
    id: 'energy.fuelPower',
    title: 'Fuel power',
    subsystem: 'energy',
    latex: String.raw`\dot Q_{fuel} = \frac{P_b + T_{fric}\,\omega + P_{acc}}{\eta_i}`,
    inputs: {
      P_b: { symbol: 'P_b', unit: 'W', label: 'brake power' },
      P_f: { symbol: String.raw`T_{fric}\,\omega`, unit: 'W', label: 'friction power' },
      L: { symbol: 'L', unit: '', label: 'load fraction' },
    },
    output: { symbol: String.raw`\dot Q_{fuel}`, unit: 'W', label: 'fuel power' },
    compute: ({ P_b, P_f, L }) => fuelPower_W(P_b, P_f, L),
    substitute: (s) =>
      String.raw`\frac{${s.v('P_b')} + ${s.v('P_f')} + 500}{${s.n(indicatedEfficiency(s.i.L), 4)}}`,
  }),
  defineEquation<{ Q_fuel: number; L: number }>({
    id: 'energy.coolantHeat',
    title: 'Heat into coolant',
    subsystem: 'energy',
    latex: String.raw`\dot Q_{cool} = (0.34 - 0.12L)\,\dot Q_{fuel}`,
    inputs: {
      Q_fuel: { symbol: String.raw`\dot Q_{fuel}`, unit: 'W', label: 'fuel power' },
      L: { symbol: 'L', unit: '', label: 'load fraction' },
    },
    output: { symbol: String.raw`\dot Q_{cool}`, unit: 'W', label: 'coolant heat' },
    compute: ({ Q_fuel, L }) => coolantHeatFraction(L) * Q_fuel,
    substitute: (s) =>
      String.raw`\left(0.34 - 0.12 \cdot ${s.v('L')}\right) \cdot ${s.v('Q_fuel')}`,
  }),
];
