import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';

/** g(N) = 1 − e^(−N/600): how close the alternator is to full regulation at this speed */
export function alternatorFactor(rpm: number, p: EngineProfile = PROFILE) {
  return rpm <= 0 ? 0 : 1 - Math.exp(-rpm / p.electrical.alternatorSpeedConst_rpm);
}

/**
 * Bus voltage (draft §14):
 *   V = V_bat + H_alt · g(N) · (V_reg − V_bat) − ΔV_load
 * With the engine stopped the alternator gives nothing and the bus sits at battery voltage;
 * below 400 rpm (cranking) the starter pulls it down to 10.5 V.
 */
export function busVoltage_V(rpm: number, alternatorHealth: number, p: EngineProfile = PROFILE) {
  const e = p.electrical;
  if (rpm <= 0) return e.batteryV;
  // Starter motor draw while cranking (draft §32, Q-20)
  if (rpm < e.crankingBelow_rpm) return e.crankingV;
  return (
    e.batteryV +
    alternatorHealth * alternatorFactor(rpm, p) * (e.regulatorV - e.batteryV) -
    e.loadDrop_V
  );
}

export const electricalEquations = [
  defineEquation<{ N: number; H_alt: number }>({
    id: 'electrical.busVoltage',
    title: 'Bus voltage',
    subsystem: 'electrical',
    latex: String.raw`V = V_{bat} + H_{alt}\,\left(1 - e^{-N/600}\right)(V_{reg} - V_{bat}) - \Delta V_{load}`,
    inputs: {
      N: { symbol: 'N', unit: 'rpm', label: 'engine speed' },
      H_alt: { symbol: 'H_{alt}', unit: '', label: 'alternator health' },
    },
    output: { symbol: 'V', unit: 'V', label: 'bus voltage' },
    compute: ({ N, H_alt }) => busVoltage_V(N, H_alt),
    substitute: (s) =>
      s.i.N <= 0
        ? String.raw`V_{bat} = 12.6`
        : s.i.N < 400
          ? String.raw`V_{crank} = 10.5 \quad \left(N = ${s.v('N')} < 400,\ \text{starter draw}\right)`
          : String.raw`12.6 + ${s.v('H_alt')}\left(1 - e^{-${s.v('N')}/600}\right)(14.4 - 12.6) - 0.2`,
  }),
];
