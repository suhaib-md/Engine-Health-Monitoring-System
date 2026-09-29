import { describe, expect, it } from 'vitest';
import { PROFILE } from '../engine/profile';
import { combustionGlow, cyclePhase_deg, firingOffset_deg, strokeAt, valveLift_m } from './cycle';
import { cylinderCrankAngle_rad, pistonPosition_m } from './sliderCrank';

const rad = (d: number) => (d * Math.PI) / 180;
const { crankRadius_m: r, conRod_m: l } = PROFILE.geometry;

describe('four-stroke cycle (firing order 1-3-4-2)', () => {
  it('cylinders fire 180° apart in order 1, 3, 4, 2', () => {
    expect([1, 3, 4, 2].map((c) => firingOffset_deg(c))).toEqual([0, 180, 360, 540]);
  });

  it('every cylinder is at top dead centre when it fires (cycle agrees with the crank throws)', () => {
    for (const c of [1, 2, 3, 4]) {
      const theta = rad(firingOffset_deg(c));
      expect(cyclePhase_deg(theta, c)).toBeCloseTo(0, 9);
      expect(pistonPosition_m(cylinderCrankAngle_rad(theta, c))).toBeCloseTo(l + r, 9);
    }
  });

  it('strokes run power → exhaust → intake → compression', () => {
    expect([10, 200, 400, 600].map(strokeAt)).toEqual([
      'power',
      'exhaust',
      'intake',
      'compression',
    ]);
  });

  it('both valves are shut at firing TDC and after intake closing (590°)', () => {
    for (const ph of [0, 20, 620, 700]) {
      expect(valveLift_m(ph, 'intake')).toBe(0);
      expect(valveLift_m(ph, 'exhaust')).toBe(0);
    }
  });

  it('intake peaks mid-window at full lift; both are open around overlap TDC (360°)', () => {
    expect(valveLift_m(470, 'intake')).toBeCloseTo(PROFILE.geometry.maxValveLift_m, 9);
    expect(valveLift_m(360, 'intake')).toBeGreaterThan(0);
    expect(valveLift_m(360, 'exhaust')).toBeGreaterThan(0);
  });

  it('combustion glow is brightest at firing and gone by 70°', () => {
    expect(combustionGlow(0)).toBe(1);
    expect(combustionGlow(90)).toBe(0);
  });
});
