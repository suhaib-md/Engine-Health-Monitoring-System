import { ANALYTICS } from './config';
import type { AlertLevel } from './types';

/**
 * Hysteresis + persistence (draft §23). Never alert on one noisy sample:
 *   NORMAL → WATCH     score > 0.30 for 5 s
 *   WATCH  → WARNING   score > 0.55 for 10 s
 *   WARNING→ CRITICAL  score > 0.85 for 5 s
 * A level clears (one step down) when the score stays below (enter − 0.15) for 20 s, so
 * WARNING clears below 0.40, as in the draft. Times are simulated seconds (Q-18).
 * A critical override (draft §22.2) held for 2 s jumps straight to CRITICAL.
 */
/** tolerance so N steps of dt reach an N·dt hold despite float rounding */
const EPS = 1e-6;
const LEVELS: AlertLevel[] = ['NORMAL', 'WATCH', 'WARNING', 'CRITICAL'];

export class HysteresisMachine {
  private levelIdx = 0;
  private upTimer = 0;
  private downTimer = 0;
  private overrideTimer = 0;

  get level(): AlertLevel {
    return LEVELS[this.levelIdx]!;
  }

  /**
   * Advance by dt with the current evidence score. `armed` = false (engine not running or
   * still settling) freezes escalation so start-up transients never alert.
   * Returns the new level if it went UP this step, else null.
   */
  update(score: number, dt: number, armed: boolean, override = false): AlertLevel | null {
    const cfg = ANALYTICS.levels;
    let raised: AlertLevel | null = null;

    if (armed && override) {
      this.overrideTimer += dt;
      if (this.overrideTimer >= ANALYTICS.overrideHold_s - EPS && this.levelIdx < 3) {
        this.levelIdx = 3;
        this.upTimer = this.downTimer = 0;
        return 'CRITICAL';
      }
    } else {
      this.overrideTimer = 0;
    }

    const next = cfg[this.levelIdx]; // threshold to go from levelIdx → levelIdx + 1
    if (armed && next && score > next.enter) {
      this.upTimer += dt;
      if (this.upTimer >= next.hold_s - EPS) {
        this.levelIdx++;
        this.upTimer = 0;
        this.downTimer = 0;
        raised = this.level;
      }
    } else {
      this.upTimer = 0;
    }

    const current = cfg[this.levelIdx - 1];
    if (current && !override && score < current.enter - ANALYTICS.clearMargin) {
      this.downTimer += dt;
      if (this.downTimer >= ANALYTICS.clearHold_s - EPS) {
        this.levelIdx--;
        this.downTimer = 0;
      }
    } else {
      this.downTimer = 0;
    }
    return raised;
  }

  reset() {
    this.levelIdx = 0;
    this.upTimer = this.downTimer = this.overrideTimer = 0;
  }
}

export const levelRank = (l: AlertLevel) => LEVELS.indexOf(l);
