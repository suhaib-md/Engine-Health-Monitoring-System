import { useState } from 'react';
import { SectionHeader } from '../shell/Brand';
import { Panel, Toggle, cx } from '../primitives';
import { Reveal } from '../motion';
import { useUi } from '../store';
import { useSim } from '../sim/simClient';
import type { Snapshot } from '../../worker/protocol';
import { BINDINGS } from '../math/bindings';
import { EquationRegistry, MathView } from '../math/MathView';
import { EQUATIONS } from '../../physics';

/**
 * Equations page (Phase 8): the live chain behind any gauge, then every registered equation with
 * its symbols and units. This page is lazy-loaded with KaTeX.
 */
export function MathPage() {
  const pick = useUi((s) => s.mathPick);
  const set = useUi((s) => s.set);
  const live = useSim((s) => s.snapshot);
  const [held, setHeld] = useState<Snapshot | null>(null);

  return (
    <div className="flex flex-col gap-20 lg:gap-24">
      <section className="flex flex-col gap-10">
        <SectionHeader
          index="04"
          title="Equations"
          description="Every value on screen comes from a registered equation. Select a gauge to see its calculation with current values substituted: cyan is measured, white is the Twin's own state, grey is a healthy-engine assumption, orange is inferred by the monitor. The chain shown is the Twin's expected-value chain; its result is the white Twin marker on the gauge."
        />
        <Reveal>
          <Panel tab className="flex flex-col gap-8 p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div role="tablist" aria-label="Gauge" className="flex flex-wrap gap-2">
                {BINDINGS.map((b) => (
                  <button
                    key={b.id}
                    role="tab"
                    aria-selected={pick === b.id}
                    onClick={() => set({ mathPick: b.id })}
                    className={cx(
                      'h-9 cursor-pointer border px-4 font-mono text-xs font-bold uppercase transition-colors duration-fast',
                      pick === b.id
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-line-strong text-fg-2 hover:border-fg-3 hover:text-fg',
                    )}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <Toggle checked={held != null} onChange={(v) => setHeld(v ? live : null)}>
                {held ? 'Holding these numbers' : 'Live'}
              </Toggle>
            </div>
            <MathView id={pick} snapshot={held ?? live} />
          </Panel>
        </Reveal>
      </section>

      <section className="flex flex-col gap-10">
        <SectionHeader
          size="section"
          index="05"
          title="Equation registry"
          description={`All ${EQUATIONS.length} equations the simulator and the analytics use, with every symbol and unit. The same functions run the Plant, the Twin and this page; the test suite checks that each substituted form evaluates to the function's result.`}
        />
        <EquationRegistry />
      </section>
    </div>
  );
}

export default MathPage;
