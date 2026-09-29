import { useEffect } from 'react';
import { create } from 'zustand';
import type { Command, Snapshot, WorkerMessage } from '../../worker/protocol';
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

let worker: Worker | null = null;

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
        if (e.data.type === 'snapshot') useSim.setState({ snapshot: e.data.snapshot });
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
