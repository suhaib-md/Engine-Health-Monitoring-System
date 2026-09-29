import type { FaultOnset, PlantFaultId } from '../plant';
import type { SimSettings } from './protocol';

/**
 * Blind-mode deck (review, Features: "a judge secretly picks a fault"). Each card is a hidden
 * fault the Plant can develop. The deck is shuffled with the seeded RNG inside the worker and the
 * UI only ever learns the card's position, never its content, until the reveal. The answer is
 * compared with the monitor's explanation, which is computed from telemetry alone.
 */
export interface BlindCard {
  fault: PlantFaultId;
  severity: number;
  onset: FaultOnset;
  /** what a human would call it */
  label: string;
  /** the explanation-card title that counts as a correct diagnosis */
  expected: string;
}

export const BLIND_DECK: readonly BlindCard[] = [
  {
    fault: 'oilPump',
    severity: 0.6,
    onset: 'gradual',
    label: 'Oil-pump wear (health 0.55)',
    expected: 'Lubrication-system degradation',
  },
  {
    fault: 'cooling',
    severity: 0.9,
    onset: 'gradual',
    label: 'Radiator losing capacity (health 0.28)',
    expected: 'Cooling-system degradation',
  },
  ...([1, 2, 3, 4] as const).map((c): BlindCard => ({
    fault: `misfire${c}`,
    severity: 1,
    onset: 'instant',
    label: `Cylinder ${c} misfire`,
    expected: `Cylinder ${c} misfire`,
  })),
];

/**
 * Operating point for the challenge: part load, where every card is detectable, at 10× so the
 * slowest card (pump wear, WARNING about 107 simulated seconds after the pick) takes ~11 s of wall time.
 */
export const BLIND_SETTINGS: Partial<SimSettings> = { targetRpm: 3000, torque_Nm: 80, warp: 10 };
