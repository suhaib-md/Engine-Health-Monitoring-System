import { PROFILE, type EngineProfile } from '../engine/profile';
import { clamp } from '../lib/math';
import { defineEquation } from './registry';

/** Full-load torque curve T_max(N) = 190[1 − 0.53((N − 4000)/4000)²] (review, Fix 4) */
export function maxTorque_Nm(rpm: number, p: EngineProfile = PROFILE) {
  const { peak_Nm, peakAt_rpm, curveShape } = p.torque;
  const x = (rpm - peakAt_rpm) / peakAt_rpm;
  return peak_Nm * (1 - curveShape * x * x);
}

/** Normalised load L = T / T_max(N), clamped to 0..1 (open-questions Q-07) */
export function loadFraction(torque_Nm: number, rpm: number, p: EngineProfile = PROFILE) {
  const tMax = maxTorque_Nm(rpm, p);
  return tMax > 0 ? clamp(torque_Nm / tMax, 0, 1) : 0;
}

export const torqueEquations = [
  defineEquation<{ N: number }>({
    id: 'engine.maxTorque',
    title: 'Full-load torque curve',
    subsystem: 'engine',
    latex: String.raw`T_{max}(N) = 190\left[1 - 0.53\left(\frac{N - 4000}{4000}\right)^2\right]`,
    inputs: { N: { symbol: 'N', unit: 'rpm', label: 'engine speed' } },
    output: { symbol: 'T_{max}', unit: 'N·m', label: 'maximum torque' },
    compute: ({ N }) => maxTorque_Nm(N),
    substitute: (s) =>
      String.raw`190\left[1 - 0.53\left(\frac{${s.v('N')} - 4000}{4000}\right)^2\right]`,
  }),
  defineEquation<{ T: number; N: number }>({
    id: 'engine.load',
    title: 'Normalised load',
    subsystem: 'engine',
    latex: String.raw`L = \frac{T}{T_{max}(N)}`,
    inputs: {
      T: { symbol: 'T', unit: 'N·m', label: 'brake torque' },
      N: { symbol: 'N', unit: 'rpm', label: 'engine speed' },
    },
    output: { symbol: 'L', unit: '', label: 'load fraction' },
    compute: ({ T, N }) => loadFraction(T, N),
    substitute: (s) => String.raw`\frac{${s.v('T')}}{${s.n(maxTorque_Nm(s.i.N), 1)}}`,
  }),
];
