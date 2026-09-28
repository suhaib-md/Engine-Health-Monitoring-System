import { describe, expect, it } from 'vitest';
import { createRng } from './rng';

describe('seeded rng', () => {
  it('replays the identical sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 1000; i++) {
      expect(a.next()).toBe(b.next());
      expect(a.gaussian()).toBe(b.gaussian());
    }
  });

  it('produces different sequences for different seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 100 }, () => a.next() === b.next()).filter(Boolean);
    expect(same.length).toBeLessThan(5);
  });

  it('uniform values stay in [0, 1) with mean ≈ 0.5', () => {
    const r = createRng(7);
    let sum = 0;
    const n = 50_000;
    for (let i = 0; i < n; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / n).toBeCloseTo(0.5, 2);
  });

  it('gaussian has mean ≈ 0 and sd ≈ 1', () => {
    const r = createRng(11);
    const n = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const x = r.gaussian();
      sum += x;
      sumSq += x * x;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(sd - 1)).toBeLessThan(0.02);
  });
});
