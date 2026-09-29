import { AnimatePresence, motion } from 'motion/react';
import { Button } from './primitives';
import { EASE_OUT } from './motion';
import { sendSim, useSim } from './sim/simClient';
import { formatClock } from './format';

const letter = (i: number) => String.fromCharCode(65 + i);

/**
 * Blind challenge strip (Live Twin). A judge picks one of the face-down cards; the worker injects
 * the fault on it and the UI never learns which one until Reveal. Meanwhile the system's verdict
 * comes from the same analytics everyone can see.
 */
export function BlindBar() {
  const blind = useSim((s) => s.snapshot?.blind ?? null);
  return (
    <AnimatePresence initial={false}>
      {blind && (
        <motion.section
          key="blind"
          aria-label="Blind challenge"
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.32, ease: EASE_OUT }}
        >
          <div className="flex flex-col gap-7 border border-line border-l-4 border-l-fault-marker bg-panel p-6 md:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-2">
                <span className="label">Blind challenge</span>
                <h3 className="m-0 text-h2 font-bold">
                  {blind.picked == null
                    ? 'Pick a sealed card'
                    : blind.answer
                      ? blind.answer.correct
                        ? 'Named correctly'
                        : 'Not named correctly'
                      : `Card ${letter(blind.picked)} is in the engine`}
                </h3>
                <p className="m-0 max-w-3xl leading-relaxed text-fg-2">
                  {blind.picked == null
                    ? 'Each card hides one fault. The worker shuffled them; nobody on this screen knows which is which. The analytics will have to find it from the sensors alone.'
                    : blind.answer
                      ? 'The card is face up. The verdict below is what the monitor concluded before it was turned over.'
                      : 'The fault is developing now. Watch the gauges drift from their ghosts and the evidence build, then turn the card over.'}
                </p>
              </div>
              <div className="flex shrink-0 gap-3">
                {blind.answer && (
                  <Button variant="secondary" onClick={() => sendSim({ type: 'blindDeal' })}>
                    Deal again
                  </Button>
                )}
                <Button variant="ghost" onClick={() => sendSim({ type: 'blindEnd' })}>
                  End · repair
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
              {Array.from({ length: blind.cards }, (_, i) => {
                const chosen = blind.picked === i;
                const faded = blind.picked != null && !chosen;
                return (
                  <motion.button
                    key={i}
                    disabled={blind.picked != null}
                    onClick={() => sendSim({ type: 'blindPick', card: i })}
                    className={`relative flex aspect-[3/4] max-h-40 cursor-pointer flex-col items-center justify-center gap-2 border font-mono disabled:cursor-default ${
                      chosen
                        ? 'border-fault-marker bg-fault-marker/15'
                        : 'border-line-strong bg-bg/60 hover:border-fault-marker'
                    }`}
                    animate={{ opacity: faded ? 0.3 : 1, y: chosen ? -6 : 0 }}
                    whileHover={blind.picked == null ? { y: -4 } : undefined}
                    transition={{ duration: 0.25, ease: EASE_OUT }}
                    aria-label={`Card ${letter(i)}`}
                  >
                    <span className="text-[28px] font-extrabold text-fg">{letter(i)}</span>
                    <span className="text-label text-fg-3">
                      {chosen ? (blind.answer ? 'revealed' : 'in the engine') : 'sealed'}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            {blind.picked != null && <Verdict />}
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function Verdict() {
  const blind = useSim((s) => s.snapshot?.blind ?? null);
  const verdict = useSim((s) => s.snapshot?.analytics?.explanation?.fault ?? null);
  const level = useSim((s) => s.snapshot?.analytics?.overallLevel ?? 'NORMAL');
  if (!blind || blind.picked == null) return null;
  const a = blind.answer;
  const elapsed =
    blind.firstWarningAt != null && blind.pickedAt != null
      ? blind.firstWarningAt - blind.pickedAt
      : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 border-t border-line pt-6 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <div className="flex flex-col gap-2">
        <span className="label">System verdict{a ? ' at the reveal' : ' · live'}</span>
        <span className="text-h2 font-bold">
          {(a ? a.verdict : verdict) ?? 'No fault evidence yet'}
        </span>
        <span className="num text-xs text-fg-3">
          {elapsed != null
            ? `WARNING held ${formatClock(elapsed).slice(3)} after the pick`
            : a
              ? 'never reached WARNING'
              : `alert level ${level}`}
        </span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {a ? (
          <motion.div
            key="answer"
            className="flex flex-col gap-2"
            initial={{ opacity: 0, rotateX: 90 }}
            animate={{ opacity: 1, rotateX: 0 }}
            transition={{ duration: 0.4, ease: EASE_OUT }}
          >
            <span className="label">On the card</span>
            <span className="text-h2 font-bold">{a.label}</span>
            <span className={`num text-xs font-bold ${a.correct ? 'text-ok' : 'text-crit'}`}>
              {a.correct ? `✓ CORRECT · expected “${a.expected}”` : `✗ expected “${a.expected}”`}
            </span>
          </motion.div>
        ) : (
          <motion.div key="hidden" className="flex flex-col gap-2" exit={{ opacity: 0 }}>
            <span className="label">On the card</span>
            <span className="text-h2 font-bold tracking-[0.3em] text-fg-3">• • • • •</span>
          </motion.div>
        )}
      </AnimatePresence>
      {!a && (
        <Button variant="primary" onClick={() => sendSim({ type: 'blindReveal' })}>
          Reveal the card
        </Button>
      )}
    </div>
  );
}
