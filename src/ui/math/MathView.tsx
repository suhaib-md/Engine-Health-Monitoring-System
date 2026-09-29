import { useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { EQUATIONS, type RegisteredEquation, type Subsystem } from '../../physics';
import { TAG_LABEL, buildBinding, type BindingId, type MathSnapshot, type Tag } from './bindings';
import { TAG_COLOR, stepTex, texNum, unitTex } from './tex';
import { color } from '../tokens';

/**
 * KaTeX views for "Show the math". This module (and KaTeX, ~270 kB) loads only when the math
 * drawer or the Math page opens.
 */

export function Tex({
  tex,
  display = false,
  className,
}: {
  tex: string;
  display?: boolean;
  className?: string;
}) {
  const html = useMemo(
    () =>
      katex.renderToString(tex, {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
        output: 'html',
      }),
    [tex, display],
  );
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

const TAG_ORDER: Tag[] = ['live', 'twin', 'assumed', 'inferred', 'constant'];

export function TagLegend() {
  return (
    <div className="num flex flex-wrap gap-x-6 gap-y-2 text-label text-fg-2">
      {TAG_ORDER.map((t) => (
        <span key={t} className="flex items-center gap-2">
          <span className="size-2.5" style={{ background: TAG_COLOR[t] ?? color.fg2 }} />
          {TAG_LABEL[t]}
        </span>
      ))}
    </div>
  );
}

/** One gauge's chain of equations with live numbers substituted, plus the checks against the gauge. */
export function MathView({ id, snapshot }: { id: BindingId; snapshot: MathSnapshot | null }) {
  const b = snapshot ? buildBinding(id, snapshot) : null;
  if (!snapshot) return <p className="num text-fg-3">Waiting for the simulation worker…</p>;
  if (!b)
    return (
      <p className="m-0 leading-relaxed text-fg-2">
        This needs a crank-angle window, which arrives once per simulated second while the engine
        runs. Start the engine to see it.
      </p>
    );
  return (
    <div className="flex flex-col gap-8">
      <p className="m-0 max-w-3xl leading-relaxed text-fg-2">{b.story}</p>
      <TagLegend />
      <ol className="m-0 flex list-none flex-col gap-6 p-0">
        {b.steps.map((st, i) => (
          <li
            key={`${st.eq.id}-${i}`}
            className="flex flex-col gap-4 border border-line bg-bg/40 p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <span className="flex items-baseline gap-3">
                <span className="num text-label text-accent">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-h3 font-semibold">{st.eq.title}</span>
              </span>
              <span className="num text-label text-fg-3">{st.eq.id}</span>
            </div>
            <div className="overflow-x-auto text-fg-2">
              <Tex tex={st.eq.latex} display />
            </div>
            <div className="overflow-x-auto text-[1.08em] text-fg">
              <Tex tex={stepTex(st)} display />
            </div>
            {st.note && <p className="m-0 text-sm leading-relaxed text-fg-3">{st.note}</p>}
            <dl className="num m-0 grid grid-cols-[auto_1fr] gap-x-5 gap-y-1.5 border-t border-line pt-4 text-xs">
              {Object.entries(st.inputs).map(([k, v]) => {
                const info = st.eq.inputs[k];
                return (
                  <div key={k} className="contents">
                    <dt className="text-fg">
                      <Tex tex={info?.symbol ?? k} />
                    </dt>
                    <dd className="m-0 text-fg-3">
                      {info?.label} ·{' '}
                      <span style={{ color: TAG_COLOR[v.tag] ?? color.fg2 }}>
                        {TAG_LABEL[v.tag]}
                      </span>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ol>
      <section className="flex flex-col gap-3">
        <span className="label">Checks against the screen</span>
        <div className="overflow-x-auto border border-line">
          <table className="num w-full min-w-[480px] border-collapse text-xs">
            <tbody>
              {b.checks.map((c) => {
                const same = Math.abs(c.math - c.shown) <= Math.max(1e-9, Math.abs(c.shown) * 1e-9);
                return (
                  <tr key={c.label} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 text-fg-2">{c.label}</td>
                    <td className="px-4 py-3 text-right text-fg">
                      <Tex tex={texNum(c.math, c.d) + unitTex(c.unit)} />
                    </td>
                    <td className="px-4 py-3 text-right text-fg">
                      <Tex tex={texNum(c.shown, c.d) + unitTex(c.unit)} />
                    </td>
                    <td className="px-4 py-3 text-right font-bold">
                      {c.strict ? (
                        <span className={same ? 'text-ok' : 'text-crit'}>
                          {same ? '✓ EQUAL' : '✗ DIFFERS'}
                        </span>
                      ) : (
                        <span className="text-fg-3">MODEL VS MEASURED</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const SUBSYSTEM_ORDER: { id: Subsystem; label: string }[] = [
  { id: 'engine', label: 'Engine & kinematics' },
  { id: 'friction', label: 'Friction' },
  { id: 'energy', label: 'Energy flow' },
  { id: 'cooling', label: 'Cooling' },
  { id: 'lubrication', label: 'Lubrication' },
  { id: 'electrical', label: 'Electrical' },
  { id: 'vibration', label: 'Vibration' },
  { id: 'combustion', label: 'Combustion & misfire' },
];

function EquationCard({ eq }: { eq: RegisteredEquation }) {
  const rows = [
    ...Object.values(eq.inputs).map((s) => ({ ...s, out: false })),
    { ...eq.output, out: true },
  ];
  return (
    <article className="flex h-full flex-col gap-5 border border-line bg-panel p-6 transition-[transform,border-color] duration-fast ease-out hover:-translate-y-0.5 hover:border-line-strong">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-h3 font-semibold">{eq.title}</span>
        <span className="num text-label text-fg-3">{eq.id}</span>
      </div>
      <div className="overflow-x-auto text-fg">
        <Tex tex={eq.latex} display />
      </div>
      <table className="num mt-auto w-full border-collapse text-xs">
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol + r.out} className="border-t border-line">
              <td className="w-24 py-2 pr-3 text-fg">
                <Tex tex={r.symbol} />
              </td>
              <td className="py-2 pr-3 text-fg-2">
                {r.label}
                {r.out && <span className="text-accent"> · result</span>}
              </td>
              <td className="py-2 text-right text-fg-3">{r.unit || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}

/** Every registered equation, grouped by subsystem, with its symbols and units. */
export function EquationRegistry() {
  return (
    <div className="flex flex-col gap-12">
      {SUBSYSTEM_ORDER.map(({ id, label }) => {
        const eqs = EQUATIONS.filter((e) => e.subsystem === id);
        if (!eqs.length) return null;
        return (
          <section key={id} className="flex flex-col gap-5">
            <span className="label">
              {label} · {eqs.length}
            </span>
            <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
              {eqs.map((eq) => (
                <EquationCard key={eq.id} eq={eq} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
