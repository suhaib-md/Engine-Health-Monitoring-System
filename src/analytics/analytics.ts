import { PROFILE } from '../engine/profile';
import type { Telemetry } from '../telemetry';
import type { TwinExpected } from '../twin';
import { ANALYTICS } from './config';
import { ResidualTracker, type Features } from './residuals';
import { diagnose } from './diagnosis';
import { criticalOverride, overallHealth, subsystemHealth, subsystemRisks } from './health';
import { HysteresisMachine, levelRank } from './alerts';
import { buildExplanation } from './explain';
import type {
  AlertLevel,
  AlertRow,
  Explanation,
  FaultEvidence,
  FaultKind,
  SubsystemHealth,
} from './types';

/**
 * The analytics pipeline. Input: Telemetry + TwinExpected. Output: plain data for the UI.
 * It never sees the Plant or its faults (CLAUDE.md rule 1; enforced by lint).
 */

export interface AnalyticsState {
  t: number;
  running: boolean;
  /** true while alerts are allowed to escalate (running and settled) */
  armed: boolean;
  features: Features;
  evidence: FaultEvidence[];
  overallHealth: number;
  subsystems: SubsystemHealth[];
  overallLevel: AlertLevel;
  levels: Record<FaultKind, AlertLevel>;
  alerts: AlertRow[];
  explanation: Explanation | null;
}

const clock = (t: number) => {
  const s = Math.floor(t);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `T+${h}:${mm}:${ss}` : `T+${mm}:${ss}`;
};

const UNITS: Record<FaultKind, { ch: keyof Features['channels']; unit: string; d: number }> = {
  cooling: { ch: 'coolantC', unit: '°C', d: 1 },
  lubrication: { ch: 'oilPressBar', unit: 'bar', d: 2 },
  charging: { ch: 'busV', unit: 'V', d: 2 },
};

export class Analytics {
  private residuals = new ResidualTracker();
  private machines: Record<FaultKind, HysteresisMachine> = {
    cooling: new HysteresisMachine(),
    lubrication: new HysteresisMachine(),
    charging: new HysteresisMachine(),
  };
  private alerts: AlertRow[] = [];
  private alertSeq = 0;
  private runningFor_s = 0;
  private reachedOperatingTemp = false;
  state: AnalyticsState | null = null;

  private push(a: Omit<AlertRow, 'id' | 'time'>) {
    this.alerts.unshift({ ...a, id: `a${++this.alertSeq}`, time: clock(a.t) });
    if (this.alerts.length > ANALYTICS.maxAlerts) this.alerts.pop();
  }

  update(tel: Telemetry, exp: TwinExpected, dt: number): AnalyticsState {
    const f = this.residuals.update(tel, exp, dt);
    const running = tel.rpm > ANALYTICS.runningRpmFraction * PROFILE.speed.idle_rpm;
    this.runningFor_s = running ? this.runningFor_s + dt : 0;
    const armed = running && this.runningFor_s >= ANALYTICS.settleAfterStart_s;

    // INFO: operating temperature reached
    const coolant = tel.coolantC;
    if (
      running &&
      !this.reachedOperatingTemp &&
      coolant != null &&
      coolant >= ANALYTICS.operatingTemp_C
    ) {
      this.reachedOperatingTemp = true;
      this.push({
        cls: 'INFO',
        subsystem: 'Thermal',
        title: 'engine reached operating temperature',
        t: tel.t,
        measured: `coolant ${coolant.toFixed(0)} °C`,
        source: 'rule',
      });
    }

    const evidence = diagnose(f);
    const override = criticalOverride(f);
    const risks = subsystemRisks(evidence, f);

    for (const e of evidence) {
      const m = this.machines[e.id];
      // the override belongs to the subsystem it comes from
      const ov =
        override.active &&
        ((e.id === 'lubrication' && override.reason.startsWith('Oil')) ||
          (e.id === 'cooling' && override.reason.startsWith('Coolant')));
      const raised = m.update(e.score, dt, armed, ov);
      if (raised) {
        const u = UNITS[e.id];
        const c = f.channels[u.ch];
        const persist = Math.max(c.persistHigh_s, c.persistLow_s);
        this.push({
          cls: raised as Exclude<AlertLevel, 'NORMAL'>,
          subsystem: e.name.split(/[- ]/)[0]!,
          title: ov && raised === 'CRITICAL' ? override.reason : e.name.toLowerCase(),
          t: tel.t,
          measured: c.measured == null ? undefined : c.measured.toFixed(u.d),
          expected: `${c.expected.toFixed(u.d)} ${u.unit}`,
          residual: `z ${c.z >= 0 ? '+' : '−'}${Math.abs(c.z).toFixed(1)}`,
          persistence: persist > 0 ? `${persist.toFixed(0)} s` : undefined,
          source: 'rule',
        });
      }
    }

    const levels = {
      cooling: this.machines.cooling.level,
      lubrication: this.machines.lubrication.level,
      charging: this.machines.charging.level,
    };
    const overallLevel = (Object.values(levels) as AlertLevel[]).reduce((a, b) =>
      levelRank(b) > levelRank(a) ? b : a,
    );

    // The explanation follows the most severe active alert (ties → highest evidence).
    const active = evidence
      .filter((e) => levels[e.id] !== 'NORMAL')
      .sort((a, b) => levelRank(levels[b.id]) - levelRank(levels[a.id]) || b.score - a.score);
    const top = active[0];
    const explanation = top
      ? buildExplanation(
          top,
          levels[top.id],
          evidence.filter((e) => e !== top),
        )
      : null;

    this.state = {
      t: tel.t,
      running,
      armed,
      features: f,
      evidence,
      overallHealth: overallHealth(risks),
      subsystems: subsystemHealth(risks),
      overallLevel,
      levels,
      alerts: [...this.alerts],
      explanation,
    };
    return this.state;
  }
}
