import type { ReactNode } from 'react';
import type { Status } from './tokens';
import { statusBg, statusBorder, statusText } from './status';

const legend: Record<Status, string> = {
  ok: 'healthy',
  watch: 'watch',
  warn: 'warning',
  crit: 'critical',
  invalid: 'sensor invalid',
};

/** HTML chrome that sits over the <Canvas>. Use drei <Html> for PartCallout anchors. */
export function ViewportChrome({
  preset,
  presets,
  onPreset,
  children,
  className = 'min-h-[440px]',
}: {
  preset: string;
  presets: string[];
  onPreset: (p: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden border border-line bg-bg ${className}`}>
      {children}
      <div className="absolute left-4 top-4 flex border border-line-strong bg-bg/85">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => onPreset(p)}
            className={`cursor-pointer border-l border-line-strong px-3 py-1.5 font-mono text-label font-bold uppercase transition-colors duration-fast first:border-l-0 ${
              p === preset ? 'bg-accent text-accent-ink' : 'text-fg-2 hover:text-fg'
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      {/* Required by the build plan: physics is real-time, display is not */}
      <div className="absolute left-4 top-14 bg-accent sm:left-auto sm:right-4 sm:top-4 px-3 py-1.5 font-mono text-label font-extrabold tracking-[0.08em] text-accent-ink">
        DISPLAY SLOWED 100×
      </div>
      <div className="absolute bottom-4 left-4 flex flex-wrap gap-3 border border-line bg-bg/85 px-3 py-2 font-mono text-label text-fg-2">
        {(['ok', 'watch', 'warn', 'crit', 'invalid'] as Status[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`size-2.5 ${statusBg[s]}`} />
            {legend[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Diamond + leader line + label. Render inside drei <Html> at the part's position. */
export function PartCallout({
  name,
  health,
  status,
  onClick,
}: {
  name: string;
  health: number;
  status: Status;
  onClick?: () => void;
}) {
  return (
    <button onClick={onClick} className="flex cursor-pointer items-center">
      <span
        className={`size-3.5 rotate-45 border-2 ${statusBorder[status]}`}
        style={{ background: `color-mix(in srgb, var(--color-${status}) 25%, transparent)` }}
      />
      <span className={`h-px w-11 ${statusBg[status]}`} />
      <span
        className={`whitespace-nowrap border bg-bg/90 px-2 py-1 font-mono text-label font-bold text-fg ${statusBorder[status]}`}
      >
        {name.toUpperCase()} · {Math.round(health)}
      </span>
    </button>
  );
}

export function PartPanel({
  circuit,
  part,
  health,
  status,
  rows,
  actions,
}: {
  circuit: string;
  part: string;
  health: number;
  status: Status;
  rows: { sensor: string; measured: string; expected: string; z: number; zStatus: Status }[];
  actions?: ReactNode;
}) {
  return (
    <aside className="flex flex-col border border-line-strong bg-raised shadow-overlay">
      <header className="flex items-start justify-between gap-3 border-b border-line-strong px-6 py-5">
        <div className="flex flex-col gap-1">
          <span className="label">{circuit}</span>
          <h3 className="text-h2 font-bold">{part}</h3>
        </div>
        <span className={`num text-[22px] font-extrabold ${statusText[status]}`}>
          {Math.round(health)}
          <span className="text-xs text-fg-3">/100</span>
        </span>
      </header>
      <table className="num w-full border-collapse text-xs">
        <thead>
          <tr className="text-[10px] tracking-[0.1em] text-fg-3">
            <th className="border-b border-line px-6 py-2.5 text-left font-normal">SENSOR</th>
            <th className="border-b border-line p-2.5 text-right font-normal">MEAS</th>
            <th className="border-b border-line p-2.5 text-right font-normal">TWIN</th>
            <th className="border-b border-line py-2.5 pl-2.5 pr-6 text-right font-normal">z</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sensor}>
              <td className="border-b border-line px-6 py-3 font-sans">{r.sensor}</td>
              <td className="border-b border-line p-3 text-right font-bold">{r.measured}</td>
              <td className="border-b border-line p-3 text-right text-fg-2">{r.expected}</td>
              <td
                className={`border-b border-line py-3 pl-3 pr-6 text-right font-bold ${statusText[r.zStatus]}`}
              >
                {r.z >= 0 ? '+' : '−'}
                {Math.abs(r.z).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {actions && (
        <footer className="mt-auto flex gap-2 border-t border-line-strong px-6 py-4">
          {actions}
        </footer>
      )}
    </aside>
  );
}
