import { useEffect, type JSX } from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { BRAND } from '../../brand';
import { PAGES, isPageId, useUi, type PageId } from '../store';
import { LifecycleBadge } from '../status';
import { Button } from '../primitives';
import { pageTransition } from '../motion';
import { formatClock, useSampleClock, useSampleTicker } from '../preview/sample';
import { Mark, Wordmark } from './Brand';
import { TestBench } from './TestBench';
import { LiveTwinPage } from '../pages/LiveTwin';
import { TrendsPage } from '../pages/Trends';
import { VibrationPage } from '../pages/Vibration';
import { MathPage } from '../pages/Math';
import { ValidationPage } from '../pages/Validation';
import { ReportPage } from '../pages/Report';

const VIEWS: Record<PageId, () => JSX.Element> = {
  live: LiveTwinPage,
  trends: TrendsPage,
  vibration: VibrationPage,
  math: MathPage,
  validation: ValidationPage,
  report: ReportPage,
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

function SimClock() {
  const t = useSampleClock((s) => s.t);
  const warp = useUi((s) => s.warp);
  return (
    <span className="num hidden text-sm text-fg-2 md:inline">
      T+ <b className="text-fg">{formatClock(t)}</b> · {warp}×
    </span>
  );
}

export function AppShell() {
  useSampleTicker();
  const page = useHashRoute();
  const engineOn = useUi((s) => s.engineOn);
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
              {PAGES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => set({ page: p.id })}
                  aria-current={p.id === page ? 'page' : undefined}
                  className={`relative flex h-14 shrink-0 cursor-pointer items-center px-4 text-sm font-semibold uppercase tracking-[0.04em] transition-colors duration-fast lg:h-16 ${
                    p.id === page ? 'text-fg' : 'text-fg-3 hover:text-fg'
                  }`}
                >
                  {p.label}
                  {p.id === page && (
                    <motion.span
                      layoutId="tab-underline"
                      className="absolute inset-x-3 bottom-0 h-0.5 bg-accent"
                      transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                    />
                  )}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex h-16 items-center gap-4">
              <span
                className="hidden border border-line px-2 py-1 font-mono text-label tracking-[0.1em] text-fg-3 xl:inline"
                title="Design preview: values are sample data until the simulator lands"
              >
                SAMPLE DATA
              </span>
              <span className="hidden sm:inline-block">
                <LifecycleBadge
                  state={engineOn ? 'RUNNING' : 'OFF'}
                  sub={engineOn ? 'STEADY' : undefined}
                />
              </span>
              <SimClock />
              <Button variant="secondary" onClick={() => set({ benchOpen: true })}>
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
      </div>
    </MotionConfig>
  );
}
