import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';
import { rpmToRadps } from './basics';
import { firingOffset_deg } from './cycle';

/**
 * Crank-angle torque model (review, "Crank-angle torque model" and "Misfire detection").
 * Each cylinder's expansion stroke is a half-sine torque pulse over 180° of its 720° cycle,
 * scaled by its combustion health H_i. The crank speed follows
 *   ω_{k+1} = ω_k + Δθ / (ω_k J) · (ΣH_i A sin θ_i⁺ − T_resist)
 * stepped in crank angle (0.5°), not in time. Compression torque is ignored (a stated simplification).
 *
 * Everything here is pure. The Plant runs it with real health factors; the analytics use only the
 * closed forms (ripple, half-order amplitude and phase) to normalise what they measure.
 */

export const CYCLE_DEG = 720;
const RPM_PER_RADPS = 30 / Math.PI;

/** Combustion health per cylinder 1..4: 1 = healthy, 0 = complete misfire (draft §13.1). */
export type CombustionHealth = readonly [number, number, number, number];
export const ALL_FIRING: CombustionHealth = Object.freeze([1, 1, 1, 1]) as CombustionHealth;

/** A = 2π · T̄_cyl: the half-sine amplitude that delivers mean torque T̄_cyl over a 720° cycle. */
export const pulseAmplitude_Nm = (meanTorquePerCyl_Nm: number) => 2 * Math.PI * meanTorquePerCyl_Nm;

/** One cylinder's gas torque at its cycle phase (0 = firing TDC): a half-sine over the power stroke. */
export function cylinderGasTorque_Nm(phase_deg: number, amplitude_Nm: number, health = 1) {
  return phase_deg >= 0 && phase_deg < 180
    ? health * amplitude_Nm * Math.sin((Math.PI * phase_deg) / 180)
    : 0;
}

/** One angle step of the crank-speed equation (review). */
export const speedStep_radps = (
  omega_radps: number,
  dTheta_rad: number,
  gasTorque_Nm: number,
  resistTorque_Nm: number,
  inertia_kgm2: number,
) => omega_radps + (dTheta_rad / (omega_radps * inertia_kgm2)) * (gasTorque_Nm - resistTorque_Nm);

/** The mean torque the crank must overcome: brake load + friction + accessory drag P_acc/ω. */
export function resistTorque_Nm(
  brakeTorque_Nm: number,
  frictionTorque_Nm: number,
  rpm: number,
  p: EngineProfile = PROFILE,
) {
  return rpm > 0
    ? brakeTorque_Nm + frictionTorque_Nm + p.energy.accessoryPower_W / rpmToRadps(rpm)
    : 0;
}

/**
 * Speed-governor fixed point. With combustion healths H_i the governor raises the torque command
 * until the mean gas torque again equals the resistance: T_cmd = n · T_resist / ΣH_i. One cylinder
 * out gives 4/3 (three cylinders now do four cylinders' work).
 */
export function governorCommand_Nm(resist_Nm: number, health: readonly number[]) {
  const sum = health.reduce((a, h) => a + h, 0);
  return (health.length * resist_Nm) / Math.max(sum, 0.05);
}

const RIPPLE_PHI1 = Math.asin(2 / Math.PI);

/**
 * Peak-to-peak crank-speed ripple of a healthy 4-cylinder engine, rpm. The four half-sine pulses
 * tile the cycle as A|sin φ|; the speed swings by 0.421·A/(J ω) between its extremes.
 */
export function healthyRipplePP_rpm(rpm: number, resist_Nm: number, p: EngineProfile = PROFILE) {
  if (rpm <= 0) return 0;
  const A = (Math.PI / 2) * resist_Nm; // A = 2π · (T/4)
  const energy = A * (2 * Math.cos(RIPPLE_PHI1) - (2 / Math.PI) * (Math.PI - 2 * RIPPLE_PHI1));
  return ((energy / (p.geometry.crankInertia_kgm2 * rpmToRadps(rpm))) * 30) / Math.PI;
}

/** |Fourier coefficient| of one half-sine pulse at order 0.5, in units of its amplitude: (4√2/3)/(2π). */
const HALF_ORDER_PULSE = (4 * Math.SQRT2) / 3 / (2 * Math.PI);

/**
 * 0.5× crank-speed amplitude (rpm) when a fraction m of ONE cylinder's torque is missing
 * (m = 1 complete misfire, m = 1 − H_i). The governor has already re-scaled the other pulses, so
 * the missing pulse is m·A with A = 2π T_resist/(4 − m).
 */
export function halfOrderAmplitude_rpm(
  rpm: number,
  resist_Nm: number,
  missing: number,
  p: EngineProfile = PROFILE,
) {
  if (rpm <= 0) return 0;
  const A = (2 * Math.PI * resist_Nm) / (4 - missing);
  const torqueHarmonic = HALF_ORDER_PULSE * missing * A;
  return ((2 * torqueHarmonic) / (p.geometry.crankInertia_kgm2 * rpmToRadps(rpm))) * RPM_PER_RADPS;
}

/**
 * Inverse of `halfOrderAmplitude_rpm`: the missing torque fraction m implied by a measured 0.5×
 * amplitude. From A_h = K T m/(4 − m) it follows m = 4 A_h / (K T + A_h).
 */
export function missingFractionFromHalfOrder(
  rpm: number,
  resist_Nm: number,
  amplitude_rpm: number,
  p: EngineProfile = PROFILE,
) {
  if (rpm <= 0 || resist_Nm <= 0) return 0;
  const kT = halfOrderAmplitude_rpm(rpm, resist_Nm, 1, p) * 3; // at m = 1 the factor m/(4 − m) is 1/3
  return Math.min(1, Math.max(0, (4 * amplitude_rpm) / (kT + amplitude_rpm)));
}

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

/**
 * Phase of the 0.5× speed component (deg) for a misfire in cylinder `cyl`, referenced to cylinder 1's
 * firing TDC. Cylinders fire 180° of crank apart, which is 90° at half order, so the four phases are
 * +45° (cyl 1), +135° (cyl 2), −45° (cyl 3) and −135° (cyl 4).
 */
export const misfirePhase_deg = (cyl: number, p: EngineProfile = PROFILE) =>
  wrap180(45 - firingOffset_deg(cyl, p) / 2);

/** The cylinder whose 90° sector contains a measured 0.5× phase. */
export function cylinderFromPhase(phase_deg: number, p: EngineProfile = PROFILE): 1 | 2 | 3 | 4 {
  let best: 1 | 2 | 3 | 4 = 1;
  let bestD = Infinity;
  for (const c of [1, 2, 3, 4] as const) {
    const d = Math.abs(wrap180(phase_deg - misfirePhase_deg(c, p)));
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export interface CrankInput {
  rpm: number;
  /** mean resisting torque, N·m */
  resist_Nm: number;
  health: CombustionHealth;
}

export interface CrankRun {
  /** crank speed at the start of every angle step of one 720° cycle, rad/s */
  omega: Float64Array;
  /** total gas torque over the same steps, N·m */
  gas: Float64Array;
  /** speed-governor torque command, N·m */
  torqueCmd_Nm: number;
  meanOmega_radps: number;
  /** angle step, deg */
  step_deg: number;
}

/**
 * Integrate the crank-speed equation in crank-angle steps over one 720° cycle.
 * The speed governor is modelled at its converged state: its integral action has already raised
 * the command to T_cmd = 4 T_resist / ΣH_i and holds the mean speed on the set point, so the gas
 * torque repeats exactly every 720° cycle. One cycle is integrated (starting on the set speed),
 * made exactly periodic by removing the numerical drift of the Euler step, centred on the set
 * speed. The telemetry window is this cycle tiled (`angleWindow`). Cycle-to-cycle combustion
 * scatter and the governor's transient are not modelled (Q-39). Sample 0 is cylinder 1's firing TDC.
 */
export function simulateCrank(input: CrankInput, p: EngineProfile = PROFILE): CrankRun {
  const step = p.sim.crankStep_deg;
  const dTheta = (step * Math.PI) / 180;
  const nCycle = Math.round(CYCLE_DEG / step);
  const pulse = nCycle / 4;
  const J = p.geometry.crankInertia_kgm2;
  const omegaTarget = rpmToRadps(input.rpm);

  const cmd = governorCommand_Nm(input.resist_Nm, input.health);
  const A = pulseAmplitude_Nm(cmd / 4);
  // gas-torque pattern over one cycle: Σ H_k A sin(π φ_k / 180)
  const oneGas = new Float64Array(nCycle);
  for (let k = 0; k < 4; k++) {
    const off = Math.round(firingOffset_deg(k + 1, p) / step);
    const h = input.health[k]!;
    for (let j = 0; j < pulse; j++)
      oneGas[(off + j) % nCycle]! += h * A * Math.sin((Math.PI * j) / pulse);
  }

  const oneOmega = new Float64Array(nCycle);
  let w = omegaTarget;
  for (let i = 0; i < nCycle; i++) {
    oneOmega[i] = w;
    // the same ODE as speedStep_radps, integrated in kinetic-energy form d(ω²)/dθ = 2 net/J, which
    // is exact for a piecewise-constant torque and keeps every cylinder's ripple identical
    w = Math.sqrt(w * w + (2 * dTheta * (oneGas[i]! - input.resist_Nm)) / J);
  }
  // exact periodicity: remove the linear drift across the cycle, then centre on the set speed
  const drift = w - omegaTarget;
  let mean = 0;
  for (let i = 0; i < nCycle; i++) {
    oneOmega[i]! -= (drift * i) / nCycle;
    mean += oneOmega[i]!;
  }
  const shift = omegaTarget - mean / nCycle;
  for (let i = 0; i < nCycle; i++) oneOmega[i]! += shift;

  return {
    omega: oneOmega,
    gas: oneGas,
    torqueCmd_Nm: cmd,
    meanOmega_radps: omegaTarget,
    step_deg: step,
  };
}

/**
 * The telemetry window from one 720° cycle: resample it to `2 · samplesPerRev` points by periodic
 * linear interpolation and tile it over the window's `windowRevs / 2` cycles. Sample 0 stays at
 * cylinder 1's firing TDC.
 */
export function angleWindow(oneCycle: ArrayLike<number>, p: EngineProfile = PROFILE): Float64Array {
  const m = oneCycle.length;
  const per = 2 * p.crank.samplesPerRev;
  const tiles = p.crank.windowRevs / 2;
  const out = new Float64Array(per * tiles);
  const ratio = m / per;
  for (let j = 0; j < per; j++) {
    const pos = j * ratio;
    const i0 = Math.floor(pos);
    const f = pos - i0;
    const a = oneCycle[i0 % m]!;
    const b = oneCycle[(i0 + 1) % m]!;
    out[j] = a + f * (b - a);
  }
  for (let t = 1; t < tiles; t++) out.copyWithin(t * per, 0, per);
  return out;
}

export const crankEquations = [
  defineEquation<{ Tcyl: number }>({
    id: 'crank.pulseAmplitude',
    title: 'Cylinder torque pulse',
    subsystem: 'combustion',
    latex: String.raw`A = 2\pi\,\bar T_{cyl}`,
    inputs: {
      Tcyl: { symbol: String.raw`\bar T_{cyl}`, unit: 'N·m', label: 'mean torque per cylinder' },
    },
    output: { symbol: 'A', unit: 'N·m', label: 'half-sine pulse amplitude' },
    compute: ({ Tcyl }) => pulseAmplitude_Nm(Tcyl),
  }),
  defineEquation<{ omega: number; dTheta: number; gas: number; load: number; J: number }>({
    id: 'crank.speedStep',
    title: 'Crank speed step',
    subsystem: 'combustion',
    latex: String.raw`\omega_{k+1} = \omega_k + \frac{\Delta\theta}{\omega_k J}\left(\sum_i H_i A\sin\theta_i^{+} - T_{load} - T_{fric}\right)`,
    inputs: {
      omega: { symbol: String.raw`\omega_k`, unit: 'rad/s', label: 'crank speed' },
      dTheta: { symbol: String.raw`\Delta\theta`, unit: 'rad', label: 'angle step' },
      gas: { symbol: String.raw`\sum_i H_i A\sin\theta_i^{+}`, unit: 'N·m', label: 'gas torque' },
      load: { symbol: String.raw`T_{load}+T_{fric}`, unit: 'N·m', label: 'resisting torque' },
      J: { symbol: 'J', unit: 'kg·m²', label: 'crank + flywheel inertia' },
    },
    output: { symbol: String.raw`\omega_{k+1}`, unit: 'rad/s', label: 'next crank speed' },
    compute: ({ omega, dTheta, gas, load, J }) => speedStep_radps(omega, dTheta, gas, load, J),
  }),
  defineEquation<{ T: number; H1: number; H2: number; H3: number; H4: number }>({
    id: 'crank.governor',
    title: 'Speed-governor torque command',
    subsystem: 'combustion',
    latex: String.raw`T_{cmd} = \frac{4\,T_{resist}}{\sum_i H_i}`,
    inputs: {
      T: { symbol: 'T_{resist}', unit: 'N·m', label: 'resisting torque' },
      H1: { symbol: 'H_1', unit: '', label: 'cylinder 1 combustion health' },
      H2: { symbol: 'H_2', unit: '', label: 'cylinder 2 combustion health' },
      H3: { symbol: 'H_3', unit: '', label: 'cylinder 3 combustion health' },
      H4: { symbol: 'H_4', unit: '', label: 'cylinder 4 combustion health' },
    },
    output: { symbol: 'T_{cmd}', unit: 'N·m', label: 'torque command' },
    compute: ({ T, H1, H2, H3, H4 }) => governorCommand_Nm(T, [H1, H2, H3, H4]),
  }),
];
