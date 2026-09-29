import type { SymbolInfo } from '../../physics';
import { color } from '../tokens';
import type { Step, Tag } from './bindings';

/** LaTeX building for "Show the math": numbers, units, and a step's substituted line. Pure. */

/** Number in LaTeX: thousands as {,}, no "-0.00". */
export function texNum(x: number, d = 2): string {
  const r = Number(x.toFixed(d));
  const s = Math.abs(r)
    .toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
    .replace(/,/g, '{,}');
  return r < 0 ? `-${s}` : s;
}

export const TAG_COLOR: Record<Tag, string | null> = {
  live: color.accent,
  twin: color.twin,
  assumed: color.fg3,
  inferred: color.warn,
  constant: null,
};

const UNIT_TEX: Record<string, string> = {
  '°C': String.raw`\,^\circ\text{C}`,
  '°': String.raw`^\circ`,
  'N·m': String.raw`\,\text{N}\cdot\text{m}`,
  'm/s²': String.raw`\,\text{m/s}^2`,
  'kg·m²': String.raw`\,\text{kg}\cdot\text{m}^2`,
};

export const unitTex = (u: string) => (u ? (UNIT_TEX[u] ?? String.raw`\,\text{${u}}`) : '');

/** A coloured value; negatives are bracketed so "x − −5" never appears. */
export function valueTex(value: number, d: number, tag: Tag) {
  const n = texNum(value, d);
  const body = value < 0 && n.startsWith('-') ? String.raw`\left(${n}\right)` : n;
  const c = TAG_COLOR[tag];
  return c ? String.raw`\textcolor{${c}}{${body}}` : body;
}

/** "output = substituted = result unit" for one step. */
export function stepTex(st: Step): string {
  const { eq, inputs } = st;
  const raw = Object.fromEntries(Object.entries(inputs).map(([k, v]) => [k, v.value]));
  const result = String.raw`\mathbf{${texNum(st.result, st.d)}}${unitTex(eq.output.unit)}`;
  if (eq.substitute) {
    const body = eq.substitute({
      v: (k) => {
        const x = inputs[k];
        return x ? valueTex(x.value, x.d, x.tag) : '?';
      },
      n: (x, d = 3) => {
        const n = texNum(x, d);
        return x < 0 ? String.raw`\left(${n}\right)` : n;
      },
      i: raw,
    });
    return String.raw`${eq.output.symbol} = ${body} = ${result}`;
  }
  const list = Object.entries(inputs)
    .map(([k, v]) => {
      const sym = (eq.inputs[k] as SymbolInfo | undefined)?.symbol ?? k;
      return String.raw`${sym} = ${valueTex(v.value, v.d, v.tag)}`;
    })
    .join(String.raw`,\ `);
  return String.raw`${eq.output.symbol} = ${result}\quad\text{with}\ ${list}`;
}
