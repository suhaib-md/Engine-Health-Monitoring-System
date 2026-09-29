import { Suspense, lazy, useEffect, type JSX } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { BRAND } from '../../brand';
import { PAGES, isPageId, useUi, type PageId } from '../store';
import { LifecycleBadge } from '../status';
import { Button } from '../primitives';
import { pageTransition } from '../motion';
import { formatClock } from '../format';
import { useSim, useSimWorker } from '../sim/simClient';
import { startHistory } from '../sim/history';
import { Mark, Wordmark } from './Brand';
import { pageIcon } from '../icons';
import { SlidersHorizontal } from 'lucide-react';
import { TestBench } from './TestBench';
import { LiveTwinPage } from '../pages/LiveTwin';
import { TrendsPage } from '../pages/Trends';
import { VibrationPage } from '../pages/Vibration';
import { ValidationPage } from '../pages/Validation';
import { ReportPage } from '../pages/Report';
import { DebugPage } from '../pages/Debug';
import { MathDrawer } from '../math/MathDrawer';

// the Math page carries KaTeX: load it on first visit
const MathPageLazy = lazy(() => import('../pages/Math'));
function MathPage() {
  return (
    <Suspense fallback={<p className="num text-fg-3">Loading the equations…</p>}>
      <MathPageLazy />
    </Suspense>
  );
}

const VIEWS: Record<PageId, () => JSX.Element> = {
  live: LiveTwinPage,
  trends: TrendsPage,
  vibration: VibrationPage,
  math: MathPage,
  validation: ValidationPage,
  report: ReportPage,
  debug: DebugPage,
};

/** Keeps the page in sync with location.hash so views are linkable (#trends, #math …). */
function useHashRoute() {
  const page = useUi((s) => s.page);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (isPageId(h)) useUi.getState().set({ page: h });
    };
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  useEffect(() => {
    if (window.location.hash.slice(1) !== page) history.replaceState(null, '', `#${page}`);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [page]);
  return page;
}

/** Real simulated time from the worker. */
function SimClock() {
  const t = useSim((s) => s.snapshot?.telemetry.t ?? 0);
  const warp = useSim((s) => s.snapshot?.warp ?? 1);
  const paused = useSim((s) => s.snapshot?.paused ?? false);
  return (
    <span className="num hidden text-sm text-fg-2 md:inline">
      T+ <b className="text-fg">{formatClock(t)}</b> · {paused ? 'paused' : `${warp}×`}
    </span>
  );
}

/** A badge whenever something other than the simulator feeds the monitor. */
function SourceBadge() {
  const kind = useSim((s) => s.snapshot?.source.kind ?? 'sim');
  const name = useSim((s) => s.snapshot?.source.name ?? '');
  if (kind === 'sim') return null;
  return (
    <span
      title={name}
      className="num hidden max-w-[220px] truncate border border-fault-marker px-2.5 py-1 text-label font-bold text-fault-marker sm:inline-block"
    >
      {kind === 'replay' ? 'REPLAY' : 'LIVE'} · {name}
    </span>
  );
}

function SimLifecycle() {
  const lifecycle = useSim((s) => s.snapshot?.lifecycle ?? 'OFF');
  const transient = useSim((s) => s.snapshot?.transient ?? false);
  const firing = lifecycle === 'WARMUP' || lifecycle === 'RUNNING';
  return (
    <span className="hidden sm:inline-block">
      <LifecycleBadge
        state={lifecycle}
        sub={firing ? (transient ? 'TRANSIENT' : 'STEADY') : undefined}
      />
    </span>
  );
}

export function AppShell() {
  useSimWorker();
  startHistory();
  const page = useHashRoute();
  const set = useUi((s) => s.set);
  const View = VIEWS[page];

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col overflow-x-clip">
        <header className="sticky top-0 z-30 border-b border-line bg-panel">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-8 gap-y-2 px-6 lg:px-10">
            <a
              href="#live"
              className="flex h-16 items-center gap-3 text-fg hover:text-fg"
              aria-label={`${BRAND.product} home`}
            >
              <Mark />
              <Wordmark />
            </a>

            <nav
              className="order-last -mx-6 flex w-[calc(100%+3rem)] overflow-x-auto px-6 lg:order-none lg:mx-0 lg:w-auto lg:px-0"
              aria-label="Pages"
            >
              {PAGES.map((p) => {
                const Icon = pageIcon[p.id];
                return (
                  <button
                    key={p.id}
                    onClick={() => set({ page: p.id })}
                    aria-current={p.id === page ? 'page' : undefined}
                    className={`relative flex h-14 shrink-0 cursor-pointer items-center gap-2 px-4 text-sm font-semibold uppercase tracking-[0.04em] transition-colors duration-fast lg:h-16 ${
                      p.id === page ? 'text-fg' : 'text-fg-3 hover:text-fg'
                    }`}
                  >
                    <Icon aria-hidden className="size-4" />
                    {p.label}
                    {p.id === page && (
                      <motion.span
                        layoutId="tab-underline"
                        className="absolute inset-x-3 bottom-0 h-0.5 bg-accent"
                        transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                      />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="ml-auto flex h-16 items-center gap-4">
              <SourceBadge />
              <SimLifecycle />
              <SimClock />
              <Button variant="secondary" onClick={() => set({ benchOpen: true })}>
                <SlidersHorizontal aria-hidden className="size-4" />
                Test bench
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-10 lg:px-10 lg:py-14">
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={pageTransition}
            >
              <View />
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="border-t border-line">
          <div className="num mx-auto flex max-w-[1440px] flex-wrap justify-between gap-3 px-6 py-6 text-label text-fg-3 lg:px-10">
            <span>
              {BRAND.fullName} · Team {BRAND.team}
            </span>
            <span>{BRAND.tagline} · all values are demo calibration</span>
          </div>
        </footer>

        <TestBench />
        <MathDrawer />
      </div>
    </MotionConfig>
  );
}
