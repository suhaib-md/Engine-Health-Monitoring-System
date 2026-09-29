import { describe, expect, it } from 'vitest';
import { expectClose } from '../tests/expectClose';
import { PROFILE } from '../engine/profile';
import {
  cylinderCrankAngle_rad,
  pistonAccel_mps2,
  pistonPosition_m,
  rodAngle_rad,
} from './sliderCrank';
import { rpmToRadps } from './basics';

const { crankRadius_m: r, conRod_m: l, lambda } = PROFILE.geometry;

describe('slider-crank kinematics (review, "Piston motion")', () => {
  it('TDC at θ = 0: x = l + r (188 mm)', () => expectClose(pistonPosition_m(0), l + r, 1e-9));
  it('BDC at θ = 180°: x = l − r (102 mm)', () =>
    expectClose(pistonPosition_m(Math.PI), l - r, 1e-9));
  it('stroke = 2r = 86 mm', () =>
    expectClose(pistonPosition_m(0) - pistonPosition_m(Math.PI), PROFILE.geometry.stroke_m, 1e-9));
  it('at 90° the piston is below mid-stroke (rod angularity)', () =>
    expect(pistonPosition_m(Math.PI / 2)).toBeLessThan(l));
  it('rod angle is 0 at TDC/BDC and peaks at asin(λ) = 17.3° at 90°', () => {
    expect(Math.abs(rodAngle_rad(0))).toBeLessThan(1e-12);
    expect(Math.abs(rodAngle_rad(Math.PI))).toBeLessThan(1e-12);
    expectClose(
      (rodAngle_rad(Math.PI / 2) * 180) / Math.PI,
      (Math.asin(lambda) * 180) / Math.PI,
      1e-9,
    );
  });
  it('acceleration at TDC = rω²(1 + λ) at 3,000 rpm', () => {
    const w = rpmToRadps(3000);
    expectClose(pistonAccel_mps2(0, w), r * w * w * (1 + lambda), 1e-9);
  });
  it('pistons 1 & 4 share θ; 2 & 3 run 180° apart (one at TDC while the other is at BDC)', () => {
    const theta = 0;
    const x = (c: number) => pistonPosition_m(cylinderCrankAngle_rad(theta, c));
    expectClose(x(1), l + r, 1e-9);
    expectClose(x(4), l + r, 1e-9);
    expectClose(x(2), l - r, 1e-9);
    expectClose(x(3), l - r, 1e-9);
  });
});
