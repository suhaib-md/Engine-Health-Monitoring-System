import type { Lifecycle } from '../lifecycle';
import type { Telemetry } from '../telemetry';
import type { TwinExpected } from '../twin';
import type { FanMode, FaultOnset, PlantFaultId } from '../plant';
import type { AnalyticsState } from '../analytics';

/** Messages between the UI thread and sim.worker.ts. */

export type Warp = 1 | 10 | 60;

export interface SimSettings {
  targetRpm: number;
  torque_Nm: number;
  ambient_C: number;
  fanMode: FanMode;
  warp: Warp;
}

export type Command =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'pause'; paused: boolean }
  | { type: 'set'; settings: Partial<SimSettings> }
  | { type: 'reset'; seed?: number }
  | { type: 'injectFault'; fault: PlantFaultId; severity: number; onset: FaultOnset }
  | { type: 'clearFaults' };

/** When a fault was injected (for chart markers). The label is hidden by the UI in blind mode. */
export interface FaultEvent {
  t: number;
  label: string;
}

/** 20 Hz UI snapshot. Contains only what a real monitoring system could observe. */
export interface Snapshot {
  seed: number;
  paused: boolean;
  warp: Warp;
  lifecycle: Lifecycle;
  transient: boolean;
  telemetry: Telemetry;
  expected: TwinExpected;
  /** simulated seconds advanced per wall second, measured (for the header / debugging) */
  simRate: number;
  /** analytics output: residuals, evidence, health, alerts, explanation */
  analytics: AnalyticsState | null;
  faultEvents: FaultEvent[];
}

export type WorkerMessage = { type: 'snapshot'; snapshot: Snapshot };
