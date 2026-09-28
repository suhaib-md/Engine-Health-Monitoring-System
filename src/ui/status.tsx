import type { ReactNode } from 'react';
import type { AlertClass, Lifecycle, SensorQuality, Status } from './tokens';
import { evidenceClass, qualityStatus } from './tokens';

/** Static class maps so Tailwind can see every class. */
export const statusText: Record<Status | 'info', string> = {
  info: 'text-accent',
  ok: 'text-ok',
  watch: 'text-watch',
  warn: 'text-warn',
  crit: 'text-crit',
  invalid: 'text-invalid',
};
export const statusBg: Record<Status | 'info', string> = {
  info: 'bg-accent',
  ok: 'bg-ok',
  watch: 'bg-watch',
  warn: 'bg-warn',
  crit: 'bg-crit',
  invalid: 'bg-invalid',
};
export const statusBorder: Record<Status | 'info', string> = {
  info: 'border-accent',
  ok: 'border-ok',
  watch: 'border-watch',
  warn: 'border-warn',
  crit: 'border-crit',
  invalid: 'border-invalid',
};
/** Single-edge accents: gauges colour only the top border, cards/alerts only the left. */
export const statusBorderTop: Record<Status | 'info', string> = {
  info: 'border-t-accent',
  ok: 'border-t-ok',
  watch: 'border-t-watch',
  warn: 'border-t-warn',
  crit: 'border-t-crit',
  invalid: 'border-t-invalid',
};
export const statusBorderLeft: Record<Status | 'info', string> = {
  info: 'border-l-accent',
  ok: 'border-l-ok',
  watch: 'border-l-watch',
  warn: 'border-l-warn',
  crit: 'border-l-crit',
  invalid: 'border-l-invalid',
};
const fill: Record<AlertClass, string> = {
  INFO: 'bg-accent text-accent-ink',
  WATCH: 'bg-watch text-watch-ink',
  WARNING: 'bg-warn text-warn-ink',
  CRITICAL: 'bg-crit text-crit-ink animate-crit-pulse',
};

/** Alert class badge: filled parallelogram. Only CRITICAL pulses. */
export function AlertBadge({ cls, children }: { cls: AlertClass; children?: ReactNode }) {
  return (
    <span
      className={`skew-badge inline-block px-3 py-1 font-mono text-xs font-extrabold tracking-[0.08em] ${fill[cls]}`}
    >
      <span className="unskew">{children ?? cls}</span>
    </span>
  );
}

const life: Record<Lifecycle, string> = {
  OFF: 'border-invalid text-fg-2',
  STARTING: 'border-accent text-accent',
  WARMUP: 'border-accent text-accent',
  RUNNING: 'border-ok text-ok',
  SHUTDOWN: 'border-invalid text-fg-2',
};

/** Lifecycle badge: outlined parallelogram. */
export function LifecycleBadge({ state, sub }: { state: Lifecycle; sub?: string }) {
  return (
    <span
      className={`skew-badge inline-block border-[1.5px] px-3 py-1 font-mono text-xs font-bold tracking-[0.08em] ${life[state]}`}
    >
      <span className="unskew">
        {state}
        {sub && ` · ${sub}`}
      </span>
    </span>
  );
}

export function QualityDot({ q }: { q: SensorQuality }) {
  if (q === 'unavailable')
    return <span title={q} className="size-2 border-[1.5px] border-invalid" />;
  return <span title={q} className={`size-2 ${statusBg[qualityStatus[q]]}`} />;
}

export function EvidenceBar({ score }: { score: number }) {
  const { label, status } = evidenceClass(score);
  return (
    <div className="grid grid-cols-[78px_1fr_44px] items-center gap-3">
      <span
        className={`font-mono text-label font-bold uppercase tracking-[0.08em] ${statusText[status]}`}
      >
        {label}
      </span>
      <div className="relative h-1.5 bg-line">
        <div
          className={`absolute inset-y-0 left-0 transition-[width] duration-base ${statusBg[status]}`}
          style={{ width: `${score * 100}%` }}
        />
      </div>
      <span className="num text-right text-sm font-bold">{score.toFixed(2)}</span>
    </div>
  );
}
