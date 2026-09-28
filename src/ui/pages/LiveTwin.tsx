import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useUi } from '../store';
import { useSampleClock, sampleSnapshot } from '../preview/sample';
import { SectionHeader } from '../shell/Brand';
import { Button, Panel } from '../primitives';
import { AlertBadge } from '../status';
import { Gauge } from '../Gauge';
import { HealthRing, SubsystemBars } from '../health';
import { AlertItem, ExplanationCard } from '../diagnostics';
import { PartCallout, PartPanel, ViewportChrome } from '../overlay3d';
import { Reveal, Stagger, StaggerItem, drawerSpring } from '../motion';

const PRESETS = ['front', 'cutaway', 'top', 'explode'];

/**
 * Home view (Amendment A): three calm sections instead of one dense grid.
 *   01 hero: 3D viewport + health column
 *   02 signals: six gauges, three per row
 *   03 diagnosis: explanation card + alerts
 */
export function LiveTwinPage() {
  const k = useSampleClock((s) => s.k);
  const targetRpm = useUi((s) => s.targetRpm);
  const engineOn = useUi((s) => s.engineOn);
  const set = useUi((s) => s.set);
  const snap = sampleSnapshot(k, targetRpm, engineOn);
  const [preset, setPreset] = useState('front');
  const [part, setPart] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-20 lg:gap-24">
      {/* 01 · Hero */}
      <section className="flex flex-col gap-10">
        <SectionHeader
          index="01"
          title="Live twin"
          description="What the engine measures, beside what the healthy Twin expects. The gap between them is the evidence."
          aside={
            <Button variant="secondary" onClick={() => set({ benchOpen: true })}>
              Open test bench
            </Button>
          }
        />

        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Reveal>
            <ViewportChrome
              preset={preset}
              presets={PRESETS}
              onPreset={setPreset}
              className="h-[58vh] min-h-[420px]"
            >
              <div className="viewport-hatch absolute inset-0" />
              <div className="num absolute inset-0 flex items-center justify-center text-xs text-fg-3">
                three.js viewport · procedural I4 cutaway (Phase 5)
              </div>
              <div className="absolute left-[14%] top-[64%]">
                <PartCallout
                  name="Oil pump"
                  health={46}
                  status="warn"
                  onClick={() => setPart('oilPump')}
                />
              </div>
              <div className="absolute left-[56%] top-[26%]">
                <PartCallout
                  name="Radiator"
                  health={98}
                  status="ok"
                  onClick={() => setPart('radiator')}
                />
              </div>
              <div className="num absolute bottom-4 right-4 hidden border border-line bg-bg/85 px-3 py-2 text-label text-fg-3 sm:block">
                θ <b className="text-fg">{String(snap.thetaDeg).padStart(3, '0')}°</b>
              </div>

              <AnimatePresence>
                {part && (
                  <motion.div
                    key={part}
                    className="absolute inset-y-4 right-4 z-10 w-[340px] max-w-[calc(100%-2rem)]"
                    initial={{ x: 40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 40, opacity: 0 }}
                    transition={drawerSpring}
                  >
                    {part === 'oilPump' ? (
                      <PartPanel
                        circuit="Lubrication circuit"
                        part="Oil pump"
                        health={46}
                        status="warn"
                        rows={[
                          {
                            sensor: 'Oil pressure',
                            measured: '1.70',
                            expected: '3.23',
                            z: -7.6,
                            zStatus: 'warn',
                          },
                          {
                            sensor: 'Oil temp',
                            measured: '108',
                            expected: '101',
                            z: 2.3,
                            zStatus: 'watch',
                          },
                          {
                            sensor: 'Vib RMS',
                            measured: '4.1',
                            expected: '2.0',
                            z: 2.1,
                            zStatus: 'watch',
                          },
                        ]}
                        actions={
                          <>
                            <Button variant="ghost" onClick={() => set({ page: 'math' })}>
                              Show the math
                            </Button>
                            <Button variant="secondary" onClick={() => setPart(null)}>
                              Close
                            </Button>
                          </>
                        }
                      />
                    ) : (
                      <PartPanel
                        circuit="Cooling circuit"
                        part="Radiator"
                        health={98}
                        status="ok"
                        rows={[
                          {
                            sensor: 'Coolant',
                            measured: '93.4',
                            expected: '93.0',
                            z: 0.3,
                            zStatus: 'ok',
                          },
                        ]}
                        actions={
                          <Button variant="secondary" onClick={() => setPart(null)}>
                            Close
                          </Button>
                        }
                      />
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </ViewportChrome>
          </Reveal>

          <Stagger className="flex flex-col gap-6">
            <StaggerItem>
              <Panel tab className="flex flex-col items-center gap-6 p-8 text-center">
                <HealthRing score={snap.health} state={snap.alertState} size={176} />
                <div className="flex flex-col items-center gap-3">
                  <AlertBadge cls="WARNING" />
                  <span className="text-h2 font-bold leading-tight">{snap.explanation.fault}</span>
                  <span className="num text-xs text-fg-2">RUL 46–62 sim. h · high uncertainty</span>
                </div>
              </Panel>
            </StaggerItem>
            <StaggerItem>
              <Panel className="flex flex-col gap-5">
                <span className="label">Subsystems</span>
                <SubsystemBars items={snap.subsystems} />
              </Panel>
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      {/* 02 · Signals */}
      <section className="flex flex-col gap-10">
        <SectionHeader
          size="section"
          index="02"
          title="Signals"
          description="Six live channels. The white tick is the Twin's expected value; Δ is the residual."
        />
        <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2 xl:grid-cols-3">
          {snap.gauges.map(({ id, ...g }) => (
            <StaggerItem key={id}>
              <Gauge {...g} />
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* 03 · Diagnosis */}
      <section className="flex flex-col gap-10">
        <SectionHeader
          size="section"
          index="03"
          title="Diagnosis"
          description="Every point of the diagnostic evidence score traces back to a named symptom."
        />
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Reveal>
            <ExplanationCard e={snap.explanation} />
          </Reveal>
          <Reveal className="flex flex-col gap-4">
            <span className="label">Alerts · newest first</span>
            <motion.div layout className="flex flex-col gap-3">
              {snap.alerts.map((a) => (
                <AlertItem key={a.id} a={a} />
              ))}
            </motion.div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
