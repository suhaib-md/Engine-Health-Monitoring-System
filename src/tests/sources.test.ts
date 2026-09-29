import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import {
  LiveSource,
  ReplaySource,
  obdToPatch,
  parseJsonLine,
  parseObdResponse,
  parseTelemetryCsv,
  telemetryToCsvRow,
  csvHeader,
} from '../sources';
import type { Telemetry } from '../telemetry';

// Phase 13: every source emits the same Telemetry and the analytics do not change (rule 2).

describe('CSV', () => {
  const tel: Telemetry = {
    t: 12.5,
    rpm: 3001.2,
    load: 0.4213,
    ambientC: 30,
    coolantC: 91.234,
    oilC: null,
    oilPressBar: 3.2101,
    busV: 14.1,
    fanOn: true,
    torqueCmdNm: 111.5,
  };

  it('round-trips a row (a dropout stays null)', () => {
    const [back] = parseTelemetryCsv(`${csvHeader()}\n${telemetryToCsvRow(tel)}\n`);
    expect(back).toEqual(tel);
  });

  it('accepts a minimal file and rejects a broken one', () => {
    const rows = parseTelemetryCsv('t,rpm,coolantC\n0,800,40\n0.5,810,\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]!.coolantC).toBeNull();
    expect(() => parseTelemetryCsv('time,speed\n1,2\n')).toThrow(/Missing the "t" column/);
    expect(() => parseTelemetryCsv('t,rpm\n0,abc\n')).toThrow(/not a number/);
  });

  it('replay steps sample-and-hold on its own clock', () => {
    const r = new ReplaySource(parseTelemetryCsv('t,rpm\n0,800\n1,900\n2,1000\n'), 'x.csv');
    expect(r.step(0.5).rpm).toBe(800);
    expect(r.step(0.5).rpm).toBe(900);
    expect(r.step(5).rpm).toBe(1000);
    expect(r.done).toBe(true);
  });
});

describe('record → replay reproduces the diagnosis (the analytics only ever see telemetry)', () => {
  it('a pump fault recorded from the simulator is diagnosed the same from its CSV', () => {
    const sim = new SimLoop(4);
    sim.handle({ type: 'set', settings: { targetRpm: 3000, torque_Nm: 80 } });
    sim.handle({ type: 'start' });
    sim.advanceSim(240);
    sim.handle({ type: 'injectFault', fault: 'oilPump', severity: 0.6, onset: 'gradual' });
    sim.advanceSim(300);
    const original = sim.snapshot().analytics!;
    const rec = sim.handle({ type: 'exportRecording' });
    expect(rec && rec.type).toBe('recording');
    const csv = rec && rec.type === 'recording' ? rec.csv : '';
    expect(rec && rec.type === 'recording' && rec.rows).toBe(Math.round(540 / 0.05) + 1); // + the t = 0 sample

    const replay = new SimLoop(99); // different seed: nothing comes from the simulator
    expect(replay.handle({ type: 'loadReplay', csv, name: 'run.csv' })).toBeUndefined();
    replay.advanceSim(540);
    const s = replay.snapshot();
    expect(s.source.kind).toBe('replay');
    const a = s.analytics!;
    expect(a.explanation?.fault).toBe(original.explanation?.fault);
    expect(a.levels.lubrication).toBe(original.levels.lubrication);
    const lube = (x: typeof a) => x.evidence.find((e) => e.id === 'lubrication')!.score;
    // CSV keeps 5–6 decimals, so the evidence matches to a few parts in 10⁴
    expect(Math.abs(lube(a) - lube(original))).toBeLessThan(1e-3);
    // a CSV has no crank-angle windows: vibration and combustion are honestly "not monitored"
    expect(a.subsystems.find((x) => x.id === 'combustion')!.health).toBeNull();

    // at the end the replay stops the clock instead of freezing the readings (no fake stuck sensor)
    const tEnd = replay.telemetry.t;
    replay.advanceSim(120);
    expect(replay.snapshot().source.done).toBe(true);
    expect(replay.telemetry.t).toBe(tEnd);
    expect(replay.snapshot().analytics!.sanity.channels.coolantC.state).toBe('ok');
  });

  it('a bad file is reported and the simulator keeps running', () => {
    const loop = new SimLoop();
    const reply = loop.handle({ type: 'loadReplay', csv: 'nonsense', name: 'bad.csv' });
    expect(reply && reply.type).toBe('sourceError');
    expect(loop.snapshot().source.kind).toBe('sim');
  });
});

describe('ESP32 JSON lines', () => {
  it('parses known fields and ignores the rest', () => {
    expect(parseJsonLine('{"rpm":3010,"coolantC":90.4,"oilPressBar":null,"x":1}')).toEqual({
      rpm: 3010,
      coolantC: 90.4,
      oilPressBar: null,
    });
    expect(parseJsonLine('boot: ok')).toBeNull();
    expect(parseJsonLine('{"rpm":')).toBeNull();
  });
});

describe('OBD-II (ELM327, mode 01) — review PID table', () => {
  it.each([
    ['41 0C 1A F8', '0C', (256 * 0x1a + 0xf8) / 4],
    ['41 04 80', '04', (100 * 0x80) / 255],
    ['41 05 7B', '05', 0x7b - 40],
    ['41 0F 46', '0F', 0x46 - 40],
    ['41 0B 65', '0B', 0x65],
    ['41 42 37 B4', '42', (256 * 0x37 + 0xb4) / 1000],
  ])('%s → PID %s', (raw, pid, value) => {
    const r = parseObdResponse(raw);
    expect(r?.pid).toBe(pid);
    expect(r!.value).toBeCloseTo(value, 9);
  });

  it('tolerates echo, no spaces and the prompt; rejects NO DATA', () => {
    expect(parseObdResponse('010C\r410C1AF8\r\r>')?.value).toBeCloseTo(1726, 9);
    expect(parseObdResponse('NO DATA')).toBeNull();
  });

  it('maps PIDs onto telemetry fields', () => {
    expect(obdToPatch('04', 50)).toEqual({ load: 0.5 });
    expect(obdToPatch('42', 14.2)).toEqual({ busV: 14.2 });
  });
});

describe('live source through the full pipeline', () => {
  it('OBD-II has no oil sensors: those channels are "not fitted", not a dropout fault', () => {
    const loop = new SimLoop();
    loop.handle({ type: 'useLive', name: 'OBD-II' });
    for (let i = 0; i < 1200; i++) {
      // a warm engine at 3,000 rpm, reporting only OBD-II channels, 10 readings per second
      if (i % 2 === 0)
        loop.handle({
          type: 'liveTelemetry',
          patch: { rpm: 3000 + (i % 7), load: 0.42, coolantC: 92, busV: 14.2, ambientC: 30 },
        });
      loop.advanceSim(0.05);
    }
    const s = loop.snapshot();
    expect(s.source.kind).toBe('live');
    expect(s.telemetry.oilPressBar).toBeNull();
    expect(s.analytics!.sanity.channels.oilPressBar.state).toBe('ok');
    expect(s.analytics!.levels.sensor).toBe('NORMAL');
    expect(s.lifecycle).toBe('RUNNING');
  });

  it('a channel that stops arriving goes null after 2 s', () => {
    const src = new LiveSource('ESP32', 0);
    src.push({ coolantC: 90 });
    expect(src.step(1).coolantC).toBe(90);
    expect(src.step(1.5).coolantC).toBeNull();
  });
});

describe('device accelerometer → the same FFT', () => {
  it('finds a 10 Hz vibration sampled unevenly at about 60 Hz', async () => {
    const { deviceSpectrum } = await import('../ui/sources/accelerometer');
    const { createRng } = await import('../lib/rng');
    const rng = createRng(3);
    const samples = [];
    let t = 0;
    for (let i = 0; i < 240; i++) {
      t += 1 / 60 + (rng.next() - 0.5) * 0.004; // phone event jitter
      samples.push({ t, a: 9.81 + 0.4 * Math.sin(2 * Math.PI * 10 * t) + 0.02 * rng.gaussian() });
    }
    const s = deviceSpectrum(samples)!;
    expect(Math.abs(s.peakHz - 10)).toBeLessThan(0.5);
    expect(s.peakAmp).toBeGreaterThan(0.3);
    expect(s.peakAmp).toBeLessThan(0.5);
    expect(s.fs).toBeGreaterThan(55);
  });
});

describe('recording ring buffer', () => {
  it('keeps the last 30 simulated minutes, oldest first, after it wraps', () => {
    const loop = new SimLoop(2);
    loop.handle({ type: 'start' });
    loop.advanceSim(2100); // 35 min > 30 min
    const rec = loop.handle({ type: 'exportRecording' });
    const rows = parseTelemetryCsv(rec && rec.type === 'recording' ? rec.csv : '');
    expect(rows).toHaveLength(36_000);
    const ts = rows.map((r) => r.t);
    expect(ts[0]).toBeCloseTo(2100 - 36_000 * 0.05 + 0.05, 6);
    expect(ts.at(-1)).toBeCloseTo(2100, 6);
    for (let i = 1; i < ts.length; i++) expect(ts[i]! - ts[i - 1]!).toBeCloseTo(0.05, 6);
  });
});
