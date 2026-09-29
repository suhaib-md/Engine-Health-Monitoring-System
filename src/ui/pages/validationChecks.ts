import { PROFILE } from '../../engine/profile';
import {
  angleWindow,
  evaluateEngine,
  maxCoolantRate_Kps,
  oilPressure_bar,
  rpmToRadps,
  secondaryForcePeak_N,
  simulateCrank,
  stepThermal,
  type CombustionHealth,
  type ThermalState,
} from '../../physics';
import { orderAmp, orderPhase_deg, orderSpectrum } from '../../analytics/fft';
import { ANALYTICS, overallHealth } from '../../analytics';
import { chi2Quantile, cusumSamplesToFlag } from '../../lib/stats';

/**
 * In-app validation rows: the hand-calculated golden value beside what the model computes
 * right now. Mirrors the Vitest suites in src/physics/*.test.ts (CLAUDE.md "Golden numbers").
 */
export interface Check {
  check: string;
  expected: number;
  unit: string;
  decimals: number;
  phase: number;
  /** absolute tolerance instead of the 2 % rule (used for angles) */
  tolAbs?: number;
  /** undefined until that phase's physics exists */
  model?: () => number;
}

const hot: ThermalState = { coolant_C: 90, oil_C: 100, fanOn: false };
const at3000 = { rpm: 3000, brakeTorque_Nm: 80, ambient_C: 30 };

function settleCoolant() {
  let s: ThermalState = { coolant_C: 90, oil_C: 95, fanOn: false };
  const dt = PROFILE.sim.slowDt_s;
  for (let i = 0; i < 7200 / dt; i++) s = stepThermal(s, at3000, dt);
  return s.coolant_C;
}

/**
 * The review's misfire table: 3,000 rpm, 80 N·m brake load. The review's resisting torque is a
 * rounded 110 N·m; the live app computes 111.5 N·m (friction + accessories), within the 2 % rule.
 */
const REVIEW_RESIST_Nm = 110;
function crank(health: CombustionHealth) {
  const run = simulateCrank({ rpm: 3000, resist_Nm: REVIEW_RESIST_Nm, health });
  const rpm = Float64Array.from(run.omega, (w) => (w * 30) / Math.PI);
  const spec = orderSpectrum(angleWindow(rpm), PROFILE.crank.windowRevs);
  return {
    pp: Math.max(...rpm) - Math.min(...rpm),
    amp: orderAmp(spec, 0.5),
    phase: orderPhase_deg(spec, 0.5),
    cmd: run.torqueCmd_Nm,
  };
}
const one = (cyl: number, h: number) =>
  [1, 2, 3, 4].map((c) => (c === cyl ? h : 1)) as unknown as CombustionHealth;
const healthy = () => crank([1, 1, 1, 1]);
const out = (cyl: number, h = 0) => crank(one(cyl, h));

export const CHECKS: Check[] = [
  {
    check: 'ω at 3,000 rpm',
    expected: 314.16,
    unit: 'rad/s',
    decimals: 2,
    phase: 1,
    model: () => rpmToRadps(3000),
  },
  {
    check: 'Fuel power · 3,000 rpm / 80 N·m',
    expected: 110.8,
    unit: 'kW',
    decimals: 1,
    phase: 1,
    model: () => evaluateEngine(hot, at3000).fuelPower_W / 1e3,
  },
  {
    check: 'Coolant heat · 3,000 rpm / 80 N·m',
    expected: 31.9,
    unit: 'kW',
    decimals: 1,
    phase: 1,
    model: () => evaluateEngine(hot, at3000).coolantHeat_W / 1e3,
  },
  {
    check: 'Steady coolant · 3,000 rpm / 80 N·m',
    expected: 93,
    unit: '°C',
    decimals: 1,
    phase: 1,
    model: settleCoolant,
  },
  {
    check: 'Oil pressure · cold start 20 °C',
    expected: 2.54,
    unit: 'bar',
    decimals: 2,
    phase: 1,
    model: () => oilPressure_bar({ rpm: 800, oil_C: 20, pumpHealth: 1, bearingWear: 0 }),
  },
  {
    check: 'Oil pressure · pump 0.4, hot idle',
    expected: 0.56,
    unit: 'bar',
    decimals: 2,
    phase: 1,
    model: () => oilPressure_bar({ rpm: 800, oil_C: 100, pumpHealth: 0.4, bearingWear: 0 }),
  },
  {
    // review: 81,500 W / 100,000 J/K ≈ 0.8 K/s (0.815 unrounded)
    check: 'Max coolant heating rate',
    expected: 0.815,
    unit: 'K/s',
    decimals: 3,
    phase: 1,
    model: () =>
      evaluateEngine(hot, { rpm: 6000, brakeTorque_Nm: 999, ambient_C: 30 }).coolantHeat_W /
      PROFILE.cooling.thermalCapacity_JperK,
  },
  ...(
    [
      [800, 179],
      [3000, 2517],
      [6000, 10068],
    ] as const
  ).map(([rpm, F]) => ({
    check: `F₂ peak at ${rpm.toLocaleString('en-US')} rpm`,
    expected: F,
    unit: 'N',
    decimals: 0,
    phase: 7,
    model: () => secondaryForcePeak_N(rpm),
  })),
  {
    check: 'Healthy crank-speed ripple · 3,000 rpm',
    expected: 11,
    unit: 'rpm p-p',
    decimals: 1,
    phase: 7,
    model: () => healthy().pp,
  },
  {
    check: 'Cyl 1 misfire · speed ripple',
    expected: 61,
    unit: 'rpm p-p',
    decimals: 1,
    phase: 7,
    model: () => out(1).pp,
  },
  {
    check: 'Cyl 1 misfire · 0.5× amplitude',
    expected: 21,
    unit: 'rpm',
    decimals: 1,
    phase: 7,
    model: () => out(1).amp,
  },
  ...(
    [
      [1, 45],
      [2, 135],
      [3, -45],
      [4, -135],
    ] as const
  ).map(([cyl, phase]) => ({
    check: `Cyl ${cyl} misfire · 0.5× phase`,
    expected: phase,
    unit: '°',
    decimals: 0,
    phase: 7,
    tolAbs: 1,
    model: () => out(cyl).phase,
  })),
  {
    check: 'Misfire torque command (110 → 146)',
    expected: 146,
    unit: 'N·m',
    decimals: 0,
    phase: 7,
    model: () => out(3).cmd,
  },
  {
    check: 'Cyl 3 at 50 % · speed ripple',
    expected: 32,
    unit: 'rpm p-p',
    decimals: 1,
    phase: 7,
    model: () => out(3, 0.5).pp,
  },
  {
    check: 'Cyl 3 at 50 % · 0.5× amplitude',
    expected: 9,
    unit: 'rpm',
    decimals: 1,
    phase: 7,
    model: () => out(3, 0.5).amp,
  },
  {
    check: 'Cyl 3 at 50 % · torque command',
    expected: 125,
    unit: 'N·m',
    decimals: 0,
    phase: 7,
    model: () => out(3, 0.5).cmd,
  },
  {
    check: 'χ²₅ 99 % point (D² alarm limit)',
    expected: 15.09,
    unit: '',
    decimals: 2,
    phase: 9,
    model: () => chi2Quantile(0.99, 5),
  },
  {
    // review: "a residual sitting at 1σ … CUSUM flags it after about 10 samples"
    check: 'CUSUM samples to flag a 1σ shift (κ 0.5, h 5)',
    expected: 10,
    unit: 'samples',
    decimals: 0,
    phase: 9,
    tolAbs: 1,
    model: () => cusumSamplesToFlag(1, ANALYTICS.stats.cusumKappa, ANALYTICS.stats.cusumH),
  },
  {
    // review: 25 °C in one 0.2 s sample = 125 K/s, "over 150 times the physical limit"
    check: '25 °C spike in 0.2 s ÷ max coolant heating rate',
    expected: 153,
    unit: '×',
    decimals: 0,
    phase: 9,
    model: () => 25 / 0.2 / maxCoolantRate_Kps(),
  },
  {
    // draft §22.1: thermal 0.47, lubrication 0.33, vibration 0.38, combustion 0.20
    check: 'Overall health example (draft §22.1)',
    expected: 69.4,
    unit: '',
    decimals: 1,
    phase: 9,
    model: () =>
      overallHealth({
        thermal: 0.47,
        lubrication: 0.33,
        vibration: 0.38,
        combustion: 0.2,
        electrical: 0,
        sensors: 0,
      }),
  },
  {
    // draft §25.2: D 0.62 → 1 at 0.008 per hour; the same arithmetic as rul.ts with health = 1 − D
    check: 'Linear RUL example (draft §25.2)',
    expected: 47.5,
    unit: 'h',
    decimals: 1,
    phase: 9,
    model: () => (1 - 0.62) / 0.008,
  },
];

/** Same rule as the test suite: within 2 % (or `tolAbs` for angles). */
export const passes = (model: number, expected: number, tolAbs?: number) =>
  Math.abs(model - expected) <= (tolAbs ?? Math.abs(expected) * 0.02);
