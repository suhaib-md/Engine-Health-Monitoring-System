import { describe, expect, it } from 'vitest';
import { PROFILE } from './profile';

// Geometry checks from the review's "Engine geometry" table.
describe('engine profile geometry', () => {
  const g = PROFILE.geometry;

  it('displacement is ≈ 1,998 cc', () => {
    expect(g.displacement_m3 * 1e6).toBeCloseTo(1998, 0);
  });

  it('crank radius is half the stroke (43 mm)', () => {
    expect(g.crankRadius_m).toBeCloseTo(0.043, 6);
  });

  it('λ = r / l ≈ 0.297', () => {
    expect(g.lambda).toBeCloseTo(0.297, 3);
  });

  it('firing order 1-3-4-2 with throws 0/180/180/0', () => {
    expect(g.firingOrder).toEqual([1, 3, 4, 2]);
    expect(g.crankThrow_deg).toEqual([0, 180, 180, 0]);
  });

  it('thermostat opens before it is full, and the fan is above full-open', () => {
    const c = PROFILE.cooling;
    expect(c.thermostatOpen_C).toBeLessThan(c.thermostatFull_C);
    expect(c.fanOn_C).toBeGreaterThan(c.thermostatFull_C);
  });
});
