import { describe, expect, it } from 'vitest';
import { createRng } from '../lib/rng';
import { CrankSensors } from '../plant/crank';
import type { CombustionHealth } from '../physics';
import { exhaustLoop, firingStrengths } from '../ui/audio/pulses';
import { PROFILE } from '../engine/profile';

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

describe('exhaust pulse loop', () => {
  const SR = 48000;
  const REF = 1500;
  const slot = Math.round(((120 / REF) * SR) / 4); // one firing every 180° of crank
  /** energy in the first 60 % of each firing slot, per cylinder (order 1-3-4-2) */
  const energyByCyl = (d: Float32Array) => {
    const e = [0, 0, 0, 0];
    const order = PROFILE.geometry.firingOrder;
    for (let k = 0; k * slot + slot <= d.length; k++) {
      for (let i = 0; i < slot * 0.6; i++) e[order[k % 4]! - 1]! += d[k * slot + i]! ** 2;
    }
    return e;
  };

  it('is a whole number of cycles long and deterministic', () => {
    const a = exhaustLoop(SR, { 1: 1, 2: 1, 3: 1, 4: 1 }, createRng(1), REF, 16);
    const b = exhaustLoop(SR, { 1: 1, 2: 1, 3: 1, 4: 1 }, createRng(1), REF, 16);
    expect(a.length).toBe(Math.round((120 / REF) * 16 * SR));
    expect(a).toEqual(b);
  });

  it('a healthy engine has four even pulses; a misfiring cylinder slot is silent', () => {
    const even = energyByCyl(exhaustLoop(SR, { 1: 1, 2: 1, 3: 1, 4: 1 }, createRng(2), REF));
    const mean = even.reduce((x, y) => x + y) / 4;
    for (const e of even) expect(Math.abs(e / mean - 1)).toBeLessThan(0.2);
    const mis = energyByCyl(exhaustLoop(SR, { 1: 1, 2: 1, 3: 0, 4: 1 }, createRng(2), REF));
    expect(mis[2]! / mean).toBeLessThan(0.05);
    for (const c of [0, 1, 3]) expect(mis[c]! / mean).toBeGreaterThan(0.8);
  });
});
