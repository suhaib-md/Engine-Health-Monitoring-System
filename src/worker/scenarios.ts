import { HERO_SEED } from '../lib/rng';
import type { Command, ScenarioId, SimSettings } from './protocol';

/**
 * Scripted scenarios. A script is a list of steps that run on the *simulated* clock inside the
 * loop, never on wall time, so a scenario plays identically at 1×, 10× or 60× and on every run
 * (CLAUDE.md rule 6). Each step waits for its `until` condition (if any), then for `after_s`
 * simulated seconds, then applies its commands.
 */

/** Conditions read from what the monitor itself can see (lifecycle, analytics), never from fault state. */
export type Until =
  | 'running'
  | 'diagnosed'
  /** the explanation card names exactly this fault, at WARNING or worse */
  | { fault: string };

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

/**
 * Hot-city stop-and-go (Phase 10): 40 °C ambient, 60 s of driving then 60 s at the lights, over
 * and over. Four healthy cycles show the fan working hard with no false alarms; then the radiator
 * starts to clog and keeps getting worse ('wears on', faster in the heat), so the monitor names the
 * cooling fault and a thermal RUL appears.
 */
function hotCity(): Scenario {
  const drive: Command = { type: 'set', settings: { targetRpm: 3500, torque_Nm: 160 } };
  const idle: Command = { type: 'set', settings: { targetRpm: 800, torque_Nm: 0 } };
  const cycle = (n: number, clogging: boolean): ScenarioStep[] => [
    {
      title: clogging ? `Stop-and-go ${n} · radiator clogging` : `Stop-and-go ${n} · driving`,
      caption: clogging
        ? 'Coolant sits above the Twin a little more each cycle. Stop-and-go makes the trend noisy, so an RUL appears only if it is statistically significant.'
        : 'Drive hard at 3,500 rpm / 160 N·m in 40 °C heat. The fan cycles; the Twin follows it, so no alarm.',
      after_s: 60,
      commands: [drive],
    },
    {
      title: clogging ? `Stop-and-go ${n} · at the lights` : `Stop-and-go ${n} · at the lights`,
      caption: 'Idle at the lights. Transients pause the statistics; the rules keep watching.',
      after_s: 60,
      commands: [idle],
    },
  ];
  return {
    id: 'hotCity',
    name: 'Hot city: stop-and-go at 40 °C',
    blurb:
      '40 °C ambient, 60 s driving then 60 s idling. Healthy for four cycles, then the radiator starts to clog.',
    seed: HERO_SEED,
    initial: { targetRpm: 800, torque_Nm: 0, ambient_C: 40, fanMode: 'auto', warp: 60 },
    steps: [
      {
        title: 'Hot start',
        caption: 'The engine starts in 40 °C heat and warms up at 60×.',
        after_s: 0,
        commands: [{ type: 'start' }],
      },
      {
        title: 'Warm: into the traffic',
        caption: 'Operating temperature reached. The time-warp drops to 10× for the stop-and-go.',
        after_s: 0,
        until: 'running',
        commands: [{ type: 'set', settings: { warp: 10 } }],
      },
      ...[1, 2, 3, 4].flatMap((n) => cycle(n, false)),
      {
        title: 'The radiator starts to clog',
        caption: 'Cooling capacity begins to fall and keeps falling, faster under heat and load.',
        after_s: 0,
        commands: [{ type: 'injectFault', fault: 'cooling', severity: 0.3, onset: 'progressive' }],
      },
      ...[5, 6, 7].flatMap((n) => cycle(n, true)),
      {
        title: 'Diagnosis',
        caption:
          'The thermal residual holds, the alert escalates and the card names the cooling system.',
        after_s: 0,
        until: 'diagnosed',
        maxWait_s: 1800,
        commands: [],
      },
    ],
  };
}

/**
 * The five-minute demo as one button (review "Demo script" steps 2–6). Every moment waits on what
 * the MONITOR concluded, so it plays identically each time and never runs ahead of the evidence.
 * Pause it (the strip's Pause button) to talk; the script runs on simulated time. A step's
 * `after_s` is how long the PREVIOUS caption stays up before this step fires.
 */
function tour(): Scenario {
  return {
    id: 'tour',
    name: 'Full demo tour (≈5 min)',
    blurb:
      'Cold start → oil pump caught early by CUSUM → RUL → cylinder 3 misfire named by its phase → coolant sensor spike proven impossible.',
    seed: HERO_SEED,
    initial: { targetRpm: 800, torque_Nm: 0, ambient_C: 20, fanMode: 'auto', warp: 1 },
    steps: [
      {
        title: '1 · Cold start',
        caption:
          'Real time. Cold oil is thick, so pressure reads about 2.5 bar. Pistons move by the slider-crank equation, slowed 100× on screen. Ghost markers sit on the needles: measured equals expected.',
        after_s: 0,
        commands: [{ type: 'start' }],
      },
      {
        title: '2 · Time-warp warm-up',
        caption:
          'Warp 60×: half an hour of warm-up in half a minute. Pressure settles as the oil thins. The monitor learns its healthy baseline once warm.',
        after_s: 20,
        commands: [{ type: 'set', settings: { warp: 60 } }],
      },
      {
        title: '3 · Warm and steady at 3,000 rpm',
        caption: 'Measured equals expected on every channel. D² sits under its χ² limit.',
        after_s: 0,
        until: 'running',
        commands: [{ type: 'set', settings: { targetRpm: 3000, torque_Nm: 80, warp: 10 } }],
      },
      {
        title: '4 · The oil pump starts to wear',
        caption:
          'A small, growing pump fault. Watch CUSUM flag the oil pressure while it still looks acceptable, then the rules follow and the card lists its evidence. Click the oil-pressure value to show the math.',
        after_s: 90,
        commands: [{ type: 'injectFault', fault: 'oilPump', severity: 0.25, onset: 'progressive' }],
      },
      {
        title: '5 · Diagnosis and prognosis',
        caption:
          'The card names lubrication and the RUL appears with its band, in simulated time at the current load.',
        after_s: 0,
        until: { fault: 'Lubrication-system degradation' },
        commands: [],
      },
      {
        title: '6 · Repair, then a cylinder 3 misfire',
        caption:
          'Turn the sound on: one exhaust pulse in four goes missing. The polar dot jumps to the cylinder 3 sector and the governor asks for 4/3 of the torque (110 → 146 N·m).',
        after_s: 90,
        commands: [
          { type: 'clearFaults' },
          { type: 'injectFault', fault: 'misfire3', severity: 1, onset: 'instant' },
        ],
      },
      {
        title: '7 · Cylinder 3 named',
        caption: 'Named from the phase of the half-order component alone. Open the Vibration page.',
        after_s: 0,
        until: { fault: 'Cylinder 3 misfire' },
        commands: [],
      },
      {
        title: '8 · A coolant sensor spikes by 25 °C',
        caption:
          'The monitor refuses to believe it: 25 °C in 0.1 s is 250 K/s, over 300 times what the energy balance allows. The engine did not overheat; the sensor failed.',
        after_s: 20,
        commands: [
          { type: 'clearFaults' },
          { type: 'injectSensorFault', channel: 'coolantC', kind: 'spike' },
        ],
      },
      {
        title: '9 · Sensor fault proven',
        caption:
          'Same telemetry interface for ESP32 sensors or OBD-II. Print the maintenance report from the Report page.',
        after_s: 0,
        until: { fault: 'Coolant sensor fault' },
        commands: [],
      },
    ],
  };
}

export const SCENARIOS: Scenario[] = [
  tour(),
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
  hotCity(),
];

export const scenarioById = (id: ScenarioId) => SCENARIOS.find((s) => s.id === id)!;
