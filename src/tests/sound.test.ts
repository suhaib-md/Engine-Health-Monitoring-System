import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng';
import { CrankSensors } from '../plant/crank';
import type { CombustionHealth } from '../physics';
import { firingStrengths } from '../ui/audio/pulses';

// Phase 10 engine sound: firing strengths come from the MEASURED crank speed, so a misfiring
// cylinder's exhaust pulse is missing (the audible stumble) without the UI knowing the fault.

const window = (health: CombustionHealth, rpm = 3000) =>
  new CrankSensors(createRng(9)).window({ rpm, resist_Nm: 111.5, health }).speed;

describe('firing strengths from the crank-speed window', () => {
  it('a healthy engine fires all four cylinders evenly', () => {
    const s = firingStrengths(window([1, 1, 1, 1]));
    for (const c of [1, 2, 3, 4] as const) expect(s[c]).toBeGreaterThan(0.85);
  });

  it.each([1, 2, 3, 4] as const)('a cylinder %i misfire silences that pulse only', (cyl) => {
    const h = [1, 2, 3, 4].map((c) => (c === cyl ? 0 : 1)) as unknown as CombustionHealth;
    const s = firingStrengths(window(h));
    expect(s[cyl]).toBeLessThan(0.1);
    for (const c of [1, 2, 3, 4] as const) if (c !== cyl) expect(s[c]).toBeGreaterThan(0.6);
  });

  it('still works at 6,000 rpm, where the ripple is smallest', () => {
    const s = firingStrengths(window([1, 1, 0, 1], 6000));
    expect(s[3]).toBeLessThan(0.1);
    expect(s[1]).toBeGreaterThan(0.6);
  });
});
