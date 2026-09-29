import { useEffect } from 'react';
import { create } from 'zustand';
import type { Command, SimWindows, Snapshot, WorkerMessage } from '../../worker/protocol';
import { useUi } from '../store';

/**
 * UI side of the simulation worker. The worker posts a Snapshot at 20 Hz; components select the
 * slices they need from `useSim`. (60 fps consumers like the 3D view will use transient
 * subscriptions via useSim.subscribe in Phase 5.)
 */
interface SimStore {
  snapshot: Snapshot | null;
}

export const useSim = create<SimStore>(() => ({ snapshot: null }));

/**
 * The latest crank-angle window. The worker sends a window only when it is new (once per simulated
 * second), so it lives in its own store and the vibration charts redraw only then.
 */
export const useWindows = create<{ windows: SimWindows | null }>(() => ({ windows: null }));

/** Last message from a data-source action (recording saved, replay error, serial status). */
export const useSourceMessage = create<{ message: string | null }>(() => ({ message: null }));

const pad = (n: number) => String(n).padStart(2, '0');

/** Save the worker's recording as a CSV file (no server: a Blob download). */
function download(csv: string, rows: number) {
  const d = new Date();
  const name = `ignisense-telemetry-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  useSourceMessage.setState({
    message: `Saved ${name}: ${rows.toLocaleString('en-US')} rows (${(rows / 20 / 60).toFixed(1)} simulated minutes).`,
  });
}

let worker: Worker | null = null;
let lastSettingsRev = 0;

/** A scripted scenario changed the controls in the worker: make the sliders show the truth. */
function mirrorSettings(s: Snapshot) {
  if (s.settingsRev === lastSettingsRev) return;
  lastSettingsRev = s.settingsRev;
  const c = s.settings;
  useUi.setState({
    targetRpm: c.targetRpm,
    load_Nm: c.torque_Nm,
    ambient_C: c.ambient_C,
    fan: c.fanMode,
    warp: c.warp,
  });
}

export function sendSim(cmd: Command) {
  worker?.postMessage(cmd);
}

/** Pushes the test-bench settings to the worker. */
function syncSettings() {
  const u = useUi.getState();
  sendSim({
    type: 'set',
    settings: {
      targetRpm: u.targetRpm,
      torque_Nm: u.load_Nm,
      ambient_C: u.ambient_C,
      fanMode: u.fan,
      warp: u.warp,
    },
  });
}

/** Starts the worker once and keeps it in sync with the test-bench controls. */
export function useSimWorker() {
  useEffect(() => {
    if (!worker) {
      worker = new Worker(new URL('../../worker/sim.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        if (e.data.type === 'recording') download(e.data.csv, e.data.rows);
        if (e.data.type === 'sourceError') useSourceMessage.setState({ message: e.data.message });
        if (e.data.type === 'snapshot') {
          const { windows, ...rest } = e.data.snapshot;
          mirrorSettings(e.data.snapshot);
          if (windows) useWindows.setState({ windows });
          useSim.setState({ snapshot: { ...rest, windows: null } });
        }
      };
    }
    syncSettings();
    return useUi.subscribe((s, prev) => {
      if (
        s.targetRpm !== prev.targetRpm ||
        s.load_Nm !== prev.load_Nm ||
        s.ambient_C !== prev.ambient_C ||
        s.fan !== prev.fan ||
        s.warp !== prev.warp
      )
        syncSettings();
    });
  }, []);
}

export const isEngineRunning = (s: Snapshot | null) =>
  !!s && s.lifecycle !== 'OFF' && s.lifecycle !== 'SHUTDOWN';
