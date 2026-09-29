import { useState } from 'react';
import { SectionHeader } from '../shell/Brand';
import { Button, Panel, Segmented } from '../primitives';
import { EvidenceBar, statusText } from '../status';
import { Stagger, StaggerItem } from '../motion';
import { useUi } from '../store';
import { useSim } from '../sim/simClient';
import { MisfirePolar, OrderSpectrumChart, WaveChart } from '../charts/VibrationCharts';
import { ANALYTICS, riskHigh, riskStatus } from '../../analytics';
import type { Status } from '../tokens';

/**
 * Vibration & crank (Phase 7). Everything here is computed from the crank-angle windows the
 * monitor receives: 16 revolutions at 512 samples per revolution (order-tracked), sample 0 at
 * cylinder 1's firing TDC. Thresholds are engine-profile calibration values, never ISO limits.
 */
export function VibrationPage() {
  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="03"
        title="Vibration & crank"
        description="Order spectrum in the crank-angle domain, so peaks stay sharp while RPM changes. A half-order (0.5×) component means one cylinder is firing weak; its phase names which one."
      />
      <Body />
    </div>
  );
}

function Body() {
  const seq = useSim((s) => s.snapshot?.analytics?.spectral?.seq ?? 0);
  const set = useUi((s) => s.set);
  if (!seq)
    return (
      <Panel tab className="flex flex-col items-start gap-5 p-10">
        <span className="label">No crank-angle window yet</span>
        <p className="m-0 max-w-2xl leading-relaxed text-fg-2">
          A window of 16 crank revolutions arrives once per simulated second while the engine is
          running. Start the engine (or run the hero scenario) to fill this page.
        </p>
        <Button variant="secondary" onClick={() => set({ benchOpen: true })}>
          Open test bench
        </Button>
      </Panel>
    );
  return (
    <>
      <Metrics />
      <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <StaggerItem>
          <SpectrumPanel />
        </StaggerItem>
        <StaggerItem>
          <MisfirePanel />
        </StaggerItem>
      </Stagger>
      <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <StaggerItem>
          <Panel className="flex h-full flex-col gap-6 p-8">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-h2 font-bold">Vibration waveform</h3>
              <span className="num text-label text-fg-3">
                two 720° cycles · m/s² · dashed lines mark each firing TDC
              </span>
            </div>
            <WaveChart kind="vib" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel className="flex h-full flex-col gap-6 p-8">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-h2 font-bold">Crank-speed ripple</h3>
              <span className="num text-label text-fg-3">
                about the mean speed · rpm · a weak cylinder leaves a missing rise
              </span>
            </div>
            <WaveChart kind="speed" stroke="#ff9a3c" />
          </Panel>
        </StaggerItem>
      </Stagger>
    </>
  );
}

function ratioStatus(ratio: number, warn: number, crit: number): Status {
  return riskStatus(riskHigh(ratio, warn, crit));
}

function Stat({
  label,
  value,
  unit,
  sub,
  status = 'ok',
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  status?: Status;
}) {
  return (
    <div className="flex h-full flex-col gap-3 border border-line bg-panel p-6 transition-[transform,border-color] duration-fast ease-out hover:-translate-y-0.5 hover:border-line-strong">
      <span className="label">{label}</span>
      <div className="flex items-baseline gap-2">
        <span
          className={`num text-[30px] leading-none font-extrabold ${status === 'ok' ? 'text-fg' : statusText[status]}`}
        >
          {value}
        </span>
        {unit && <span className="num text-sm text-fg-3">{unit}</span>}
      </div>
      {sub && <span className="num text-label text-fg-3">{sub}</span>}
    </div>
  );
}

function Metrics() {
  const s = useSim((x) => x.snapshot?.analytics?.spectral);
  const exp = useSim((x) => x.snapshot?.expected);
  if (!s || !exp) return null;
  const c = ANALYTICS.misfire;
  return (
    <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 sm:grid-cols-2 xl:grid-cols-5">
      <StaggerItem>
        <Stat
          label="Vibration RMS"
          value={s.vib.rms.toFixed(2)}
          unit="m/s²"
          sub={`twin expects ${exp.vibRmsMs2.toFixed(2)} · ×${s.ratios.rms.toFixed(2)}`}
          status={ratioStatus(s.ratios.rms, c.vibRatio.warn, c.vibRatio.crit)}
        />
      </StaggerItem>
      <StaggerItem>
        <Stat label="Peak" value={s.vib.peak.toFixed(2)} unit="m/s²" sub="largest excursion" />
      </StaggerItem>
      <StaggerItem>
        <Stat
          label="Crest factor"
          value={s.vib.crest.toFixed(2)}
          sub={`kurtosis ${s.vib.kurtosis.toFixed(2)}`}
        />
      </StaggerItem>
      <StaggerItem>
        <Stat
          label="Speed ripple"
          value={s.ripplePPRpm.toFixed(1)}
          unit="rpm p-p"
          sub={`twin expects ${exp.ripplePPRpm.toFixed(1)} · ×${s.ratios.ripple.toFixed(2)}`}
          status={ratioStatus(s.ratios.ripple, c.rippleRatio.warn, c.rippleRatio.crit)}
        />
      </StaggerItem>
      <StaggerItem>
        <Stat
          label="I_rpm"
          value={(s.irregularity * 100).toFixed(2)}
          unit="%"
          sub={`σ(N) ÷ mean ${s.meanRpm.toFixed(0)} rpm`}
        />
      </StaggerItem>
    </Stagger>
  );
}

function SpectrumPanel() {
  const [signal, setSignal] = useState<'vib' | 'speed'>('vib');
  const s = useSim((x) => x.snapshot?.analytics?.spectral);
  const level = useSim((x) => x.snapshot?.analytics?.levels.combustion ?? 'NORMAL');
  if (!s) return null;
  const spec = signal === 'vib' ? s.vib.spectrum : s.speed.spectrum;
  const unit = signal === 'vib' ? 'm/s²' : 'rpm';
  const at = (o: number) => (spec[Math.round(o * 16)] ?? 0).toFixed(signal === 'vib' ? 2 : 1);
  return (
    <Panel tab className="flex h-full flex-col gap-6 p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h3 className="text-h2 font-bold">Order spectrum</h3>
          <span className="num text-label text-fg-3">
            crank-angle domain · 16-rev window · window {s.seq} · resolution 1/16 order
          </span>
        </div>
        <div className="w-56">
          <Segmented
            value={signal}
            onChange={setSignal}
            options={[
              { value: 'vib', label: 'VIBRATION' },
              { value: 'speed', label: 'CRANK SPEED' },
            ]}
          />
        </div>
      </div>
      <OrderSpectrumChart spectrum={spec} unit={unit} halfAlert={level !== 'NORMAL'} />
      <div className="num flex flex-wrap gap-x-8 gap-y-2 border-t border-line pt-5 text-sm text-fg-2">
        <span>
          0.5× <b className={level !== 'NORMAL' ? 'text-warn' : 'text-fg'}>{at(0.5)}</b>
        </span>
        <span>
          1× <b className="text-fg">{at(1)}</b>
        </span>
        <span>
          2× <b className="text-fg">{at(2)}</b>
        </span>
        <span className="text-fg-3">{unit}</span>
      </div>
      <p className="m-0 text-sm leading-relaxed text-fg-2">
        The 2× line is always present in an inline-4: the second-order piston forces add while the
        first-order ones cancel. A 0.5× line in the crank speed appears when one cylinder fires
        weak.
      </p>
    </Panel>
  );
}

function MisfirePanel() {
  const s = useSim((x) => x.snapshot?.analytics?.spectral);
  const score = useSim(
    (x) => x.snapshot?.analytics?.evidence.find((e) => e.id === 'combustion')?.score ?? 0,
  );
  const cmd = useSim((x) => x.snapshot?.telemetry.torqueCmdNm);
  const setUi = useUi((s) => s.set);
  const expCmd = useSim((x) => x.snapshot?.expected.torqueCmdNm);
  if (!s) return null;
  const active = s.misfire.missing >= ANALYTICS.misfire.nameAbove;
  return (
    <Panel tab className="flex h-full flex-col gap-6 p-8">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-h2 font-bold">Misfire polar</h3>
        <span className="num text-label text-fg-3">0.5× phase · four 90° sectors</span>
      </div>
      <MisfirePolar
        phase_deg={s.speed.halfPhase_deg}
        missing={s.misfire.missing}
        cylinder={s.misfire.cylinder}
        active={active}
      />
      <div className="num grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <span className="text-fg-3">verdict</span>
        <b className={active ? 'text-warn' : 'text-ok'}>
          {active ? `cylinder ${s.misfire.cylinder}` : 'all cylinders firing'}
        </b>
        <span className="text-fg-3">0.5× phase</span>
        <b>
          {s.speed.halfPhase_deg >= 0 ? '+' : '−'}
          {Math.abs(s.speed.halfPhase_deg).toFixed(0)}°
        </b>
        <span className="text-fg-3">0.5× amplitude</span>
        <b>{s.speed.halfAmp_rpm.toFixed(1)} rpm</b>
        <span className="text-fg-3">torque missing</span>
        <b>{(s.misfire.missing * 100).toFixed(0)}%</b>
        <span className="text-fg-3">torque command</span>
        <b>
          {cmd != null && expCmd ? `${cmd.toFixed(0)} N·m · ×${(cmd / expCmd).toFixed(2)}` : '—'}
        </b>
      </div>
      <div className="flex flex-col gap-3 border-t border-line pt-5">
        <span className="label">Misfire · diagnostic evidence score</span>
        <EvidenceBar score={score} />
      </div>
      <Button variant="ghost" className="self-start" onClick={() => setUi({ math: 'misfire' })}>
        ƒ(x) Show the math
      </Button>
    </Panel>
  );
}
