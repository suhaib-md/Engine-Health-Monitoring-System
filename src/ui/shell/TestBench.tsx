import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, Segmented, Slider, Toggle } from '../primitives';
import { FAULTS, useUi, type FanMode, type FaultId, type FaultMode, type Warp } from '../store';
import { scoreStatus } from '../tokens';
import { statusBg, statusText } from '../status';
import { drawerSpring } from '../motion';
import { PROFILE } from '../../engine/profile';

/**
 * Test-bench drawer (Amendment A): engine and fault controls slide in from the left
 * instead of occupying a permanent sidebar.
 */
export function TestBench() {
  const ui = useUi();
  const close = () => ui.set({ benchOpen: false });

  useEffect(() => {
    if (!ui.benchOpen) return;
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && useUi.getState().set({ benchOpen: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ui.benchOpen]);

  // A fault slider fills in the status colour of the health it produces.
  const sevStatus = scoreStatus(100 * (1 - 0.75 * ui.severity));

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

            <section className="panel-tab flex flex-col gap-7 border-b border-line-strong px-8 py-8">
              <span className="label">Engine</span>
              <Button
                variant="primary"
                className="w-full"
                onClick={() => ui.set({ engineOn: !ui.engineOn })}
              >
                {ui.engineOn ? 'Stop engine' : 'Start engine'}
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

            <section className="panel-tab flex flex-col gap-7 px-8 py-8">
              <span className="label">Fault injection</span>
              <label className="flex flex-col gap-2.5">
                <span className="text-sm text-fg-2">Fault</span>
                <select
                  value={ui.fault}
                  onChange={(e) => ui.set({ fault: e.target.value as FaultId })}
                  className="h-10 cursor-pointer border border-line-strong bg-panel px-3 text-base text-fg"
                >
                  {FAULTS.map((f) => (
                    <option key={f.id} value={f.id}>
                      {ui.blind ? '•••••••' : f.label}
                    </option>
                  ))}
                </select>
              </label>
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
                <Button variant="danger" className="flex-1" disabled>
                  Inject fault
                </Button>
              </div>
              <Toggle checked={ui.blind} onChange={(v) => ui.set({ blind: v })}>
                {ui.blind ? 'Blind mode on · fault hidden' : 'Blind mode off'}
              </Toggle>
              <p className="num m-0 text-label leading-relaxed text-fg-3">
                Fault injection connects to the simulator in Phase 3. All values are demo
                calibration.
              </p>
            </section>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
