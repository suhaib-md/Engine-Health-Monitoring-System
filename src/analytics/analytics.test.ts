import { describe, expect, it } from 'vitest';
import { expectClose } from '../tests/expectClose';
import { HysteresisMachine } from './alerts';
import { overallHealth } from './health';
import { riskHigh, riskLow } from './risk';

describe('risk functions (draft §21, worked example §43)', () => {
  it('thermal risk 112 °C between 105 and 120 → 0.467', () =>
    expectClose(riskHigh(112, 105, 120), 0.467, 0.005));
  it('low oil-pressure risk 1.8 bar between 2.2 and 1.0 → 0.333', () =>
    expectClose(riskLow(1.8, 2.2, 1.0), 0.333, 0.005));
  it('vibration risk 5.5 between 4 and 8 → 0.375', () =>
    expectClose(riskHigh(5.5, 4, 8), 0.375, 0.001));
  it('clips to 0..1', () => {
    expect(riskHigh(0, 105, 120)).toBe(0);
    expect(riskHigh(200, 105, 120)).toBe(1);
  });
});

describe('overall health (draft §22.1)', () => {
  it('thermal 0.47, lube 0.33, vib 0.38, combustion 0.20 → 69.4', () =>
    expectClose(
      overallHealth({
        thermal: 0.47,
        lubrication: 0.33,
        vibration: 0.38,
        combustion: 0.2,
        electrical: 0,
        sensors: 0,
      }),
      69.4,
      0.002,
    ));
  it('unmonitored subsystems drop out of the weights', () =>
    expectClose(
      overallHealth({
        thermal: 1,
        lubrication: 0,
        vibration: null,
        combustion: null,
        electrical: 0,
        sensors: 0,
      }),
      100 * (1 - 0.25 / 0.65),
      0.001,
    ));
});

describe('hysteresis and persistence (draft §23)', () => {
  const dt = 0.1;
  const run = (m: HysteresisMachine, score: number, seconds: number, armed = true) => {
    for (let i = 0; i < Math.round(seconds / dt); i++) m.update(score, dt, armed);
  };

  it('a single noisy spike never alerts', () => {
    const m = new HysteresisMachine();
    m.update(1, dt, true);
    run(m, 0, 10);
    expect(m.level).toBe('NORMAL');
  });

  it('0.6 sustained: WATCH after 5 s, WARNING after 5 + 10 s, never CRITICAL', () => {
    const m = new HysteresisMachine();
    run(m, 0.6, 4.9);
    expect(m.level).toBe('NORMAL');
    run(m, 0.6, 0.2);
    expect(m.level).toBe('WATCH');
    run(m, 0.6, 10);
    expect(m.level).toBe('WARNING');
    run(m, 0.6, 60);
    expect(m.level).toBe('WARNING');
  });

  it('WARNING clears only below 0.40 for 20 s', () => {
    const m = new HysteresisMachine();
    run(m, 0.9, 30);
    expect(m.level).toBe('CRITICAL');
    run(m, 0.45, 60); // below the CRITICAL clear line (0.70) → steps down to WARNING, then holds
    expect(m.level).toBe('WARNING');
    run(m, 0.35, 19);
    expect(m.level).toBe('WARNING');
    run(m, 0.35, 2);
    expect(m.level).toBe('WATCH');
  });

  it('does not escalate while disarmed (engine stopped or settling)', () => {
    const m = new HysteresisMachine();
    run(m, 1, 60, false);
    expect(m.level).toBe('NORMAL');
  });

  it('a critical override held 2 s jumps straight to CRITICAL', () => {
    const m = new HysteresisMachine();
    for (let i = 0; i < 25; i++) m.update(0.4, dt, true, true);
    expect(m.level).toBe('CRITICAL');
  });
});
