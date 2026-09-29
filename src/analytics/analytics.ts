import { PROFILE } from '../engine/profile';
import type { Telemetry } from '../telemetry';
import type { TwinExpected } from '../twin';
import { ANALYTICS } from './config';
import { RESIDUAL_CHANNELS, ResidualTracker, type Features } from './residuals';
import { SpectralAnalyzer, type SpectralFeatures } from './spectral';
import { CHANNEL_LABEL, SensorSanity, type SanityState } from './sanity';
import { STAT_LABEL, Statistics, type StatChannel, type StatsState } from './statistics';
import { RulEstimator, type RulEstimate } from './rul';
import { diagnose } from './diagnosis';
import { criticalOverride, overallHealth, subsystemHealth, subsystemRisks } from './health';
import { HysteresisMachine, levelRank, limitedBy } from './alerts';
import { buildEarlyWarning, buildExplanation, type ExplainContext } from './explain';
import { riskHigh, riskLow } from './risk';
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
 *
 * Order each tick (10 Hz): sensor sanity → residuals on the cleaned telemetry → crank-angle
 * features → statistics (D², CUSUM) → diagnosis → health → alerts → RUL → explanation.
 */

/** Draft §26: cumulative exposure, in simulated seconds weighted by risk. */
export interface Exposure {
  /** ∫ R_T dt, coolant risk 105 → 120 °C */
  highTemp_s: number;
  /** ∫ R_lowP · L dt: low oil pressure counts more under load */
  lowPressureLoad_s: number;
  /** ∫ R_rpm dt, speed risk above the 6,000 rpm redline */
  overspeed_s: number;
  /** running time */
  running_s: number;
}

export interface AnalyticsState {
  t: number;
  running: boolean;
  /** true while alerts are allowed to escalate (running and settled) */
  armed: boolean;
  features: Features;
  /** crank-angle features of the latest window (null while the engine is not running) */
  spectral: SpectralFeatures | null;
  sanity: SanityState;
  stats: StatsState;
  rul: RulEstimate[];
  exposure: Exposure;
  evidence: FaultEvidence[];
  overallHealth: number;
  subsystems: SubsystemHealth[];
  overallLevel: AlertLevel;
  /** Q-57: the subsystem driving a WARNING/CRITICAL level, shown beside the overall health */
  limitedBy: string | null;
  levels: Record<FaultKind, AlertLevel>;
  /** a statistical alarm (D² or CUSUM) is active */
  statWatch: boolean;
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

const UNITS: Record<
  'cooling' | 'lubrication' | 'charging',
  { ch: keyof Features['channels']; unit: string; d: number }
> = {
  cooling: { ch: 'coolantC', unit: '°C', d: 1 },
  lubrication: { ch: 'oilPressBar', unit: 'bar', d: 2 },
  charging: { ch: 'busV', unit: 'V', d: 2 },
};

/** Which fault hypothesis a drifting statistical channel belongs to. */
const KIND_OF: Record<StatChannel, FaultKind> = {
  coolantC: 'cooling',
  oilC: 'lubrication',
  oilPressBar: 'lubrication',
  busV: 'charging',
  vib: 'combustion',
};

const KINDS: readonly FaultKind[] = ['cooling', 'lubrication', 'charging', 'combustion', 'sensor'];

export class Analytics {
  private sanity = new SensorSanity();
  private residuals = new ResidualTracker();
  private machines = Object.fromEntries(KINDS.map((k) => [k, new HysteresisMachine()])) as Record<
    FaultKind,
    HysteresisMachine
  >;
  private spectral = new SpectralAnalyzer();
  private stats = new Statistics();
  private rul = new RulEstimator();
  private alerts: AlertRow[] = [];
  private alertSeq = 0;
  private runningFor_s = 0;
  private reachedOperatingTemp = false;
  private prevD2Alarm = false;
  private rpmHistory: { t: number; rpm: number }[] = [];
  private prevCusum = new Set<StatChannel>();
  private exposure: Exposure = {
    highTemp_s: 0,
    lowPressureLoad_s: 0,
    overspeed_s: 0,
    running_s: 0,
  };
  state: AnalyticsState | null = null;

  private push(a: Omit<AlertRow, 'id' | 'time'>) {
    this.alerts.unshift({ ...a, id: `a${++this.alertSeq}`, time: clock(a.t) });
    if (this.alerts.length > ANALYTICS.maxAlerts) this.alerts.pop();
  }

  update(tel: Telemetry, exp: TwinExpected, dt: number): AnalyticsState {
    // 1. sensor sanity first: readings physics rules out never reach the diagnosis
    const sanity = this.sanity.update(tel, exp, dt);
    const clean: Telemetry = { ...tel };
    for (const c of sanity.rejected) clean[c] = null;

    const f = this.residuals.update(clean, exp, dt);
    const running = tel.rpm > ANALYTICS.runningRpmFraction * PROFILE.speed.idle_rpm;
    this.runningFor_s = running ? this.runningFor_s + dt : 0;
    const armed = running && this.runningFor_s >= ANALYTICS.settleAfterStart_s;

    // INFO: operating temperature reached (only from a trusted coolant reading)
    const coolant = clean.coolantC;
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

    const spectral = this.spectral.update(clean, exp);
    this.rpmHistory.push({ t: tel.t, rpm: tel.rpm });
    while (this.rpmHistory.length && tel.t - this.rpmHistory[0]!.t > ANALYTICS.stats.steadyWindow_s)
      this.rpmHistory.shift();
    const rpms = this.rpmHistory.map((p) => p.rpm);
    const steady =
      this.runningFor_s >= ANALYTICS.stats.steadyWindow_s &&
      Math.max(...rpms) - Math.min(...rpms) < ANALYTICS.stats.steadyBand_rpm;
    const stats = this.stats.update(f, spectral, armed, dt, {
      warm: this.reachedOperatingTemp,
      steady,
    });
    const evidence = diagnose(f, spectral, sanity);
    const override = criticalOverride(f);
    const risks = subsystemRisks(evidence, f, spectral, sanity);
    this.accumulateExposure(f, tel, running, dt);

    for (const e of evidence) {
      const m = this.machines[e.id];
      // the override belongs to the subsystem it comes from
      const ov =
        override.active &&
        ((e.id === 'lubrication' && override.reason.startsWith('Oil')) ||
          (e.id === 'cooling' && override.reason.startsWith('Coolant')));
      const raised = m.update(e.score, dt, armed, ov);
      if (!raised) continue;
      const cls = raised as Exclude<AlertLevel, 'NORMAL'>;
      if (e.id === 'combustion') {
        this.push({
          cls,
          subsystem: 'Combustion',
          title: e.name.toLowerCase(),
          t: tel.t,
          measured: spectral ? `0.5× ${spectral.speed.halfAmp_rpm.toFixed(1)} rpm` : undefined,
          expected: '0.0 rpm',
          residual: spectral ? `ripple ×${spectral.ratios.ripple.toFixed(1)}` : undefined,
          source: 'rule',
        });
      } else if (e.id === 'sensor') {
        const w = sanity.worst;
        const reading = w ? tel[w] : null;
        this.push({
          cls,
          subsystem: 'Sensor',
          title: e.name.toLowerCase(),
          t: tel.t,
          measured:
            w && reading != null
              ? `${CHANNEL_LABEL[w].toLowerCase()} reads ${reading.toFixed(1)}`
              : w
                ? `${CHANNEL_LABEL[w].toLowerCase()} missing`
                : undefined,
          residual: w ? sanity.channels[w].state : undefined,
          source: 'rule',
        });
      } else {
        const u = UNITS[e.id];
        const c = f.channels[u.ch];
        const persist = Math.max(c.persistHigh_s, c.persistLow_s);
        this.push({
          cls,
          subsystem: e.name.split(/[- /]/)[0]!,
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

    // statistical alerts (WATCH-class): rising edges only
    if (stats.d2Alarm && !this.prevD2Alarm && stats.d2 != null) {
      const top = stats.contributions[0];
      this.push({
        cls: 'WATCH',
        subsystem: 'Anomaly',
        title: top
          ? `unusual residual pattern, mostly ${STAT_LABEL[top.channel]} (${(top.share * 100).toFixed(0)} %)`
          : 'unusual residual pattern',
        t: tel.t,
        measured: `D² ${stats.d2.toFixed(1)}`,
        expected: `< ${stats.limit}`,
        source: 'statistical',
      });
    }
    this.prevD2Alarm = stats.d2Alarm;
    for (const c of stats.cusumAlarm)
      if (!this.prevCusum.has(c)) {
        const s = stats.cusum[c];
        this.push({
          cls: 'WATCH',
          subsystem: 'Drift',
          title: `slow drift in ${STAT_LABEL[c]} (CUSUM)`,
          t: tel.t,
          measured: `S ${Math.max(s.pos, s.neg).toFixed(1)}`,
          expected: `h ${stats.h}`,
          source: 'statistical',
        });
      }
    this.prevCusum = new Set(stats.cusumAlarm);

    const levels = Object.fromEntries(KINDS.map((k) => [k, this.machines[k].level])) as Record<
      FaultKind,
      AlertLevel
    >;
    const ruleLevel = (Object.values(levels) as AlertLevel[]).reduce((a, b) =>
      levelRank(b) > levelRank(a) ? b : a,
    );
    const statWatch = armed && (stats.d2Alarm || stats.cusumAlarm.length > 0);
    const overallLevel: AlertLevel = ruleLevel === 'NORMAL' && statWatch ? 'WATCH' : ruleLevel;

    const subsystems = subsystemHealth(risks);
    const rul = this.rul.update(tel.t, subsystems, armed);
    const ctx: ExplainContext = { stats, rul, sanity };

    // The explanation follows the most severe active alert (ties → highest evidence); with no
    // rule alert, a statistical alarm gives an early warning named after the drifting signal.
    const active = evidence
      .filter((e) => levels[e.id] !== 'NORMAL')
      .sort((a, b) => levelRank(levels[b.id]) - levelRank(levels[a.id]) || b.score - a.score);
    const top = active[0];
    let explanation: Explanation | null = null;
    if (top) {
      explanation = buildExplanation(
        top,
        levels[top.id],
        evidence.filter((e) => e !== top),
        ctx,
      );
    } else if (statWatch) {
      const zNow = (c: StatChannel) =>
        c === 'vib'
          ? Math.abs(((spectral?.ratios.rms ?? 1) - 1) / ANALYTICS.stats.vibSigmaRel)
          : Math.abs(f.channels[c].z);
      const ch =
        // the drifting signal: the alarmed channel whose residual is largest right now
        [...stats.cusumAlarm].sort((a, b) => zNow(b) - zNow(a))[0] ??
        stats.contributions[0]?.channel;
      if (ch)
        explanation = buildEarlyWarning(
          ch,
          evidence.find((e) => e.id === KIND_OF[ch]),
          ctx,
        );
    }

    this.state = {
      t: tel.t,
      running,
      armed,
      features: f,
      spectral,
      sanity,
      stats,
      rul,
      exposure: { ...this.exposure },
      evidence,
      overallHealth: overallHealth(risks),
      subsystems,
      overallLevel,
      limitedBy: limitedBy(
        levels,
        overallLevel,
        Object.fromEntries(evidence.map((e) => [e.id, e.score])),
      ),
      levels,
      statWatch,
      alerts: [...this.alerts],
      explanation,
    };
    return this.state;
  }

  /** Draft §26 exposure counters: they drive maintenance advice without claiming a fatigue life. */
  private accumulateExposure(f: Features, tel: Telemetry, running: boolean, dt: number) {
    if (!running) return;
    const e = this.exposure;
    e.running_s += dt;
    const c = f.channels.coolantC;
    if (c.valid && c.measured != null)
      e.highTemp_s +=
        dt * riskHigh(c.measured, ANALYTICS.coolantAbs_C.warn, ANALYTICS.coolantAbs_C.crit);
    if (f.channels.oilPressBar.valid)
      e.lowPressureLoad_s +=
        dt *
        riskLow(f.pressRatio, ANALYTICS.pressRatio.warn, ANALYTICS.pressRatio.crit) *
        Math.max(0, tel.load);
    e.overspeed_s += dt * riskHigh(tel.rpm, PROFILE.speed.max_rpm, PROFILE.speed.max_rpm + 500);
  }
}

/** Residual channels (re-exported for the UI's sensor-status list). */
export const MONITORED_CHANNELS = RESIDUAL_CHANNELS;
