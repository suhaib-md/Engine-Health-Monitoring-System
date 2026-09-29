import { PROFILE, type EngineProfile } from '../engine/profile';
import { clamp } from '../lib/math';
import { defineEquation } from './registry';

/** Thermostat opening F_therm: linear 0 → 1 between 82 and 95 °C (draft §9.2, §34) */
export function thermostatOpening(coolant_C: number, p: EngineProfile = PROFILE) {
  const { thermostatOpen_C: open, thermostatFull_C: full } = p.cooling;
  return clamp((coolant_C - open) / (full - open), 0, 1);
}

/**
 * Thermo-fan with hysteresis: switches on above 98 °C, off below 96 °C.
 * Returns the new fan state given the current one.
 */
export function nextFanState(fanOn: boolean, coolant_C: number, p: EngineProfile = PROFILE) {
  const { fanOn_C, fanHysteresis_K } = p.cooling;
  if (!fanOn && coolant_C > fanOn_C) return true;
  if (fanOn && coolant_C < fanOn_C - fanHysteresis_K) return false;
  return fanOn;
}

/** UA_eff = H_cool · F_therm(T_c) · (600 + 1000·F_fan) W/K (review, Fix 1) */
export function radiatorUA_WperK(
  coolingHealth: number,
  thermostat: number,
  fanOn: boolean,
  p: EngineProfile = PROFILE,
) {
  return (
    coolingHealth * thermostat * (p.cooling.uaBase_WperK + (fanOn ? p.cooling.uaFan_WperK : 0))
  );
}

/** Radiator heat rejection Q̇_rad = UA_eff (T_c − T_amb) (draft §9.1) */
export const radiatorHeat_W = (ua_WperK: number, coolant_C: number, ambient_C: number) =>
  ua_WperK * (coolant_C - ambient_C);

/**
 * Lumped coolant balance C_th dT_c/dt = Q̇_cool − Q̇_rad (draft §9.1; the draft's separate
 * Q̇_fric and Q̇_ambient terms are left out, see open-questions Q-03 and Q-06).
 */
export function coolantRate_Kps(
  coolantHeat_W: number,
  radiatorHeat: number,
  p: EngineProfile = PROFILE,
) {
  return (coolantHeat_W - radiatorHeat) / p.cooling.thermalCapacity_JperK;
}

export const coolingEquations = [
  defineEquation<{ T_c: number }>({
    id: 'cooling.thermostat',
    title: 'Thermostat opening',
    subsystem: 'cooling',
    latex: String.raw`F_{therm} = \operatorname{clip}\!\left(\frac{T_c - 82}{95 - 82},\,0,\,1\right)`,
    inputs: { T_c: { symbol: 'T_c', unit: '°C', label: 'coolant temperature' } },
    output: { symbol: 'F_{therm}', unit: '', label: 'thermostat opening' },
    compute: ({ T_c }) => thermostatOpening(T_c),
    substitute: (s) =>
      String.raw`\operatorname{clip}\!\left(\frac{${s.v('T_c')} - 82}{13},\,0,\,1\right)`,
  }),
  defineEquation<{ H_cool: number; F_therm: number; F_fan: number }>({
    id: 'cooling.ua',
    title: 'Radiator conductance',
    subsystem: 'cooling',
    latex: String.raw`UA_{eff} = H_{cool}\,F_{therm}(T_c)\,\left(600 + 1000\,F_{fan}\right)`,
    inputs: {
      H_cool: { symbol: 'H_{cool}', unit: '', label: 'cooling health' },
      F_therm: { symbol: 'F_{therm}', unit: '', label: 'thermostat opening' },
      F_fan: { symbol: 'F_{fan}', unit: '', label: 'fan on (1) / off (0)' },
    },
    output: { symbol: 'UA_{eff}', unit: 'W/K', label: 'radiator conductance' },
    compute: ({ H_cool, F_therm, F_fan }) => radiatorUA_WperK(H_cool, F_therm, F_fan >= 0.5),
    substitute: (s) =>
      String.raw`${s.v('H_cool')} \cdot ${s.v('F_therm')} \cdot \left(600 + 1000 \cdot ${s.v('F_fan')}\right)`,
  }),
  defineEquation<{ Q_cool: number; UA: number; T_c: number; T_amb: number }>({
    id: 'cooling.rate',
    title: 'Coolant heating rate',
    subsystem: 'cooling',
    latex: String.raw`\frac{dT_c}{dt} = \frac{\dot Q_{cool} - UA_{eff}\,(T_c - T_{amb})}{C_{th}}`,
    inputs: {
      Q_cool: { symbol: String.raw`\dot Q_{cool}`, unit: 'W', label: 'coolant heat' },
      UA: { symbol: 'UA_{eff}', unit: 'W/K', label: 'radiator conductance' },
      T_c: { symbol: 'T_c', unit: '°C', label: 'coolant temperature' },
      T_amb: { symbol: 'T_{amb}', unit: '°C', label: 'ambient temperature' },
    },
    output: { symbol: String.raw`dT_c/dt`, unit: 'K/s', label: 'coolant heating rate' },
    compute: ({ Q_cool, UA, T_c, T_amb }) =>
      coolantRate_Kps(Q_cool, radiatorHeat_W(UA, T_c, T_amb)),
    substitute: (s) =>
      String.raw`\frac{${s.v('Q_cool')} - ${s.v('UA')}\,\left(${s.v('T_c')} - ${s.v('T_amb')}\right)}{100{,}000}`,
  }),
];
