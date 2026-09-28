import { motion } from 'motion/react';
import { color } from '../tokens';
import { EASE_OUT } from '../motion';

/**
 * SVG preview charts from the design system (sample data). Live charts move to uPlot
 * (uplotTheme.ts) when the simulator streams data in Phase 4.
 */

const inView = { once: true, margin: '0px 0px -10% 0px' } as const;

export interface TrendSpec {
  /** Twin expected value */
  base: number;
  /** size of the fault-driven drop (negative = below twin) */
  drop: number;
  yMin: number;
  yMax: number;
  ticks: number[];
  watchAt?: number;
  critAt?: number;
  faultLabel?: string;
}

export function TrendChart({ spec }: { spec: TrendSpec }) {
  const N = 120;
  const W0 = 44;
  const W = 636;
  const faultI = 54;
  const exp: number[] = [];
  const meas: number[] = [];
  for (let i = 0; i < N; i++) {
    const e = spec.base + (spec.yMax - spec.yMin) * 0.014 * Math.sin(i / 9);
    const d = i > faultI ? spec.drop * Math.pow((i - faultI) / 65, 1.3) : 0;
    const noise =
      (spec.yMax - spec.yMin) * (0.011 * Math.sin(i * 1.7) + 0.014 * Math.sin(i * 0.63));
    exp.push(e);
    meas.push(e + d + noise);
  }
  const X = (i: number) => W0 + (i / (N - 1)) * W;
  const Y = (v: number) => 200 - ((v - spec.yMin) / (spec.yMax - spec.yMin)) * 180;
  const P = (a: number[]) =>
    a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const band = `${P(exp)} ${meas
    .slice()
    .reverse()
    .map((v, j) => `L${X(N - 1 - j).toFixed(1)} ${Y(v).toFixed(1)}`)
    .join(' ')} Z`;
  const fx = X(faultI);

  return (
    <svg
      viewBox="0 0 680 220"
      className="block h-auto w-full"
      role="img"
      aria-label="Measured vs Twin trend (sample data)"
    >
      {spec.ticks.map((v) => (
        <g key={v}>
          <line x1={W0} x2={680} y1={Y(v)} y2={Y(v)} stroke={color.raised} />
          <text
            x={W0 - 8}
            y={Y(v) + 3}
            textAnchor="end"
            fontFamily="JetBrains Mono"
            fontSize="10"
            fill={color.fg3}
          >
            {v}
          </text>
        </g>
      ))}
      {spec.watchAt != null && (
        <line
          x1={W0}
          x2={680}
          y1={Y(spec.watchAt)}
          y2={Y(spec.watchAt)}
          stroke={color.watch}
          strokeDasharray="2 4"
          opacity="0.8"
        />
      )}
      {spec.critAt != null && (
        <line
          x1={W0}
          x2={680}
          y1={Y(spec.critAt)}
          y2={Y(spec.critAt)}
          stroke={color.crit}
          strokeDasharray="2 4"
          opacity="0.8"
        />
      )}
      <motion.path
        d={band}
        fill="rgba(53,224,240,.14)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={inView}
        transition={{ duration: 0.6, delay: 0.9 }}
      />
      <motion.path
        d={P(exp)}
        fill="none"
        stroke={color.twin}
        strokeWidth="1.5"
        strokeDasharray="5 4"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={inView}
        transition={{ duration: 0.5 }}
      />
      <motion.path
        d={P(meas)}
        fill="none"
        stroke={color.accent}
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={inView}
        transition={{ duration: 1.2, ease: EASE_OUT }}
      />
      <line x1={fx} x2={fx} y1={10} y2={210} stroke={color.faultMarker} strokeWidth="1.5" />
      <text x={fx + 6} y={20} fontFamily="JetBrains Mono" fontSize="10" fill={color.faultMarker}>
        {spec.faultLabel ?? 'FAULT'}
      </text>
      {[
        { i: 76, c: color.watch },
        { i: 96, c: color.warn },
      ].map((m) => (
        <rect
          key={m.i}
          x={X(m.i) - 5}
          y={200}
          width={10}
          height={10}
          fill={m.c}
          transform={`rotate(45 ${X(m.i)} 205)`}
        />
      ))}
    </svg>
  );
}

export function TrendLegend() {
  return (
    <div className="num flex flex-wrap gap-5 text-label text-fg-2">
      <span className="flex items-center gap-2">
        <span className="h-0.5 w-4 bg-accent" />
        measured
      </span>
      <span className="flex items-center gap-2">
        <span className="h-0 w-4 border-t-2 border-dashed border-twin" />
        twin
      </span>
      <span className="flex items-center gap-2">
        <span className="h-2.5 w-3 bg-accent/15" />
        residual
      </span>
      <span className="flex items-center gap-2">
        <span className="h-3 w-0.5 bg-fault-marker" />
        fault injected
      </span>
    </div>
  );
}

/** Order spectrum, crank-angle domain. Bars grow in; 0.5× bar in warn = misfire evidence. */
export function OrderSpectrum() {
  const bins = 64;
  const sx = (o: number) => 20 + (o / 4) * 370;
  const peaks: [number, number][] = [
    [0.5, 0.78],
    [1, 0.22],
    [1.5, 0.3],
    [2, 0.95],
    [3, 0.12],
    [4, 0.4],
  ];
  const bars = Array.from({ length: bins }, (_, idx) => {
    const k = idx + 1;
    const o = (k * 4) / bins;
    let a = 0.04 + 0.02 * Math.abs(Math.sin(k * 2.3));
    for (const [po, pa] of peaks) a += pa * Math.exp(-Math.pow((o - po) / 0.035, 2));
    const h = Math.min(1, a) * 160;
    return { k, x: sx(o) - 2.5, h, c: Math.abs(o - 0.5) < 0.04 ? color.warn : color.accent };
  });
  return (
    <svg
      viewBox="0 0 400 200"
      className="block h-auto w-full"
      role="img"
      aria-label="Order spectrum (sample data)"
    >
      <line x1={20} x2={400} y1={180} y2={180} stroke={color.line} />
      {bars.map((b, i) => (
        <motion.rect
          key={b.k}
          x={b.x}
          y={180 - b.h}
          width={4}
          height={b.h}
          fill={b.c}
          style={{ transformBox: 'fill-box', originY: 1 }}
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={inView}
          transition={{ duration: 0.5, delay: i * 0.012, ease: EASE_OUT }}
        />
      ))}
      {(
        [
          [0.5, '0.5×'],
          [1, '1×'],
          [2, '2×'],
        ] as const
      ).map(([o, l]) => (
        <g key={l}>
          <line
            x1={sx(o)}
            x2={sx(o)}
            y1={14}
            y2={180}
            stroke={color.twin}
            strokeDasharray="2 3"
            opacity="0.7"
          />
          <text
            x={sx(o)}
            y={10}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize="10"
            fontWeight="700"
            fill={color.twin}
          >
            {l}
          </text>
        </g>
      ))}
      {[0, 1, 2, 3, 4].map((o) => (
        <text
          key={o}
          x={sx(o)}
          y={194}
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize="9"
          fill={color.fg3}
        >
          {o}×
        </text>
      ))}
    </svg>
  );
}

const SECTORS = [
  { cyl: 1, deg: 45, lx: 190, ly: 44 },
  { cyl: 2, deg: 135, lx: 50, ly: 44 },
  { cyl: 3, deg: -45, lx: 190, ly: 184 },
  { cyl: 4, deg: -135, lx: 50, ly: 184 },
] as const;

/** Misfire polar plot: 0.5× phase lands in one cylinder's 90° sector. */
export function MisfirePolar({
  cylinder = 3,
  magnitude = 0.78,
}: {
  cylinder?: 1 | 2 | 3 | 4;
  magnitude?: number;
}) {
  const sec = SECTORS.find((s) => s.cyl === cylinder) ?? SECTORS[2];
  const a = (sec.deg * Math.PI) / 180;
  const r = 90 * magnitude;
  const dx = 120 + r * Math.cos(a);
  const dy = 110 - r * Math.sin(a);
  // wedge covering the active quadrant
  const q = (d: number) => [
    120 + 90 * Math.cos((d * Math.PI) / 180),
    110 - 90 * Math.sin((d * Math.PI) / 180),
  ];
  const [x1, y1] = q(sec.deg - 45);
  const [x2, y2] = q(sec.deg + 45);
  return (
    <svg
      viewBox="0 0 240 220"
      className="mx-auto block h-auto w-full max-w-[340px]"
      role="img"
      aria-label={`Misfire polar plot, cylinder ${cylinder} (sample data)`}
    >
      <motion.path
        d={`M120 110 L${x1} ${y1} A90 90 0 0 0 ${x2} ${y2} Z`}
        fill="rgba(255,154,60,.22)"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={inView}
        transition={{ duration: 0.4, delay: 0.7 }}
      />
      <circle cx="120" cy="110" r="90" fill="none" stroke={color.lineStrong} />
      <circle cx="120" cy="110" r="60" fill="none" stroke={color.line} />
      <circle cx="120" cy="110" r="30" fill="none" stroke={color.line} />
      <line x1="30" x2="210" y1="110" y2="110" stroke={color.lineStrong} />
      <line x1="120" x2="120" y1="20" y2="200" stroke={color.lineStrong} />
      {SECTORS.map((s) => (
        <text
          key={s.cyl}
          x={s.lx}
          y={s.ly}
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize="11"
          fontWeight={s.cyl === cylinder ? 800 : 700}
          fill={s.cyl === cylinder ? color.warn : color.fg2}
        >
          CYL {s.cyl}
        </text>
      ))}
      <motion.line
        x1="120"
        y1="110"
        x2={dx}
        y2={dy}
        stroke={color.warn}
        strokeWidth="2"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={inView}
        transition={{ duration: 0.6, delay: 0.2, ease: EASE_OUT }}
      />
      <motion.rect
        x={dx - 6}
        y={dy - 6}
        width="12"
        height="12"
        fill={color.warn}
        transform={`rotate(45 ${dx} ${dy})`}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={inView}
        transition={{ duration: 0.3, delay: 0.75 }}
      />
    </svg>
  );
}
