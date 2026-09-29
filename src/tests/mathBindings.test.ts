import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import { BINDINGS, buildBinding } from '../ui/math/bindings';
import { stepTex } from '../ui/math/tex';
import type { PlantFaultId } from '../plant';
import { evalTex } from './texEval';

// Phase 8 exit check: the numbers substituted in "Show the math" equal the gauge values, in every
// engine state the demo visits (cold start, warm, each fault).

function state(name: string) {
  const loop = new SimLoop(5);
  const set = (targetRpm: number, torque_Nm: number) =>
    loop.handle({ type: 'set', settings: { targetRpm, torque_Nm } });
  const fault = (f: PlantFaultId, severity: number) =>
    loop.handle({ type: 'injectFault', fault: f, severity, onset: 'instant' });
  switch (name) {
    case 'engine off':
      break;
    case 'cold idle':
      set(800, 0);
      loop.handle({ type: 'start' });
      loop.advanceSim(30);
      break;
    default:
      set(3000, 80);
      loop.handle({ type: 'start' });
      loop.advanceSim(300);
      if (name === 'oil pump 0.6') fault('oilPump', 0.6);
      if (name === 'cooling 0.6') fault('cooling', 0.6);
      if (name === 'cylinder 2 misfire') fault('misfire2', 1);
      loop.advanceSim(60);
  }
  // land between two analytics ticks (analytics runs every 2nd 20 Hz step), as the live UI often does
  loop.advanceSim(0.05);
  return loop.snapshot();
}

const STATES = [
  'engine off',
  'cold idle',
  'warm 3,000 rpm',
  'oil pump 0.6',
  'cooling 0.6',
  'cylinder 2 misfire',
];

describe.each(STATES)('%s', (name) => {
  const snap = state(name);
  for (const { id } of BINDINGS) {
    it(`${id}: strict checks equal the gauge values; every line renders and evaluates`, () => {
      const b = buildBinding(id, snap);
      if (!b) {
        // only the misfire binding needs a crank window (engine running)
        expect(id).toBe('misfire');
        return;
      }
      for (const c of b.checks.filter((c) => c.strict))
        expect(
          Math.abs(c.math - c.shown),
          `${b.id}: ${c.label} (${c.math} vs ${c.shown})`,
        ).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(c.shown) * 1e-9));
      for (const st of b.steps) {
        const tex = stepTex(st);
        expect(
          () => katex.renderToString(tex, { throwOnError: true, strict: 'error' }),
          tex,
        ).not.toThrow();
        if (
          !st.eq.substitute ||
          st.eq.id === 'crank.misfirePhase' ||
          st.eq.id === 'electrical.busVoltage'
        )
          continue; // wrapped angle / branch text: not plain arithmetic
        // the middle of "out = substituted = result" evaluates to the result shown
        const middle = tex.slice(tex.indexOf('=') + 1, tex.lastIndexOf('=')).trim();
        const shownD = st.d;
        expect(Math.abs(evalTex(middle) - st.result), `${st.eq.id}: ${middle}`).toBeLessThanOrEqual(
          Math.max(0.6 * 10 ** -shownD, Math.abs(st.result) * 3e-3),
        );
      }
    });
  }
});

it('the misfire binding names the injected cylinder and predicts the 4/3 command', () => {
  const b = buildBinding('misfire', state('cylinder 2 misfire'))!;
  expect(b.title).toBe('Cylinder 2 misfire');
  const cmd = b.checks.find((c) => c.label.startsWith('predicted'))!;
  expect(Math.abs(cmd.math - cmd.shown) / cmd.shown).toBeLessThan(0.03);
  const phase = b.checks.find((c) => c.label.startsWith('sector'))!;
  expect(Math.abs(phase.math - phase.shown)).toBeLessThan(10);
});

it('the inferred pump health explains the reading after an oil-pump fault', () => {
  const b = buildBinding('oilPress', state('oil pump 0.6'))!;
  const inferredH = b.steps[2]!.inputs.H_pump!.value;
  expect(inferredH).toBeGreaterThan(0.45);
  expect(inferredH).toBeLessThan(0.65); // true H_pump = 1 − 0.75·0.6 = 0.55
});
