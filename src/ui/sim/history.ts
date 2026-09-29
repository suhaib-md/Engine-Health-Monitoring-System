import type { Snapshot } from '../../worker/protocol';
import { useSim } from './simClient';

/**
 * Rolling history of snapshots for the Trends charts, kept OUTSIDE React state: charts read it
 * on their own redraw timer (transient subscription), so appending never re-renders the tree.
 * Columns are plain arrays in uPlot's column layout.
 */
export interface History {
  t: number[];
  coolant: (number | null)[];
  coolantExp: number[];
  oil: (number | null)[];
  oilExp: number[];
  press: (number | null)[];
  pressExp: number[];
  busV: (number | null)[];
  busVExp: number[];
  rpm: number[];
  health: (number | null)[];
  /** bumps on every append/reset so charts know to redraw */
  version: number;
}

/** minimum simulated spacing between stored points; cap keeps ~1 h at 60× in memory */
const MIN_DT_S = 0.5;
const MAX_POINTS = 4000;

const empty = (): History => ({
  t: [],
  coolant: [],
  coolantExp: [],
  oil: [],
  oilExp: [],
  press: [],
  pressExp: [],
  busV: [],
  busVExp: [],
  rpm: [],
  health: [],
  version: 0,
});

export const history: History = empty();

function append(s: Snapshot) {
  const h = history;
  const t = s.telemetry.t;
  const last = h.t[h.t.length - 1];
  if (last != null && t < last) {
    // simulation was reset
    Object.assign(h, empty(), { version: h.version + 1 });
  } else if (last != null && t - last < MIN_DT_S) {
    return;
  }
  h.t.push(t);
  h.coolant.push(s.telemetry.coolantC);
  h.coolantExp.push(s.expected.coolantC);
  h.oil.push(s.telemetry.oilC);
  h.oilExp.push(s.expected.oilC);
  h.press.push(s.telemetry.oilPressBar);
  h.pressExp.push(s.expected.oilPressBar);
  h.busV.push(s.telemetry.busV);
  h.busVExp.push(s.expected.busV);
  h.rpm.push(s.telemetry.rpm);
  h.health.push(s.analytics?.overallHealth ?? null);
  if (h.t.length > MAX_POINTS) {
    for (const k of Object.keys(h) as (keyof History)[]) {
      const col = h[k];
      if (Array.isArray(col)) col.splice(0, col.length - MAX_POINTS);
    }
  }
  h.version++;
}

let started = false;
/** Start recording once (called by the app shell). */
export function startHistory() {
  if (started) return;
  started = true;
  useSim.subscribe((s) => {
    if (s.snapshot) append(s.snapshot);
  });
}
