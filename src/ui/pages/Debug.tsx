import { PROFILE } from '../../engine/profile';
import { SectionHeader } from '../shell/Brand';
import { Button, Panel } from '../primitives';
import { LifecycleBadge, statusText } from '../status';
import { Reveal } from '../motion';
import { isEngineRunning, sendSim, useSim } from '../sim/simClient';
import { formatClock } from '../format';
import type { Status } from '../tokens';
import { DataSourcePanel } from '../sources/DataSourcePanel';

/**
 * Phase 2 debug view: raw telemetry beside the Twin's expectation, straight from the worker.
 * No analytics yet — z is just residual / sensor σ so a healthy engine should sit near ±1.
 */
const ROWS = [
  { key: 'coolantC', label: 'Coolant', unit: '°C', d: 2 },
  { key: 'oilC', label: 'Oil temp', unit: '°C', d: 2 },
  { key: 'oilPressBar', label: 'Oil pressure', unit: 'bar', d: 3 },
  { key: 'busV', label: 'Bus voltage', unit: 'V', d: 3 },
] as const;

const zStatus = (z: number): Status =>
  Math.abs(z) > 5 ? 'crit' : Math.abs(z) > 3 ? 'watch' : 'ok';

export function DebugPage() {
  const snap = useSim((s) => s.snapshot);

  if (!snap) {
    return <p className="num text-fg-3">Waiting for the simulation worker…</p>;
  }
  const tel = snap.telemetry;
  const running = isEngineRunning(snap);

  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="07"
        title="Debug & data"
        description="Raw telemetry beside what the blind Twin expects, and the data source feeding them. On a healthy engine the residual is pure sensor noise (|z| ≈ 1)."
        aside={
          snap.source.kind !== 'sim' ? undefined : (
            <>
              <Button
                variant="primary"
                onClick={() => sendSim({ type: running ? 'stop' : 'start' })}
              >
                {running ? 'Stop engine' : 'Start engine'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => sendSim({ type: 'pause', paused: !snap.paused })}
              >
                {snap.paused ? 'Resume' : 'Pause'}
              </Button>
              <Button variant="ghost" onClick={() => sendSim({ type: 'reset' })}>
                Reset
              </Button>
            </>
          )
        }
      />

      <Reveal>
        <DataSourcePanel />
      </Reveal>

      <Reveal>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
          {[
            [
              'Lifecycle',
              <LifecycleBadge
                key="l"
                state={snap.lifecycle}
                sub={snap.transient ? 'TRANSIENT' : undefined}
              />,
            ],
            ['Sim time', `T+ ${formatClock(tel.t)}`],
            ['Sim rate', `${snap.simRate.toFixed(0)}× (set ${snap.warp}×)`],
            ['Seed', String(snap.seed)],
            ['Engine speed', `${tel.rpm.toFixed(0)} rpm`],
            ['Load', `${(tel.load * 100).toFixed(1)} %`],
            ['Ambient', `${tel.ambientC.toFixed(1)} °C`],
            ['Fan', tel.fanOn ? 'ON' : 'OFF'],
          ].map(([k, v]) => (
            <Panel key={String(k)} className="flex flex-col gap-2 p-5">
              <span className="label">{k}</span>
              <span className="num text-h3 font-bold">{v}</span>
            </Panel>
          ))}
        </div>
      </Reveal>

      <Reveal>
        <div className="overflow-x-auto border border-line bg-panel">
          <table className="num w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="label text-left">
                <th className="border-b border-line px-8 py-4 font-medium">Channel</th>
                <th className="border-b border-line px-4 py-4 text-right font-medium">Measured</th>
                <th className="border-b border-line px-4 py-4 text-right font-medium">Twin</th>
                <th className="border-b border-line px-4 py-4 text-right font-medium">Residual</th>
                <th className="border-b border-line px-8 py-4 text-right font-medium">z = r/σ</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r) => {
                const m = tel[r.key];
                const e = snap.expected[r.key];
                const res = m == null ? null : m - e;
                const z = res == null ? null : res / PROFILE.sensors[r.key].sigma;
                return (
                  <tr key={r.key}>
                    <td className="border-b border-line px-8 py-4 font-sans">
                      {r.label} <span className="text-fg-3">{r.unit}</span>
                    </td>
                    <td className="border-b border-line px-4 py-4 text-right font-bold">
                      {m == null ? <span className="text-invalid">— —</span> : m.toFixed(r.d)}
                    </td>
                    <td className="border-b border-line px-4 py-4 text-right text-fg-2">
                      {e.toFixed(r.d)}
                    </td>
                    <td className="border-b border-line px-4 py-4 text-right">
                      {res == null ? '—' : `${res >= 0 ? '+' : '−'}${Math.abs(res).toFixed(r.d)}`}
                    </td>
                    <td
                      className={`border-b border-line px-8 py-4 text-right font-bold ${z == null ? 'text-invalid' : statusText[zStatus(z)]}`}
                    >
                      {z == null ? '—' : `${z >= 0 ? '+' : '−'}${Math.abs(z).toFixed(1)}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
