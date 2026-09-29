import { PROFILE } from '../engine/profile';
import { cylinderFromPhase, missingFractionFromHalfOrder, secondaryAccel_ms2 } from '../physics';
import type { Telemetry } from '../telemetry';
import type { TwinExpected } from '../twin';
import { ANALYTICS } from './config';
import { orderAmp, orderPhase_deg, orderSpectra2 } from './fft';

/**
 * Crank-angle features (draft §11, §13.2 and the review's "Misfire detection that names the
 * cylinder"). Input: the telemetry windows only (16 revolutions at 512 samples per revolution, sample 0 at
 * cylinder 1's firing TDC), plus the Twin's healthy expectations for normalisation.
 *
 * The 0.5× component of the crank speed repeats once per 720° cycle, so it appears when one
 * cylinder fires weakly. Its amplitude measures how much torque is missing, and its phase names
 * the cylinder: the four cylinders sit 90° apart at half order.
 */

export interface SpectralFeatures {
  /** simulated time the window was completed */
  t: number;
  /** window counter, for consumers that redraw only on new data */
  seq: number;
  meanRpm: number;
  /** I_rpm = σ(N_inst) / N̄ (draft §13.2) */
  irregularity: number;
  /** peak-to-peak crank-speed ripple of the noise-filtered, cycle-averaged waveform, rpm */
  ripplePPRpm: number;
  speed: {
    /** amplitude per order bin (bin k = order k/16), rpm */
    spectrum: Float32Array;
    halfAmp_rpm: number;
    halfPhase_deg: number;
  };
  vib: {
    rms: number;
    peak: number;
    crest: number;
    kurtosis: number;
    spectrum: Float32Array;
    halfAmp: number;
    firstAmp: number;
    secondAmp: number;
  };
  /** measured / the healthy Twin's expectation (torqueCmd is refreshed on every update) */
  ratios: { rms: number; ripple: number; torqueCmd: number; first: number };
  /** the healthy Twin's resisting torque this window was normalised with, N·m */
  resistNm: number;
  misfire: {
    /** the cylinder whose sector holds the 0.5× phase */
    cylinder: 1 | 2 | 3 | 4;
    /** estimated missing fraction of that cylinder's torque, 0..1 (1 = complete misfire) */
    missing: number;
  };
}

/** samples per 720° cycle in the telemetry window */
const CYCLE_SAMPLES = 2 * PROFILE.crank.samplesPerRev;

/** Cycle-averaged waveform (coherent averaging over the window's whole cycles). */
function cycleAverage(w: Float32Array) {
  const cycles = Math.floor(w.length / CYCLE_SAMPLES);
  const out = new Float64Array(CYCLE_SAMPLES);
  for (let c = 0; c < cycles; c++)
    for (let i = 0; i < CYCLE_SAMPLES; i++) out[i]! += w[c * CYCLE_SAMPLES + i]! / cycles;
  return out;
}

/** Peak-to-peak of a periodic waveform after a short moving average (removes residual noise). */
function smoothedPeakToPeak(x: Float64Array, span: number) {
  const n = x.length;
  let lo = Infinity;
  let hi = -Infinity;
  const half = Math.floor(span / 2);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) s += x[(i + k + n) % n]!;
    s /= 2 * half + 1;
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  return hi - lo;
}

/** Statistics of a window: mean, RMS about the mean, peak, kurtosis (draft §11.4–11.6). */
function stats(w: Float32Array) {
  const n = w.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += w[i]!;
  mean /= n;
  let m2 = 0;
  let m4 = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const d = w[i]! - mean;
    const d2 = d * d;
    m2 += d2;
    m4 += d2 * d2;
    if (Math.abs(d) > peak) peak = Math.abs(d);
  }
  m2 /= n;
  m4 /= n;
  return { mean, rms: Math.sqrt(m2), peak, kurtosis: m2 > 0 ? m4 / (m2 * m2) : 0 };
}

export function analyseWindows(
  speed: Float32Array,
  vib: Float32Array,
  exp: TwinExpected,
  t: number,
  seq: number,
): SpectralFeatures {
  const revs = PROFILE.crank.windowRevs;
  const ss = stats(speed);
  const vs = stats(vib);
  const [speedSpec, vibSpec] = orderSpectra2(speed, vib, revs);

  const halfAmp = orderAmp(speedSpec, 0.5);
  const halfPhase = orderPhase_deg(speedSpec, 0.5);
  const ripple = smoothedPeakToPeak(cycleAverage(speed), 5);

  return {
    t,
    seq,
    meanRpm: ss.mean,
    irregularity: ss.mean > 0 ? ss.rms / ss.mean : 0,
    ripplePPRpm: ripple,
    speed: { spectrum: speedSpec.amp, halfAmp_rpm: halfAmp, halfPhase_deg: halfPhase },
    vib: {
      rms: vs.rms,
      peak: vs.peak,
      crest: vs.rms > 0 ? vs.peak / vs.rms : 0,
      kurtosis: vs.kurtosis,
      spectrum: vibSpec.amp,
      halfAmp: orderAmp(vibSpec, 0.5),
      firstAmp: orderAmp(vibSpec, 1),
      secondAmp: orderAmp(vibSpec, 2),
    },
    ratios: {
      rms: exp.vibRmsMs2 > 0 ? vs.rms / exp.vibRmsMs2 : 1,
      ripple: exp.ripplePPRpm > 0 ? ripple / exp.ripplePPRpm : 1,
      torqueCmd: 1,
      // 1× amplitude against the healthy imbalance line (bearing wear loosens the crank)
      first:
        vs.rms > 0
          ? orderAmp(vibSpec, 1) /
            Math.max(1e-6, PROFILE.vibration.imbalance1xFraction * secondaryAccel_ms2(ss.mean))
          : 1,
    },
    resistNm: exp.resistNm,
    misfire: {
      cylinder: cylinderFromPhase(halfPhase),
      missing: missingFractionFromHalfOrder(ss.mean, exp.resistNm, halfAmp),
    },
  };
}

/** Keeps the latest window's features; the engine is not analysed below the running speed. */
export class SpectralAnalyzer {
  private latest: SpectralFeatures | null = null;
  private seq = 0;

  update(tel: Telemetry, exp: TwinExpected): SpectralFeatures | null {
    const running = tel.rpm > ANALYTICS.runningRpmFraction * PROFILE.speed.idle_rpm;
    if (!running) {
      this.latest = null;
      return null;
    }
    if (tel.crankSpeedWindow && tel.vibWindow)
      this.latest = analyseWindows(tel.crankSpeedWindow, tel.vibWindow, exp, tel.t, ++this.seq);
    if (!this.latest) return null;
    // the governor command is a slow scalar: compare it on every update, not only when a window lands
    const cmd = tel.torqueCmdNm;
    const torqueCmd = cmd != null && exp.torqueCmdNm > 0 ? cmd / exp.torqueCmdNm : 1;
    return { ...this.latest, ratios: { ...this.latest.ratios, torqueCmd } };
  }
}
