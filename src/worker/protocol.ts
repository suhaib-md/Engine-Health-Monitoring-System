import type { Lifecycle } from '../lifecycle';
import type { Telemetry } from '../telemetry';
import type { TwinExpected } from '../twin';
import type {
  FanMode,
  FaultOnset,
  MonitoredChannel,
  PlantFaultId,
  SensorFaultKind,
} from '../plant';
import type { AnalyticsState } from '../analytics';
import type { TelemetryPatch } from '../sources/serialSource';

/** Messages between the UI thread and sim.worker.ts. */

export type Warp = 1 | 10 | 60;

export interface SimSettings {
  targetRpm: number;
  torque_Nm: number;
  ambient_C: number;
  fanMode: FanMode;
  warp: Warp;
}

export type ScenarioId = 'tour' | 'hero' | 'overheat' | 'hotCity';

export type Command =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'pause'; paused: boolean }
  | { type: 'set'; settings: Partial<SimSettings> }
  | { type: 'reset'; seed?: number }
  | { type: 'injectFault'; fault: PlantFaultId; severity: number; onset: FaultOnset }
  /** break a sensor (Plant side); the monitor has to notice from the data */
  | { type: 'injectSensorFault'; channel: MonitoredChannel; kind: SensorFaultKind }
  | { type: 'clearFaults' }
  | { type: 'runScenario'; id: ScenarioId }
  | { type: 'stopScenario' }
  /** blind mode: deal a shuffled, face-down deck of faults */
  | { type: 'blindDeal' }
  /** the user picks a case by position; the worker injects what is on it */
  | { type: 'blindPick'; card: number }
  | { type: 'blindReveal' }
  | { type: 'blindEnd' }
  /** Phase 13 data sources: the analytics are the same whatever feeds them */
  | { type: 'exportRecording' }
  | { type: 'loadReplay'; csv: string; name: string }
  | { type: 'useLive'; name: string }
  | { type: 'liveTelemetry'; patch: TelemetryPatch }
  | { type: 'useSimulator' };

/** What is feeding the Twin and the analytics. */
export interface SourceStatus {
  kind: 'sim' | 'replay' | 'live';
  name: string;
  /** replay only: 0..1 through the file */
  progress?: number;
  done?: boolean;
  /** replay/live: rows or readings received so far */
  count?: number;
}

/**
 * Blind challenge as the UI sees it. Before the reveal it holds only positions and times, never
 * which fault is on a card.
 */
export interface BlindStatus {
  cards: number;
  picked: number | null;
  pickedAt: number | null;
  /** when the monitor first held a WARNING-or-worse diagnosis after the pick */
  firstWarningAt: number | null;
  /** filled in by the reveal */
  answer: {
    label: string;
    expected: string;
    /** the monitor's diagnosis at the moment of the reveal */
    verdict: string | null;
    correct: boolean;
  } | null;
}

/** Where a scripted scenario is, for the progress strip. */
export interface ScenarioStatus {
  id: ScenarioId;
  name: string;
  /** 1-based number of the step now showing; `steps` is the total */
  step: number;
  steps: number;
  title: string;
  caption: string;
  done: boolean;
}

/** When a fault was injected (for chart markers). The label is hidden by the UI in blind mode. */
export interface FaultEvent {
  t: number;
  label: string;
}

/** The latest crank-angle window (sent once, when it is new): 16 revolutions per 0.5° step. */
export interface SimWindows {
  seq: number;
  /** simulated time the window was completed */
  t: number;
  /** crank speed, rpm */
  speed: Float32Array;
  /** vibration, m/s² */
  vib: Float32Array;
}

/** 20 Hz UI snapshot. Contains only what a real monitoring system could observe. */
export interface Snapshot {
  seed: number;
  paused: boolean;
  warp: Warp;
  lifecycle: Lifecycle;
  transient: boolean;
  /** the newest sample without its crank-angle windows (those travel in `windows`) */
  telemetry: Omit<Telemetry, 'crankSpeedWindow' | 'vibWindow'>;
  expected: TwinExpected;
  /** simulated seconds advanced per wall second, measured (for the header / debugging) */
  simRate: number;
  /** analytics output: residuals, evidence, health, alerts, explanation */
  analytics: AnalyticsState | null;
  faultEvents: FaultEvent[];
  /** a window the UI has not seen yet, else null (the UI keeps the last one it received) */
  windows: SimWindows | null;
  /** the running scripted scenario, if any */
  scenario: ScenarioStatus | null;
  /** the blind challenge, if one is dealt */
  blind: BlindStatus | null;
  source: SourceStatus;
  /** current control settings; the UI mirrors them when `settingsRev` changes (a scenario set them) */
  settings: SimSettings;
  settingsRev: number;
}

export type WorkerMessage =
  | { type: 'snapshot'; snapshot: Snapshot }
  /** reply to exportRecording, or an error loading a source */
  | { type: 'recording'; csv: string; rows: number }
  | { type: 'sourceError'; message: string };
