import { PROFILE } from '../engine/profile';
import { cylinderCrankAngle_rad, pistonPosition_m, rodAngle_rad } from '../physics';
import { heatRamp } from '../ui/tokens';

/**
 * Scene layout for the procedural inline-4 (pure, testable). 1 scene unit = 10 cm, so the real
 * geometry (r = 43 mm, l = 145 mm, bore 86 mm) is multiplied by SCALE. The crank axis is the
 * x-axis; cylinders stand along +y; θ = 0 puts piston 1 at top dead centre.
 */
export const SCALE = 10;
const g = PROFILE.geometry;

export const R = g.crankRadius_m * SCALE; // 0.43
export const L = g.conRod_m * SCALE; // 1.45
export const BORE = g.bore_m * SCALE; // 0.86
export const PITCH = 0.98; // cylinder spacing along x
export const PISTON_H = 0.62;
/** piston crown sits this far above the gudgeon pin */
export const PIN_TO_CROWN = 0.36;

export const cylinderX = (cyl: number) => (cyl - 2.5) * PITCH;

export interface CylinderPose {
  /** crank angle of this cylinder's throw */
  angle: number;
  /** gudgeon-pin height above the crank axis (scene units) */
  pinY: number;
  /** crank-pin centre (y, z) */
  crankPinY: number;
  crankPinZ: number;
  /** rod centre and rotation about x */
  rodY: number;
  rodZ: number;
  rodRotX: number;
}

/** Everything the renderer needs for one cylinder at crankshaft angle θ, straight from the equations. */
export function cylinderPose(theta: number, cyl: number): CylinderPose {
  const angle = cylinderCrankAngle_rad(theta, cyl);
  const pinY = pistonPosition_m(angle) * SCALE;
  const crankPinY = R * Math.cos(angle);
  const crankPinZ = R * Math.sin(angle);
  return {
    angle,
    pinY,
    crankPinY,
    crankPinZ,
    rodY: (pinY + crankPinY) / 2,
    rodZ: crankPinZ / 2,
    // the rod's long axis maps y → (cos α, sin α) in (y, z); pointing from crank pin to piston pin gives α = −φ
    rodRotX: -rodAngle_rad(angle),
  };
}

/** Block heat-map: coolant 30 → 120 °C runs steel → cyan → white, so heat never reads as a status. */
export function heatColor(coolant_C: number): string {
  const t = Math.min(1, Math.max(0, (coolant_C - 30) / 90)) * (heatRamp.length - 1);
  const i = Math.min(heatRamp.length - 2, Math.floor(t));
  const f = t - i;
  const a = hex(heatRamp[i]!);
  const b = hex(heatRamp[i + 1]!);
  const c = a.map((v, k) => Math.round(v + (b[k]! - v) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Camera presets: position and look-at target (scene units). */
export const CAMERA_PRESETS: Record<
  string,
  { pos: [number, number, number]; target: [number, number, number] }
> = {
  front: { pos: [-7.9, 4.6, 8.6], target: [-0.3, 1.2, 0] },
  cutaway: { pos: [0, 1.7, 10.2], target: [0, 1.1, 0] },
  top: { pos: [0, 11.5, 0.01], target: [0, 1, 0] },
  explode: { pos: [-9.4, 5.8, 9.8], target: [-0.6, 1.5, 0] },
};
