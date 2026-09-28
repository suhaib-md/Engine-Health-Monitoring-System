import { describe, expect, it } from 'vitest';
import { expectClose } from '../tests/expectClose';
import { PROFILE } from '../engine/profile';
import {
  EQUATIONS,
  bmep_Pa,
  busVoltage_V,
  equationById,
  evaluateEngine,
  firingFreq_Hz,
  maxTorque_Nm,
  nextFanState,
  oilPressure_bar,
  rotationalFreq_Hz,
  rpmToRadps,
  shaftPower_W,
  thermostatOpening,
  viscosityRatio,
} from '.';

// Golden numbers: CLAUDE.md "Golden numbers", from docs/research-review-and-build-plan.md.

describe('basics (draft §7, §11)', () => {
  it('ω = 314.16 rad/s at 3,000 rpm', () => expectClose(rpmToRadps(3000), 314.16, 0.001));
  it('P_b = 25.13 kW at 80 N·m, 3,000 rpm', () => expectClose(shaftPower_W(80, 3000), 25_130));
  it('BMEP ≈ 5.03 bar at 80 N·m', () => expectClose(bmep_Pa(80) / 1e5, 5.03));
  it('f_r = 50 Hz and f_fire = 100 Hz at 3,000 rpm', () => {
    expect(rotationalFreq_Hz(3000)).toBe(50);
    expect(firingFreq_Hz(3000)).toBe(100);
  });
});

describe('torque curve (review Fix 4)', () => {
  it('peaks at 190 N·m at 4,000 rpm', () => expect(maxTorque_Nm(4000)).toBe(190));
  it('drops to ≈164.8 N·m at 6,000 rpm', () => expectClose(maxTorque_Nm(6000), 164.8, 0.005));
});

describe('energy flow golden table (review Fix 1 & 2; warm oil)', () => {
  const hot = { coolant_C: 90, oil_C: 100, fanOn: false };
  const rows = [
    // rpm, torque request, P_b kW, fric+acc kW, fuel kW, coolant kW, L/h
    { rpm: 800, T: 0, pb: 0, fa: 2.0, fuel: 7.5, cool: 2.6, lph: 0.85 },
    { rpm: 3000, T: 80, pb: 25.1, fa: 9.9, fuel: 110.8, cool: 31.9, lph: 12.5 },
    { rpm: 4000, T: 190, pb: 79.6, fa: 16.3, fuel: 252.3, cool: 55.5, lph: 28.6 },
    { rpm: 6000, T: 999, pb: 103.6, fa: 37.2, fuel: 370.4, cool: 81.5, lph: 41.9 },
  ];
  for (const r of rows) {
    it(`${r.rpm} rpm / ${r.T === 999 ? 'full load' : `${r.T} N·m`}`, () => {
      const o = evaluateEngine(hot, { rpm: r.rpm, brakeTorque_Nm: r.T, ambient_C: 30 });
      if (r.pb === 0) expect(o.brakePower_W).toBe(0);
      else expectClose(o.brakePower_W / 1e3, r.pb);
      expectClose((o.frictionPower_W + PROFILE.energy.accessoryPower_W) / 1e3, r.fa);
      expectClose(o.fuelPower_W / 1e3, r.fuel);
      expectClose(o.coolantHeat_W / 1e3, r.cool);
      expectClose(o.fuelRate_Lph, r.lph);
    });
  }

  it('3,000 rpm / 80 N·m is load 0.435 (Q-07 definition)', () => {
    const o = evaluateEngine(hot, { rpm: 3000, brakeTorque_Nm: 80, ambient_C: 30 });
    expectClose(o.load, 0.435, 0.005);
  });

  it('cold oil nearly doubles friction (factor 1.86 at 30 °C)', () => {
    const warm = evaluateEngine(hot, { rpm: 800, brakeTorque_Nm: 0, ambient_C: 30 });
    const cold = evaluateEngine(
      { ...hot, oil_C: 30 },
      { rpm: 800, brakeTorque_Nm: 0, ambient_C: 30 },
    );
    expectClose(cold.fmep_kPa / warm.fmep_kPa, 1 + 60 / 70, 0.001);
  });

  it('max coolant heating rate ≈ 0.8 K/s at full load with zero cooling', () => {
    const o = evaluateEngine(hot, { rpm: 6000, brakeTorque_Nm: 999, ambient_C: 30 });
    expectClose(o.coolantHeat_W / PROFILE.cooling.thermalCapacity_JperK, 0.815);
  });

  it('a stopped engine burns no fuel and makes no heat', () => {
    const o = evaluateEngine(hot, { rpm: 0, brakeTorque_Nm: 50, ambient_C: 30 });
    expect(o.fuelPower_W).toBe(0);
    expect(o.coolantHeat_W).toBe(0);
    expect(o.brakePower_W).toBe(0);
  });
});

describe('oil pressure golden cases (review Fix 3)', () => {
  const healthy = { pumpHealth: 1, bearingWear: 0 };
  const cases = [
    { name: 'cold start 800 rpm, 20 °C', rpm: 800, oil: 20, ...healthy, bar: 2.54 },
    { name: 'hot idle 800 rpm, 100 °C', rpm: 800, oil: 100, ...healthy, bar: 1.39 },
    { name: 'hot 3,000 rpm', rpm: 3000, oil: 100, ...healthy, bar: 3.23 },
    {
      name: 'pump health 0.4, hot idle',
      rpm: 800,
      oil: 100,
      pumpHealth: 0.4,
      bearingWear: 0,
      bar: 0.56,
    },
    {
      name: 'pump health 0.4, 3,000 rpm',
      rpm: 3000,
      oil: 100,
      pumpHealth: 0.4,
      bearingWear: 0,
      bar: 1.29,
    },
    {
      name: 'bearing wear 0.6, 3,000 rpm',
      rpm: 3000,
      oil: 100,
      pumpHealth: 1,
      bearingWear: 0.6,
      bar: 1.7,
    },
  ];
  for (const c of cases) {
    it(c.name, () =>
      expectClose(
        oilPressure_bar({
          rpm: c.rpm,
          oil_C: c.oil,
          pumpHealth: c.pumpHealth,
          bearingWear: c.bearingWear,
        }),
        c.bar,
      ),
    );
  }
  it('never exceeds the 5 bar relief valve', () =>
    expect(oilPressure_bar({ rpm: 6000, oil_C: -10, ...healthy })).toBe(5));
  it('reads 0 bar with the engine stopped', () =>
    expect(oilPressure_bar({ rpm: 0, oil_C: 90, ...healthy })).toBe(0));
  it('viscosity falls as oil warms', () =>
    expect(viscosityRatio(120)).toBeLessThan(viscosityRatio(40)));
});

describe('cooling components', () => {
  it('thermostat is shut below 82 °C, full open above 95 °C, linear between', () => {
    expect(thermostatOpening(70)).toBe(0);
    expect(thermostatOpening(100)).toBe(1);
    expectClose(thermostatOpening(88.5), 0.5, 0.001);
  });
  it('fan switches on above 98 °C and off below 96 °C (hysteresis)', () => {
    expect(nextFanState(false, 97.9)).toBe(false);
    expect(nextFanState(false, 98.1)).toBe(true);
    expect(nextFanState(true, 96.5)).toBe(true);
    expect(nextFanState(true, 95.9)).toBe(false);
  });
});

describe('electrical (draft §14, provisional Q-11)', () => {
  it('stopped engine sits at battery voltage', () => expect(busVoltage_V(0, 1)).toBe(12.6));
  it('charges ≈14.2 V at 3,000 rpm, lower at idle', () => {
    expectClose(busVoltage_V(3000, 1), 14.19, 0.005);
    expect(busVoltage_V(800, 1)).toBeLessThan(busVoltage_V(3000, 1));
  });
  it('a failed alternator leaves the bus below battery voltage', () =>
    expect(busVoltage_V(3000, 0)).toBeLessThan(12.6));
});

describe('equation registry', () => {
  it('has unique ids and a LaTeX string for every entry', () => {
    const ids = EQUATIONS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EQUATIONS) expect(e.latex.length).toBeGreaterThan(0);
  });
  it('registry compute matches the direct function (oil pressure, pump 0.4 at 3,000 rpm)', () => {
    const eq = equationById('oil.pressure');
    expect(eq).toBeDefined();
    expectClose(eq!.compute({ N: 3000, T_o: 100, H_pump: 0.4, W_b: 0 }), 1.29);
  });
});
