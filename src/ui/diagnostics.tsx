import type { AlertClass, Status } from './tokens';
import { alertStatus, evidenceClass } from './tokens';
import { AlertBadge, statusBg, statusBorderLeft, statusText } from './status';
import { alertIcon } from './icons';

/** Explanation card — follows draft §35.5 exactly. Amendment A: 24px section padding. */
export interface Explanation {
  fault: string;
  severity: 'Low' | 'Medium' | 'High';
  alert: AlertClass;
  evidence: number;
  why: { text: string; status: Status }[];
  action: string;
  model: { physics: string; anomaly: string; anomalyStatus?: Status; rul: string };
  /** draft §46 */
  uncertainty?: { evidence: string; dataQuality: string; agreement: string; level: string };
}

export function ExplanationCard({ e }: { e: Explanation }) {
  const st = alertStatus[e.alert];
  const ev = evidenceClass(e.evidence);
  return (
    <article
      className={`flex flex-col border border-line border-l-4 bg-panel ${statusBorderLeft[st]}`}
    >
      <header className="flex flex-col gap-2 border-b border-line px-6 py-5">
        <span className="label">Probable fault</span>
        <h3 className="text-[22px] leading-tight font-bold">{e.fault}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <AlertBadge cls={e.alert}>SEVERITY {e.severity.toUpperCase()}</AlertBadge>
          <span className="num text-xs text-fg-2">
            evidence <b className={statusText[ev.status]}>{e.evidence.toFixed(2)}</b> · {ev.label}
          </span>
        </div>
      </header>
      <section className="flex flex-col gap-3 border-b border-line px-6 py-5">
        <span className="label">Why the system thinks this</span>
        {e.why.map((w, i) => (
          <div key={i} className="grid grid-cols-[18px_1fr] gap-2 text-base leading-snug">
            <span
              className={`mt-[4px] size-3 [clip-path:polygon(0_0,100%_50%,0_100%)] ${statusBg[w.status]}`}
            />
            <span>{w.text}</span>
          </div>
        ))}
      </section>
      <section className="flex flex-col gap-2 border-b border-line px-6 py-5">
        <span className="label">Recommended action</span>
        <p className="m-0 leading-relaxed">{e.action}</p>
      </section>
      <dl className="num m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 px-6 py-5 text-xs">
        <span className="label col-span-2">Model status</span>
        <dt className="text-fg-2">Physics rules</dt>
        <dd className="m-0">{e.model.physics}</dd>
        <dt className="text-fg-2">Anomaly model</dt>
        <dd className={`m-0 ${e.model.anomalyStatus ? statusText[e.model.anomalyStatus] : ''}`}>
          {e.model.anomaly}
        </dd>
        <dt className="text-fg-2">RUL</dt>
        <dd className="m-0">{e.model.rul}</dd>
        {e.uncertainty && (
          <>
            <span className="label col-span-2 mt-3">Confidence in this output</span>
            <dt className="text-fg-2">Evidence strength</dt>
            <dd className="m-0">{e.uncertainty.evidence}</dd>
            <dt className="text-fg-2">Data quality</dt>
            <dd className={`m-0 ${e.uncertainty.dataQuality === 'good' ? '' : 'text-watch'}`}>
              {e.uncertainty.dataQuality}
            </dd>
            <dt className="text-fg-2">Model agreement</dt>
            <dd className="m-0">{e.uncertainty.agreement}</dd>
            <dt className="text-fg-2">Uncertainty</dt>
            <dd className="m-0">{e.uncertainty.level} · prototype estimate, demo calibration</dd>
          </>
        )}
      </dl>
    </article>
  );
}

export interface AlertRow {
  id: string;
  cls: AlertClass;
  subsystem: string;
  title: string;
  time: string;
  measured?: string;
  expected?: string;
  residual?: string;
  persistence?: string;
  source: 'rule' | 'statistical';
}

export function AlertItem({ a, compact }: { a: AlertRow; compact?: boolean }) {
  const st = alertStatus[a.cls];
  const Icon = alertIcon[a.cls];
  return (
    <div
      className={`grid animate-alert-in grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 border border-line border-l-4 bg-panel px-5 py-4 ${statusBorderLeft[st]}`}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon aria-hidden className={`size-4 shrink-0 ${statusText[st]}`} />
        <span className={`font-mono text-label font-extrabold tracking-[0.08em] ${statusText[st]}`}>
          {a.cls}
        </span>
        <span className="truncate text-base font-semibold">
          {a.subsystem} · {a.title}
        </span>
      </div>
      <span className="num text-label text-fg-3">{a.time}</span>
      {!compact && (
        <span className="num col-span-2 text-xs text-fg-2">
          {[
            a.measured && a.expected && `${a.measured} vs ${a.expected}`,
            a.residual,
            a.persistence,
            a.source,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      )}
    </div>
  );
}
