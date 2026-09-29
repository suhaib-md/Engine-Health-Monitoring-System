import type { SensorQuality, Status } from './tokens';
import { QualityDot, statusBg, statusBorderTop, statusText } from './status';

/**
 * Bar gauge with a Twin ghost marker.
 * value = null means sensor dropout: show "— —", hatched track, grey. Never 0.
 * Amendment A: 20px padding, 36px value, hover lift. Numbers never tween; only the bar/ghost geometry transitions.
 */
export function Gauge({
  label,
  unit,
  value,
  expected,
  min,
  max,
  decimals = 0,
  status,
  quality,
  z,
  zones = [],
  onMath,
}: {
  label: string;
  unit: string;
  value: number | null;
  expected: number | null;
  min: number;
  max: number;
  decimals?: number;
  status: Status;
  quality: SensorQuality;
  /** normalised residual; Δ turns coloured when |z| > 2 */
  z?: number;
  /** warn/crit bands drawn as a strip under the track */
  zones?: { from: number; to: number; status: Status }[];
  /** opens "Show the math" for this gauge */
  onMath?: () => void;
}) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100))}%`;
  const fmt = (x: number) =>
    x.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const dropped = value == null;
  const s: Status = dropped ? 'invalid' : status;
  const loud = s === 'warn' || s === 'crit';
  const delta = !dropped && expected != null ? value - expected : null;
  const deltaLoud = z != null && Math.abs(z) > 2;

  return (
    <div
      className={`flex h-full flex-col gap-4 border border-line border-t-2 bg-panel p-5 transition-[transform,border-color] duration-fast ease-out hover:-translate-y-0.5 ${statusBorderTop[s]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="label">{label}</span>
        <span className="flex items-center gap-3">
          {onMath && (
            <button
              onClick={onMath}
              className="cursor-pointer font-serif text-sm italic text-fg-3 transition-colors duration-fast hover:text-accent"
              aria-label={`Show the math for ${label}`}
              title="Show the math"
            >
              ƒ(x)
            </button>
          )}
          <QualityDot q={dropped ? 'unavailable' : quality} />
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        {(() => {
          const cls = `num text-[36px] leading-none font-extrabold ${dropped ? 'text-invalid' : loud ? statusText[s] : 'text-fg'}`;
          const text = dropped ? '— —' : fmt(value);
          return onMath ? (
            <button
              onClick={onMath}
              title="Show the math"
              className={`${cls} cursor-pointer decoration-accent/60 decoration-dotted underline-offset-8 transition-colors duration-fast hover:underline`}
            >
              {text}
            </button>
          ) : (
            <span className={cls}>{text}</span>
          );
        })()}
        <span className="num text-sm text-fg-3">{unit}</span>
      </div>
      <div className="relative h-6">
        <div
          className={`absolute inset-x-0 top-[7px] h-[9px] bg-raised ${dropped ? 'hatch' : ''}`}
        />
        {!dropped && (
          <div
            className={`absolute left-0 top-[7px] h-[9px] transition-[width] duration-base ease-out ${statusBg[s]}`}
            style={{ width: pct(value) }}
          />
        )}
        <div className="gauge-segments absolute inset-x-0 top-[7px] h-[9px]" />
        {zones.map((zn, i) => (
          <div
            key={i}
            className={`absolute top-[19px] h-[3px] ${statusBg[zn.status]}`}
            style={{ left: pct(zn.from), width: `calc(${pct(zn.to)} - ${pct(zn.from)})` }}
          />
        ))}
        {expected != null && (
          <>
            <div
              className="absolute top-0.5 h-5 w-0.5 -translate-x-1/2 bg-twin transition-[left] duration-base ease-out"
              style={{ left: pct(expected) }}
            />
            <div
              className="absolute top-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-twin transition-[left] duration-base ease-out"
              style={{ left: pct(expected) }}
            />
          </>
        )}
      </div>
      <div className="num mt-auto flex justify-between text-xs">
        <span className="text-fg-2">
          TWIN <b className="text-fg">{expected == null ? '—' : fmt(expected)}</b>
        </span>
        <span
          className={`font-bold ${dropped ? 'text-invalid' : deltaLoud ? statusText[s] : 'text-fg-2'}`}
        >
          {delta == null ? 'no data' : `Δ ${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))}`}
        </span>
      </div>
    </div>
  );
}
