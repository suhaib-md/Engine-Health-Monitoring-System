import { Suspense, lazy, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useUi } from '../store';
import { isEngineRunning, sendSim, useSim } from '../sim/simClient';
import { SectionHeader } from '../shell/Brand';
import { Button, Panel } from '../primitives';
import { AlertBadge, LifecycleBadge, statusBg, statusBorder, statusText } from '../status';
import { Gauge } from '../Gauge';
import { HealthRing, SubsystemBars } from '../health';
import { AlertItem, ExplanationCard } from '../diagnostics';
import { PartPanel, ViewportChrome } from '../overlay3d';
import { RunHeroButton, ScenarioBar } from '../ScenarioBar';
import { BlindBar } from '../BlindBar';
import { Reveal, Stagger, StaggerItem, drawerSpring, EASE_OUT } from '../motion';
import { residualStatus } from '../format';
import { scoreStatus } from '../tokens';
import { ANALYTICS, riskHigh, riskStatus, type ResidualChannel } from '../../analytics';
import { PROFILE } from '../../engine/profile';
import { registerCallout } from '../../three/callouts';
import type { PartId as EnginePartId } from '../../three/Engine';

const PRESETS = ['front', 'cutaway', 'top', 'explode'];
/** stable empty list: a selector must never return a fresh [] (it would re-render forever) */
const NO_ALERTS: never[] = [];

/**
 * Home view (Amendment A), now live from the worker (Phase 4):
 *   01 hero: viewport + health column   02 signals: gauges   03 diagnosis: card + alerts
 * Each block subscribes to its own slice of the snapshot, so the page shell never re-renders per tick.
 */
export function LiveTwinPage() {
  const set = useUi((s) => s.set);
  return (
    <div className="flex flex-col gap-20 lg:gap-24">
      <section className="flex flex-col gap-10">
        <SectionHeader
          index="01"
          title="Live twin"
          description="What the engine measures, beside what the healthy Twin expects. The gap between them is the evidence."
          aside={
            <div className="flex flex-wrap gap-3">
              <RunHeroButton />
              <Button variant="secondary" onClick={() => set({ benchOpen: true })}>
                Open test bench
              </Button>
            </div>
          }
        />
        <ScenarioBar />
        <BlindBar />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <Reveal>
            <Viewport />
          </Reveal>
          <Stagger className="flex flex-col gap-6">
            <StaggerItem>
              <HealthPanel />
            </StaggerItem>
            <StaggerItem>
              <SubsystemsPanel />
            </StaggerItem>
          </Stagger>
        </div>
      </section>

      <section className="flex flex-col gap-10">
        <SectionHeader
          size="section"
          index="02"
          title="Signals"
          description="Live channels. The white tick is the Twin's expected value; Δ is the residual, coloured once it leaves the noise band."
        />
        <Signals />
      </section>

      <section className="flex flex-col gap-10">
        <SectionHeader
          size="section"
          index="03"
          title="Diagnosis"
          description="Every point of the diagnostic evidence score traces back to a named symptom."
        />
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Reveal>
            <Diagnosis />
          </Reveal>
          <Reveal className="flex flex-col gap-4">
            <span className="label">Alerts · newest first</span>
            <Alerts />
          </Reveal>
        </div>
      </section>
    </div>
  );
}

/* ---------- hero ---------- */

// three.js is ~600 kB: load the 3D scene on demand so the rest of the app paints first
const EngineScene = lazy(() => import('../../three/EngineScene'));
/** `?no3d` skips the WebGL scene: for headless browser checks and a last-resort fallback (Q-36). */
const NO_3D =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('no3d');

type PartId = EnginePartId;

/** Holds only UI state (preset, selected part); live data is read by its children, never here. */
function Viewport() {
  const [preset, setPreset] = useState('front');
  const [part, setPart] = useState<PartId | null>(null);
  // DOM callouts: the 3D frame loop moves them onto their parts (no extra React roots)
  return (
    <ViewportChrome
      preset={preset}
      presets={PRESETS}
      onPreset={setPreset}
      className="h-[58vh] min-h-[420px]"
    >
      <Suspense
        fallback={
          <div className="viewport-hatch num absolute inset-0 flex items-center justify-center text-xs text-fg-3">
            loading the procedural I4 cutaway…
          </div>
        }
      >
        {NO_3D ? (
          <div className="viewport-hatch num absolute inset-0 flex items-center justify-center text-xs text-fg-3">
            3D view off (?no3d)
          </div>
        ) : (
          <EngineScene preset={preset} onPart={setPart} />
        )}
      </Suspense>
      <PartMarker
        part="oilPump"
        name="Oil pump"
        subsystem="lubrication"
        onOpen={() => setPart('oilPump')}
      />
      <PartMarker
        part="radiator"
        name="Radiator"
        subsystem="thermal"
        onOpen={() => setPart('radiator')}
      />
      <SpeedReadout />
      <AnimatePresence>
        {part && <PartOverlay key={part} part={part} onClose={() => setPart(null)} />}
      </AnimatePresence>
    </ViewportChrome>
  );
}

/**
 * Minimal 3D part marker: a small status diamond sits on the part. Its label slides out on hover
 * and stays open only while that subsystem is faulty, so labels never cover a healthy engine.
 * The 3D frame loop positions it and sets `data-side` so the label opens away from the engine.
 */
function PartMarker({
  part,
  name,
  subsystem,
  onOpen,
}: {
  part: PartId;
  name: string;
  subsystem: 'lubrication' | 'thermal';
  onOpen: () => void;
}) {
  const h = useSim(
    (s) => s.snapshot?.analytics?.subsystems.find((x) => x.id === subsystem)?.health ?? 100,
  );
  const st = scoreStatus(h);
  const alert = st !== 'ok';
  return (
    <div
      ref={registerCallout(part)}
      data-side="right"
      data-alert={alert}
      className="group pointer-events-none absolute left-0 top-0 z-[5] opacity-0 transition-opacity duration-base"
    >
      <button
        onClick={onOpen}
        aria-label={`${name} · health ${Math.round(h)}`}
        className={`pointer-events-auto absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 cursor-pointer border-2 bg-bg/70 transition-transform duration-fast ease-out hover:scale-125 ${statusBorder[st]}`}
      >
        {alert && <span className={`absolute inset-0 animate-ping ${statusBg[st]} opacity-40`} />}
      </button>
      <div
        className={`absolute top-0 flex -translate-y-1/2 items-center transition-all duration-panel ease-out left-2 group-data-[side=left]:left-auto group-data-[side=left]:right-2 group-data-[side=left]:flex-row-reverse opacity-0 group-hover:opacity-100 group-data-[alert=true]:opacity-100`}
      >
        <span
          className={`h-px w-0 transition-all duration-panel ease-out group-hover:w-10 group-data-[alert=true]:w-10 ${statusBg[st]}`}
        />
        <button
          onClick={onOpen}
          className={`pointer-events-auto cursor-pointer whitespace-nowrap border bg-bg/85 px-2.5 py-1 font-mono text-label font-bold text-fg backdrop-blur-sm ${statusBorder[st]}`}
        >
          {name.toUpperCase()} · <span className={statusText[st]}>{Math.round(h)}</span>
        </button>
      </div>
    </div>
  );
}

/** Real engine speed vs the slowed display speed, plus the renderer's measured fps and mesh count. */
function SpeedReadout() {
  const rpm = useSim((s) => Math.round(s.snapshot?.telemetry.rpm ?? 0));
  const [gfx, setGfx] = useState<{ fps: number; meshes: number; quality: number } | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      const g = (
        window as unknown as { __ignisense3d?: { fps: number; meshes: number; quality: number } }
      ).__ignisense3d;
      if (g) setGfx({ fps: g.fps, meshes: g.meshes, quality: g.quality });
    }, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="num pointer-events-none absolute right-4 top-14 hidden border border-line bg-bg/85 px-3 py-2 text-right text-label text-fg-3 sm:block">
      engine <b className="text-fg">{rpm.toLocaleString('en-US')} rpm</b> · shown at{' '}
      {(rpm / PROFILE.sim.displaySlowdown).toFixed(0)} rpm
      {gfx && (
        <>
          {' '}
          · {gfx.fps} fps · {gfx.meshes} meshes
          {gfx.quality > 0 && ' · reduced effects'}
        </>
      )}
    </div>
  );
}

function PartOverlay({ part, onClose }: { part: PartId; onClose: () => void }) {
  const subs = useSim((s) => s.snapshot?.analytics?.subsystems);
  const f = useSim((s) => s.snapshot?.analytics?.features);
  const set = useUi((s) => s.set);
  const lube = subs?.find((x) => x.id === 'lubrication')?.health ?? 100;
  const thermal = subs?.find((x) => x.id === 'thermal')?.health ?? 100;

  const row = (sensor: string, ch: ResidualChannel, d: number) => {
    const c = f?.channels[ch];
    return {
      sensor,
      measured: c?.measured == null ? '— —' : c.measured.toFixed(d),
      expected: c ? c.expected.toFixed(d) : '—',
      z: c?.z ?? 0,
      zStatus: residualStatus(c?.z),
    };
  };

  return (
    <motion.div
      className="absolute inset-y-4 right-4 z-10 w-[360px] max-w-[calc(100%-2rem)]"
      initial={{ x: 40, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 40, opacity: 0 }}
      transition={drawerSpring}
    >
      <PartPanel
        circuit={part === 'oilPump' ? 'Lubrication circuit' : 'Cooling circuit'}
        part={part === 'oilPump' ? 'Oil pump' : 'Radiator'}
        health={part === 'oilPump' ? lube : thermal}
        status={scoreStatus(part === 'oilPump' ? lube : thermal)}
        rows={
          part === 'oilPump'
            ? [row('Oil pressure', 'oilPressBar', 2), row('Oil temp', 'oilC', 1)]
            : [row('Coolant', 'coolantC', 1), row('Oil temp', 'oilC', 1)]
        }
        actions={
          <>
            <Button
              variant="ghost"
              onClick={() => set({ math: part === 'oilPump' ? 'oilPress' : 'coolant' })}
            >
              Show the math
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        }
      />
    </motion.div>
  );
}

function HealthPanel() {
  const a = useSim((s) => s.snapshot?.analytics);
  const lifecycle = useSim((s) => s.snapshot?.lifecycle ?? 'OFF');
  const running = useSim((s) => isEngineRunning(s.snapshot));
  const health = a?.overallHealth ?? 100;
  const level = a?.overallLevel ?? 'NORMAL';
  const fault = a?.explanation?.fault;

  return (
    <Panel tab className="flex flex-col items-center gap-6 p-8 text-center">
      <HealthRing score={health} state={level} size={176} />
      <div className="flex min-h-24 flex-col items-center gap-3">
        {level === 'NORMAL' ? <LifecycleBadge state={lifecycle} /> : <AlertBadge cls={level} />}
        <AnimatePresence mode="wait">
          <motion.span
            key={fault ?? (running ? 'ok' : 'off')}
            className="text-h2 font-bold leading-tight"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
          >
            {fault ?? (running ? 'No fault evidence' : 'Engine is off')}
          </motion.span>
        </AnimatePresence>
        {!running ? (
          <Button variant="primary" onClick={() => sendSim({ type: 'start' })}>
            Start engine
          </Button>
        ) : (
          <span className="num text-xs text-fg-2">RUL · arrives with trend analysis (Phase 9)</span>
        )}
      </div>
    </Panel>
  );
}

function SubsystemsPanel() {
  const subs = useSim((s) => s.snapshot?.analytics?.subsystems);
  return (
    <Panel className="flex flex-col gap-5">
      <span className="label">Subsystems</span>
      <SubsystemBars items={subs ?? []} />
      <span className="num text-label text-fg-3">— = not monitored while the engine is off</span>
    </Panel>
  );
}

/* ---------- signals ---------- */

function Signals() {
  const tel = useSim((s) => s.snapshot?.telemetry);
  const exp = useSim((s) => s.snapshot?.expected);
  const f = useSim((s) => s.snapshot?.analytics?.features);
  const targetRpm = useUi((s) => s.targetRpm);
  const running = useSim((s) => isEngineRunning(s.snapshot));
  const spectral = useSim((s) => s.snapshot?.analytics?.spectral);
  const set = useUi((s) => s.set);
  if (!tel || !exp) return <p className="num text-fg-3">Waiting for the simulation worker…</p>;

  const q = (v: number | null) => (v == null ? ('unavailable' as const) : ('valid' as const));
  const ch = (c: ResidualChannel) => f?.channels[c];
  const rpmStatus = tel.rpm > 6000 ? 'crit' : 'ok';
  // vibration is judged against the healthy Twin at this speed and load (ratio, not an absolute limit)
  const vibStatus = spectral
    ? riskStatus(
        riskHigh(
          spectral.ratios.rms,
          ANALYTICS.misfire.vibRatio.warn,
          ANALYTICS.misfire.vibRatio.crit,
        ),
      )
    : 'ok';

  return (
    <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2 xl:grid-cols-3">
      <StaggerItem>
        <Gauge
          label="Engine speed"
          onMath={() => set({ math: 'rpm' })}
          unit="rpm"
          value={tel.rpm}
          expected={running ? targetRpm : 0}
          min={0}
          max={7000}
          status={rpmStatus}
          quality="valid"
          zones={[{ from: 6000, to: 7000, status: 'crit' }]}
        />
      </StaggerItem>
      <StaggerItem>
        <Gauge
          label="Coolant"
          onMath={() => set({ math: 'coolant' })}
          unit="°C"
          value={tel.coolantC}
          expected={exp.coolantC}
          min={20}
          max={130}
          decimals={1}
          status={residualStatus(ch('coolantC')?.z)}
          quality={q(tel.coolantC)}
          z={ch('coolantC')?.z}
          zones={[
            { from: 105, to: 120, status: 'warn' },
            { from: 120, to: 130, status: 'crit' },
          ]}
        />
      </StaggerItem>
      <StaggerItem>
        <Gauge
          label="Oil temp"
          onMath={() => set({ math: 'oilTemp' })}
          unit="°C"
          value={tel.oilC}
          expected={exp.oilC}
          min={20}
          max={160}
          status={residualStatus(ch('oilC')?.z)}
          quality={q(tel.oilC)}
          z={ch('oilC')?.z}
          zones={[{ from: 140, to: 160, status: 'crit' }]}
        />
      </StaggerItem>
      <StaggerItem>
        <Gauge
          label="Oil pressure"
          onMath={() => set({ math: 'oilPress' })}
          unit="bar"
          value={tel.oilPressBar}
          // compared at the measured oil temperature (draft §17.3), the same expectation Δ uses
          expected={ch('oilPressBar')?.expected ?? exp.oilPressBar}
          min={0}
          max={5}
          decimals={2}
          status={residualStatus(ch('oilPressBar')?.z)}
          quality={q(tel.oilPressBar)}
          z={ch('oilPressBar')?.z}
          zones={[{ from: 0, to: 0.5, status: 'crit' }]}
        />
      </StaggerItem>
      <StaggerItem>
        <Gauge
          label="Voltage"
          onMath={() => set({ math: 'voltage' })}
          unit="V"
          value={tel.busV}
          expected={exp.busV}
          min={10}
          max={15}
          decimals={1}
          status={residualStatus(ch('busV')?.z)}
          quality={q(tel.busV)}
          z={ch('busV')?.z}
          zones={[{ from: 10, to: 11.8, status: 'warn' }]}
        />
      </StaggerItem>
      <StaggerItem>
        <Gauge
          label="Vibration RMS"
          onMath={() => set({ math: 'vibration' })}
          unit="m/s²"
          value={spectral?.vib.rms ?? 0}
          expected={exp.vibRmsMs2}
          min={0}
          max={10}
          decimals={2}
          status={vibStatus}
          quality={spectral ? 'valid' : 'unavailable'}
          z={spectral ? (spectral.ratios.rms - 1) / 0.15 : undefined}
        />
      </StaggerItem>
    </Stagger>
  );
}

/* ---------- diagnosis ---------- */

function Diagnosis() {
  const e = useSim((s) => s.snapshot?.analytics?.explanation ?? null);
  const running = useSim((s) => isEngineRunning(s.snapshot));
  return (
    <AnimatePresence mode="wait">
      {e ? (
        <motion.div
          key={`${e.fault}-${e.alert}`}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          <ExplanationCard e={e} />
        </motion.div>
      ) : (
        <motion.div
          key="calm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
        >
          <Panel className="flex flex-col gap-3 border-l-4 border-l-ok p-8">
            <span className="label">Probable fault</span>
            <h3 className="text-[22px] leading-tight font-bold">No fault evidence</h3>
            <p className="m-0 leading-relaxed text-fg-2">
              {running
                ? 'Every residual is inside its noise band. Inject a fault from the test bench to watch the evidence build.'
                : 'The engine is off. Start it from the test bench; alerts arm once it has run for a few seconds.'}
            </p>
          </Panel>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Alerts() {
  const alerts = useSim((s) => s.snapshot?.analytics?.alerts ?? NO_ALERTS);
  if (!alerts.length)
    return (
      <p className="m-0 border border-dashed border-line px-5 py-6 text-sm text-fg-3">
        No alerts yet.
      </p>
    );
  return (
    <motion.div layout className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {alerts.slice(0, 8).map((a) => (
          <motion.div
            key={a.id}
            layout
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
          >
            <AlertItem a={a} />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}
