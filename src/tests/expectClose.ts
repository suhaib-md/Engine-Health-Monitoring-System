import { expect } from 'vitest';

/** Golden numbers came from a Python sim with rounding: compare with a relative tolerance (CLAUDE.md: ~2 %). */
export function expectClose(actual: number, expected: number, rel = 0.02, label = '') {
  const tol = Math.max(Math.abs(expected) * rel, 1e-9);
  expect(
    Math.abs(actual - expected),
    `${label ? label + ': ' : ''}expected ${expected} ±${(rel * 100).toFixed(1)}%, got ${actual}`,
  ).toBeLessThanOrEqual(tol);
}
