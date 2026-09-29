import { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Toggle } from '../primitives';
import { drawerSpring } from '../motion';
import { useUi } from '../store';
import { useSim } from '../sim/simClient';
import type { Snapshot } from '../../worker/protocol';
import { BINDINGS, type BindingId } from './bindings';

const MathView = lazy(() => import('./MathView').then((m) => ({ default: m.MathView })));

/**
 * Calculation drawer (right side; the test bench owns the left). Opened by clicking a gauge
 * value. Live by default; "Hold" freezes the numbers so they can be read out loud.
 */
export function MathDrawer() {
  const id = useUi((s) => s.math);
  const set = useUi((s) => s.set);
  const close = () => set({ math: null });

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useUi.getState().set({ math: null });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  return (
    <AnimatePresence>
      {id && (
        <>
          <motion.div
            key="math-backdrop"
            className="fixed inset-0 z-40 bg-bg/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={close}
          />
          <motion.aside
            key="math-drawer"
            role="dialog"
            aria-label="Calculation"
            className="fixed inset-y-0 right-0 z-50 flex w-[720px] max-w-[94vw] flex-col overflow-y-auto border-l border-line-strong bg-raised shadow-overlay"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={drawerSpring}
          >
            <DrawerBody id={id} onClose={close} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function DrawerBody({ id, onClose }: { id: BindingId; onClose: () => void }) {
  const live = useSim((s) => s.snapshot);
  const [held, setHeld] = useState<Snapshot | null>(null);
  const set = useUi((s) => s.set);
  const label = BINDINGS.find((b) => b.id === id)?.label ?? id;
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b border-line-strong px-8 py-6">
        <div className="flex flex-col gap-1">
          <span className="label">Calculation</span>
          <h2 className="text-h1 font-bold uppercase">{label}</h2>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label="Close the math panel">
          Close ✕
        </Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-8 py-4">
        <Toggle checked={held != null} onChange={(v) => setHeld(v ? live : null)}>
          {held ? 'Holding these numbers' : 'Live · updates 20× a second'}
        </Toggle>
        <Button
          variant="secondary"
          onClick={() => {
            set({ math: null, mathPick: id, page: 'math' });
          }}
        >
          All equations →
        </Button>
      </div>
      <p className="num m-0 border-b border-line px-8 py-4 text-label leading-relaxed text-fg-3">
        This is the Twin&apos;s expected-value chain: its result is the white Twin marker on the
        gauge, and the gap to the measured value is the evidence.
      </p>
      <div className="px-8 py-8">
        <Suspense fallback={<p className="num text-fg-3">Loading KaTeX…</p>}>
          <MathView id={id} snapshot={held ?? live} />
        </Suspense>
      </div>
    </>
  );
}
