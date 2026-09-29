/**
 * Analytics output types. They are plain data, structurally identical to the design-system
 * component props in src/ui (analytics must not import ui).
 */
export type Status = 'ok' | 'watch' | 'warn' | 'crit' | 'invalid';
export type AlertClass = 'INFO' | 'WATCH' | 'WARNING' | 'CRITICAL';
export type AlertLevel = 'NORMAL' | Exclude<AlertClass, 'INFO'>;

export type FaultKind = 'cooling' | 'lubrication' | 'charging';
export type SubsystemId =
  'lubrication' | 'thermal' | 'vibration' | 'combustion' | 'electrical' | 'sensors';

export interface Symptom {
  id: string;
  weight: number;
  /** normalised evidence R ∈ [0,1] */
  risk: number;
  /** one-line human explanation with the live number in it */
  text: string;
}

export interface FaultEvidence {
  id: FaultKind;
  name: string;
  subsystem: SubsystemId;
  /** diagnostic evidence score S = Σ wR / Σ w (never "confidence") */
  score: number;
  symptoms: Symptom[];
  action: string;
}

export interface Explanation {
  fault: string;
  severity: 'Low' | 'Medium' | 'High';
  alert: AlertClass;
  evidence: number;
  why: { text: string; status: Status }[];
  action: string;
  model: { physics: string; anomaly: string; anomalyStatus?: Status; rul: string };
}

export interface AlertRow {
  id: string;
  cls: AlertClass;
  subsystem: string;
  title: string;
  time: string;
  /** simulated seconds, for chart markers */
  t: number;
  measured?: string;
  expected?: string;
  residual?: string;
  persistence?: string;
  source: 'rule' | 'statistical';
}

export interface SubsystemHealth {
  id: SubsystemId;
  name: string;
  weight: number;
  /** 0–100, null = not monitored yet */
  health: number | null;
}
