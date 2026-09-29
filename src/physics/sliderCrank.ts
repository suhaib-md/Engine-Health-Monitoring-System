import { PROFILE, type EngineProfile } from '../engine/profile';
import { defineEquation } from './registry';

/**
 * Slider-crank kinematics (review, "Piston motion"). θ = 0 at top dead centre (TDC).
 * The 3D engine positions every piston and rod from these functions, so the animation is the
 * equation, not a looped clip.
 */

const deg = (d: number) => (d * Math.PI) / 180;

/** Piston-pin distance from the crank axis: x(θ) = r cos θ + √(l² − r² sin² θ) */
export function pistonPosition_m(theta_rad: number, p: EngineProfile = PROFILE) {
  const r = p.geometry.crankRadius_m;
  const l = p.geometry.conRod_m;
  const s = Math.sin(theta_rad);
  return r * Math.cos(theta_rad) + Math.sqrt(l * l - r * r * s * s);
}

/** Connecting-rod angle from the cylinder axis: φ = asin(λ sin θ) */
export function rodAngle_rad(theta_rad: number, p: EngineProfile = PROFILE) {
  return Math.asin(p.geometry.lambda * Math.sin(theta_rad));
}

/** Piston acceleration (second-order approximation): a ≈ r ω² (cos θ + λ cos 2θ), m/s² */
export function pistonAccel_mps2(
  theta_rad: number,
  omega_radps: number,
  p: EngineProfile = PROFILE,
) {
  const { crankRadius_m: r, lambda } = p.geometry;
  return r * omega_radps * omega_radps * (Math.cos(theta_rad) + lambda * Math.cos(2 * theta_rad));
}

/**
 * Crank angle of cylinder i (1-based) given the crankshaft angle θ: its throw offset.
 * Inline-4 throws 0°, 180°, 180°, 0°: pistons 1 & 4 move together, 2 & 3 opposite.
 */
export function cylinderCrankAngle_rad(
  theta_rad: number,
  cylinder: number,
  p: EngineProfile = PROFILE,
) {
  const throwDeg = p.geometry.crankThrow_deg[cylinder - 1] ?? 0;
  return theta_rad + deg(throwDeg);
}

export const sliderCrankEquations = [
  defineEquation<{ theta: number }>({
    id: 'crank.pistonPosition',
    title: 'Piston position (slider-crank)',
    subsystem: 'engine',
    latex: String.raw`x(\theta) = r\cos\theta + \sqrt{l^2 - r^2\sin^2\theta}`,
    inputs: { theta: { symbol: String.raw`\theta`, unit: 'rad', label: 'crank angle' } },
    output: { symbol: 'x', unit: 'm', label: 'piston-pin distance from crank axis' },
    compute: ({ theta }) => pistonPosition_m(theta),
  }),
  defineEquation<{ theta: number; omega: number }>({
    id: 'crank.pistonAccel',
    title: 'Piston acceleration',
    subsystem: 'engine',
    latex: String.raw`a(\theta) \approx r\omega^2\left(\cos\theta + \lambda\cos 2\theta\right)`,
    inputs: {
      theta: { symbol: String.raw`\theta`, unit: 'rad', label: 'crank angle' },
      omega: { symbol: String.raw`\omega`, unit: 'rad/s', label: 'angular speed' },
    },
    output: { symbol: 'a', unit: 'm/s²', label: 'piston acceleration' },
    compute: ({ theta, omega }) => pistonAccel_mps2(theta, omega),
  }),
];
