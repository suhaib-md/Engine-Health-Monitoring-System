/** JS mirror of index.css for places CSS can't reach: uPlot, three.js materials, canvas. Keep in sync. */
export const color = {
  bg: '#0c131c',
  panel: '#121b26',
  raised: '#1a2532',
  line: '#26323f',
  lineStrong: '#3a4858',
  fg: '#eef3f8',
  fg2: '#b3c0cf',
  fg3: '#7f8fa3',
  accent: '#35e0f0',
  accentStrong: '#1fb8c8',
  accentDim: '#10333d',
  accentInk: '#06222a',
  twin: '#e8eef5',
  ok: '#3ddc84',
  watch: '#f5d547',
  warn: '#ff9a3c',
  crit: '#ff4d5e',
  invalid: '#6f7c8c',
  series: ['#35e0f0', '#a98bff', '#5b9dff', '#ff7bd0'],
  faultMarker: '#a98bff',
} as const;

export const print = {
  paper: '#f7f8fa',
  ink: '#121a24',
  ink2: '#4a5664',
  rule: '#d5dbe2',
  accent: '#0a8a9a',
  warn: '#c2410c',
  crit: '#d8283a',
} as const;

export type Status = 'ok' | 'watch' | 'warn' | 'crit' | 'invalid';
export type AlertClass = 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL';
export type SensorQuality = 'valid' | 'degraded' | 'failed' | 'unavailable';
export type Lifecycle = 'OFF' | 'STARTING' | 'WARMUP' | 'RUNNING' | 'SHUTDOWN';

export const alertStatus: Record<AlertClass, Status | 'info'> = {
  INFO: 'info',
  WATCH: 'watch',
  WARNING: 'warn',
  CRITICAL: 'crit',
};

export const qualityStatus: Record<SensorQuality, Status> = {
  valid: 'ok',
  degraded: 'watch',
  failed: 'crit',
  unavailable: 'invalid',
};

/** Evidence classes (CLAUDE.md rule 9). Never call this "confidence". */
export function evidenceClass(s: number): { label: string; status: Status } {
  if (s > 0.75) return { label: 'strong', status: 'crit' };
  if (s > 0.55) return { label: 'probable', status: 'warn' };
  if (s >= 0.3) return { label: 'possible', status: 'watch' };
  return { label: 'weak', status: 'ok' };
}

/** Subsystem bar colour from a 0–100 score. The overall ring uses the alert state instead. */
export function scoreStatus(h: number | null): Status {
  if (h == null) return 'invalid';
  if (h >= 85) return 'ok';
  if (h >= 70) return 'watch';
  if (h >= 50) return 'warn';
  return 'crit';
}

/** 3D heat-map: cold → hot runs steel → cyan → white so it never reads as a status. */
export const heatRamp = ['#26323f', '#1fb8c8', '#35e0f0', '#e8eef5'] as const;

export const motion = { fast: 120, base: 200, panel: 240, pulseMs: 1200 } as const;
