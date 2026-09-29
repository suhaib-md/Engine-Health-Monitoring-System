/**
 * Small statistics helpers for the Validation page: the χ² distribution, so the D² limit can be
 * checked against the table value (15.09 for 5 degrees of freedom at 99 %) instead of trusted.
 */

/** ln Γ(x), Lanczos approximation (accurate to ~1e-12 for x > 0). */
export function lnGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Regularised lower incomplete gamma P(a, x), by its power series (fine for the χ² range used). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0;
  let term = 1 / a;
  let sum = term;
  for (let n = 1; n < 500; n++) {
    term *= x / (a + n);
    sum += term;
    if (term < sum * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

/** χ² cumulative distribution with k degrees of freedom. */
export const chi2Cdf = (x: number, k: number) => gammaP(k / 2, x / 2);

/** χ² quantile by bisection: the x with chi2Cdf(x, k) = p. */
export function chi2Quantile(p: number, k: number): number {
  let lo = 0;
  let hi = 200;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (chi2Cdf(mid, k) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Samples a one-sided CUSUM (κ, h) needs to flag a constant shift of `shift` σ. */
export function cusumSamplesToFlag(shift: number, kappa: number, h: number): number {
  let s = 0;
  for (let n = 1; n < 10_000; n++) {
    s = Math.max(0, s + shift - kappa);
    if (s > h) return n;
  }
  return Infinity;
}
