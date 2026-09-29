import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import { scenarioById } from '../worker/scenarios';
import type { ScenarioId } from '../worker/protocol';

// Phase 6 gate: the hero scenario must play identically every run, whatever the time-warp.

interface Sample {
  t: number;
  rpm: number;
  coolantC: number | null;
  oilC: number | null;
  oilPressBar: number | null;
  busV: number | null;
  health: number | null;
  level: string | undefined;
  fault: string | undefined;
  step: number | undefined;
}

/** Play a scenario to the end. `chunk_s` mimics different time-warps (wall-clock chunking). */
function play(id: ScenarioId, chunk_s: number, horizon_s = 2000) {
  const loop = new SimLoop();
  loop.handle({ type: 'runScenario', id });
  const samples: Sample[] = [];
  while (loop.telemetry.t < horizon_s - 1e-6) {
    loop.advanceSim(chunk_s);
    const snap = loop.snapshot();
    // sample on whole simulated 20 s marks, whatever the chunking
    const t = loop.telemetry.t;
    if (Math.abs(t / 20 - Math.round(t / 20)) < 1e-6) {
      const tl = loop.telemetry;
      samples.push({
        t: +t.toFixed(2),
        rpm: tl.rpm,
        coolantC: tl.coolantC,
        oilC: tl.oilC,
        oilPressBar: tl.oilPressBar,
        busV: tl.busV,
        health: snap.analytics?.overallHealth ?? null,
        level: snap.analytics?.overallLevel,
        fault: snap.analytics?.explanation?.fault,
        step: snap.scenario?.step,
      });
    }
  }
  return {
    loop,
    samples,
    stepAt: loop.scenarioFired_t.map((t) => +t.toFixed(2)),
    alerts: loop.snapshot().analytics?.alerts ?? [],
  };
}

describe('hero scenario', () => {
  const [r1, r10, r60] = [0.05, 0.5, 5].map((c) => play('hero', c)) as [
    ReturnType<typeof play>,
    ReturnType<typeof play>,
    ReturnType<typeof play>,
  ]; // 1×, 10×, 100× chunking
  const runs = [r1, r10, r60];

  it('reaches its last step', () => {
    for (const r of runs) {
      expect(r.loop.snapshot().scenario?.done).toBe(true);
      expect(r.stepAt).toHaveLength(scenarioById('hero').steps.length);
    }
  });

  it('plays identically on three runs, at 1×, 10× and 100× chunking', () => {
    for (const r of [r10, r60]) {
      expect(r.stepAt).toEqual(r1.stepAt);
      expect(r.samples).toEqual(r1.samples);
      expect(r.alerts).toEqual(r1.alerts);
    }
  });

  it('a second scripted play from the same loop is identical too', () => {
    const loop = new SimLoop();
    const grab = () => {
      loop.handle({ type: 'runScenario', id: 'hero' });
      while (!loop.snapshot().scenario?.done) loop.advanceSim(3);
      return loop.snapshot();
    };
    const a = grab();
    const b = grab();
    expect(b.telemetry).toEqual(a.telemetry);
    expect(b.analytics).toEqual(a.analytics);
  });

  it('cold start reads about 2.5 bar and then settles as the oil warms', () => {
    const { samples } = r1;
    const early = samples.find((s) => s.t >= 20);
    if (!early) throw new Error('no early sample');
    expect(early.oilPressBar!).toBeGreaterThan(2.3);
    expect(early.oilPressBar!).toBeLessThan(2.75);
    const warmIdx = samples.findIndex((s) => s.step! >= 3);
    const settled = samples[warmIdx - 1];
    if (!settled) throw new Error('no settled sample');
    expect(settled.oilPressBar!).toBeLessThan(early.oilPressBar! - 0.4);
  });

  it('is warm and healthy before the fault, then names lubrication', () => {
    const { samples } = r1;
    const beforeFault = samples.filter((s) => s.step === 3).at(-1);
    if (!beforeFault) throw new Error('no sample before the fault');
    expect(beforeFault.level).toBe('NORMAL');
    expect(beforeFault.fault).toBeUndefined();
    const last = samples.at(-1);
    if (!last) throw new Error('no samples');
    expect(['WARNING', 'CRITICAL']).toContain(last.level);
    expect(last.fault).toMatch(/lubrication/i);
    // overall health averages six subsystems (draft §22 weights), so one failed subsystem dilutes it
    expect(last.health!).toBeLessThan(90);
  });
});

describe('overheat scenario', () => {
  const r = play('overheat', 3, 2400);
  it('ends with a cooling diagnosis', () => {
    expect(r.loop.snapshot().scenario?.done).toBe(true);
    expect(r.samples.at(-1)?.fault).toMatch(/cooling/i);
  });
});

describe('scenario control', () => {
  it('stopScenario and reset clear the script', () => {
    const loop = new SimLoop();
    loop.handle({ type: 'runScenario', id: 'hero' });
    expect(loop.snapshot().scenario).not.toBeNull();
    loop.handle({ type: 'stopScenario' });
    expect(loop.snapshot().scenario).toBeNull();
    loop.handle({ type: 'runScenario', id: 'hero' });
    loop.handle({ type: 'reset' });
    expect(loop.snapshot().scenario).toBeNull();
  });

  it('applies the scenario controls and bumps settingsRev', () => {
    const loop = new SimLoop();
    const rev = loop.snapshot().settingsRev;
    loop.handle({ type: 'runScenario', id: 'hero' });
    const s = loop.snapshot();
    expect(s.settings.ambient_C).toBe(20);
    expect(s.settings.targetRpm).toBe(800);
    expect(s.settingsRev).toBeGreaterThan(rev);
  });
});

describe('hot-city stop-and-go scenario (Phase 10)', () => {
  const loop = new SimLoop();
  loop.handle({ type: 'runScenario', id: 'hotCity' });
  let faultAt = -1;
  let worstBeforeFault = 'NORMAL';
  let fanCycles = 0;
  let lastFan = false;
  while (!loop.snapshot().scenario?.done && loop.telemetry.t < 6000) {
    loop.advanceSim(1);
    const s = loop.snapshot();
    if (faultAt < 0 && s.faultEvents.length) faultAt = s.telemetry.t;
    if (faultAt < 0 && s.analytics && s.analytics.overallLevel !== 'NORMAL')
      worstBeforeFault = s.analytics.overallLevel;
    const fan = !!s.telemetry.fanOn;
    if (fan && !lastFan) fanCycles++;
    lastFan = fan;
  }
  const end = loop.snapshot();

  it('four healthy cycles in 40 °C heat raise no alert, while the fan works', () => {
    expect(faultAt).toBeGreaterThan(0);
    expect(worstBeforeFault).toBe('NORMAL');
    expect(fanCycles).toBeGreaterThan(0);
  });

  it('ends with the cooling system named and thermal health falling', () => {
    expect(end.scenario?.done).toBe(true);
    expect(end.analytics?.explanation?.fault).toBe('Cooling-system degradation');
    const thermal = end.analytics!.subsystems.find((x) => x.id === 'thermal')!.health!;
    expect(thermal).toBeLessThan(70);
  });
});
