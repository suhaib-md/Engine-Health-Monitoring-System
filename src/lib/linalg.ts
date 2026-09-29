/**
 * Small dense linear algebra for the Mahalanobis distance (5 × 5). Matrices are row-major
 * number[][]; sizes are tiny, so clarity beats speed.
 */

/** Cholesky factor L of a symmetric positive-definite matrix (A = L Lᵀ). Throws if A is not SPD. */
export function cholesky(a: number[][]): number[][] {
  const n = a.length;
  const l = a.map(() => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = a[i]![j]!;
      for (let k = 0; k < j; k++) s -= l[i]![k]! * l[j]![k]!;
      if (i === j) {
        if (s <= 0) throw new Error('cholesky: matrix is not positive definite');
        l[i]![i] = Math.sqrt(s);
      } else {
        l[i]![j] = s / l[j]![j]!;
      }
    }
  }
  return l;
}

/** Solve A x = b given the Cholesky factor L of A. */
export function choleskySolve(l: number[][], b: number[]): number[] {
  const n = l.length;
  const y = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = b[i]!;
    for (let k = 0; k < i; k++) s -= l[i]![k]! * y[k]!;
    y[i] = s / l[i]![i]!;
  }
  const x = new Array<number>(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = y[i]!;
    for (let k = i + 1; k < n; k++) s -= l[k]![i]! * x[k]!;
    x[i] = s / l[i]![i]!;
  }
  return x;
}

/** Sample mean and covariance (n − 1 denominator) of row vectors. */
export function meanCov(rows: number[][]): { mean: number[]; cov: number[][] } {
  const m = rows.length;
  const n = rows[0]?.length ?? 0;
  const mean = new Array<number>(n).fill(0);
  for (const r of rows) for (let i = 0; i < n; i++) mean[i]! += r[i]! / m;
  const cov = mean.map(() => new Array<number>(n).fill(0));
  for (const r of rows)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        cov[i]![j]! += ((r[i]! - mean[i]!) * (r[j]! - mean[j]!)) / (m - 1);
  return { mean, cov };
}
