import type { Telemetry } from '../telemetry';
import type { TelemetrySource } from './simSource';

/**
 * Live hardware sources (Phase 13; review "Hardware roadmap"). The browser reads the serial port
 * (Web Serial, on the page) and hands each reading to the worker, where this source turns the
 * latest values into Telemetry on the loop's clock. The analytics are unchanged (rule 2).
 *
 * Path A: an ESP32 streaming one JSON object per line, using Telemetry field names, e.g.
 *   {"rpm":3010,"load":0.42,"coolantC":90.4,"oilC":97.8,"oilPressBar":3.1,"busV":14.1}
 * Path B: a USB ELM327 OBD-II adapter, polled for mode-01 PIDs. Oil pressure and oil temperature
 * are not standard PIDs, so those channels stay "not fitted" (null).
 */

/** Fields a source may set. */
export type TelemetryPatch = Partial<Omit<Telemetry, 't' | 'crankSpeedWindow' | 'vibWindow'>>;

const NUMERIC: readonly (keyof TelemetryPatch)[] = [
  'rpm',
  'load',
  'ambientC',
  'coolantC',
  'oilC',
  'oilPressBar',
  'busV',
  'torqueCmdNm',
];

/** One ESP32 JSON line → a telemetry patch (unknown keys ignored; bad lines give null). */
export function parseJsonLine(line: string): TelemetryPatch | null {
  const s = line.trim();
  if (!s.startsWith('{')) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(s);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  const out: TelemetryPatch = {};
  for (const k of NUMERIC) {
    const v = o[k];
    if (v === null) (out as Record<string, unknown>)[k] = null;
    else if (typeof v === 'number' && Number.isFinite(v)) (out as Record<string, unknown>)[k] = v;
  }
  if (typeof o.fanOn === 'boolean') out.fanOn = o.fanOn;
  return Object.keys(out).length ? out : null;
}

/** Mode-01 PIDs the review lists, with their SAE J1979 formulas (A, B = response bytes). */
export const OBD_PIDS = {
  '0C': { name: 'engine speed', unit: 'rpm', decode: (a: number, b: number) => (256 * a + b) / 4 },
  '04': { name: 'calculated load', unit: '%', decode: (a: number) => (100 * a) / 255 },
  '05': { name: 'coolant temperature', unit: '°C', decode: (a: number) => a - 40 },
  '0F': { name: 'intake air temperature', unit: '°C', decode: (a: number) => a - 40 },
  '0B': { name: 'manifold absolute pressure', unit: 'kPa', decode: (a: number) => a },
  '42': {
    name: 'control module voltage',
    unit: 'V',
    decode: (a: number, b: number) => (256 * a + b) / 1000,
  },
} as const;
export type ObdPid = keyof typeof OBD_PIDS;

/**
 * Parse an ELM327 reply such as "41 0C 1A F8" (spaces optional, echo and prompt tolerated).
 * Returns the PID and its decoded value, or null for "NO DATA" and anything unrecognised.
 */
export function parseObdResponse(text: string): { pid: ObdPid; value: number } | null {
  const hex = text.toUpperCase().replace(/[^0-9A-F]/g, ' ');
  const m = /41\s*([0-9A-F]{2})\s*([0-9A-F]{2})(?:\s*([0-9A-F]{2}))?/.exec(hex);
  if (!m) return null;
  const pid = m[1] as ObdPid;
  const spec = OBD_PIDS[pid];
  if (!spec) return null;
  const a = parseInt(m[2]!, 16);
  const b = m[3] ? parseInt(m[3], 16) : 0;
  return { pid, value: spec.decode(a, b) };
}

/**
 * OBD-II value → telemetry patch. Calculated load (PID 04) is used as the load fraction L, and
 * intake-air temperature (PID 0F) stands in for ambient: both approximations (Q-58).
 */
export function obdToPatch(pid: ObdPid, value: number): TelemetryPatch {
  switch (pid) {
    case '0C':
      return { rpm: value };
    case '04':
      return { load: value / 100 };
    case '05':
      return { coolantC: value };
    case '0F':
      return { ambientC: value };
    case '42':
      return { busV: value };
    default:
      return {};
  }
}

/** Channels not updated for this long read as dropouts (null). */
const STALE_S = 2;

/**
 * A live source: the page pushes patches as readings arrive; each loop step returns the latest
 * values, timestamped on the loop's clock. A channel that has never arrived is not fitted (null);
 * one that stops arriving goes null after 2 s, which the sanity layer reports as a dropout.
 */
export class LiveSource implements TelemetrySource {
  private t = 0;
  private latest: Record<string, { v: number | boolean | null; t: number }> = {};

  constructor(
    readonly name: string,
    t0: number,
  ) {
    this.t = t0;
  }

  push(patch: TelemetryPatch) {
    for (const [k, v] of Object.entries(patch))
      this.latest[k] = { v: v as number | boolean | null, t: this.t };
  }

  private get(k: string): number | null {
    const e = this.latest[k];
    if (!e || this.t - e.t > STALE_S || typeof e.v !== 'number') return null;
    return e.v;
  }

  current(): Telemetry {
    const fan = this.latest.fanOn;
    return {
      t: this.t,
      rpm: Math.max(0, this.get('rpm') ?? 0),
      load: Math.min(1, Math.max(0, this.get('load') ?? 0)),
      ambientC: this.get('ambientC') ?? 25,
      coolantC: this.get('coolantC'),
      oilC: this.get('oilC'),
      oilPressBar: this.get('oilPressBar'),
      busV: this.get('busV'),
      fanOn: fan && typeof fan.v === 'boolean' ? fan.v : null,
      torqueCmdNm: this.get('torqueCmdNm'),
    };
  }

  step(dt: number): Telemetry {
    this.t += dt;
    return this.current();
  }
}
