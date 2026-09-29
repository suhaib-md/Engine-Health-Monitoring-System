import type { Telemetry } from '../telemetry';
import type { TelemetrySource } from './simSource';

/**
 * CSV replay (Phase 13; review "Hardware roadmap"). Plays recorded telemetry back on the simulated
 * clock: each step returns the newest row at or before the cursor (sample and hold), so a file
 * recorded at the 20 Hz loop rate replays sample for sample and the analytics reach the same
 * conclusions. The time-warp works as usual. At the end the last row is held.
 */
export class ReplaySource implements TelemetrySource {
  private i = 0;
  private cursor: number;

  constructor(
    private readonly rows: Telemetry[],
    readonly name: string,
  ) {
    if (!rows.length) throw new Error('replay needs at least one row');
    this.cursor = rows[0]!.t;
  }

  get done() {
    return this.i >= this.rows.length - 1 && this.cursor >= this.rows[this.rows.length - 1]!.t;
  }

  /** 0..1 through the file */
  get progress() {
    const first = this.rows[0]!.t;
    const last = this.rows[this.rows.length - 1]!.t;
    return last > first ? Math.min(1, (this.cursor - first) / (last - first)) : 1;
  }

  /** the first row (the state before any step) */
  current(): Telemetry {
    return { ...this.rows[this.i]! };
  }

  step(dt: number): Telemetry {
    this.cursor += dt;
    while (this.i < this.rows.length - 1 && this.rows[this.i + 1]!.t <= this.cursor + 1e-9)
      this.i++;
    return { ...this.rows[this.i]! };
  }
}
