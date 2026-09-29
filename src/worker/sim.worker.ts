/// <reference lib="webworker" />
import { SimLoop } from './simLoop';
import type { Command, WorkerMessage } from './protocol';

/**
 * Runs the simulation off the UI thread. Every 50 ms (20 Hz) it advances the loop by the
 * elapsed wall time × time-warp and posts one snapshot.
 */
const loop = new SimLoop();
let last = performance.now();

const post = () => {
  const msg: WorkerMessage = { type: 'snapshot', snapshot: loop.snapshot() };
  self.postMessage(msg);
};

self.onmessage = (e: MessageEvent<Command>) => {
  const reply = loop.handle(e.data);
  if (reply) self.postMessage(reply);
  if (e.data.type !== 'liveTelemetry') post(); // reflect commands immediately
};

setInterval(() => {
  const now = performance.now();
  loop.advanceWall(now - last);
  last = now;
  post();
}, 1000 / 20);
