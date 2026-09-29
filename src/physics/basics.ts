import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';

/** ω = 2πN/60 (draft §7.1) */
export const rpmToRadps = (rpm: number) => (2 * Math.PI * rpm) / 60;

/** P = T·ω (draft §7.2) */
export const shaftPower_W = (torque_Nm: number, rpm: number) => torque_Nm * rpmToRadps(rpm);

/** Four-stroke BMEP = 4πT / V_d (draft §7.3) */
export const bmep_Pa = (torque_Nm: number, p: EngineProfile = PROFILE) =>
  (4 * Math.PI * torque_Nm) / p.geometry.displacement_m3;

/** 1× rotational frequency f_r = N/60 (draft §11.1) */
export const rotationalFreq_Hz = (rpm: number) => rpm / 60;

/** Aggregate four-stroke firing frequency f_fire = (N/60)(n_c/2) (draft §11.2) */
export const firingFreq_Hz = (rpm: number, p: EngineProfile = PROFILE) =>
  (rpm / 60) * (p.geometry.cylinders / 2);

export const basicsEquations = [
  defineEquation<{ N: number }>({
    id: 'engine.omega',
    title: 'Angular speed',
    subsystem: 'engine',
    latex: String.raw`\omega = \frac{2\pi N}{60}`,
    inputs: { N: { symbol: 'N', unit: 'rpm', label: 'engine speed' } },
    output: { symbol: String.raw`\omega`, unit: 'rad/s', label: 'angular speed' },
    compute: ({ N }) => rpmToRadps(N),
    substitute: (s) => String.raw`\frac{2\pi \cdot ${s.v('N')}}{60}`,
  }),
  defineEquation<{ T: number; N: number }>({
    id: 'engine.brakePower',
    title: 'Brake power',
    subsystem: 'engine',
    latex: String.raw`P_b = T\,\omega`,
    inputs: {
      T: { symbol: 'T', unit: 'N·m', label: 'brake torque' },
      N: { symbol: 'N', unit: 'rpm', label: 'engine speed' },
    },
    output: { symbol: 'P_b', unit: 'W', label: 'brake power' },
    compute: ({ T, N }) => shaftPower_W(T, N),
    substitute: (s) => String.raw`${s.v('T')} \cdot \frac{2\pi \cdot ${s.v('N')}}{60}`,
  }),
];
