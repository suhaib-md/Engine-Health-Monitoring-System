import { create } from 'zustand';
import type { ScenarioId } from '../worker/protocol';
import type { BindingId } from './math/bindings';

/** UI-only state: navigation and test-bench controls. Simulation state comes from the worker (sim/simClient.ts). */

export const PAGES = [
  { id: 'live', label: 'Live Twin' },
  { id: 'trends', label: 'Trends' },
  { id: 'vibration', label: 'Vibration' },
  { id: 'math', label: 'Math' },
  { id: 'validation', label: 'Validation' },
  { id: 'report', label: 'Report' },
  { id: 'debug', label: 'Debug' },
] as const;

export type PageId = (typeof PAGES)[number]['id'];

export const isPageId = (s: string): s is PageId => PAGES.some((p) => p.id === s);

export type Warp = 1 | 10 | 60;
export type FanMode = 'auto' | 'on' | 'off';
export type FaultMode = 'gradual' | 'instant';

/** Fault catalogue. `phase` = the build phase that makes it injectable; `gain` = health lost per unit severity. */
export const FAULTS = [
  { id: 'oilPump', label: 'Oil-pump wear', phase: 3, gain: 0.75 },
  { id: 'cooling', label: 'Cooling degradation', phase: 3, gain: 0.8 },
  { id: 'misfire', label: 'Cylinder misfire', phase: 7, gain: 1 },
  { id: 'bearing', label: 'Bearing wear', phase: 9, gain: 1 },
  { id: 'alternator', label: 'Alternator fault', phase: 9, gain: 1 },
  { id: 'coolantSensor', label: 'Coolant sensor spike', phase: 9, gain: 1 },
] as const;
export const AVAILABLE_PHASE = 7;

export type FaultId = (typeof FAULTS)[number]['id'];

interface UiState {
  page: PageId;
  benchOpen: boolean;
  warp: Warp;
  fan: FanMode;
  targetRpm: number;
  load_Nm: number;
  ambient_C: number;
  fault: FaultId;
  /** which cylinder the misfire fault hits */
  cylinder: 1 | 2 | 3 | 4;
  severity: number;
  faultMode: FaultMode;
  scenario: ScenarioId;
  /** open "Show the math" drawer for this gauge (null = closed) */
  math: BindingId | null;
  /** gauge selected on the Math page */
  mathPick: BindingId;
  set: (patch: Partial<Omit<UiState, 'set'>>) => void;
}

const initialPage = (): PageId => {
  const h = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return isPageId(h) ? h : 'live';
};

export const useUi = create<UiState>((set) => ({
  page: initialPage(),
  benchOpen: false,
  warp: 60,
  fan: 'auto',
  targetRpm: 3000,
  load_Nm: 80,
  ambient_C: 30,
  fault: 'oilPump',
  cylinder: 3,
  severity: 0.6,
  faultMode: 'gradual',
  scenario: 'hero',
  math: null,
  mathPick: 'oilPress',
  set: (patch) => set(patch),
}));
