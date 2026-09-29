import type { SensorQuality, Status } from './tokens';
import { color } from './tokens';
import { QualityDot, statusBg, statusBorderTop, statusText } from './status';
import { IconTile } from './primitives';
import type { LucideIcon } from './icons';

type Zone = { from: number; to: number; status: Status };

/**
 * Gauge with a Twin marker: a bar (default) or a car-style dial (`variant="dial"`).
 * value = null means sensor dropout: show "— —", hatched track, grey. Never 0.
 * Amendment A: 20px padding, 36px value, hover lift. Numbers never tween; only the bar/needle/marker geometry transitions.
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
  icon,
  variant = 'bar',
  dialScale = 1,
  dialUnit,
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
  /** warn/crit bands: a strip under the bar, or a band on the dial rim */
  zones?: Zone[];
  /** opens the calculation drawer for this gauge */
  onMath?: () => void;
  icon?: LucideIcon;
  variant?: 'bar' | 'dial';
  /** dial numerals are value / dialScale (1000 → a tachometer's "×1000" face) */
  dialScale?: number;
  /** caption printed on the dial face, e.g. "×1000 r/min" */
  dialUnit?: string;
}) {
  const fmt = (x: number) =>
    x.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const dropped = value == null;
  const s: Status = dropped ? 'invalid' : status;
  const loud = s === 'warn' || s === 'crit';
  const delta = !dropped && expected != null ? value - expected : null;
  const deltaLoud = z != null && Math.abs(z) > 2;
  const valueCls = `num leading-none font-extrabold ${dropped ? 'text-invalid' : loud ? statusText[s] : 'text-fg'}`;
  const valueText = dropped ? '— —' : fmt(value);

  const valueEl = (cls: string) =>
    onMath ? (
      <button
        onClick={onMath}
        title="View calculation"
        className={`${cls} cursor-pointer decoration-accent/60 decoration-dotted underline-offset-8 transition-colors duration-fast hover:underline`}
      >
        {valueText}
      </button>
    ) : (
      <span className={cls}>{valueText}</span>
    );

  return (
    <div
      className={`flex h-full flex-col gap-4 border border-line border-t-2 bg-panel p-5 transition-[transform,border-color] duration-fast ease-out hover:-translate-y-0.5 ${statusBorderTop[s]}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-3">
          {icon && <IconTile icon={icon} tone={dropped ? 'invalid' : loud ? s : 'accent'} />}
          <span className="label">{label}</span>
        </span>
        <span className="flex items-center gap-3">
          {onMath && (
            <button
              onClick={onMath}
              className="cursor-pointer font-serif text-sm italic text-fg-3 transition-colors duration-fast hover:text-accent"
              aria-label={`View calculation for ${label}`}
              title="View calculation"
            >
              ƒ(x)
            </button>
          )}
          <QualityDot q={dropped ? 'unavailable' : quality} />
        </span>
      </div>

      {variant === 'dial' ? (
        <div className="relative m-auto w-full max-w-[320px]">
          <Dial
            value={value}
            expected={expected}
            min={min}
            max={max}
            zones={zones}
            status={s}
            scale={dialScale}
            caption={dialUnit ?? unit}
            label={label}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-baseline justify-center gap-2">
            {valueEl(`${valueCls} text-[32px]`)}
            <span className="num text-sm text-fg-3">{unit}</span>
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            {valueEl(`${valueCls} text-[36px]`)}
            <span className="num text-sm text-fg-3">{unit}</span>
          </div>
          <Bar value={value} expected={expected} min={min} max={max} zones={zones} status={s} />
        </>
      )}

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

function Bar({
  value,
  expected,
  min,
  max,
  zones,
  status,
}: {
  value: number | null;
  expected: number | null;
  min: number;
  max: number;
  zones: Zone[];
  status: Status;
}) {
  const pct = (x: number) => `${Math.max(0, Math.min(100, ((x - min) / (max - min)) * 100))}%`;
  const dropped = value == null;
  return (
    <div className="relative h-6">
      <div className={`absolute inset-x-0 top-[7px] h-[9px] bg-raised ${dropped ? 'hatch' : ''}`} />
      {!dropped && (
        <div
          className={`absolute left-0 top-[7px] h-[9px] transition-[width] duration-base ease-out ${statusBg[status]}`}
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
  );
}

/* ---------- dial (car tachometer face) ---------- */

const CX = 120;
const CY = 118;
const R = 100;
/** the needle sweeps 240°, from 8 o'clock (min) through 12 to 4 o'clock (max), like a car cluster */
const SWEEP = 240;

/** point at angle `a` (degrees clockwise from 12 o'clock) and radius `r` */
const pt = (a: number, r: number) => {
  const rad = (a * Math.PI) / 180;
  return [CX + r * Math.sin(rad), CY - r * Math.cos(rad)] as const;
};
const arc = (a0: number, a1: number, r: number) => {
  const [x0, y0] = pt(a0, r);
  const [x1, y1] = pt(a1, r);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

function Dial({
  value,
  expected,
  min,
  max,
  zones,
  status,
  scale,
  caption,
  label,
}: {
  value: number | null;
  expected: number | null;
  min: number;
  max: number;
  zones: Zone[];
  status: Status;
  scale: number;
  caption: string;
  label: string;
}) {
  const clamp = (x: number) => Math.max(min, Math.min(max, x));
  const ang = (x: number) => -SWEEP / 2 + ((clamp(x) - min) / (max - min)) * SWEEP;
  const a0 = -SWEEP / 2;
  const a1 = SWEEP / 2;

  // one numbered tick per `scale` step (0…7 on a ×1000 tachometer) and a minor tick halfway
  const majors: number[] = [];
  for (let x = min; x <= max + 1e-9; x += scale) majors.push(x);
  const minors = majors.slice(0, -1).map((x) => x + scale / 2);

  const needle = status === 'crit' || status === 'warn' ? color[status] : color.accent;
  const va = value == null ? null : ang(value);
  const glowLen = ((R - 14) * SWEEP * Math.PI) / 180;

  return (
    <svg
      viewBox="0 0 240 196"
      className="block w-full"
      role="img"
      aria-label={`${label} dial${value == null ? ', no data' : ''}`}
    >
      {/* track, then the zone bands (redline) on the rim */}
      <path d={arc(a0, a1, R)} fill="none" stroke={color.raised} strokeWidth="10" />
      {zones.map((zn, i) => (
        <path
          key={i}
          d={arc(ang(zn.from), ang(zn.to), R)}
          fill="none"
          stroke={color[zn.status]}
          strokeWidth="10"
        />
      ))}
      {/* sweep glow up to the needle */}
      {va != null && (
        <path
          d={arc(a0, a1, R - 14)}
          fill="none"
          stroke={needle}
          strokeOpacity="0.28"
          strokeWidth="6"
          strokeDasharray={`${glowLen * ((va - a0) / SWEEP)} ${glowLen}`}
          style={{ transition: 'stroke-dasharray 200ms cubic-bezier(.2,.8,.2,1)' }}
        />
      )}

      {minors.map((x) => {
        const [xa, ya] = pt(ang(x), R - 6);
        const [xb, yb] = pt(ang(x), R - 13);
        return (
          <line
            key={`m${x}`}
            x1={xa}
            y1={ya}
            x2={xb}
            y2={yb}
            stroke={color.fg3}
            strokeWidth="1.5"
          />
        );
      })}
      {majors.map((x) => {
        const a = ang(x);
        const [xa, ya] = pt(a, R - 6);
        const [xb, yb] = pt(a, R - 20);
        const [tx, ty] = pt(a, R - 34);
        const red = zones.some((zn) => zn.status === 'crit' && x >= zn.from);
        return (
          <g key={`M${x}`}>
            <line
              x1={xa}
              y1={ya}
              x2={xb}
              y2={yb}
              stroke={red ? color.crit : color.fg}
              strokeWidth="2.5"
            />
            <text
              x={tx}
              y={ty + 5}
              textAnchor="middle"
              fontFamily="JetBrains Mono"
              fontWeight="700"
              fontSize="15"
              fill={red ? color.crit : color.fg2}
            >
              {Math.round(x / scale)}
            </text>
          </g>
        );
      })}

      <text
        x={CX}
        y={CY + 34}
        textAnchor="middle"
        fontFamily="JetBrains Mono"
        fontSize="10"
        letterSpacing="1"
        fill={color.fg3}
      >
        {caption}
      </text>

      {/* Twin marker: a white pointer outside the rim at the expected value */}
      {expected != null && (
        <g
          transform={`rotate(${ang(expected)} ${CX} ${CY})`}
          style={{ transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)' }}
        >
          <path d={`M ${CX} ${CY - R + 7} l -6 -11 h 12 z`} fill={color.twin} />
        </g>
      )}

      {/* needle */}
      {va != null && (
        <g
          transform={`rotate(${va} ${CX} ${CY})`}
          style={{ transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)' }}
        >
          <path
            d={`M ${CX - 3.5} ${CY + 12} L ${CX} ${CY - R + 12} L ${CX + 3.5} ${CY + 12} Z`}
            fill={needle}
          />
        </g>
      )}
      <circle cx={CX} cy={CY} r="9" fill={color.raised} stroke={color.lineStrong} strokeWidth="2" />
      <circle cx={CX} cy={CY} r="3" fill={value == null ? color.invalid : needle} />
    </svg>
  );
}
