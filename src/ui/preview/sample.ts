import { useEffect } from 'react';
import { create } from 'zustand';
import type { AlertRow, Explanation } from '../diagnostics';
import type { AlertClass, Lifecycle, SensorQuality, Status } from '../tokens';
import { useUi } from '../store';

/**
 * DESIGN PREVIEW DATA — not physics.
 * Deterministic sample values (mirroring the design's Live Twin sample) so the UI can be built
 * and reviewed before the simulation exists. Replaced by worker snapshots in Phases 2–4.
 * Everything that renders from this file is labelled "sample data" in the UI.
 */

interface SampleClock {
  k: number;
  /** simulated seconds */
  t: number;
  tick: (warp: number) => void;
}

export const useSampleClock = create<SampleClock>((set) => ({
  k: 0,
  t: 872,
  tick: (warp) => set((s) => ({ k: s.k + 1, t: s.t + warp * 0.25 })),
}));

/** 4 Hz ticker for the sample preview; runs only while the engine is "on". */
export function useSampleTicker() {
  const on = useUi((s) => s.engineOn);
  const warp = useUi((s) => s.warp);
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => useSampleClock.getState().tick(warp), 250);
    return () => clearInterval(id);
  }, [on, warp]);
}

export function formatClock(t: number) {
  const s = Math.floor(t);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

export interface GaugeSample {
  id: string;
  label: string;
  unit: string;
  value: number | null;
  expected: number | null;
  min: number;
  max: number;
  decimals: number;
  status: Status;
  quality: SensorQuality;
  z: number;
  zones: { from: number; to: number; status: Status }[];
}

export interface Snapshot {
  lifecycle: Lifecycle;
  alertState: AlertClass | 'NORMAL';
  health: number;
  thetaDeg: number;
  gauges: GaugeSample[];
  subsystems: { name: string; health: number; weight: number }[];
  explanation: Explanation;
  alerts: AlertRow[];
}

export function sampleSnapshot(k: number, targetRpm: number, engineOn: boolean): Snapshot {
  const n = (a: number, f: number) => a * Math.sin(k * f);
  const on = engineOn;
  const rpm = on ? targetRpm + n(14, 1.3) : 0;
  const g = (
    id: string,
    label: string,
    unit: string,
    value: number | null,
    expected: number | null,
    min: number,
    max: number,
    decimals: number,
    status: Status,
    z: number,
    zones: GaugeSample['zones'] = [],
  ): GaugeSample => ({
    id,
    label,
    unit,
    value,
    expected,
    min,
    max,
    decimals,
    status,
    quality: value == null ? 'unavailable' : 'valid',
    z,
    zones,
  });

  return {
    lifecycle: on ? 'RUNNING' : 'OFF',
    alertState: 'WARNING',
    health: 61 + n(0.4, 0.2),
    thetaDeg: Math.floor((k * 9) % 720),
    gauges: [
      g('rpm', 'Engine speed', 'rpm', rpm, on ? targetRpm : 0, 0, 7000, 0, 'ok', 0.4, [
        { from: 6000, to: 7000, status: 'crit' },
      ]),
      g('coolant', 'Coolant', '°C', 93.4 + n(0.2, 0.4), 93.0, 40, 130, 1, 'ok', 0.3, [
        { from: 110, to: 130, status: 'crit' },
      ]),
      g('oilTemp', 'Oil temp', '°C', 108 + n(0.3, 0.3), 101, 40, 150, 0, 'watch', 2.3, [
        { from: 130, to: 150, status: 'crit' },
      ]),
      g('oilPress', 'Oil pressure', 'bar', 1.7 + n(0.03, 0.9), 3.23, 0, 5, 2, 'warn', -7.6, [
        { from: 0, to: 1, status: 'crit' },
      ]),
      g('busV', 'Voltage', 'V', 14.1 + n(0.04, 1.1), 14.1, 11, 15, 1, 'ok', 0.2),
      g('vib', 'Vibration RMS', 'm/s²', 4.1 + n(0.15, 1.7), 2.0, 0, 10, 1, 'watch', 2.1),
    ],
    subsystems: [
      { name: 'Lubrication', health: 46, weight: 0.25 },
      { name: 'Thermal', health: 74, weight: 0.25 },
      { name: 'Mechanical vibration', health: 66, weight: 0.2 },
      { name: 'Combustion', health: 88, weight: 0.15 },
      { name: 'Electrical', health: 97, weight: 0.1 },
      { name: 'Sensor integrity', health: 100, weight: 0.05 },
    ],
    explanation: {
      fault: 'Lubrication-system degradation',
      severity: 'High',
      alert: 'WARNING',
      evidence: 0.71,
      why: [
        { text: 'Oil pressure is 47% below twin expectation', status: 'warn' },
        { text: 'Pressure residual persisted for 27 s', status: 'warn' },
        { text: 'Oil temperature trend is rising', status: 'watch' },
        { text: 'Vibration RMS is 2.1× operating baseline', status: 'watch' },
        { text: 'Electrical and cooling signals do not explain the anomaly', status: 'ok' },
      ],
      action:
        'Inspect oil level, oil-pump operation, filter restriction and bearing-clearance condition.',
      model: {
        physics: 'strong match',
        anomaly: 'abnormal · D² 21.4 > 15.09',
        anomalyStatus: 'warn',
        rul: '46–62 sim. h · high uncertainty',
      },
    },
    alerts: [
      {
        id: 'a4',
        cls: 'WARNING',
        subsystem: 'Lubrication',
        title: 'low oil pressure',
        time: 'T+14:32',
        measured: '1.70',
        expected: '3.23 bar',
        residual: 'z −7.6',
        persistence: '27 s',
        source: 'rule',
      },
      {
        id: 'a3',
        cls: 'WATCH',
        subsystem: 'Anomaly',
        title: 'D² above limit',
        time: 'T+14:05',
        residual: 'D² 21.4 > 15.09',
        persistence: '12 s',
        source: 'statistical',
      },
      {
        id: 'a2',
        cls: 'WATCH',
        subsystem: 'Lubrication',
        title: 'CUSUM drift',
        time: 'T+13:48',
        residual: 'S⁻ 5.3 > h 5',
        source: 'statistical',
      },
      {
        id: 'a1',
        cls: 'INFO',
        subsystem: 'Thermal',
        title: 'engine reached operating temp',
        time: 'T+02:10',
        measured: 'coolant 82 °C',
        source: 'rule',
      },
    ],
  };
}
