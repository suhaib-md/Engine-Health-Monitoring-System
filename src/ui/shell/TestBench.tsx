import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Segmented, Slider } from '../primitives';
import {
  AVAILABLE_PHASE,
  FAULTS,
  useUi,
  type FanMode,
  type FaultId,
  type FaultMode,
  type Warp,
} from '../store';
import { scoreStatus } from '../tokens';
import { statusBg, statusText } from '../status';
import { drawerSpring } from '../motion';
import { PROFILE } from '../../engine/profile';
import { isEngineRunning, sendSim, useSim } from '../sim/simClient';
import { SCENARIOS } from '../../worker/scenarios';
import { cx } from '../primitives';

/**
 * Test-bench drawer (Amendment A): engine and fault controls slide in from the left
 * instead of occupying a permanent sidebar.
 */
export function TestBench() {
  const ui = useUi();
  const running = useSim((s) => isEngineRunning(s.snapshot));
  const scenarioActive = useSim((s) => !!s.snapshot?.scenario);
  const blindActive = useSim((s) => !!s.snapshot?.blind);
  const close = () => ui.set({ benchOpen: false });

  useEffect(() => {
    if (!ui.benchOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && useUi.getState().set({ benchOpen: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.benchOpen]);

  // A fault slider fills in the status colour of the health it produces.
  const fault = FAULTS.find((f) => f.id === ui.fault) ?? FAULTS[0];
  const sevStatus = scoreStatus(100 * (1 - fault.gain * ui.severity));
  const injectable = fault.phase <= AVAILABLE_PHASE;
  const inject = () => {
    if (fault.id === 'misfire')
      sendSim({
        type: 'injectFault',
        fault: `misfire${ui.cylinder}`,
        severity: ui.severity,
        onset: ui.faultMode,
      });
    else if (fault.id === 'oilPump' || fault.id === 'cooling')
      sendSim({ type: 'injectFault', fault: fault.id, severity: ui.severity, onset: ui.faultMode });
  };

  return (
    <AnimatePresence>
      {ui.benchOpen && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-bg/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24 }}
            onClick={close}
          />
          <motion.aside
            key="drawer"
            role="dialog"
            aria-label="Test bench"
            className="fixed inset-y-0 left-0 z-50 flex w-[420px] max-w-[92vw] flex-col overflow-y-auto border-r border-line-strong bg-raised shadow-overlay"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={drawerSpring}
          >
            <header className="flex items-center justify-between border-b border-line-strong px-8 py-6">
              <div className="flex flex-col gap-1">
                <span className="label">Virtual engine</span>
                <h2 className="text-h1 font-bold uppercase">Test bench</h2>
              </div>
              <Button variant="ghost" onClick={close} aria-label="Close test bench">
                Close ✕
              </Button>
            </header>

            <section className="panel-tab flex flex-col gap-6 border-b border-line-strong px-8 py-8">
              <span className="label">Scenario</span>
              <div role="radiogroup" aria-label="Scenario" className="flex flex-col gap-3">
                {SCENARIOS.map((sc) => (
                  <button
                    key={sc.id}
                    role="radio"
                    aria-checked={ui.scenario === sc.id}
                    onClick={() => ui.set({ scenario: sc.id })}
                    className={cx(
                      'flex cursor-pointer flex-col gap-1.5 border p-4 text-left transition-colors duration-fast',
                      ui.scenario === sc.id
                        ? 'border-accent bg-accent-dim'
                        : 'border-line-strong hover:border-fg-3',
                    )}
                  >
                    <span className="text-sm font-bold text-fg">{sc.name}</span>
                    <span className="text-label leading-relaxed text-fg-3">{sc.blurb}</span>
                  </button>
                ))}
                <div
                  aria-disabled="true"
                  className="flex flex-col gap-1.5 border border-dashed border-line p-4 opacity-60"
                >
                  <span className="text-sm font-bold text-fg-2">Hot-city stop-and-go</span>
                  <span className="text-label text-fg-3">Arrives in Phase 10.</span>
                </div>
              </div>
              <div className="flex gap-3">
                <Button
                  variant="primary"
                  className="flex-1"
                  onClick={() => {
                    sendSim({ type: 'runScenario', id: ui.scenario });
                    close();
                  }}
                >
                  Run scenario
                </Button>
                {scenarioActive && (
                  <Button variant="secondary" onClick={() => sendSim({ type: 'stopScenario' })}>
                    Stop
                  </Button>
                )}
              </div>
              <p className="num m-0 text-label leading-relaxed text-fg-3">
                Scripts run on the simulated clock with a fixed seed, so they play identically every
                time. Moving a control mid-run takes over from the script.
              </p>
            </section>

            <section className="panel-tab flex flex-col gap-7 border-b border-line-strong px-8 py-8">
              <span className="label">Engine</span>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => sendSim({ type: running ? 'stop' : 'start' })}
              >
                {running ? 'Stop engine' : 'Start engine'}
              </Button>
              <Slider
                label="Target RPM"
                value={ui.targetRpm}
                min={PROFILE.speed.idle_rpm}
                max={7000}
                step={50}
                unit="rpm"
                redlineFrom={
                  (PROFILE.speed.max_rpm - PROFILE.speed.idle_rpm) / (7000 - PROFILE.speed.idle_rpm)
                }
                hint={
                  <>
                    <span>{PROFILE.speed.idle_rpm} idle</span>
                    <span>redline {PROFILE.speed.max_rpm.toLocaleString('en-US')}</span>
                  </>
                }
                onChange={(v) => ui.set({ targetRpm: v })}
              />
              <Slider
                label="Load"
                value={ui.load_Nm}
                min={0}
                max={PROFILE.torque.peak_Nm}
                unit="N·m"
                onChange={(v) => ui.set({ load_Nm: v })}
              />
              <Slider
                label="Ambient"
                value={ui.ambient_C}
                min={-10}
                max={50}
                unit="°C"
                onChange={(v) => ui.set({ ambient_C: v })}
              />
              <Segmented<FanMode>
                label="Radiator fan"
                value={ui.fan}
                onChange={(v) => ui.set({ fan: v })}
                options={[
                  { value: 'auto', label: 'AUTO' },
                  { value: 'on', label: 'ON' },
                  { value: 'off', label: 'OFF' },
                ]}
              />
              <Segmented<Warp>
                label="Time-warp"
                value={ui.warp}
                onChange={(v) => ui.set({ warp: v })}
                options={PROFILE.sim.timeWarpOptions.map((w) => ({ value: w, label: `${w}×` }))}
              />
            </section>

            <section className="panel-tab flex flex-col gap-6 border-b border-line-strong px-8 py-8">
              <span className="label">Blind challenge</span>
              <p className="m-0 text-sm leading-relaxed text-fg-2">
                Deal six sealed fault cards. A judge picks one on the Live Twin page; the monitor
                has to name it from the sensors alone before the card is turned over.
              </p>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  sendSim({ type: 'blindDeal' });
                  ui.set({ page: 'live' });
                  close();
                }}
              >
                {blindActive ? 'Deal a new hand' : 'Deal blind challenge'}
              </Button>
            </section>

            <section className="panel-tab flex flex-col gap-7 px-8 py-8">
              <span className="label">Fault injection</span>
              <label className="flex flex-col gap-2.5">
                <span className="text-sm text-fg-2">Fault</span>
                <select
                  value={ui.fault}
                  onChange={(e) => {
                    const id = e.target.value as FaultId;
                    // a misfire is abrupt: default it to instant onset (the slider still overrides)
                    ui.set(
                      id === 'misfire'
                        ? { fault: id, faultMode: 'instant', severity: 1 }
                        : { fault: id },
                    );
                  }}
                  className="h-10 cursor-pointer border border-line-strong bg-panel px-3 text-base text-fg"
                >
                  {FAULTS.map((f) => (
                    <option key={f.id} value={f.id} disabled={f.phase > AVAILABLE_PHASE}>
                      {f.label}
                      {f.phase > AVAILABLE_PHASE ? ` (Phase ${f.phase})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              {fault.id === 'misfire' && (
                <Segmented<'1' | '2' | '3' | '4'>
                  label="Cylinder"
                  value={String(ui.cylinder) as '1' | '2' | '3' | '4'}
                  onChange={(v) => ui.set({ cylinder: Number(v) as 1 | 2 | 3 | 4 })}
                  options={(['1', '2', '3', '4'] as const).map((c) => ({
                    value: c,
                    label: `C${c}`,
                  }))}
                />
              )}
              <Slider
                label="Severity"
                value={ui.severity}
                min={0}
                max={1}
                step={0.01}
                format={(v) => v.toFixed(2)}
                fillClass={statusBg[sevStatus]}
                valueClass={statusText[sevStatus]}
                onChange={(v) => ui.set({ severity: v })}
              />
              <Segmented<FaultMode>
                label="Onset"
                value={ui.faultMode}
                onChange={(v) => ui.set({ faultMode: v })}
                options={[
                  { value: 'gradual', label: 'GRADUAL' },
                  { value: 'instant', label: 'INSTANT' },
                ]}
              />
              <div className="flex gap-3">
                <Button
                  variant="danger"
                  className="flex-1"
                  disabled={!injectable || blindActive}
                  title={blindActive ? 'End the blind challenge first' : undefined}
                  onClick={inject}
                >
                  Inject fault
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => sendSim({ type: 'clearFaults' })}
                >
                  Repair
                </Button>
              </div>

              <p className="num m-0 text-label leading-relaxed text-fg-3">
                Severity {ui.severity.toFixed(2)} leaves{' '}
                {fault.id === 'misfire'
                  ? `cylinder ${ui.cylinder} combustion`
                  : fault.label.toLowerCase()}{' '}
                at health {(1 - fault.gain * ui.severity).toFixed(2)}. Gradual onset ramps over 120
                simulated seconds. All values are demo calibration.
              </p>
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
