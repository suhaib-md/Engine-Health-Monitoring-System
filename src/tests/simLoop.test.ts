import { describe, expect, it } from 'vitest';
import { PROFILE } from '../engine/profile';
import { SimLoop } from '../worker/simLoop';
import type { Telemetry } from '../telemetry';

// Phase 2 exit checks: determinism, healthy residuals ≈ sensor noise, time-warp speed.

const S = PROFILE.sensors;

function coldStartTo(loop: SimLoop, targetRpm: number, torque_Nm: number) {
  loop.handle({ type: 'set', settings: { targetRpm, torque_Nm } });
  loop.handle({ type: 'start' });
}

describe('determinism', () => {
  const record = (seed: number) => {
    const loop = new SimLoop(seed);
    coldStartTo(loop, 3000, 80);
    const out: Telemetry[] = [];
    for (let i = 0; i < 600; i++) {
      loop.advanceSim(1);
      out.push({ ...loop.telemetry });
    }
    return out;
  };

  it('the same seed replays identical telemetry', () => {
    expect(record(42)).toEqual(record(42));
  });

  it('a different seed gives different noise', () => {
    expect(record(42)).not.toEqual(record(43));
  });
});

describe('healthy engine: measured ≈ Twin expected, within sensor noise', () => {
  const points = [
    { name: 'hot idle', rpm: 800, torque: 0 },
    { name: '3,000 rpm / 80 N·m', rpm: 3000, torque: 80 },
    { name: '4,000 rpm / 190 N·m (fan cycling)', rpm: 4000, torque: 190 },
    { name: '6,000 rpm full load (fan cycling)', rpm: 6000, torque: 999 },
  ];

  const loop = new SimLoop(7);
  coldStartTo(loop, 3000, 80);
  loop.advanceSim(30 * 60); // warm up

  for (const pt of points) {
    it(pt.name, () => {
      loop.handle({ type: 'set', settings: { targetRpm: pt.rpm, torque_Nm: pt.torque } });
      loop.advanceSim(20 * 60); // settle

      const channels = ['coolantC', 'oilC', 'oilPressBar', 'busV'] as const;
      const res: Record<(typeof channels)[number], number[]> = {
        coolantC: [],
        oilC: [],
        oilPressBar: [],
        busV: [],
      };
      for (let i = 0; i < 60 / PROFILE.sim.slowDt_s; i++) {
        loop.advanceSim(PROFILE.sim.slowDt_s);
        for (const c of channels) res[c].push(loop.telemetry[c]! - loop.expected[c]);
      }
      for (const c of channels) {
        const sigma = S[c].sigma;
        const r = res[c];
        const mean = r.reduce((a, b) => a + b, 0) / r.length;
        const worst = Math.max(...r.map(Math.abs));
        // bias well under one σ; no sample beyond 5σ
        expect(Math.abs(mean), `${c} mean residual`).toBeLessThan(0.5 * sigma);
        expect(worst, `${c} worst residual`).toBeLessThan(5 * sigma);
      }
    });
  }
});

describe('time-warp and pause', () => {
  it('60× warms a cold engine to RUNNING in well under a minute of wall time', () => {
    const loop = new SimLoop(1);
    coldStartTo(loop, 800, 0); // idle warm-up ≈ 25 simulated minutes
    let wall_ms = 0;
    while (loop.snapshot().lifecycle !== 'RUNNING' && wall_ms < 120_000) {
      loop.advanceWall(50);
      wall_ms += 50;
    }
    expect(loop.snapshot().lifecycle).toBe('RUNNING');
    expect(wall_ms / 1000).toBeLessThan(35);
  });

  it('1× advances one simulated second per wall second; pause freezes time', () => {
    const loop = new SimLoop(1);
    loop.handle({ type: 'set', settings: { warp: 1 } });
    const t0 = loop.telemetry.t;
    for (let i = 0; i < 20; i++) loop.advanceWall(50);
    expect(loop.telemetry.t - t0).toBeCloseTo(1, 5);
    loop.handle({ type: 'pause', paused: true });
    loop.advanceWall(1000);
    expect(loop.telemetry.t - t0).toBeCloseTo(1, 5);
  });

  it('one simulated hour runs fast enough for 60× to stay real-time', () => {
    const loop = new SimLoop(1);
    coldStartTo(loop, 3000, 80);
    const t0 = performance.now();
    loop.advanceSim(3600);
    const ms = performance.now() - t0;
    // 60× needs 1 simulated hour per wall minute; demand ≥ 20× headroom on top of that
    // (the loop now includes analytics, and CI workers run tests in parallel).
    expect(ms).toBeLessThan(60_000 / 20);
  });
});
