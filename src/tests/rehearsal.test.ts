import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import { scenarioById } from '../worker/scenarios';

// at(n) is the moment step n of the script fires (its caption appears).
// Phase 11 exit check: "two clean full demo runs back to back". The demo tour (review "Demo script"
// steps 2–6) is played twice in a row in the same worker loop; every scripted moment must show what
// the presenter says it shows, and both runs must be identical.

interface Moment {
  step: number;
  t: number;
  fault: string | null;
  level: string;
  pressure: number | null;
  cusumPressure: boolean;
  rulSignificant: boolean;
  cylinder: number | null;
  cmdRatio: number | null;
  sensorState: string;
}

function play(loop: SimLoop) {
  loop.handle({ type: 'runScenario', id: 'tour' });
  const moments: Moment[] = [];
  let firstCusum = -1;
  let firstRuleWarning = -1;
  let lastStep = 0;
  let rulDuringPrognosis = false;
  while (!loop.snapshot().scenario?.done && loop.telemetry.t < 7200) {
    loop.advanceSim(0.5);
    const s = loop.snapshot();
    const a = s.analytics;
    const step = s.scenario?.step ?? 0;
    if (a && step === 4 && firstCusum < 0 && a.stats.cusumAlarm.includes('oilPressBar'))
      firstCusum = s.telemetry.t;
    if (a && step >= 4 && step <= 5 && firstRuleWarning < 0 && a.levels.lubrication === 'WARNING')
      firstRuleWarning = s.telemetry.t;
    if (a && step === 5 && a.rul.find((r) => r.subsystem === 'lubrication')?.significant)
      rulDuringPrognosis = true;
    if (step !== lastStep || s.scenario?.done) {
      lastStep = step;
      moments.push({
        step,
        t: +s.telemetry.t.toFixed(2),
        fault: a?.explanation?.fault ?? null,
        level: a?.overallLevel ?? 'NORMAL',
        pressure: s.telemetry.oilPressBar,
        cusumPressure: !!a?.stats.cusumAlarm.includes('oilPressBar'),
        rulSignificant: !!a?.rul.find((r) => r.subsystem === 'lubrication')?.significant,
        cylinder: a?.spectral?.misfire.cylinder ?? null,
        cmdRatio:
          s.telemetry.torqueCmdNm != null && s.expected.torqueCmdNm > 0
            ? s.telemetry.torqueCmdNm / s.expected.torqueCmdNm
            : null,
        sensorState: a?.sanity.channels.coolantC.state ?? 'ok',
      });
    }
  }
  return {
    moments,
    firstCusum,
    firstRuleWarning,
    rulDuringPrognosis,
    done: !!loop.snapshot().scenario?.done,
  };
}

describe('demo tour, twice back to back', () => {
  const loop = new SimLoop();
  const run1 = play(loop);
  const run2 = play(loop);

  for (const [name, run] of [
    ['run 1', run1],
    ['run 2', run2],
  ] as const) {
    describe(name, () => {
      const at = (step: number) => run.moments.find((m) => m.step === step)!;
      it('reaches the end of the script', () => {
        expect(run.done).toBe(true);
        expect(run.moments.at(-1)!.step).toBe(scenarioById('tour').steps.length);
      });
      it('1 · cold start reads about 2.5 bar and is healthy', () => {
        expect(at(2).pressure!).toBeGreaterThan(2.3);
        expect(at(2).level).toBe('NORMAL');
      });
      it('3 · warm and steady with no alert', () => {
        expect(at(4).level).toBe('NORMAL');
      });
      it('4 · CUSUM flags the pump before the rules reach WARNING', () => {
        expect(run.firstCusum).toBeGreaterThan(0);
        expect(run.firstCusum).toBeLessThan(run.firstRuleWarning);
      });
      it('5 · lubrication named, with a significant RUL', () => {
        expect(at(5).fault).toBe('Lubrication-system degradation');
        expect(run.rulDuringPrognosis).toBe(true);
      });
      it('7 · cylinder 3 named, governor at 4/3', () => {
        expect(at(7).fault).toBe('Cylinder 3 misfire');
        expect(at(7).cylinder).toBe(3);
        expect(at(7).cmdRatio!).toBeCloseTo(4 / 3, 1);
      });
      it('9 · the coolant spike is a sensor fault', () => {
        const end = run.moments.at(-1)!;
        expect(end.fault).toBe('Coolant sensor fault');
        expect(end.sensorState).toBe('implausible');
      });
    });
  }

  it('both runs are identical (rule 6)', () => {
    expect(run2.moments).toEqual(run1.moments);
    expect(run2.firstCusum).toBe(run1.firstCusum);
  });
});
