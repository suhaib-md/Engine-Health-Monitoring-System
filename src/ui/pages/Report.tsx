import { useEffect, useState } from 'react';
import { BRAND } from '../../brand';
import { SectionHeader } from '../shell/Brand';
import { Button } from '../primitives';
import { useSim } from '../sim/simClient';
import { history } from '../sim/history';
import { formatClock } from '../format';
import type { Snapshot } from '../../worker/protocol';
import { STAT_LABEL, formatSim } from '../../analytics';

/**
 * Maintenance report (Phase 10; draft §26, §35.5, §46). A frozen copy of the live analytics, laid
 * out on paper colours so it prints on one A4 page. Everything on it comes from what the monitor
 * observed: telemetry, the Twin and the analytics, never the hidden fault state.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const human = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

const ALERT_BG: Record<string, string> = {
  NORMAL: 'bg-accent-print',
  INFO: 'bg-accent-print',
  WATCH: 'bg-[#a16207]',
  WARNING: 'bg-warn-print',
  CRITICAL: 'bg-crit-print',
};

export function ReportPage() {
  const [taken, setTaken] = useState(() => ({
    snap: useSim.getState().snapshot,
    at: new Date(),
  }));
  const refresh = () => setTaken({ snap: useSim.getState().snapshot, at: new Date() });
  const fileName = `${BRAND.fileSlug}-report-${stamp(taken.at)}`;

  // the browser offers the document title as the PDF file name
  useEffect(() => {
    const before = document.title;
    const onBefore = () => {
      document.title = fileName;
      document.body.classList.add('print-report');
    };
    const onAfter = () => {
      document.title = before;
      document.body.classList.remove('print-report');
    };
    window.addEventListener('beforeprint', onBefore);
    window.addEventListener('afterprint', onAfter);
    return () => {
      window.removeEventListener('beforeprint', onBefore);
      window.removeEventListener('afterprint', onAfter);
    };
  }, [fileName]);

  return (
    <div className="flex flex-col gap-14">
      <div data-print-hide>
        <SectionHeader
          index="06"
          title="Report"
          description="A one-page maintenance report: fault, evidence, recommended action, RUL band and exposure. It is a snapshot of the live monitor; refresh it, then print or save it as a PDF."
          aside={
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={refresh}>
                Refresh from engine
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  refresh();
                  setTimeout(() => window.print(), 50);
                }}
              >
                Print / save PDF
              </Button>
            </div>
          }
        />
      </div>
      <div className="flex justify-center">
        <ReportSheet snap={taken.snap} at={taken.at} fileName={fileName} />
      </div>
    </div>
  );
}

function ReportSheet({
  snap,
  at,
  fileName,
}: {
  snap: Snapshot | null;
  at: Date;
  fileName: string;
}) {
  const a = snap?.analytics ?? null;
  const e = a?.explanation ?? null;
  const level = a?.overallLevel ?? 'NORMAL';
  // the most urgent significant trend (the same one the Live Twin RUL line shows)
  const rul = a?.rul
    .filter((r) => r.significant && r.rul_s != null)
    .sort((x, y) => x.rul_s! - y.rul_s!)[0];
  const tel = snap?.telemetry;
  const exposure = a?.exposure;
  const sensorsOut = a
    ? (Object.entries(a.sanity.channels) as [string, { state: string; reason: string }][]).filter(
        ([, v]) => v.state !== 'ok',
      )
    : [];

  return (
    <article
      id="report-sheet"
      className="flex w-full max-w-[720px] flex-col gap-5 bg-paper p-8 text-[11.5px] leading-snug text-ink sm:p-10"
    >
      {/* header */}
      <div className="flex items-start justify-between gap-4 border-b-[3px] border-ink pb-3">
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true">
            <polygon points="14,8 30,8 26,32 10,32" fill="#0a8a9a" />
            <rect x="27" y="27" width="6" height="6" fill="#d8283a" />
          </svg>
          <div className="flex flex-col">
            <b className="text-[15px] tracking-[0.04em]">{BRAND.product.toUpperCase()}</b>
            <span className="text-ink-2">{BRAND.reportTitle}</span>
          </div>
        </div>
        <span className="num text-right text-ink-2">
          {human(at)}
          <br />
          engine time {formatClock(tel?.t ?? 0)} · seed {snap?.seed ?? '—'}
        </span>
      </div>

      {!snap || !a ? (
        <p className="m-0">
          No engine data yet. Start the engine (or run the hero scenario), then refresh this report.
        </p>
      ) : (
        <>
          {/* verdict */}
          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="num text-[9.5px] tracking-[0.1em] text-ink-2">PROBABLE FAULT</span>
              <b className="text-[20px] leading-tight">{e?.fault ?? 'No fault evidence'}</b>
            </div>
            <span
              className={`num px-3 py-1 text-[10px] font-extrabold tracking-[0.08em] text-white ${ALERT_BG[level]}`}
            >
              {level}
            </span>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-4 border border-rule">
            {[
              ['OVERALL HEALTH', a.overallHealth.toFixed(1)],
              ['EVIDENCE', e ? `${e.evidence.toFixed(2)} · ${e.uncertainty.evidence}` : '—'],
              [
                'RUL BAND',
                rul?.rul_s != null && rul.low_s != null && rul.high_s != null
                  ? `${formatSim(rul.low_s)}–${formatSim(rul.high_s)}`
                  : 'no trend',
              ],
              [
                'OPERATING POINT',
                `${Math.round(tel?.rpm ?? 0).toLocaleString('en-US')} rpm · ${((tel?.load ?? 0) * 100).toFixed(0)} %`,
              ],
            ].map(([k, v], i) => (
              <div
                key={k}
                className={`flex flex-col gap-1 p-2.5 ${i < 3 ? 'border-r border-rule' : ''}`}
              >
                <span className="num text-[9px] text-ink-2">{k}</span>
                <b className="num text-[15px]">{v}</b>
              </div>
            ))}
          </div>

          {/* evidence + action */}
          <div className="grid grid-cols-[1.3fr_1fr] gap-5">
            <div className="flex flex-col gap-1.5">
              <span className="num text-[9.5px] tracking-[0.1em] text-ink-2">
                WHY THE SYSTEM THINKS THIS
              </span>
              {(e?.why ?? [{ text: 'Every residual is inside its noise band.', status: 'ok' }])
                .slice(0, 6)
                .map((w, i) => (
                  <span key={i}>
                    {w.status === 'ok' ? '·' : '✓'} {w.text}
                  </span>
                ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="num text-[9.5px] tracking-[0.1em] text-ink-2">
                RECOMMENDED ACTION
              </span>
              <span>{e?.action ?? 'No action needed. Continue normal service intervals.'}</span>
              {sensorsOut.length > 0 && (
                <span className="text-warn-print">
                  Sensor check: {sensorsOut.map(([c, v]) => `${c} (${v.state})`).join(', ')}.
                </span>
              )}
            </div>
          </div>

          {/* subsystems + trend */}
          <div className="grid grid-cols-[1fr_1.2fr] gap-5">
            <div className="flex flex-col gap-1">
              <span className="num text-[9.5px] tracking-[0.1em] text-ink-2">SUBSYSTEM HEALTH</span>
              {a.subsystems.map((s) => (
                <div key={s.id} className="grid grid-cols-[1fr_90px_30px] items-center gap-2">
                  <span>{s.name}</span>
                  <span className="h-1.5 bg-rule">
                    <span
                      className={`block h-full ${s.health == null ? '' : s.health < 45 ? 'bg-crit-print' : s.health < 70 ? 'bg-warn-print' : 'bg-accent-print'}`}
                      style={{ width: `${s.health ?? 0}%` }}
                    />
                  </span>
                  <b className="num text-right">{s.health == null ? '—' : s.health.toFixed(0)}</b>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <span className="num text-[9.5px] tracking-[0.1em] text-ink-2">
                OVERALL HEALTH · RECENT HISTORY
              </span>
              <HealthSparkline />
            </div>
          </div>

          {/* model status, exposure */}
          <div className="grid grid-cols-2 gap-5">
            <dl className="num m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10.5px]">
              <span className="col-span-2 text-[9.5px] tracking-[0.1em] text-ink-2">
                MODEL STATUS AND CONFIDENCE
              </span>
              <dt className="text-ink-2">Anomaly</dt>
              <dd className="m-0">
                {a.stats.d2 == null
                  ? a.stats.phase === 'monitoring'
                    ? 'paused'
                    : `baseline ${a.stats.phase}`
                  : `D² ${a.stats.d2.toFixed(1)} (limit ${a.stats.limit})`}
              </dd>
              <dt className="text-ink-2">Drift</dt>
              <dd className="m-0">
                {a.stats.cusumAlarm.length
                  ? `CUSUM: ${a.stats.cusumAlarm.map((c) => STAT_LABEL[c]).join(', ')}`
                  : 'CUSUM quiet'}
              </dd>
              <dt className="text-ink-2">RUL</dt>
              <dd className="m-0">{e?.model.rul ?? rul?.text ?? 'no significant trend'}</dd>
              <dt className="text-ink-2">Agreement</dt>
              <dd className="m-0">{e?.uncertainty.agreement ?? '—'}</dd>
              <dt className="text-ink-2">Uncertainty</dt>
              <dd className="m-0">{e ? `${e.uncertainty.level} · prototype estimate` : '—'}</dd>
            </dl>
            <dl className="num m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10.5px]">
              <span className="col-span-2 text-[9.5px] tracking-[0.1em] text-ink-2">
                EXPOSURE (DRAFT §26)
              </span>
              <dt className="text-ink-2">Running time</dt>
              <dd className="m-0">{formatSim(exposure?.running_s ?? 0)}</dd>
              <dt className="text-ink-2">High coolant temp</dt>
              <dd className="m-0">{(exposure?.highTemp_s ?? 0).toFixed(0)} risk·s</dd>
              <dt className="text-ink-2">Low oil pressure × load</dt>
              <dd className="m-0">{(exposure?.lowPressureLoad_s ?? 0).toFixed(0)} risk·s</dd>
              <dt className="text-ink-2">Overspeed</dt>
              <dd className="m-0">{(exposure?.overspeed_s ?? 0).toFixed(0)} risk·s</dd>
            </dl>
          </div>

          {/* recent alerts */}
          <div className="flex flex-col gap-1">
            <span className="num text-[9.5px] tracking-[0.1em] text-ink-2">RECENT ALERTS</span>
            {a.alerts.length === 0 && <span>None.</span>}
            {a.alerts.slice(0, 5).map((al) => (
              <span key={al.id} className="num text-[10.5px]">
                {al.time} · <b>{al.cls}</b> · {al.subsystem} · {al.title}
                {al.measured ? ` · ${al.measured}` : ''} · {al.source}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="num mt-2 flex justify-between gap-4 border-t border-rule pt-3 text-[9.5px] text-ink-2">
        <span>
          All values are demo calibration of a simulated engine · {BRAND.tagline} · Team{' '}
          {BRAND.team}
        </span>
        <span>{fileName}.pdf</span>
      </div>
    </article>
  );
}

/** Overall-health history in the print palette (read once from the chart ring buffer). */
function HealthSparkline() {
  const [pts] = useState(() => {
    const n = history.t.length;
    const from = Math.max(0, n - 600);
    const out: [number, number][] = [];
    for (let i = from; i < n; i++) {
      const h = history.health[i];
      if (h != null) out.push([history.t[i]!, h]);
    }
    return out;
  });
  if (pts.length < 2)
    return (
      <div className="flex h-20 items-center border border-rule px-3 text-ink-2">
        no history yet
      </div>
    );
  const t0 = pts[0]![0];
  const t1 = pts[pts.length - 1]![0];
  const W = 300;
  const H = 80;
  const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * W;
  const y = (h: number) => H - (h / 100) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H + 12}`} className="block h-auto w-full border border-rule">
      {[100, 50].map((v) => (
        <line key={v} x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="#d5dbe2" strokeWidth={0.5} />
      ))}
      <polyline
        points={pts.map(([t, h]) => `${x(t).toFixed(1)},${y(h).toFixed(1)}`).join(' ')}
        fill="none"
        stroke="#0a8a9a"
        strokeWidth={1.4}
      />
      <text x={2} y={H + 10} fontSize={7} fill="#4a5664" fontFamily="JetBrains Mono">
        {formatClock(t0)}
      </text>
      <text
        x={W - 2}
        y={H + 10}
        fontSize={7}
        fill="#4a5664"
        fontFamily="JetBrains Mono"
        textAnchor="end"
      >
        {formatClock(t1)}
      </text>
    </svg>
  );
}
