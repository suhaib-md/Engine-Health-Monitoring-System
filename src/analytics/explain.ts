import type { AlertLevel, Explanation, FaultEvidence, Status } from './types';

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
};

/**
 * Explanation card in the draft §35.5 order: probable fault, severity, why, action, model status.
 * Only built once the fault's alert machine has reached WATCH or above.
 */
export function buildExplanation(
  top: FaultEvidence,
  level: AlertLevel,
  others: FaultEvidence[],
): Explanation | null {
  if (level === 'NORMAL') return null;
  const why = top.symptoms
    .filter((s) => s.risk >= 0.05)
    .sort((a, b) => b.risk * b.weight - a.risk * a.weight)
    .map((s) => ({ text: s.text, status: riskStatus(s.risk) }));
  if (others.every((o) => o.score < 0.3)) why.push({ text: OTHER_SIGNALS[top.id], status: 'ok' });

  const ev = evidenceLabel(top.score);
  return {
    fault: top.name,
    severity: top.score > 0.75 ? 'High' : top.score > 0.55 ? 'Medium' : 'Low',
    alert: level,
    evidence: top.score,
    why,
    action: top.action,
    model: {
      physics: ev === 'strong' ? 'strong match' : ev === 'probable' ? 'match' : 'partial match',
      anomaly: 'Mahalanobis D² — arrives in Phase 9',
      anomalyStatus: 'invalid',
      rul: 'trend estimate — arrives in Phase 9',
    },
  };
}
