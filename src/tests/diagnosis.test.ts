import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import { levelRank } from '../analytics';

// Phase 3 exit checks: faults injected into the Plant are named by analytics that see only
// telemetry + the Twin; a healthy engine raises nothing.

function warm(seed: number, rpm: number, torque: number) {
  const loop = new SimLoop(seed);
  loop.handle({ type: 'set', settings: { targetRpm: rpm, torque_Nm: torque } });
  loop.handle({ type: 'start' });
  loop.advanceSim(40 * 60);
  return loop;
}
const a = (l: SimLoop) => l.analyticsState!;
const top = (l: SimLoop) => a(l).evidence[0]!;

describe('healthy engine', () => {
  it('20 simulated minutes with 8 operating-point changes raise no alert', () => {
    const loop = warm(3, 3000, 80);
    let maxScore = 0;
    const points: [number, number][] = [
      [800, 0],
      [3000, 80],
      [4000, 190],
      [6000, 999],
      [2000, 40],
      [5000, 150],
      [800, 0],
      [3000, 80],
    ];
    for (const [rpm, torque] of points) {
      loop.handle({ type: 'set', settings: { targetRpm: rpm, torque_Nm: torque } });
      for (let i = 0; i < 1500; i++) {
        loop.advanceSim(0.1);
        maxScore = Math.max(maxScore, top(loop).score);
        expect(a(loop).overallLevel).toBe('NORMAL');
      }
    }
    expect(maxScore).toBeLessThan(0.1);
    expect(a(loop).overallHealth).toBeGreaterThan(97);
    expect(a(loop).alerts.every((x) => x.cls === 'INFO')).toBe(true);
    expect(a(loop).explanation).toBeNull();
  });

  it('cold start and warm-up never alert', () => {
    const loop = new SimLoop(9);
    loop.handle({ type: 'start' });
    for (let i = 0; i < 25 * 60 * 10; i++) {
      loop.advanceSim(0.1);
      expect(a(loop).overallLevel).toBe('NORMAL');
    }
  });
});

describe('oil-pump fault (exit check: pump health 0.4 at hot idle → lubrication)', () => {
  it('is named lubrication, escalates to at least WARNING, with an explanation', () => {
    const loop = warm(4, 800, 0);
    loop.handle({ type: 'injectFault', fault: 'oilPump', severity: 0.8, onset: 'instant' }); // H_pump 0.4
    loop.advanceSim(60);
    expect(top(loop).id).toBe('lubrication');
    expect(top(loop).score).toBeGreaterThan(0.55);
    expect(levelRank(a(loop).levels.lubrication)).toBeGreaterThanOrEqual(levelRank('WARNING'));
    expect(a(loop).levels.cooling).toBe('NORMAL');
    const e = a(loop).explanation!;
    expect(e.fault).toBe('Lubrication-system degradation');
    expect(e.why[0]!.text).toMatch(/Oil pressure is \d+% below twin expectation/);
    expect(a(loop).alerts.some((x) => x.subsystem === 'Lubrication')).toBe(true);
  });
});

describe('cooling fault (exit check: cooling health 0.5 at full load → cooling)', () => {
  it('is named cooling, reaches CRITICAL, and does not implicate lubrication', () => {
    const loop = warm(5, 6000, 999);
    loop.handle({ type: 'injectFault', fault: 'cooling', severity: 0.625, onset: 'instant' }); // H_cool 0.5
    let maxLube = 0;
    for (let i = 0; i < 6000; i++) {
      loop.advanceSim(0.1);
      maxLube = Math.max(maxLube, a(loop).evidence.find((e) => e.id === 'lubrication')!.score);
    }
    expect(top(loop).id).toBe('cooling');
    expect(a(loop).levels.cooling).toBe('CRITICAL');
    // Hot, thin oil lowers pressure; the context-corrected residual (Q-32) must not blame the pump.
    expect(maxLube).toBeLessThan(0.3);
    expect(a(loop).levels.lubrication).toBe('NORMAL');
  });

  it('a gradual cooling fault at part load warns within 2 simulated minutes', () => {
    const loop = warm(7, 3000, 80);
    loop.handle({ type: 'injectFault', fault: 'cooling', severity: 0.9375, onset: 'gradual' }); // → H 0.25
    loop.advanceSim(120);
    expect(top(loop).id).toBe('cooling');
    expect(levelRank(a(loop).overallLevel)).toBeGreaterThanOrEqual(levelRank('WARNING'));
  });
});

describe('lifecycle awareness', () => {
  it('a pump fault on a stopped engine raises nothing until it runs', () => {
    const loop = new SimLoop(11);
    loop.handle({ type: 'injectFault', fault: 'oilPump', severity: 0.8, onset: 'instant' });
    loop.advanceSim(120);
    expect(a(loop).overallLevel).toBe('NORMAL');
  });

  it('repairing the engine clears the alert after the hysteresis hold', () => {
    const loop = warm(12, 3000, 80);
    loop.handle({ type: 'injectFault', fault: 'oilPump', severity: 0.8, onset: 'instant' });
    loop.advanceSim(60);
    expect(a(loop).overallLevel).not.toBe('NORMAL');
    loop.handle({ type: 'clearFaults' });
    loop.advanceSim(180);
    // the rule alert clears after its hysteresis hold…
    expect(a(loop).levels.lubrication).toBe('NORMAL');
    // …while the oil, overheated by the poor lubrication, cools back to the Twin (τ ≈ 57 s);
    // until then CUSUM rightly keeps a WATCH on oil temperature
    loop.advanceSim(300);
    expect(a(loop).overallLevel).toBe('NORMAL');
  });
});
