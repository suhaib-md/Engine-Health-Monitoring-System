import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import type { Command } from '../worker/protocol';
import { maxCoolantRate_Kps } from '../physics';
import { cholesky, choleskySolve, meanCov } from '../lib/linalg';

// Phase 9 exit checks (CLAUDE.md): D² false-alarm rate, CUSUM before any fixed limit, a sensor
// spike proven with the 0.8 K/s rate limit, RUL significance and band, load shortens RUL, plus
// the new bearing / alternator / sensor faults.

function warm(rpm = 3000, torque = 80, seed = 21) {
  const loop = new SimLoop(seed);
  loop.handle({ type: 'set', settings: { targetRpm: rpm, torque_Nm: torque } });
  loop.handle({ type: 'start' });
  loop.advanceSim(300); // warm up, then the 60 s baseline is learned
  return loop;
}
const a = (l: SimLoop) => l.snapshot().analytics!;
const send = (l: SimLoop, c: Command) => l.handle(c);

describe('linear algebra', () => {
  it('Cholesky solves a small SPD system', () => {
    const A = [
      [4, 2, 0.4],
      [2, 5, 1],
      [0.4, 1, 3],
    ];
    const x = choleskySolve(cholesky(A), [1, 2, 3]);
    const back = A.map((r) => r.reduce((s, v, j) => s + v * x[j]!, 0));
    back.forEach((v, i) => expect(v).toBeCloseTo([1, 2, 3][i]!, 10));
  });
  it('meanCov gives the sample covariance', () => {
    const { mean, cov } = meanCov([
      [1, 2],
      [3, 6],
      [5, 10],
    ]);
    expect(mean).toEqual([3, 6]);
    expect(cov[0]![1]).toBeCloseTo(8, 10);
  });
});

describe('physical rate limit (review: 81.5 kW into 100 kJ/K ≈ 0.8 K/s)', () => {
  it('max coolant heating rate', () => {
    expect(maxCoolantRate_Kps()).toBeGreaterThan(0.79);
    expect(maxCoolantRate_Kps()).toBeLessThan(0.83);
  });
});

describe('healthy engine: the statistical layer stays quiet', () => {
  it('D² crosses its 99 % limit about 1 % of the time and never holds an alarm', () => {
    const loop = warm();
    expect(a(loop).stats.phase).toBe('monitoring');
    let over = 0;
    let n = 0;
    const points = [
      [3000, 80],
      [2500, 55],
      [4000, 120],
      [1500, 30],
      [3000, 80],
    ] as const;
    for (const [rpm, tq] of points) {
      send(loop, { type: 'set', settings: { targetRpm: rpm, torque_Nm: tq } });
      loop.advanceSim(60); // let the transient pass
      for (let i = 0; i < 1800; i++) {
        loop.advanceSim(0.1);
        const s = a(loop);
        if (s.stats.d2 != null) {
          n++;
          if (s.stats.d2 > s.stats.limit) over++;
        }
        expect(s.stats.d2Alarm).toBe(false);
        expect(s.statWatch).toBe(false);
        expect(s.overallLevel).toBe('NORMAL');
      }
    }
    const rate = over / n;
    expect(rate).toBeLessThan(0.03);
  });

  it('RUL says "trend not significant" for every subsystem', () => {
    const loop = warm();
    loop.advanceSim(180);
    const rul = a(loop).rul;
    expect(rul.length).toBeGreaterThan(0);
    for (const r of rul) {
      expect(r.significant).toBe(false);
      expect(r.text).toBe('trend not significant');
    }
  });
});

describe('CUSUM catches the oil pump at 85 % health before any fixed limit', () => {
  it('slow drift alarm on oil pressure while the rules stay NORMAL', () => {
    const loop = warm();
    // S 0.2 → H_pump = 1 − 0.75·0.2 = 0.85
    send(loop, { type: 'injectFault', fault: 'oilPump', severity: 0.2, onset: 'gradual' });
    let cusumAt = -1;
    let ruleAt = -1;
    for (let t = 1; t <= 300; t++) {
      loop.advanceSim(1);
      const s = a(loop);
      if (cusumAt < 0 && s.stats.cusumAlarm.includes('oilPressBar')) cusumAt = t;
      if (ruleAt < 0 && s.levels.lubrication !== 'NORMAL') ruleAt = t;
    }
    expect(cusumAt).toBeGreaterThan(0);
    if (ruleAt > 0) expect(cusumAt).toBeLessThan(ruleAt);
    const s = a(loop);
    expect(s.overallLevel).toBe('WATCH');
    expect(s.explanation?.fault).toMatch(/early warning: oil pressure drifting below/i);
  });
});

describe('sensor faults are proven with physics', () => {
  it('a +25 °C coolant spike is a sensor fault citing the rate limit, not overheating', () => {
    const loop = warm();
    send(loop, { type: 'injectSensorFault', channel: 'coolantC', kind: 'spike' });
    loop.advanceSim(16);
    const s = a(loop);
    expect(s.sanity.channels.coolantC.state).toBe('implausible');
    expect(s.explanation?.fault).toBe('Coolant sensor fault');
    const why = s.explanation!.why.map((w) => w.text).join(' | ');
    expect(why).toMatch(/K\/s/);
    expect(why).toMatch(/at most 0\.8\d K\/s/);
    // the engine is not blamed
    expect(s.levels.cooling).toBe('NORMAL');
    expect(s.evidence.find((e) => e.id === 'cooling')!.score).toBeLessThan(0.3);
    // sensor faults are WARNING-class at most
    expect(['WATCH', 'WARNING']).toContain(s.levels.sensor);
  });

  it('a stuck coolant sensor is caught by its missing noise', () => {
    const loop = warm();
    send(loop, { type: 'injectSensorFault', channel: 'coolantC', kind: 'stuck' });
    loop.advanceSim(25);
    const s = a(loop);
    expect(s.sanity.channels.coolantC.state).toBe('stuck');
    expect(s.explanation?.fault).toBe('Coolant sensor fault');
  });

  it('a dead oil-pressure sensor is a sensor fault, not a pump fault', () => {
    const loop = warm();
    send(loop, { type: 'injectSensorFault', channel: 'oilPressBar', kind: 'dropout' });
    loop.advanceSim(25);
    const s = a(loop);
    expect(s.sanity.channels.oilPressBar.state).toBe('dropout');
    expect(s.explanation?.fault).toBe('Oil-pressure sensor fault');
    expect(s.levels.lubrication).toBe('NORMAL');
  });

  it('a drifting coolant sensor is exposed by the oil cross-check', () => {
    const loop = warm();
    send(loop, { type: 'injectSensorFault', channel: 'coolantC', kind: 'drift' });
    let flagged = -1;
    for (let t = 1; t <= 600 && flagged < 0; t++) {
      loop.advanceSim(1);
      if (a(loop).sanity.channels.coolantC.state === 'drift') flagged = t;
    }
    expect(flagged).toBeGreaterThan(0);
    loop.advanceSim(30);
    expect(a(loop).explanation?.fault).toBe('Coolant sensor fault');
  });

  it('a real cooling fault is never mistaken for a coolant sensor fault', () => {
    const loop = warm();
    send(loop, { type: 'injectFault', fault: 'cooling', severity: 0.9, onset: 'gradual' });
    for (let t = 0; t < 600; t++) {
      loop.advanceSim(1);
      expect(a(loop).sanity.channels.coolantC.state).toBe('ok');
    }
    expect(a(loop).explanation?.fault).toBe('Cooling-system degradation');
  });
});

describe('new engine faults', () => {
  it('bearing wear is named from pressure + 1× vibration + impacts', () => {
    const loop = warm();
    send(loop, { type: 'injectFault', fault: 'bearing', severity: 0.35, onset: 'instant' });
    loop.advanceSim(120);
    expect(a(loop).explanation?.fault).toBe('Bearing wear / increased clearance');
  });

  it('a weak pump is NOT called bearing wear (vibration stays normal)', () => {
    const loop = warm();
    send(loop, { type: 'injectFault', fault: 'oilPump', severity: 0.6, onset: 'instant' });
    loop.advanceSim(120);
    expect(a(loop).explanation?.fault).toBe('Lubrication-system degradation');
  });

  it('an alternator fault is a charging-system fault', () => {
    const loop = warm();
    send(loop, { type: 'injectFault', fault: 'alternator', severity: 0.6, onset: 'gradual' });
    loop.advanceSim(200);
    expect(a(loop).explanation?.fault).toBe('Charging-system fault');
  });

  it('bearing wear follows the draft §18.3 law: it grows, faster under load', () => {
    const wearAfter = (torque: number) => {
      const loop = warm(3000, torque);
      send(loop, { type: 'injectFault', fault: 'bearing', severity: 0.05, onset: 'progressive' });
      loop.advanceSim(300);
      return loop.source.plant.severity('bearing');
    };
    const light = wearAfter(30);
    const heavy = wearAfter(150);
    expect(light).toBeGreaterThan(0.05);
    expect(heavy).toBeGreaterThan(light * 1.5);
  });
});

describe('RUL', () => {
  const rulAfter = (rpm: number, torque: number, seconds: number) => {
    const loop = warm(rpm, torque);
    send(loop, { type: 'injectFault', fault: 'oilPump', severity: 0.3, onset: 'progressive' });
    loop.advanceSim(seconds);
    return a(loop).rul.find((r) => r.subsystem === 'lubrication')!;
  };

  it('a wearing pump gives a significant RUL with a band around it', () => {
    const r = rulAfter(3000, 80, 300);
    expect(r.significant).toBe(true);
    expect(r.rul_s!).toBeGreaterThan(0);
    expect(r.low_s!).toBeLessThan(r.rul_s!);
    expect(r.high_s!).toBeGreaterThan(r.rul_s!);
    expect(r.text).toMatch(/simulated/);
  });

  it('raising the load shortens the RUL (stress-dependent progression, draft §19.3)', () => {
    const light = rulAfter(3000, 40, 300);
    const heavy = rulAfter(3000, 160, 300);
    expect(light.significant && heavy.significant).toBe(true);
    expect(heavy.rul_s!).toBeLessThan(light.rul_s!);
  });
});
