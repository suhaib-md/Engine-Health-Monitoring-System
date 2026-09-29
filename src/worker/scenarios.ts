import { HERO_SEED } from '../lib/rng';
import type { Command, ScenarioId, SimSettings } from './protocol';

/**
 * Scripted scenarios. A script is a list of steps that run on the *simulated* clock inside the
 * loop, never on wall time, so a scenario plays identically at 1×, 10× or 60× and on every run
 * (CLAUDE.md rule 6). Each step waits for its `until` condition (if any), then for `after_s`
 * simulated seconds, then applies its commands.
 */

/** Conditions read from what the monitor itself can see (lifecycle, analytics), never from fault state. */
export type Until = 'running' | 'diagnosed';

export interface ScenarioStep {
  title: string;
  caption: string;
  /** simulated seconds to wait (after `until` became true, or after the previous step) */
  after_s: number;
  until?: Until;
  /** give up waiting for `until` after this many simulated seconds */
  maxWait_s?: number;
  commands: Command[];
}

export interface Scenario {
  id: ScenarioId;
  name: string;
  blurb: string;
  seed: number;
  /** controls in force at t = 0 (the engine is built cold at this ambient) */
  initial: SimSettings;
  steps: ScenarioStep[];
}

export const MAX_WAIT_S = 7200;

export const SCENARIOS: Scenario[] = [
  {
    id: 'hero',
    name: 'Hero: cold start to oil-pump wear',
    blurb:
      'Cold start at 20 °C, time-warped warm-up, then the oil pump wears out. About a minute of wall time.',
    seed: HERO_SEED,
    initial: { targetRpm: 800, torque_Nm: 0, ambient_C: 20, fanMode: 'auto', warp: 10 },
    steps: [
      {
        title: 'Cold start',
        caption:
          'The engine cranks and settles at idle. Oil is cold and thick, so pressure reads about 2.5 bar.',
        after_s: 0,
        commands: [{ type: 'start' }],
      },
      {
        title: 'Time-warp warm-up',
        caption:
          'Warp 60×: the coolant climbs to the thermostat point and the oil pressure settles as the oil thins.',
        after_s: 25,
        commands: [{ type: 'set', settings: { warp: 60 } }],
      },
      {
        title: 'Warm, driving at 2,500 rpm',
        caption: 'The engine is warm. Ghost markers sit on the needles: measured equals expected.',
        after_s: 0,
        until: 'running',
        commands: [{ type: 'set', settings: { targetRpm: 2500, torque_Nm: 55, warp: 10 } }],
      },
      {
        title: 'The oil pump starts to wear',
        caption:
          'Pump health drops gradually. Watch the pressure needle leave its ghost while the Twin stays healthy.',
        after_s: 90,
        commands: [{ type: 'injectFault', fault: 'oilPump', severity: 0.6, onset: 'gradual' }],
      },
      {
        title: 'Diagnosis',
        caption:
          'The evidence builds until the alert holds, and the explanation card names the fault and its evidence.',
        after_s: 10,
        until: 'diagnosed',
        commands: [],
      },
    ],
  },
  {
    id: 'overheat',
    name: 'Overheat: cooling loses capacity on a hot day',
    blurb: 'A warm engine at 3,000 rpm, 80 N·m in 38 °C heat while the radiator loses capacity.',
    seed: HERO_SEED,
    initial: { targetRpm: 3000, torque_Nm: 80, ambient_C: 38, fanMode: 'auto', warp: 60 },
    steps: [
      {
        title: 'Start and warm up',
        caption: 'The engine starts under load and warms up at 60×.',
        after_s: 0,
        commands: [{ type: 'start' }],
      },
      {
        title: 'Warm and steady',
        caption: 'Coolant sits at its normal running temperature; the fan cycles as needed.',
        after_s: 30,
        until: 'running',
        commands: [{ type: 'set', settings: { warp: 10 } }],
      },
      {
        title: 'Radiator capacity drops',
        caption: 'Cooling health falls gradually; coolant temperature drifts above the Twin.',
        after_s: 60,
        commands: [{ type: 'injectFault', fault: 'cooling', severity: 0.6, onset: 'gradual' }],
      },
      {
        title: 'Diagnosis',
        caption:
          'The thermal residual persists, the alert escalates, and the card names the cause.',
        after_s: 10,
        until: 'diagnosed',
        commands: [],
      },
    ],
  },
];

export const scenarioById = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;
