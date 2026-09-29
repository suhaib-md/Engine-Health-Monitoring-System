import type { SanityState } from './sanity';
import { CHANNEL_LABEL } from './sanity';
import { STAT_LABEL, type StatChannel, type StatsState } from './statistics';
import type { RulEstimate } from './rul';
import type {
  AlertLevel,
  Explanation,
  FaultEvidence,
  FaultKind,
  Status,
  SubsystemId,
} from './types';

/** Symptom risk → status colour, same bands as the evidence classes (CLAUDE.md rule 9). */
export function riskStatus(r: number): Status {
  if (r > 0.75) return 'crit';
  if (r > 0.55) return 'warn';
  if (r >= 0.3) return 'watch';
  return 'ok';
}

export function evidenceLabel(s: number) {
  if (s > 0.75) return 'strong';
  if (s > 0.55) return 'probable';
  if (s >= 0.3) return 'possible';
  return 'weak';
}

const OTHER_SIGNALS: Record<FaultEvidence['id'], string> = {
  cooling: 'Oil-pressure and electrical signals do not explain it',
  lubrication: 'Cooling and electrical signals do not explain it',
  charging: 'Thermal and lubrication signals do not explain it',
  combustion: 'Oil-pressure and cooling behaviour remain normal',
  sensor:
    'The other sensors and the Twin agree with each other: the engine did not change, the sensor did',
};

/** Which statistical channels speak for which fault hypothesis (for "model agreement"). */
const CHANNELS_OF: Record<FaultKind, readonly StatChannel[]> = {
  cooling: ['coolantC'],
  lubrication: ['oilPressBar', 'oilC'],
  charging: ['busV'],
  combustion: ['vib'],
  sensor: [],
};

/** Everything besides the fault evidence that the card reports on. */
export interface ExplainContext {
  stats: StatsState | null;
  rul: RulEstimate[];
  sanity: SanityState | null;
}

export function anomalyLine(stats: StatsState | null): { text: string; status: Status } {
  if (!stats || stats.phase === 'waiting')
    return {
      text: 'D² baseline not learned yet (needs 60 s of settled running)',
      status: 'invalid',
    };
  if (stats.phase === 'learning')
    return {
      text: `learning the healthy baseline · ${(stats.progress * 100).toFixed(0)} %`,
      status: 'invalid',
    };
  if (stats.d2 == null) return { text: 'D² paused: a sensor is excluded', status: 'invalid' };
  const top = stats.contributions[0];
  return {
    text: `D² ${stats.d2.toFixed(1)} vs ${stats.limit} (χ²₅ 99 %)${
      stats.d2Alarm && top
        ? ` · anomalous, ${STAT_LABEL[top.channel]} ${(top.share * 100).toFixed(0)} %`
        : ''
    }`,
    status: stats.d2Alarm ? 'warn' : 'ok',
  };
}

const rulFor = (rul: RulEstimate[], id: SubsystemId) => rul.find((r) => r.subsystem === id);

function uncertainty(
  top: FaultEvidence,
  ruleActive: boolean,
  ctx: ExplainContext,
): Explanation['uncertainty'] {
  const worst = ctx.sanity?.worst ?? null;
  const dataQuality =
    top.id === 'sensor'
      ? 'the faulty sensor is excluded; the others are good'
      : worst
        ? `degraded: ${CHANNEL_LABEL[worst].toLowerCase()} sensor excluded`
        : 'good';
  const chans = CHANNELS_OF[top.id];
  const indicators = [
    ruleActive,
    !!ctx.stats?.d2Alarm,
    chans.some((c) => ctx.stats?.cusumAlarm.includes(c)),
    !!rulFor(ctx.rul, top.subsystem)?.significant,
  ];
  const agree = indicators.filter(Boolean).length;
  const agreement =
    top.id === 'sensor'
      ? 'physics check (rate limit / stuck / dropout / cross-check)'
      : `${agree}/4 indicators agree (rules, D², CUSUM, trend)`;
  const level = top.id !== 'sensor' && agree >= 3 && dataQuality === 'good' ? 'Medium' : 'High';
  return { evidence: evidenceLabel(top.score), dataQuality, agreement, level };
}

/**
 * Explanation card in the draft §35.5 order: probable fault, severity, why, action, model status,
 * plus the draft §46 uncertainty block. Only built once the fault's alert machine is WATCH or above.
 */
export function buildExplanation(
  top: FaultEvidence,
  level: AlertLevel,
  others: FaultEvidence[],
  ctx: ExplainContext = { stats: null, rul: [], sanity: null },
): Explanation | null {
  if (level === 'NORMAL') return null;
  const why = top.symptoms
    .filter((s) => s.risk >= 0.05)
    .sort((a, b) => b.risk * b.weight - a.risk * a.weight)
    .map((s) => ({ text: s.text, status: riskStatus(s.risk) }));
  if (others.every((o) => o.score < 0.3)) why.push({ text: OTHER_SIGNALS[top.id], status: 'ok' });

  const ev = evidenceLabel(top.score);
  const a = anomalyLine(ctx.stats);
  const r = rulFor(ctx.rul, top.subsystem);
  return {
    fault: top.name,
    severity: top.score > 0.75 ? 'High' : top.score > 0.55 ? 'Medium' : 'Low',
    alert: level,
    evidence: top.score,
    why,
    action: top.action,
    model: {
      physics: ev === 'strong' ? 'strong match' : ev === 'probable' ? 'match' : 'partial match',
      anomaly: a.text,
      anomalyStatus: a.status,
      rul:
        top.id === 'sensor'
          ? 'not applicable (sensor fault)'
          : (r?.text ?? 'collecting trend data'),
    },
    uncertainty: uncertainty(top, true, ctx),
  };
}

/**
 * Early warning from the statistical layer while no rule has tripped: CUSUM saw a small persistent
 * shift, or D² an unusual combination. Named after the drifting signal, never after a fault.
 */
export function buildEarlyWarning(
  channel: StatChannel,
  related: FaultEvidence | undefined,
  ctx: ExplainContext,
): Explanation {
  const stats = ctx.stats!;
  const c = stats.cusum[channel];
  const side = c.neg > c.pos ? 'below' : 'above';
  const why: Explanation['why'] = [];
  if (stats.cusumAlarm.includes(channel))
    why.push({
      text: `CUSUM on ${STAT_LABEL[channel]}: S = ${Math.max(c.pos, c.neg).toFixed(1)} > h = ${stats.h}, a small persistent shift ${side} the Twin`,
      status: 'watch',
    });
  const a = anomalyLine(stats);
  why.push({ text: a.text, status: stats.d2Alarm ? 'watch' : 'ok' });
  for (const s of related?.symptoms ?? [])
    if (s.risk >= 0.05) why.push({ text: s.text, status: riskStatus(s.risk) });
  why.push({ text: 'No rule threshold has tripped yet', status: 'ok' });
  const top: FaultEvidence = related ?? {
    id: 'combustion',
    name: '',
    subsystem: 'vibration',
    score: 0,
    symptoms: [],
    action: '',
  };
  const r = rulFor(ctx.rul, top.subsystem);
  return {
    fault: `Early warning: ${STAT_LABEL[channel]} drifting ${side} expectation`,
    severity: 'Low',
    alert: 'WATCH',
    evidence: top.score,
    why,
    action:
      'No limit is exceeded yet. Keep watching this trend and inspect the related system at the next stop.',
    model: {
      physics: 'no rule tripped',
      anomaly: a.text,
      anomalyStatus: a.status,
      rul: r?.text ?? 'collecting trend data',
    },
    uncertainty: uncertainty(top, false, ctx),
  };
}
