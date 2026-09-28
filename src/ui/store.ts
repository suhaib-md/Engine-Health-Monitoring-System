import { create } from 'zustand';

/** UI-only state: navigation, test-bench controls. Simulation state arrives from the worker in Phase 2. */

export const PAGES = [
  { id: 'live', label: 'Live Twin' },
  { id: 'trends', label: 'Trends' },
  { id: 'vibration', label: 'Vibration' },
  { id: 'math', label: 'Math' },
  { id: 'validation', label: 'Validation' },
  { id: 'report', label: 'Report' },
] as const;

export type PageId = (typeof PAGES)[number]['id'];

export const isPageId = (s: string): s is PageId => PAGES.some((p) => p.id === s);

export type Warp = 1 | 10 | 60;
export type FanMode = 'auto' | 'on' | 'off';
export type FaultMode = 'gradual' | 'instant';

export const FAULTS = [
  { id: 'oilPump', label: 'Oil-pump wear' },
  { id: 'cooling', label: 'Cooling degradation' },
  { id: 'misfire3', label: 'Cylinder 3 misfire' },
  { id: 'bearing', label: 'Bearing wear' },
  { id: 'alternator', label: 'Alternator fault' },
  { id: 'coolantSensor', label: 'Coolant sensor spike' },
] as const;

export type FaultId = (typeof FAULTS)[number]['id'];

interface UiState {
  page: PageId;
  benchOpen: boolean;
  engineOn: boolean;
  warp: Warp;
  fan: FanMode;
  targetRpm: number;
  load_Nm: number;
  ambient_C: number;
  fault: FaultId;
  severity: number;
  faultMode: FaultMode;
  blind: boolean;
  set: (patch: Partial<Omit<UiState, 'set'>>) => void;
}

const initialPage = (): PageId => {
  const h = typeof window === 'undefined' ? '' : window.location.hash.slice(1);
  return isPageId(h) ? h : 'live';
};

export const useUi = create<UiState>((set) => ({
  page: initialPage(),
  benchOpen: false,
  engineOn: true,
  warp: 60,
  fan: 'auto',
  targetRpm: 3000,
  load_Nm: 80,
  ambient_C: 30,
  fault: 'oilPump',
  severity: 0.6,
  faultMode: 'gradual',
  blind: false,
  set: (patch) => set(patch),
}));
