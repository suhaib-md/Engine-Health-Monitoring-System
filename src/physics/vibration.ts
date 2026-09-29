import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';
import { rpmToRadps } from './basics';
import type { CrankRun } from './crankTorque';

/**
 * Vibration from real sources (review, "Vibration from real sources"). In an inline-4 the
 * first-order piston forces cancel between pairs while the second-order ones add:
 *   F₂ = 4 m_rec r ω² λ cos 2θ
 * The sensor signal is the sum of
 *   · 2× from F₂ (always present, grows with ω²), reaching the sensor through the engine mounts,
 *   · 1× from residual imbalance (grows with bearing wear or looseness, Phase 9),
 *   · block rocking from the net crank torque, a = −gain·(T_gas − T_resist): its 0.5× and 1.5×
 *     lines appear when one cylinder fires weakly,
 *   · broadband noise (added by the sensor model, not here).
 * Amplitudes are demo calibration (Q-12, Q-13); the thresholds built on them are
 * "engine-profile calibration values", never ISO limits (CLAUDE.md rule 9).
 */

/** Peak second-order inertia force of the four pistons, N (golden: 179 / 2,517 / 10,068 N). */
export function secondaryForcePeak_N(rpm: number, p: EngineProfile = PROFILE) {
  const w = rpmToRadps(rpm);
  const g = p.geometry;
  return 4 * g.recipMassPerCyl_kg * g.crankRadius_m * w * w * g.lambda;
}

/** Peak 2× acceleration at the sensor: mount factor × F₂ / block mass, m/s². */
export const secondaryAccel_ms2 = (rpm: number, p: EngineProfile = PROFILE) =>
  (p.vibration.mountFactor * secondaryForcePeak_N(rpm, p)) / p.vibration.blockMass_kg;

/**
 * RMS of a healthy engine's vibration signal, m/s². A healthy gas torque is A|sin φ| with A = πT/2,
 * so its 2× line has amplitude (2/3)T (in phase with F₂ through the reaction sign) and its total
 * variance is T²(π²/8 − 1); the remaining harmonics add power, and noise adds σ².
 */
export function healthyVibRms_ms2(rpm: number, resist_Nm: number, p: EngineProfile = PROFILE) {
  if (rpm <= 0) return 0;
  const a2 = secondaryAccel_ms2(rpm, p);
  const a1 = p.vibration.imbalance1xFraction * a2;
  const k = p.vibration.rockGain_ms2perNm;
  const line2 = k * (2 / 3) * resist_Nm;
  const varTorque = resist_Nm * resist_Nm * (Math.PI ** 2 / 8 - 1);
  const higher = k * k * (varTorque - (2 / 3) ** 2 * resist_Nm * resist_Nm * 0.5);
  const noise = p.sensors.vibMs2.sigma;
  return Math.sqrt(0.5 * (a2 + line2) ** 2 + 0.5 * a1 * a1 + higher + noise * noise);
}

/**
 * Noise-free vibration over one 720° cycle (sample k is at crank angle k·step, 0 = cylinder 1
 * firing TDC), m/s². `imbalance` scales the 1× line (1 = healthy). Tile it with `angleWindow`.
 */
export function synthesizeVibration(
  run: CrankRun,
  resist_Nm: number,
  imbalance = 1,
  p: EngineProfile = PROFILE,
) {
  const n = run.omega.length;
  const rpm = (run.meanOmega_radps * 30) / Math.PI;
  const a2 = secondaryAccel_ms2(rpm, p);
  const a1 = imbalance * p.vibration.imbalance1xFraction * a2;
  const k = p.vibration.rockGain_ms2perNm;
  const phi1 = (p.vibration.imbalance1xPhase_deg * Math.PI) / 180;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const th = (i * run.step_deg * Math.PI) / 180;
    out[i] = a2 * Math.cos(2 * th) + a1 * Math.cos(th - phi1) - k * (run.gas[i]! - resist_Nm);
  }
  return out;
}

export const vibrationEquations = [
  defineEquation<{ m: number; r: number; N: number; lambda: number }>({
    id: 'vib.secondaryForce',
    title: 'Second-order piston force',
    subsystem: 'vibration',
    latex: String.raw`F_2 = 4\,m_{rec}\,r\,\omega^2\,\lambda\cos 2\theta`,
    inputs: {
      m: { symbol: 'm_{rec}', unit: 'kg', label: 'reciprocating mass per cylinder' },
      r: { symbol: 'r', unit: 'm', label: 'crank radius' },
      N: { symbol: 'N', unit: 'rpm', label: 'engine speed' },
      lambda: { symbol: String.raw`\lambda`, unit: '', label: 'r / l' },
    },
    output: { symbol: 'F_2', unit: 'N', label: 'peak second-order force' },
    compute: ({ m, r, N, lambda }) => {
      const w = rpmToRadps(N);
      return 4 * m * r * w * w * lambda;
    },
  }),
];
