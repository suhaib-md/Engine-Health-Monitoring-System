import { fft } from '../../analytics/fft';

/**
 * Phone / laptop accelerometer (Phase 13; review "Hardware roadmap"): the device's own motion
 * sensor through the SAME radix-2 FFT the engine analytics use. DeviceMotion arrives at an uneven
 * rate (≈ 60 Hz on phones), so the samples are resampled onto an even grid first. At 60 Hz the
 * Nyquist limit is 30 Hz: enough for idle-speed orders (800 rpm → 1× 13 Hz, 2× 27 Hz), not for a
 * running engine's 2× line at 3,000 rpm (100 Hz). This is a demonstration of the pipeline (Q-60).
 */

export interface MotionSample {
  /** seconds */
  t: number;
  /** m/s², gravity removed by subtracting the window mean */
  a: number;
}

export interface DeviceSpectrum {
  /** sample rate after resampling, Hz */
  fs: number;
  /** frequency of each bin, Hz */
  freqs: number[];
  /** amplitude of each bin, m/s² */
  amps: number[];
  peakHz: number;
  peakAmp: number;
  rms: number;
}

/** Spectrum of the last `n` evenly resampled points (n a power of two). */
export function deviceSpectrum(samples: MotionSample[], n = 256): DeviceSpectrum | null {
  if (samples.length < 16) return null;
  const t0 = samples[0]!.t;
  const t1 = samples[samples.length - 1]!.t;
  const span = t1 - t0;
  if (span <= 0) return null;
  const fs = (n - 1) / span;
  const mean = samples.reduce((s, x) => s + x.a, 0) / samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  let j = 0;
  let sq = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fs;
    while (j < samples.length - 2 && samples[j + 1]!.t < t) j++;
    const a = samples[j]!;
    const b = samples[j + 1]!;
    const f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    const v = a.a + Math.min(1, Math.max(0, f)) * (b.a - a.a) - mean;
    // Hann window keeps a tone between bins from smearing across the spectrum
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    re[i] = v * w;
    sq += v * v;
  }
  fft(re, im);
  const freqs: number[] = [];
  const amps: number[] = [];
  let peakHz = 0;
  let peakAmp = 0;
  for (let k = 1; k < n / 2; k++) {
    const amp = (4 / n) * Math.hypot(re[k]!, im[k]!); // ×2 one-sided, ×2 Hann gain
    freqs.push((k * fs) / n);
    amps.push(amp);
    if (amp > peakAmp) {
      peakAmp = amp;
      peakHz = (k * fs) / n;
    }
  }
  return { fs, freqs, amps, peakHz, peakAmp, rms: Math.sqrt(sq / n) };
}

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * Start listening. Returns a stop function. iOS asks for permission (from a click); every browser
 * needs a secure context (https, or http://localhost on the same device).
 */
export async function startMotion(onSample: (s: MotionSample) => void): Promise<() => void> {
  if (typeof DeviceMotionEvent === 'undefined')
    throw new Error('This device has no motion sensor API.');
  if (!window.isSecureContext)
    throw new Error('Motion sensors need a secure page (https, or localhost on this device).');
  const req = (DeviceMotionEvent as unknown as MotionPermission).requestPermission;
  if (req && (await req()) !== 'granted') throw new Error('Motion permission was denied.');
  const onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null || g.z == null) return;
    onSample({ t: e.timeStamp / 1000, a: Math.hypot(g.x, g.y, g.z) });
  };
  window.addEventListener('devicemotion', onMotion);
  return () => window.removeEventListener('devicemotion', onMotion);
}
