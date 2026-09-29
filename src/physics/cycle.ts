import { PROFILE, type EngineProfile } from '../engine/profile';

/**
 * Four-stroke cycle bookkeeping (720° per cycle). Cycle phase 0 = this cylinder's firing TDC.
 * Cylinders fire 180° apart in firing order 1-3-4-2, which is what the crank throws
 * (0°, 180°, 180°, 0°) produce: at firing each piston is at top dead centre.
 */

export type Stroke = 'power' | 'exhaust' | 'intake' | 'compression';

const CYCLE = 720;
const mod = (x: number, m: number) => ((x % m) + m) % m;

/** Crankshaft angle (deg) at which cylinder `cyl` fires: its slot in the firing order × 180°. */
export function firingOffset_deg(cyl: number, p: EngineProfile = PROFILE) {
  const slot = p.geometry.firingOrder.indexOf(cyl as 1 | 2 | 3 | 4);
  return (slot * CYCLE) / p.geometry.cylinders;
}

/** Where cylinder `cyl` is in its 720° cycle at crankshaft angle θ (rad). */
export function cyclePhase_deg(theta_rad: number, cyl: number, p: EngineProfile = PROFILE) {
  return mod((theta_rad * 180) / Math.PI - firingOffset_deg(cyl, p), CYCLE);
}

export function strokeAt(phase_deg: number): Stroke {
  if (phase_deg < 180) return 'power';
  if (phase_deg < 360) return 'exhaust';
  if (phase_deg < 540) return 'intake';
  return 'compression';
}

/** Valve lift (m): a smooth sin² profile across the open window, 0 outside it. */
export function valveLift_m(
  phase_deg: number,
  valve: 'intake' | 'exhaust',
  p: EngineProfile = PROFILE,
) {
  const t = p.geometry.valveTiming_deg;
  const [open, close] =
    valve === 'intake' ? [t.intakeOpen, t.intakeClose] : [t.exhaustOpen, t.exhaustClose];
  if (phase_deg < open || phase_deg > close) return 0;
  const s = Math.sin((Math.PI * (phase_deg - open)) / (close - open));
  return p.geometry.maxValveLift_m * s * s;
}

/** Combustion glow 0..1 just after firing TDC (for the 3D flash; a misfire suppresses it in Phase 7). */
export function combustionGlow(phase_deg: number) {
  return phase_deg < 70 ? Math.exp(-phase_deg / 18) : 0;
}
