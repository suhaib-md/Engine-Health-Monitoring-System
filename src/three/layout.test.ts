import { describe, expect, it } from 'vitest';
import { cylinderPose, heatColor, L, R } from './layout';

// Phase 5 exit check: TDC/BDC line up with θ = 0 / 180° in the rendered geometry.
describe('3D engine pose comes straight from the slider-crank equation', () => {
  it('θ = 0: pistons 1 & 4 at TDC (pin at l + r), 2 & 3 at BDC (l − r)', () => {
    expect(cylinderPose(0, 1).pinY).toBeCloseTo(L + R, 9);
    expect(cylinderPose(0, 4).pinY).toBeCloseTo(L + R, 9);
    expect(cylinderPose(0, 2).pinY).toBeCloseTo(L - R, 9);
    expect(cylinderPose(0, 3).pinY).toBeCloseTo(L - R, 9);
  });

  it('θ = 180°: the pairs swap', () => {
    expect(cylinderPose(Math.PI, 1).pinY).toBeCloseTo(L - R, 9);
    expect(cylinderPose(Math.PI, 2).pinY).toBeCloseTo(L + R, 9);
  });

  it('the rod always spans exactly l between crank pin and piston pin', () => {
    for (let d = 0; d < 360; d += 7) {
      const p = cylinderPose((d * Math.PI) / 180, 1);
      const len = Math.hypot(p.pinY - p.crankPinY, 0 - p.crankPinZ);
      expect(len).toBeCloseTo(L, 9);
    }
  });

  it('rod is vertical at TDC and leans opposite the crank pin at 90°', () => {
    expect(cylinderPose(0, 1).rodRotX).toBeCloseTo(0, 12);
    const p = cylinderPose(Math.PI / 2, 1);
    expect(p.crankPinZ).toBeGreaterThan(0);
    expect(p.rodRotX).toBeLessThan(0);
  });

  it('heat map runs from steel when cold to near-white when hot', () => {
    expect(heatColor(20)).toBe('rgb(38, 50, 63)');
    expect(heatColor(130)).toBe('rgb(232, 238, 245)');
  });
});
