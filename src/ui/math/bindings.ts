import {
  equationById,
  evaluateEngine,
  firingOffset_deg,
  maxTorque_Nm,
  type RegisteredEquation,
} from '../../physics';
import { PROFILE } from '../../engine/profile';
import { ANALYTICS } from '../../analytics';
import type { Snapshot } from '../../worker/protocol';

/**
 * "Show the math" bindings: for each gauge, the chain of registered equations the healthy Twin
 * (or the analytics) evaluates, with the inputs taken from the SAME snapshot the gauge shows.
 * Pure functions of the snapshot, so a test can check that the substituted numbers equal the
 * values on the gauges.
 *
 * Every input carries where it came from:
 *   live     measured telemetry (what the sensors read)
 *   twin     the healthy Twin's own state or an intermediate it computed
 *   assumed  the Twin's healthy assumption (health = 1, wear = 0): it never sees the faults
 *   inferred what the monitor infers from the residual
 *   constant an engine-profile value
 */

export type Tag = 'live' | 'twin' | 'assumed' | 'inferred' | 'constant';

export const TAG_LABEL: Record<Tag, string> = {
  live: 'measured',
  twin: 'Twin state',
  assumed: 'healthy assumption',
  inferred: 'inferred from the residual',
  constant: 'profile constant',
};

export interface StepInput {
  value: number;
  tag: Tag;
  /** decimals shown */
  d: number;
}

export interface Step {
  eq: RegisteredEquation;
  inputs: Record<string, StepInput>;
  /** decimals for the result */
  d: number;
  result: number;
  note?: string;
}

/** A number on screen that the math must reproduce (strict) or predict (compare). */
export interface Check {
  label: string;
  math: number;
  shown: number;
  unit: string;
  d: number;
  /** strict = must be equal (tested); otherwise a model prediction beside the measurement */
  strict: boolean;
}

export type BindingId =
  'rpm' | 'coolant' | 'oilTemp' | 'oilPress' | 'voltage' | 'vibration' | 'misfire';

export interface Binding {
  id: BindingId;
  title: string;
  story: string;
  steps: Step[];
  checks: Check[];
}

export const BINDINGS: { id: BindingId; label: string }[] = [
  { id: 'oilPress', label: 'Oil pressure' },
  { id: 'coolant', label: 'Coolant' },
  { id: 'oilTemp', label: 'Oil temp' },
  { id: 'voltage', label: 'Voltage' },
  { id: 'rpm', label: 'Engine speed' },
  { id: 'vibration', label: 'Vibration' },
  { id: 'misfire', label: 'Misfire' },
];

export type MathSnapshot = Pick<Snapshot, 'telemetry' | 'expected' | 'analytics'>;

const inp = (value: number, tag: Tag, d: number): StepInput => ({ value, tag, d });

function step(id: string, inputs: Record<string, StepInput>, d: number, note?: string): Step {
  const eq = equationById(id);
  if (!eq) throw new Error(`equation ${id} is not registered`);
  const raw = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value]));
  return { eq, inputs, d, result: eq.compute(raw), note };
}

/** The Twin's operating point and outputs, rebuilt exactly as twin/twin.ts builds them. */
function twinOutputs(s: MathSnapshot) {
  const tel = s.telemetry;
  const rpm = Math.max(0, tel.rpm);
  const op = {
    rpm,
    brakeTorque_Nm: rpm > 0 ? tel.load * maxTorque_Nm(rpm) : 0,
    ambient_C: tel.ambientC,
  };
  const state = {
    coolant_C: s.expected.coolantC,
    oil_C: s.expected.oilC,
    fanOn: s.expected.fanOn,
  };
  return { op, out: evaluateEngine(state, op) };
}

export function buildBinding(id: BindingId, s: MathSnapshot): Binding | null {
  const tel = s.telemetry;
  const exp = s.expected;
  const { op, out } = twinOutputs(s);
  const N = inp(tel.rpm, 'live', 0);

  switch (id) {
    case 'rpm': {
      const omega = step('engine.omega', { N }, 2);
      const tmax = step('engine.maxTorque', { N }, 1);
      const power = step('engine.brakePower', { T: inp(op.brakeTorque_Nm, 'live', 2), N }, 0);
      return {
        id,
        title: 'Engine speed',
        story:
          'The crank-speed sensor gives N. Load is measured as a fraction of the full-load curve, so the brake torque is T = L · T_max(N).',
        steps: [omega, tmax, power],
        checks: [
          {
            label: 'N on the gauge',
            math: tel.rpm,
            shown: tel.rpm,
            unit: 'rpm',
            d: 0,
            strict: true,
          },
        ],
      };
    }

    case 'coolant': {
      const heat = step(
        'energy.coolantHeat',
        { L: inp(out.load, 'live', 3), Q_fuel: inp(out.fuelPower_W, 'twin', 0) },
        0,
      );
      const therm = step('cooling.thermostat', { T_c: inp(exp.coolantC, 'twin', 3) }, 3);
      const ua = step(
        'cooling.ua',
        {
          H_cool: inp(1, 'assumed', 2),
          F_therm: inp(therm.result, 'twin', 3),
          F_fan: inp(exp.fanOn ? 1 : 0, 'live', 0),
        },
        0,
      );
      const rate = step(
        'cooling.rate',
        {
          Q_cool: inp(heat.result, 'twin', 0),
          UA: inp(ua.result, 'twin', 2),
          T_c: inp(exp.coolantC, 'twin', 3),
          T_amb: inp(tel.ambientC, 'live', 2),
        },
        4,
        'The Twin integrates this every 0.05 s. Its current state T_c is the white ghost on the coolant gauge.',
      );
      return {
        id,
        title: 'Coolant temperature',
        story:
          'The Twin burns fuel for the measured speed and load, sends the coolant share to the radiator, and integrates the balance. It assumes a healthy radiator (H_cool = 1); a real one that falls short shows up as the gap to the needle.',
        steps: [heat, therm, ua, rate],
        checks: [
          {
            label: 'Twin T_c = gauge ghost',
            math: exp.coolantC,
            shown: exp.coolantC,
            unit: '°C',
            d: 2,
            strict: true,
          },
          {
            label: 'Q̇_cool = the Twin engine model',
            math: heat.result,
            shown: out.coolantHeat_W,
            unit: 'W',
            d: 0,
            strict: true,
          },
          {
            label: 'UA_eff = the Twin engine model',
            math: ua.result,
            shown: out.radiatorUA_WperK,
            unit: 'W/K',
            d: 0,
            strict: true,
          },
          // a parked engine adds natural convection (Q-30), which this running-engine balance omits
          ...(op.rpm > 0
            ? [
                {
                  label: 'dT_c/dt = the Twin engine model',
                  math: rate.result,
                  shown: out.coolantRate_Kps,
                  unit: 'K/s',
                  d: 4,
                  strict: true,
                },
              ]
            : []),
          ...(tel.coolantC == null
            ? []
            : [
                {
                  label: 'measured coolant (needle)',
                  math: exp.coolantC,
                  shown: tel.coolantC,
                  unit: '°C',
                  d: 1,
                  strict: false,
                },
              ]),
        ],
      };
    }

    case 'oilTemp': {
      const fmep = step('friction.fmep', { N, T_o: inp(exp.oilC, 'twin', 2) }, 1);
      const tf = step('friction.torque', { FMEP: inp(fmep.result, 'twin', 1) }, 2);
      const rate = step(
        'oil.tempRate',
        {
          Q_fric: inp(out.frictionPower_W, 'twin', 0),
          D: inp(0, 'assumed', 2),
          T_c: inp(exp.coolantC, 'twin', 3),
          T_o: inp(exp.oilC, 'twin', 3),
          T_amb: inp(tel.ambientC, 'live', 2),
        },
        4,
        'Q̇_fric = T_fric · ω. The Twin integrates this every 0.05 s; its T_o is the ghost on the oil-temp gauge.',
      );
      return {
        id,
        title: 'Oil temperature',
        story:
          'Friction heats the oil, the coolant jacket pulls it toward coolant temperature, and the sump loses a little to ambient. Cold oil means more friction, which is why a cold engine warms up.',
        steps: [fmep, tf, rate],
        checks: [
          {
            label: 'Twin T_o = gauge ghost',
            math: exp.oilC,
            shown: exp.oilC,
            unit: '°C',
            d: 2,
            strict: true,
          },
          {
            label: 'T_fric · ω = Q̇_fric in the balance',
            math: (tf.result * tel.rpm * 2 * Math.PI) / 60,
            shown: out.frictionPower_W,
            unit: 'W',
            d: 0,
            strict: true,
          },
          {
            label: 'dT_o/dt = the Twin engine model',
            math: rate.result,
            shown: out.oilRate_Kps,
            unit: 'K/s',
            d: 4,
            strict: true,
          },
        ],
      };
    }

    case 'oilPress': {
      // Use exactly the inputs the analytics used (it runs on every second 20 Hz step, so the
      // newest telemetry can be one step ahead of the gauge's ghost).
      const feat = s.analytics?.features;
      const f = feat?.channels.oilPressBar;
      const oilMeasured = feat ? feat.channels.oilC.measured : tel.oilC;
      const oilC = oilMeasured ?? feat?.channels.oilC.expected ?? exp.oilC;
      const To = inp(oilC, oilMeasured == null ? 'twin' : 'live', 1);
      const Nf = feat ? inp(feat.rpm, 'live', 0) : N;
      const mu = step('oil.viscosity', { T_o: To }, 4);
      const expected = step(
        'oil.pressure',
        { N: Nf, T_o: To, H_pump: inp(1, 'assumed', 2), W_b: inp(0, 'assumed', 2) },
        2,
        'Compared at the MEASURED oil temperature (draft §17.3), so hot, thin oil from a cooling problem is not blamed on the pump.',
      );
      const ratio = s.analytics?.features.pressRatio ?? 1;
      const inferred = step(
        'oil.pressure',
        { N: Nf, T_o: To, H_pump: inp(ratio, 'inferred', 3), W_b: inp(0, 'assumed', 2) },
        2,
        'Solved backwards: the pump health that would explain the (filtered) reading, if the pump alone were at fault.',
      );
      return {
        id,
        title: 'Oil pressure',
        story:
          'The healthy expectation uses the measured speed and oil temperature with a perfect pump. The gap to the measured pressure is the lubrication evidence.',
        steps: [mu, expected, inferred],
        checks: [
          {
            label: 'P̂_o = gauge ghost',
            math: expected.result,
            shown: f?.expected ?? expected.result,
            unit: 'bar',
            d: 2,
            strict: true,
          },
          ...(tel.oilPressBar == null
            ? []
            : [
                {
                  label: 'inferred-pump pressure vs needle',
                  math: inferred.result,
                  shown: tel.oilPressBar,
                  unit: 'bar',
                  d: 2,
                  strict: false,
                },
              ]),
        ],
      };
    }

    case 'voltage': {
      const v = step('electrical.busVoltage', { N, H_alt: inp(1, 'assumed', 2) }, 2);
      return {
        id,
        title: 'Bus voltage',
        story:
          'The alternator approaches the regulator setpoint as speed rises. The Twin assumes a healthy alternator.',
        steps: [v],
        checks: [
          {
            label: 'V̂ = gauge ghost',
            math: v.result,
            shown: exp.busV,
            unit: 'V',
            d: 2,
            strict: true,
          },
          ...(tel.busV == null
            ? []
            : [
                {
                  label: 'measured voltage (needle)',
                  math: v.result,
                  shown: tel.busV,
                  unit: 'V',
                  d: 2,
                  strict: false,
                },
              ]),
        ],
      };
    }

    case 'vibration': {
      const g = PROFILE.geometry;
      const f2 = step(
        'vib.secondaryForce',
        {
          m: inp(g.recipMassPerCyl_kg, 'constant', 2),
          r: inp(g.crankRadius_m, 'constant', 3),
          N,
          lambda: inp(g.lambda, 'constant', 3),
        },
        0,
      );
      const a2 = step('vib.sensorAccel', { F2: inp(f2.result, 'twin', 0) }, 3);
      const rms = step(
        'vib.healthyRms',
        { N, T: inp(exp.resistNm, 'twin', 1) },
        3,
        'T is the Twin’s resisting torque (brake + friction + accessories); its half-sine pulses add the torque-ripple terms.',
      );
      const sp = s.analytics?.spectral;
      return {
        id,
        title: 'Vibration RMS',
        story:
          'In an inline-4 the first-order piston forces cancel and the second-order ones add, so a healthy engine shakes at 2× crank speed. Amplitudes are engine-profile calibration values, never ISO limits.',
        steps: [f2, a2, rms],
        checks: [
          {
            label: 'healthy RMS = gauge ghost',
            math: rms.result,
            shown: exp.vibRmsMs2,
            unit: 'm/s²',
            d: 3,
            strict: true,
          },
          ...(sp
            ? [
                {
                  label: 'measured RMS (needle)',
                  math: rms.result,
                  shown: sp.vib.rms,
                  unit: 'm/s²',
                  d: 3,
                  strict: false,
                },
              ]
            : []),
        ],
      };
    }

    case 'misfire': {
      const sp = s.analytics?.spectral;
      if (!sp) return null;
      const m = step(
        'crank.missing',
        {
          N: inp(sp.meanRpm, 'live', 0),
          T: inp(sp.resistNm, 'twin', 1),
          A: inp(sp.speed.halfAmp_rpm, 'live', 2),
        },
        3,
      );
      const cyl = sp.misfire.cylinder;
      const named = sp.misfire.missing >= ANALYTICS.misfire.nameAbove;
      const phase = step(
        'crank.misfirePhase',
        { theta: inp(firingOffset_deg(cyl), 'inferred', 0) },
        0,
        `Cylinder ${cyl} fires ${firingOffset_deg(cyl)}° after cylinder 1 (order 1-3-4-2): the centre of its 90° sector.`,
      );
      const H = (c: number) =>
        inp(c === cyl ? 1 - m.result : 1, c === cyl ? 'inferred' : 'assumed', 2);
      const gov = step(
        'crank.governor',
        { T: inp(exp.resistNm, 'twin', 1), H1: H(1), H2: H(2), H3: H(3), H4: H(4) },
        1,
        'Prediction: if cylinder ' +
          cyl +
          ' is missing that share, the speed governor must ask for this much torque.',
      );
      return {
        id,
        title: named ? `Cylinder ${cyl} misfire` : 'Misfire check',
        story:
          'A weak cylinder repeats once per two revolutions, so it shows as a half-order (0.5×) crank-speed component. Its size gives how much torque is missing; its phase names the cylinder.',
        steps: [m, phase, gov],
        checks: [
          {
            label: 'm = "torque missing" on the Vibration page',
            math: m.result,
            shown: sp.misfire.missing,
            unit: '',
            d: 3,
            strict: true,
          },
          {
            label: 'sector centre vs measured 0.5× phase',
            math: phase.result,
            shown: sp.speed.halfPhase_deg,
            unit: '°',
            d: 0,
            strict: false,
          },
          ...(tel.torqueCmdNm != null
            ? [
                {
                  label: 'predicted vs measured torque command',
                  math: gov.result,
                  shown: tel.torqueCmdNm,
                  unit: 'N·m',
                  d: 1,
                  strict: false,
                },
              ]
            : []),
        ],
      };
    }
  }
}
