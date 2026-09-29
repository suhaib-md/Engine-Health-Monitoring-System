import { AnimatePresence, motion } from 'motion/react';
import { Button } from './primitives';
import { EASE_OUT } from './motion';
import { sendSim, useSim } from './sim/simClient';
import { SCENARIOS } from '../worker/scenarios';

/** One-click run of the hero scenario (fixed seed, plays identically every time). */
export function RunHeroButton() {
  const hero = SCENARIOS[0];
  return (
    <Button
      variant="primary"
      title={hero?.blurb}
      onClick={() => sendSim({ type: 'runScenario', id: 'hero' })}
    >
      Run hero scenario
    </Button>
  );
}

/**
 * Narration strip for a running scenario: which step we are on, what to look at, and a way out.
 * It selects primitives only, so it re-renders when the step changes, not on every snapshot.
 */
export function ScenarioBar() {
  const id = useSim((s) => s.snapshot?.scenario?.id ?? null);
  const name = useSim((s) => s.snapshot?.scenario?.name ?? '');
  const step = useSim((s) => s.snapshot?.scenario?.step ?? 0);
  const steps = useSim((s) => s.snapshot?.scenario?.steps ?? 0);
  const title = useSim((s) => s.snapshot?.scenario?.title ?? '');
  const caption = useSim((s) => s.snapshot?.scenario?.caption ?? '');
  const done = useSim((s) => s.snapshot?.scenario?.done ?? false);

  return (
    <AnimatePresence initial={false}>
      {id && (
        <motion.section
          key="scenario"
          aria-label="Scenario progress"
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT }}
        >
          <div className="flex flex-col gap-6 border border-line border-l-4 border-l-accent bg-panel p-6 md:flex-row md:items-center md:justify-between md:gap-10 md:p-8">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <span className="label">Scenario · {name}</span>
                <ol className="m-0 flex list-none items-center gap-2 p-0" aria-label="Steps">
                  {Array.from({ length: steps }, (_, i) => (
                    <motion.li
                      key={i}
                      aria-current={i + 1 === step ? 'step' : undefined}
                      className="h-1.5"
                      animate={{
                        width: i + 1 === step ? 32 : 12,
                        backgroundColor:
                          i + 1 <= step ? 'var(--color-accent)' : 'var(--color-line-strong)',
                      }}
                      transition={{ duration: 0.3, ease: EASE_OUT }}
                    />
                  ))}
                </ol>
                <span className="num text-label text-fg-3">
                  step {step} of {steps}
                  {done ? ' · complete' : ''}
                </span>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  className="flex flex-col gap-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: EASE_OUT }}
                >
                  <h3 className="m-0 text-h2 font-bold">{title}</h3>
                  <p className="m-0 max-w-3xl leading-relaxed text-fg-2">{caption}</p>
                </motion.div>
              </AnimatePresence>
            </div>
            <div className="flex shrink-0 gap-3">
              <Button
                variant="secondary"
                onClick={() => id && sendSim({ type: 'runScenario', id })}
              >
                Restart
              </Button>
              <Button variant="ghost" onClick={() => sendSim({ type: 'stopScenario' })}>
                {done ? 'Dismiss' : 'Stop'}
              </Button>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
