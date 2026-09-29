import { describe, expect, it } from 'vitest';
import { PROFILE } from '../engine/profile';
import { createRng } from '../lib/rng';
import { Plant, type TrueSignals } from './plant';
import { SensorModel } from './sensors';

const DT = PROFILE.sim.slowDt_s;
const run = (plant: Plant, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) plant.step(DT);
};

describe('plant lifecycle (draft §31–32)', () => {
  it('starts OFF, cold, at ambient', () => {
    const p = new Plant();
    const t = p.truth();
    expect(p.state.lifecycle).toBe('OFF');
    expect(t.rpm).toBe(0);
    expect(t.coolantC).toBe(30);
    expect(t.oilPressBar).toBe(0);
    expect(t.busV).toBe(PROFILE.electrical.batteryV);
  });

  it('cranks at 250 rpm with the starter sag, then fires into WARMUP', () => {
    const p = new Plant();
    p.start();
    run(p, 0.5);
    expect(p.state.lifecycle).toBe('STARTING');
    expect(p.truth().rpm).toBe(PROFILE.lifecycle.crankingRpm);
    expect(p.truth().busV).toBe(PROFILE.electrical.crankingV);
    run(p, 0.6);
    expect(p.state.lifecycle).toBe('WARMUP');
  });

  it('reaches the target speed within a few seconds and flags the transient', () => {
    const p = new Plant();
    p.controls.targetRpm = 3000;
    p.start();
    run(p, 1.5);
    expect(p.transient).toBe(true);
    run(p, 5);
    expect(Math.abs(p.state.rpm - 3000)).toBeLessThan(10);
    expect(p.transient).toBe(false);
  });

  it('goes WARMUP → RUNNING once the coolant reaches the thermostat', () => {
    const p = new Plant();
    p.controls.targetRpm = 3000;
    p.controls.torque_Nm = 80;
    p.start();
    run(p, 60);
    expect(p.state.lifecycle).toBe('WARMUP');
    run(p, 15 * 60);
    expect(p.state.thermal.coolant_C).toBeGreaterThan(PROFILE.cooling.thermostatOpen_C);
    expect(p.state.lifecycle).toBe('RUNNING');
  });

  it('shuts down to OFF, oil pressure falls to 0, and the parked engine cools', () => {
    const p = new Plant();
    p.start();
    run(p, 20 * 60);
    const hot = p.state.thermal.coolant_C;
    p.stop();
    expect(p.state.lifecycle).toBe('SHUTDOWN');
    run(p, 3);
    expect(p.state.lifecycle).toBe('OFF');
    expect(p.truth().oilPressBar).toBe(0);
    run(p, 60 * 60);
    expect(p.state.thermal.coolant_C).toBeLessThan(hot - 10);
    expect(p.state.thermal.coolant_C).toBeGreaterThan(30);
  });

  it('honours a forced fan (test bench ON/OFF)', () => {
    const p = new Plant();
    p.controls.fanMode = 'on';
    p.start();
    run(p, 5);
    expect(p.truth().fanOn).toBe(true);
    p.controls.fanMode = 'off';
    run(p, 1);
    expect(p.truth().fanOn).toBe(false);
  });
});

const truth = (over: Partial<TrueSignals> = {}): TrueSignals => ({
  t: 0,
  rpm: 3000,
  load: 0.43,
  ambientC: 30,
  coolantC: 93,
  oilC: 101,
  oilPressBar: 3.2,
  busV: 14.2,
  fanOn: false,
  torqueCmdNm: 111,
  ...over,
});

describe('sensor model (draft §15)', () => {
  it('adds zero-mean Gaussian noise with the profile σ', () => {
    const s = new SensorModel(createRng(1));
    const n = 20_000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const y = s.measure(truth()).coolantC!;
      sum += y - 93;
      sq += (y - 93) ** 2;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sq / n - mean * mean);
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(Math.abs(sd - PROFILE.sensors.coolantC.sigma)).toBeLessThan(0.01);
  });

  it('dropout returns null (never 0 or NaN)', () => {
    const s = new SensorModel(createRng(2));
    s.inject('oilPressBar', { kind: 'dropout', probability: 1 }, 0);
    for (let i = 0; i < 50; i++) expect(s.measure(truth()).oilPressBar).toBeNull();
    s.inject('oilPressBar', { kind: 'dropout', probability: 0.3 }, 0);
    let lost = 0;
    for (let i = 0; i < 5000; i++) if (s.measure(truth()).oilPressBar === null) lost++;
    expect(lost / 5000).toBeGreaterThan(0.27);
    expect(lost / 5000).toBeLessThan(0.33);
  });

  it('stuck freezes the reading while the true value moves', () => {
    const s = new SensorModel(createRng(3));
    s.inject('coolantC', { kind: 'stuck' }, 0);
    const first = s.measure(truth({ coolantC: 90 })).coolantC;
    expect(s.measure(truth({ coolantC: 120 })).coolantC).toBe(first);
  });

  it('bias offsets, drift grows with time, a spike lasts its duration', () => {
    const s = new SensorModel(createRng(4));
    s.inject('busV', { kind: 'bias', amount: -1 }, 0);
    expect(s.measure(truth()).busV!).toBeCloseTo(13.2, 0);

    s.inject('coolantC', { kind: 'drift', ratePerS: 0.1 }, 0);
    expect(s.measure(truth({ t: 100 })).coolantC!).toBeGreaterThan(93 + 9);

    s.inject('coolantC', { kind: 'spike', amount: 25, duration_s: 5 }, 0);
    expect(s.measure(truth({ t: 0 })).coolantC!).toBeGreaterThan(93 + 24);
    expect(s.measure(truth({ t: 4.9 })).coolantC!).toBeGreaterThan(93 + 24);
    expect(s.measure(truth({ t: 5.1 })).coolantC!).toBeLessThan(93 + 1);
  });

  it('a stopped engine reads exactly 0 rpm and 0 load', () => {
    const s = new SensorModel(createRng(5));
    const tel = s.measure(truth({ rpm: 0, load: 0 }));
    expect(tel.rpm).toBe(0);
    expect(tel.load).toBe(0);
  });
});
