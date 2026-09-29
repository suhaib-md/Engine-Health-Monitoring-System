import { describe, expect, it } from 'vitest';
import { PROFILE } from '../engine/profile';
import {
  ALL_FIRING,
  angleWindow,
  cylinderFromPhase,
  governorCommand_Nm,
  halfOrderAmplitude_rpm,
  healthyRipplePP_rpm,
  healthyVibRms_ms2,
  misfirePhase_deg,
  missingFractionFromHalfOrder,
  secondaryForcePeak_N,
  simulateCrank,
  synthesizeVibration,
  type CombustionHealth,
} from '../physics';
import { fft, orderAmp, orderPhase_deg, orderSpectrum, resamplePeriodic } from '../analytics/fft';
import { expectClose } from './expectClose';

/** The review reports ripple in whole rpm: allow the 2 % tolerance or half a unit, whichever is larger. */
const nearWhole = (actual: number, expected: number) =>
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(0.02 * expected, 0.5));

// Phase 7 goldens: review "Vibration from real sources" and "Misfire detection that names the
// cylinder" (3,000 rpm, 80 N·m brake load). The review's 110 N·m is a rounded Python value; our
// friction + accessory model gives 111.5 N·m for the same point (CLAUDE.md energy table: 9.9 kW
// friction + accessories = 31.5 N·m, plus 80), which is what the app uses.

const RPM = 3000;
const REVIEW_RESIST = 110;
const rpmOf = (w: number) => (w * 30) / Math.PI;

function analyse(resist: number, health: CombustionHealth) {
  const run = simulateCrank({ rpm: RPM, resist_Nm: resist, health });
  const one = Float64Array.from(run.omega, rpmOf); // one 720° cycle at the 0.5° model step
  const pp = Math.max(...one) - Math.min(...one);
  const spec = orderSpectrum(angleWindow(one), PROFILE.crank.windowRevs);
  return {
    run,
    pp,
    amp: orderAmp(spec, 0.5),
    phase: orderPhase_deg(spec, 0.5),
    cmd: run.torqueCmd_Nm,
    spec,
  };
}
const withH = (i: number, h: number) =>
  [1, 2, 3, 4].map((c) => (c === i ? h : 1)) as unknown as CombustionHealth;

describe('secondary force F₂ = 4 m r ω² λ (review table)', () => {
  it.each([
    [800, 179],
    [3000, 2517],
    [6000, 10068],
  ])('%i rpm → %i N', (rpm, F) => {
    expectClose(secondaryForcePeak_N(rpm), F, 0.02, `F2 at ${rpm}`);
  });
});

describe('FFT', () => {
  it('matches a naive DFT', () => {
    const n = 64;
    const re = Float64Array.from(
      { length: n },
      (_, i) => Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1),
    );
    const im = new Float64Array(n);
    const ref: [number, number][] = [];
    for (let k = 0; k < n; k++) {
      let a = 0;
      let b = 0;
      for (let i = 0; i < n; i++) {
        a += re[i]! * Math.cos((2 * Math.PI * k * i) / n);
        b -= re[i]! * Math.sin((2 * Math.PI * k * i) / n);
      }
      ref.push([a, b]);
    }
    fft(re, im);
    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(ref[k]![0], 9);
      expect(im[k]).toBeCloseTo(ref[k]![1], 9);
    }
  });

  it('reads amplitude and phase of a sinusoid at an order, in the crank-angle domain', () => {
    const revs = 16;
    const n = 720 * revs; // 0.5° samples, like the telemetry window
    const x = Float64Array.from(
      { length: n },
      (_, i) => 3 * Math.cos((2 * Math.PI * 2 * i) / 720 + (30 * Math.PI) / 180) + 1,
    );
    const s = orderSpectrum(x, revs);
    expect(orderAmp(s, 2)).toBeCloseTo(3, 2);
    expect(orderPhase_deg(s, 2)).toBeCloseTo(30, 0);
    expect(s.amp[0]).toBeCloseTo(1, 2);
    expect(orderAmp(s, 0.5)).toBeLessThan(0.01);
  });

  it('resampling keeps whole-revolution sinusoids intact', () => {
    const n = 11520;
    const x = Float64Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 32 * i) / n));
    const y = resamplePeriodic(x, 8192);
    expect(Math.max(...y)).toBeGreaterThan(0.9999);
  });
});

describe('crank-angle model, healthy engine at 3,000 rpm / 80 N·m (review row "Healthy")', () => {
  const h = analyse(REVIEW_RESIST, ALL_FIRING);
  it('speed ripple is 11 rpm peak to peak (review value is a whole rpm)', () => {
    nearWhole(h.pp, 11);
  });
  it('has no 0.5× component', () => {
    expect(h.amp).toBeLessThan(0.05);
  });
  it('torque command is the resisting torque (110 N·m)', () => {
    expectClose(h.cmd, 110, 0.02, 'torque command');
  });
  it('the closed-form ripple agrees with the integration', () => {
    expectClose(healthyRipplePP_rpm(RPM, REVIEW_RESIST), h.pp, 0.02, 'analytic ripple');
  });
});

describe('single-cylinder misfire at 3,000 rpm / 80 N·m (review table)', () => {
  for (const [cyl, phase] of [
    [1, 45],
    [2, 135],
    [3, -45],
    [4, -135],
  ] as const) {
    describe(`cylinder ${cyl}`, () => {
      const m = analyse(REVIEW_RESIST, withH(cyl, 0));
      it('ripple 61 rpm peak to peak', () => {
        nearWhole(m.pp, 61);
      });
      it('0.5× amplitude 21.0 rpm', () => {
        expectClose(m.amp, 21.0, 0.02, `0.5× amplitude, cyl ${cyl}`);
      });
      it(`0.5× phase ${phase > 0 ? '+' : '−'}${Math.abs(phase)}°`, () => {
        expect(Math.abs(m.phase - phase)).toBeLessThan(1);
        expect(misfirePhase_deg(cyl)).toBe(phase);
      });
      it('lands in the correct 90° sector', () => {
        expect(cylinderFromPhase(m.phase)).toBe(cyl);
      });
      it('governor command 146 N·m, exactly 4/3 of healthy', () => {
        expectClose(m.cmd, 146, 0.02, 'torque command');
        expect(m.cmd / REVIEW_RESIST).toBeCloseTo(4 / 3, 2);
        expect(governorCommand_Nm(REVIEW_RESIST, withH(cyl, 0)) / REVIEW_RESIST).toBeCloseTo(
          4 / 3,
          10,
        );
      });
    });
  }

  it('closed-form half-order amplitude and its inverse', () => {
    expectClose(halfOrderAmplitude_rpm(RPM, REVIEW_RESIST, 1), 21.0, 0.02, 'analytic 0.5×');
    expect(missingFractionFromHalfOrder(RPM, REVIEW_RESIST, 21.0)).toBeCloseTo(1, 1);
    expect(missingFractionFromHalfOrder(RPM, REVIEW_RESIST, 0)).toBe(0);
  });
});

describe('cylinder 3 at 50 % (review row)', () => {
  const m = analyse(REVIEW_RESIST, withH(3, 0.5));
  it('ripple 32 rpm, 0.5× amplitude 9.0 rpm, phase −45°, command 125 N·m', () => {
    nearWhole(m.pp, 32);
    expectClose(m.amp, 9.0, 0.02, '0.5× amplitude');
    expect(Math.abs(m.phase + 45)).toBeLessThan(1);
    expectClose(m.cmd, 125, 0.02, 'command');
  });
  it('severity follows amplitude: the estimated missing fraction is 0.5', () => {
    expect(missingFractionFromHalfOrder(RPM, REVIEW_RESIST, m.amp)).toBeCloseTo(0.5, 1);
  });
});

describe('vibration synthesis', () => {
  it('healthy RMS agrees with the closed form used by the Twin', () => {
    for (const [rpm, resist] of [
      [800, 24],
      [3000, 111.5],
      [6000, 200],
    ] as const) {
      const run = simulateCrank({ rpm, resist_Nm: resist, health: ALL_FIRING });
      const v = angleWindow(synthesizeVibration(run, resist));
      const mean = v.reduce((a, x) => a + x, 0) / v.length;
      const rms = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / v.length);
      // the closed form includes the sensor noise floor, which the noise-free synthesis lacks
      const noise = PROFILE.sensors.vibMs2.sigma;
      const expected = Math.sqrt(healthyVibRms_ms2(rpm, resist) ** 2 - noise ** 2);
      expectClose(rms, expected, 0.02, `RMS at ${rpm} rpm`);
    }
  });

  it('shows the 2× line always, and 0.5× only when a cylinder misfires', () => {
    const resist = 111.5;
    const line = (health: CombustionHealth) => {
      const run = simulateCrank({ rpm: RPM, resist_Nm: resist, health });
      return orderSpectrum(angleWindow(synthesizeVibration(run, resist)), PROFILE.crank.windowRevs);
    };
    const healthy = line(ALL_FIRING);
    const bad = line(withH(3, 0));
    expect(orderAmp(healthy, 2)).toBeGreaterThan(1);
    expect(orderAmp(healthy, 0.5)).toBeLessThan(1e-6);
    expect(orderAmp(bad, 0.5)).toBeGreaterThan(0.2);
    expect(orderAmp(bad, 0.5)).toBeLessThan(orderAmp(bad, 2));
  });
});
