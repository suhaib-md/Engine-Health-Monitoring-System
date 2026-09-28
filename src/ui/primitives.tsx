import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/**
 * L1 surface. `tab` adds the cyan top-left tab (primary regions only).
 * Amendment A: 24px padding (was 16px); `lift` adds the 2px hover lift.
 */
export function Panel({
  tab,
  lift,
  className,
  children,
}: {
  tab?: boolean;
  lift?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cx(
        'border border-line bg-panel p-6',
        tab && 'panel-tab',
        lift &&
          'transition-[transform,border-color] duration-fast ease-out hover:-translate-y-0.5 hover:border-line-strong',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('label', className)}>{children}</span>;
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary:
    'chamfer h-11 px-5 bg-accent text-accent-ink font-bold tracking-[0.06em] hover:bg-accent-hover active:bg-accent-strong',
  secondary: 'h-9 px-4 border border-line-strong text-fg hover:border-accent hover:text-accent',
  ghost: 'h-9 px-3 text-accent hover:bg-accent-dim',
  danger: 'h-9 px-4 border border-crit text-crit hover:bg-crit-dim',
};

export function Button({
  variant = 'secondary',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cx(
        'inline-flex cursor-pointer items-center justify-center gap-2 text-sm font-semibold uppercase tracking-[0.04em] transition-colors duration-fast',
        'disabled:cursor-not-allowed disabled:border-line disabled:bg-raised disabled:text-invalid',
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && <span className="text-sm text-fg-2">{label}</span>}
      <div role="radiogroup" aria-label={label} className="flex border border-line-strong">
        {options.map((o) => (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cx(
              'h-9 flex-1 cursor-pointer border-r border-line-strong px-3 font-mono text-xs font-bold transition-colors duration-fast last:border-r-0',
              o.value === value ? 'bg-accent text-accent-ink' : 'text-fg-2 hover:text-fg',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Slider: value always shown. `fillClass` lets fault sliders fill in the status colour they cause.
 * `redlineFrom` (0–1) draws a hatched zone at the end of the track.
 */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  format = (v) => v.toLocaleString('en-US'),
  onChange,
  fillClass = 'bg-accent',
  valueClass,
  redlineFrom,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  fillClass?: string;
  valueClass?: string;
  redlineFrom?: number;
  /** small mono caption under the track, e.g. "800 · redline 6,000" */
  hint?: ReactNode;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="flex flex-col gap-2.5">
      <span className="flex items-baseline justify-between">
        <span className="text-sm text-fg-2">{label}</span>
        <span className={cx('num text-h3 font-bold', valueClass)}>
          {format(value)} {unit && <span className="text-label font-normal text-fg-3">{unit}</span>}
        </span>
      </span>
      <span className="relative block h-5">
        <span className="absolute inset-x-0 top-2 h-1 bg-line" />
        <span className={cx('absolute left-0 top-2 h-1', fillClass)} style={{ width: `${pct}%` }} />
        {redlineFrom != null && (
          <span
            className="absolute right-0 top-2 h-1"
            style={{
              left: `${redlineFrom * 100}%`,
              backgroundImage:
                'repeating-linear-gradient(-45deg,var(--color-crit) 0 3px,transparent 3px 6px)',
            }}
          />
        )}
        <span
          className="absolute top-0 h-5 w-1.5 -translate-x-1/2 bg-fg"
          style={{ left: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </span>
      {hint && <span className="num flex justify-between text-label text-fg-3">{hint}</span>}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex cursor-pointer items-center gap-2.5 text-base"
    >
      <span
        className={cx(
          'relative block h-5 w-10 border transition-colors duration-fast',
          checked ? 'border-accent bg-accent-dim' : 'border-line-strong bg-raised',
        )}
      >
        <span
          className={cx(
            'absolute top-0.5 size-3.5 transition-[left] duration-fast ease-out',
            checked ? 'left-[22px] bg-accent' : 'left-0.5 bg-fg-3',
          )}
        />
      </span>
      {children}
    </button>
  );
}
