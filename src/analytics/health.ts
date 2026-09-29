import { ANALYTICS, SUBSYSTEM_WEIGHTS } from './config';
import { riskHigh, riskLow } from './risk';
import type { Features } from './residuals';
import type { SpectralFeatures } from './spectral';
import type { FaultEvidence, SubsystemHealth, SubsystemId } from './types';

/**
 * Health scoring (draft §21–22, §38): each subsystem has a risk R ∈ [0,1] → health 100(1 − R);
 * overall H = 100 (1 − Σ w R / Σ w) over the subsystems that are monitored.
 */

const NAMES: Record<SubsystemId, string> = {
  lubrication: 'Lubrication',
  thermal: 'Thermal',
  vibration: 'Mechanical vibration',
  combustion: 'Combustion',
  electrical: 'Electrical',
  sensors: 'Sensor integrity',
};

export type SubsystemRisks = Record<SubsystemId, number | null>;

/** Overall health from subsystem risks; null (not monitored) subsystems drop out of the weights. */
export function overallHealth(risks: SubsystemRisks): number {
  let w = 0;
  let wr = 0;
  for (const id of Object.keys(SUBSYSTEM_WEIGHTS) as SubsystemId[]) {
    const r = risks[id];
    if (r == null) continue;
    w += SUBSYSTEM_WEIGHTS[id];
    wr += SUBSYSTEM_WEIGHTS[id] * r;
  }
  return w > 0 ? 100 * (1 - wr / w) : 100;
}

export function subsystemRisks(
  evidence: FaultEvidence[],
  f: Features,
  s: SpectralFeatures | null = null,
): SubsystemRisks {
  const byId = (id: FaultEvidence['id']) => evidence.find((e) => e.id === id)?.score ?? 0;
  const coolant = f.channels.coolantC.measured;
  const absThermal =
    coolant == null
      ? 0
      : riskHigh(coolant, ANALYTICS.coolantAbs_C.warn, ANALYTICS.coolantAbs_C.crit);
  return {
    thermal: Math.max(byId('cooling'), absThermal),
    lubrication: byId('lubrication'),
    electrical: byId('charging'),
    // monitored once the crank-angle windows arrive (engine running)
    vibration: s
      ? riskHigh(s.ratios.rms, ANALYTICS.misfire.vibRatio.warn, ANALYTICS.misfire.vibRatio.crit)
      : null,
    combustion: s ? byId('combustion') : null,
    sensors: f.dropped.length / 4,
  };
}

export function subsystemHealth(risks: SubsystemRisks): SubsystemHealth[] {
  return (Object.keys(SUBSYSTEM_WEIGHTS) as SubsystemId[]).map((id) => ({
    id,
    name: NAMES[id],
    weight: SUBSYSTEM_WEIGHTS[id],
    health: risks[id] == null ? null : 100 * (1 - risks[id]!),
  }));
}

/**
 * Critical overrides (draft §22.2): one catastrophic signal must not hide inside a weighted
 * average. True when oil pressure has collapsed or coolant is past the critical limit.
 */
export function criticalOverride(f: Features): { active: boolean; reason: string } {
  const pressRisk = riskLow(f.pressRatio, ANALYTICS.pressRatio.warn, ANALYTICS.pressRatio.crit);
  if (f.channels.oilPressBar.valid && pressRisk > 0.95)
    return { active: true, reason: 'Oil pressure collapsed against expectation' };
  const c = f.channels.coolantC.measured;
  if (c != null && riskHigh(c, ANALYTICS.coolantAbs_C.warn, ANALYTICS.coolantAbs_C.crit) > 0.95)
    return { active: true, reason: `Coolant ${c.toFixed(0)} °C beyond the critical limit` };
  return { active: false, reason: '' };
}
