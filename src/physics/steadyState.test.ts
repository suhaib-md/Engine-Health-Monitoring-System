import { describe, expect, it } from 'vitest';
import { expectClose } from '../tests/expectClose';
import { PROFILE } from '../engine/profile';
import {
  HEALTHY,
  stepThermal,
  type HealthFactors,
  type OperatingPoint,
  type ThermalState,
} from './engineModel';

// Integration tests: run the thermal model at the 20 Hz slow-loop step until it settles.
const DT = PROFILE.sim.slowDt_s;
const AMBIENT = 30;

function simulate(
  op: OperatingPoint,
  seconds: number,
  health: HealthFactors = HEALTHY,
  start: ThermalState = { coolant_C: 90, oil_C: 95, fanOn: false },
) {
  let s = start;
  const steps = Math.round(seconds / DT);
  const tail = Math.round(600 / DT); // last 10 simulated minutes
  let min = Infinity;
  let max = -Infinity;
  let fanToggles = 0;
  let reached82_s: number | null = null;
  for (let i = 0; i < steps; i++) {
    const prevFan = s.fanOn;
    s = stepThermal(s, op, DT, health);
    if (s.fanOn !== prevFan && i >= steps - tail) fanToggles++;
    if (reached82_s == null && s.coolant_C >= 82) reached82_s = (i + 1) * DT;
    if (i >= steps - tail) {
      min = Math.min(min, s.coolant_C);
      max = Math.max(max, s.coolant_C);
    }
  }
  return { state: s, min, max, fanToggles, reached82_s };
}

const at = (rpm: number, torque: number): OperatingPoint => ({
  rpm,
  brakeTorque_Nm: torque,
  ambient_C: AMBIENT,
});

describe('steady coolant temperature, healthy (review energy table)', () => {
  it('3,000 rpm / 80 N·m settles at 93 °C, fan off', () => {
    const r = simulate(at(3000, 80), 7200);
    expectClose(r.state.coolant_C, 93);
    expect(r.state.fanOn).toBe(false);
    expect(r.max - r.min).toBeLessThan(0.05);
  });

  for (const [rpm, torque, label] of [
    [4000, 190, '4,000 rpm / 190 N·m'],
    [6000, 999, '6,000 rpm / full load'],
  ] as const) {
    it(`${label} holds ≈98 °C by cycling the fan`, () => {
      const r = simulate(at(rpm, torque), 3600);
      expect(r.fanToggles).toBeGreaterThan(4);
      expect(r.min).toBeGreaterThan(95.5);
      expect(r.max).toBeLessThan(98.5);
    });
  }
});

describe('cooling faults overheat clearly (review fault check)', () => {
  it('cooling health 0.5 at full load settles at 132 °C', () => {
    const r = simulate(at(6000, 999), 7200, { ...HEALTHY, cooling: 0.5 });
    expectClose(r.state.coolant_C, 132);
  });
  it('cooling health 0.25 at 3,000 rpm / 80 N·m settles at 110 °C', () => {
    const r = simulate(at(3000, 80), 7200, { ...HEALTHY, cooling: 0.25 });
    expectClose(r.state.coolant_C, 110);
  });
});

describe('warm-up (open-questions Q-01)', () => {
  it('cold idle reaches 82 °C in about 25 minutes', () => {
    const r = simulate(at(800, 0), 3600, HEALTHY, {
      coolant_C: AMBIENT,
      oil_C: AMBIENT,
      fanOn: false,
    });
    expect(r.reached82_s).not.toBeNull();
    expectClose(r.reached82_s! / 60, 25, 0.06);
  });
});

describe('oil temperature (provisional Q-02)', () => {
  it('runs hotter than coolant under load, so warm-oil friction applies', () => {
    const r = simulate(at(3000, 80), 7200);
    expect(r.state.oil_C).toBeGreaterThan(r.state.coolant_C + 5);
    expect(r.state.oil_C).toBeLessThan(r.state.coolant_C + 12);
    expect(r.state.oil_C).toBeGreaterThanOrEqual(PROFILE.friction.coldRef_C);
  });
  it('more lubrication degradation means hotter oil', () => {
    const ok = simulate(at(3000, 80), 3600);
    const bad = simulate(at(3000, 80), 3600, { ...HEALTHY, lubeDegradation: 1 });
    expect(bad.state.oil_C).toBeGreaterThan(ok.state.oil_C + 3);
  });
});
