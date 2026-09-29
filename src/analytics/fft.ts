/**
 * Own radix-2 FFT and crank-angle order analysis (CLAUDE.md tech stack: no FFT library).
 *
 * The windows arrive in the crank-angle domain: 16 revolutions sampled every 0.5° (11,520 points),
 * starting at cylinder 1's firing TDC. A radix-2 FFT needs a power-of-two length, so the window is
 * resampled by periodic linear interpolation to 8,192 points (512 per revolution). Bin k of the
 * result is then order k/16 — bin 8 is 0.5×, bin 16 is 1×, bin 32 is 2× — and, because the window
 * holds a whole number of revolutions, lines stay sharp whatever the engine speed (order tracking).
 */

const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array }>();

function twiddle(n: number) {
  let t = twiddles.get(n);
  if (!t) {
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    t = { cos, sin };
    twiddles.set(n, t);
  }
  return t;
}

/** In-place iterative radix-2 FFT: X[k] = Σ x[n] e^{−j2πkn/N}. Length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n & (n - 1)) throw new Error('fft: length must be a power of two');
  // bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      re[i] = re[j]!;
      re[j] = tr;
      const ti = im[i]!;
      im[i] = im[j]!;
      im[j] = ti;
    }
  }
  const { cos, sin } = twiddle(n);
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const stride = n / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * stride]!;
        const wi = sin[k * stride]!;
        const a = i + k;
        const b = a + half;
        const xr = re[b]! * wr - im[b]! * wi;
        const xi = re[b]! * wi + im[b]! * wr;
        re[b] = re[a]! - xr;
        im[b] = im[a]! - xi;
        re[a]! += xr;
        im[a]! += xi;
      }
    }
  }
}

/** Resample a whole-revolution window to `n` points by periodic linear interpolation. */
export function resamplePeriodic(src: ArrayLike<number>, n: number): Float64Array {
  const m = src.length;
  const out = new Float64Array(n);
  const ratio = m / n;
  for (let j = 0; j < n; j++) {
    const pos = j * ratio;
    const i0 = Math.floor(pos);
    const f = pos - i0;
    const a = src[i0 % m]!;
    const b = src[(i0 + 1) % m]!;
    out[j] = a + f * (b - a);
  }
  return out;
}

export const FFT_POINTS = 8192;

export interface OrderSpectrum {
  /** revolutions in the window: bin k is order k / revs */
  revs: number;
  /** amplitude of each bin (same units as the signal, peak amplitude of a sinusoid at that order) */
  amp: Float32Array;
  /** complex amplitude, Σ x e^{−jθ} scaled by 2/N, so a·cos(2π k n/N + φ) reads a·e^{jφ} */
  re: Float64Array;
  im: Float64Array;
}

function spectrumOf(re: Float64Array, im: Float64Array, revs: number, maxOrder: number) {
  const bins = Math.floor(maxOrder * revs) + 1;
  const amp = new Float32Array(bins);
  const outRe = new Float64Array(bins);
  const outIm = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    const scale = k === 0 ? 1 / FFT_POINTS : 2 / FFT_POINTS;
    outRe[k] = re[k]! * scale;
    outIm[k] = im[k]! * scale;
    amp[k] = Math.hypot(outRe[k]!, outIm[k]!);
  }
  return { revs, amp, re: outRe, im: outIm } satisfies OrderSpectrum;
}

const prepared = (w: ArrayLike<number>) =>
  w.length === FFT_POINTS
    ? Float64Array.from(w as ArrayLike<number>)
    : resamplePeriodic(w, FFT_POINTS);

/** Order spectrum of a crank-angle window up to `maxOrder`. */
export function orderSpectrum(
  window: ArrayLike<number>,
  revs: number,
  maxOrder = 8,
): OrderSpectrum {
  const x = prepared(window);
  const im = new Float64Array(FFT_POINTS);
  fft(x, im);
  return spectrumOf(x, im, revs, maxOrder);
}

/**
 * Order spectra of two real windows from ONE complex FFT: z = a + j·b, then
 * A[k] = (Z[k] + conj Z[N−k]) / 2 and B[k] = (Z[k] − conj Z[N−k]) / 2j.
 */
export function orderSpectra2(
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  revs: number,
  maxOrder = 8,
): [OrderSpectrum, OrderSpectrum] {
  const zr = prepared(a);
  const zi = prepared(b);
  fft(zr, zi);
  const n = FFT_POINTS;
  const ar = new Float64Array(n);
  const ai = new Float64Array(n);
  const br = new Float64Array(n);
  const bi = new Float64Array(n);
  const bins = Math.floor(maxOrder * revs) + 1;
  for (let k = 0; k < bins; k++) {
    const m = (n - k) % n;
    ar[k] = (zr[k]! + zr[m]!) / 2;
    ai[k] = (zi[k]! - zi[m]!) / 2;
    br[k] = (zi[k]! + zi[m]!) / 2;
    bi[k] = -(zr[k]! - zr[m]!) / 2;
  }
  return [spectrumOf(ar, ai, revs, maxOrder), spectrumOf(br, bi, revs, maxOrder)];
}

/** Phase of order `o` in degrees (−180, 180], referenced to the window start. */
export function orderPhase_deg(s: OrderSpectrum, o: number) {
  const k = Math.round(o * s.revs);
  return (Math.atan2(s.im[k]!, s.re[k]!) * 180) / Math.PI;
}

export const orderAmp = (s: OrderSpectrum, o: number) => s.amp[Math.round(o * s.revs)] ?? 0;
