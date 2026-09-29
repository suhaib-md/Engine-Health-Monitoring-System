import { describe, expect, it } from 'vitest';
import { PROFILE } from '../engine/profile';
import { createRng } from '../lib/rng';
import { CrankSensors } from '../plant/crank';
import { ALL_FIRING } from '../physics';
import { analyseWindows } from '../analytics';
import type { PlantFaultId } from '../plant';
import { SimLoop } from '../worker/simLoop';
import { expectClose } from './expectClose';

// Phase 7 exit checks through the whole chain: Plant (hidden fault) → sensors → Twin → analytics.

function warm(rpm = 3000, torque = 80) {
  const loop = new SimLoop(11);
  loop.handle({ type: 'set', settings: { targetRpm: rpm, torque_Nm: torque } });
  loop.handle({ type: 'start' });
  loop.advanceSim(240); // warm up (3,000 rpm / 80 N·m reaches operating temperature in ~200 s)
  return loop;
}

const inject = (loop: SimLoop, fault: PlantFaultId, severity = 1) =>
  loop.handle({ type: 'injectFault', fault, severity, onset: 'instant' });

describe('healthy engine: no misfire evidence anywhere on the map', () => {
  it.each([
    [800, 0],
    [3000, 80],
    [6000, 999],
  ])('%i rpm / %i N·m', (rpm, torque) => {
    const loop = warm(rpm, torque);
    loop.advanceSim(30);
    let worst = 0;
    for (let i = 0; i < 20; i++) {
      loop.advanceSim(1);
      const a = loop.snapshot().analytics!;
      worst = Math.max(worst, a.evidence.find((e) => e.id === 'combustion')!.score);
      expect(a.levels.combustion).toBe('NORMAL');
    }
    expect(worst).toBeLessThan(0.1);
    const s = loop.snapshot().analytics!.spectral!;
    expect(s.misfire.missing).toBeLessThan(0.02);
    expect(s.ratios.ripple).toBeGreaterThan(0.9);
    expect(s.ratios.ripple).toBeLessThan(1.15);
    expect(s.ratios.rms).toBeGreaterThan(0.95);
    expect(s.ratios.rms).toBeLessThan(1.05);
  });
});

describe('cylinder 1–4 misfire at 3,000 rpm / 80 N·m: the polar dot lands in the right sector', () => {
  for (const cyl of [1, 2, 3, 4] as const) {
    it(`cylinder ${cyl}`, () => {
      const loop = warm();
      inject(loop, `misfire${cyl}` as PlantFaultId);
      loop.advanceSim(90);
      const a = loop.snapshot().analytics!;
      expect(a.spectral!.misfire.cylinder).toBe(cyl);
      expect(a.spectral!.misfire.missing).toBeGreaterThan(0.85);
      // the phase sits within ±10° of the review's +45 / +135 / −45 / −135°
      const target = { 1: 45, 2: 135, 3: -45, 4: -135 }[cyl];
      expect(Math.abs(a.spectral!.speed.halfPhase_deg - target)).toBeLessThan(10);
      // named, escalated and explained
      expect(a.evidence[0]!.id).toBe('combustion');
      expect(['WARNING', 'CRITICAL']).toContain(a.levels.combustion);
      expect(a.explanation?.fault).toBe(`Cylinder ${cyl} misfire`);
      expect(a.explanation!.why.some((w) => w.text.includes(`cylinder ${cyl} sector`))).toBe(true);
      // no cross-talk into the slow subsystems
      for (const e of a.evidence) if (e.id !== 'combustion') expect(e.score).toBeLessThan(0.3);
    });
  }
});

describe('governor command and severity', () => {
  it('one cylinder out: the torque command rises by 4/3 (3,000 rpm / 80 N·m)', () => {
    const healthy = warm();
    const cmd0 = healthy.telemetry.torqueCmdNm!;
    const bad = warm();
    inject(bad, 'misfire3');
    bad.advanceSim(5);
    expect(bad.telemetry.torqueCmdNm! / cmd0).toBeCloseTo(4 / 3, 2);
    // review: 110 → 146 N·m; our model resists 111.5 N·m at this point, so 148.7 N·m
    expectClose(cmd0, 110, 0.02, 'healthy command');
    expectClose(bad.telemetry.torqueCmdNm!, 146, 0.02, 'misfire command');
  });

  it('cylinder 3 at 50 % is the same sector at a smaller amplitude, and severity is measurable', () => {
    const loop = warm();
    inject(loop, 'misfire3', 0.5);
    loop.advanceSim(60);
    const s = loop.snapshot().analytics!.spectral!;
    expect(s.misfire.cylinder).toBe(3);
    expect(Math.abs(s.speed.halfPhase_deg + 45)).toBeLessThan(10);
    expect(s.misfire.missing).toBeGreaterThan(0.4);
    expect(s.misfire.missing).toBeLessThan(0.6);
    expectClose(s.speed.halfAmp_rpm, 9.0, 0.06, '0.5× amplitude at 50 %');
  });

  it('a gradual misfire warns before it becomes severe', () => {
    const loop = warm();
    loop.handle({ type: 'injectFault', fault: 'misfire2', severity: 1, onset: 'gradual' });
    let firstWatch = -1;
    let firstWarn = -1;
    for (let t = 1; t <= 240; t++) {
      loop.advanceSim(1);
      const l = loop.snapshot().analytics!.levels.combustion;
      if (firstWatch < 0 && l !== 'NORMAL') firstWatch = t;
      if (firstWarn < 0 && (l === 'WARNING' || l === 'CRITICAL')) firstWarn = t;
    }
    expect(firstWatch).toBeGreaterThan(0);
    expect(firstWarn).toBeGreaterThanOrEqual(firstWatch);
    expect(firstWarn).toBeLessThan(200);
  });

  it('is named at idle (800 rpm) and near redline (6,000 rpm)', () => {
    for (const [rpm, torque] of [
      [800, 0],
      [6000, 999],
    ] as const) {
      const loop = warm(rpm, torque);
      inject(loop, 'misfire4');
      loop.advanceSim(90);
      const s = loop.snapshot().analytics!;
      expect(s.spectral!.misfire.cylinder).toBe(4);
      expect(s.explanation?.fault).toBe('Cylinder 4 misfire');
    }
  });

  it('repairing clears the alert after the hysteresis hold', () => {
    const loop = warm();
    inject(loop, 'misfire1');
    loop.advanceSim(60);
    expect(loop.snapshot().analytics!.levels.combustion).not.toBe('NORMAL');
    loop.handle({ type: 'clearFaults' });
    loop.advanceSim(120);
    expect(loop.snapshot().analytics!.levels.combustion).toBe('NORMAL');
  });
});

describe('vibration gauge and F₂', () => {
  it('healthy vibration RMS follows the second-order force: it grows with speed²', () => {
    const rms = (rpm: number, tq: number) => {
      const loop = warm(rpm, tq);
      loop.advanceSim(3);
      return loop.snapshot().analytics!.spectral!.vib.rms;
    };
    const r3 = rms(3000, 80);
    const r6 = rms(6000, 999);
    expect(r6).toBeGreaterThan(2 * r3);
    // the 2× line dominates a healthy inline-4 spectrum
    const loop = warm();
    loop.advanceSim(3);
    const v = loop.snapshot().analytics!.spectral!.vib;
    expect(v.secondAmp).toBeGreaterThan(5 * v.firstAmp);
    expect(v.halfAmp).toBeLessThan(0.05);
  });
});

describe('real-time budget (Phase 7 exit check: real-time at 6,000 rpm)', () => {
  it('a window costs far less than the 1 s of simulated time it covers', () => {
    const sensors = new CrankSensors(createRng(3));
    const exp = {
      t: 0,
      coolantC: 90,
      oilC: 90,
      oilPressBar: 3,
      busV: 14,
      fanOn: false,
      resistNm: 200,
      torqueCmdNm: 200,
      vibRmsMs2: 5,
      ripplePPRpm: 7,
    };
    const input = { rpm: 6000, resist_Nm: 200, health: ALL_FIRING };
    sensors.window(input); // warm the JIT and the noise pool
    const n = 100;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      const w = sensors.window(input);
      analyseWindows(w.speed, w.vib, exp, i, i);
    }
    const perWindow_ms = (performance.now() - t0) / n;
    // 60× time-warp needs 60 windows per wall second: demand < 1/60 of a second, 10× margin
    expect(perWindow_ms).toBeLessThan(1000 / 60 / 10);
    expect(PROFILE.crank.windowEvery_s).toBe(1);
  });
});
