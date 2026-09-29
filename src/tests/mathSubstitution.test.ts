import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { EQUATIONS, type RegisteredEquation } from '../physics';
import { evalTex } from './texEval';

// Phase 8: every registered equation renders, and every substitution template evaluates to the
// equation's own compute() — the numbers on screen are the arithmetic the simulator does.

/** Representative inputs per symbol name (a warm engine at 3,000 rpm unless the name says otherwise). */
const SAMPLE: Record<string, number> = {
  N: 3000,
  T: 111.5,
  T_o: 97.3,
  T_c: 91.2,
  T_amb: 30,
  H_pump: 0.62,
  W_b: 0.1,
  H_cool: 0.8,
  F_therm: 0.71,
  F_fan: 1,
  UA: 1320,
  Q_cool: 31_900,
  Q_fuel: 110_800,
  Q_fric: 9_400,
  D: 0.3,
  L: 0.42,
  P_b: 25_100,
  P_f: 9_400,
  FMEP: 170.2,
  H_alt: 0.9,
  theta: 0.8,
  omega: 314.16,
  Tcyl: 27.9,
  dTheta: 0.00873,
  gas: 140,
  load: 111.5,
  J: 0.2,
  H1: 1,
  H2: 1,
  H3: 0,
  H4: 1,
  m: 0.5,
  r: 0.043,
  lambda: 0.297,
  F2: 2517,
  A: 9.02,
};

const inputsFor = (eq: RegisteredEquation) =>
  Object.fromEntries(Object.keys(eq.inputs).map((k) => [k, SAMPLE[k] ?? 1]));

/** The UI's number formatting in miniature: thousands as {,} and negatives in brackets. */
const tn = (x: number, d = 6) => {
  const s = Math.abs(x)
    .toLocaleString('en-US', { maximumFractionDigits: d, useGrouping: true })
    .replace(/,/g, '{,}');
  return x < 0 ? String.raw`\left(-${s}\right)` : s;
};

describe('equation registry', () => {
  it('has at least one equation per subsystem', () => {
    const subs = new Set(EQUATIONS.map((e) => e.subsystem));
    for (const s of [
      'cooling',
      'lubrication',
      'friction',
      'energy',
      'electrical',
      'vibration',
      'combustion',
    ])
      expect(subs, s).toContain(s);
  });

  it('ids are unique', () => {
    expect(new Set(EQUATIONS.map((e) => e.id)).size).toBe(EQUATIONS.length);
  });

  for (const eq of EQUATIONS) {
    describe(eq.id, () => {
      it('renders in KaTeX (strict)', () => {
        expect(() =>
          katex.renderToString(eq.latex, { throwOnError: true, strict: 'error' }),
        ).not.toThrow();
      });

      if (!eq.substitute) return;
      it('substitution evaluates to compute()', () => {
        const i = inputsFor(eq);
        const colour = (k: string) => String.raw`\textcolor{#35e0f0}{${tn(i[k]!)}}`;
        const tex = eq.substitute!({ v: colour, n: (x, d) => tn(x, d ?? 6), i });
        expect(() =>
          katex.renderToString(tex, { throwOnError: true, strict: 'error' }),
        ).not.toThrow();
        const expected = eq.compute(i);
        const got = evalTex(tex);
        // templates print intermediates to 3–4 decimals, so allow a small relative error
        expect(
          Math.abs(got - expected),
          `${tex}\n= ${got}, compute() = ${expected}`,
        ).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(expected) * 2e-3));
      });
    });
  }
});

it('the evaluator itself: fractions, roots, powers, min, implicit products', () => {
  expect(evalTex(String.raw`\frac{2\pi \cdot 3{,}000}{60}`)).toBeCloseTo(314.159, 3);
  expect(
    evalTex(
      String.raw`\min\left[5,\ \left(1.5 + 0.0009\,\left(3000 - 800\right)\right) \cdot 0.5^{0.5}\right]`,
    ),
  ).toBeCloseTo(3.48 * Math.SQRT1_2, 6);
  expect(evalTex(String.raw`\sqrt{\tfrac12 \cdot 4}`)).toBeCloseTo(Math.SQRT2, 9);
  expect(evalTex(String.raw`e^{-0.015\,\left(100 - 90\right)}`)).toBeCloseTo(Math.exp(-0.15), 9);
});
