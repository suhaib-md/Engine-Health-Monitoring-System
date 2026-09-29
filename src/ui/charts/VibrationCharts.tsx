import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { PROFILE } from '../../engine/profile';
import { misfirePhase_deg } from '../../physics';
import { color } from '../tokens';
import { axis, measured } from '../uplotTheme';
import { useWindows } from '../sim/simClient';

/**
 * Live vibration and crank charts (Phase 7). The order spectrum and polar plot are SVG (their
 * geometry animates with CSS transitions); the two waveforms are uPlot, redrawn when a new
 * crank-angle window arrives (once per simulated second), never per React render.
 */

const SPECTRUM_ORDERS = 6;
const BINS_PER_ORDER = PROFILE.crank.windowRevs;

/** Order spectrum, crank-angle domain: bin k is order k/16. Cursors at 0.5×, 1× and 2×. */
export function OrderSpectrumChart({
  spectrum,
  unit,
  halfAlert,
}: {
  spectrum: Float32Array;
  unit: string;
  /** colour the 0.5× line as misfire evidence */
  halfAlert: boolean;
}) {
  const W = 480;
  const H = 230;
  const left = 46;
  const right = 12;
  const top = 26;
  const bottom = 34;
  const pw = W - left - right;
  const ph = H - top - bottom;
  const nBins = SPECTRUM_ORDERS * BINS_PER_ORDER;
  let peak = 0;
  for (let k = 1; k <= nBins; k++) peak = Math.max(peak, spectrum[k] ?? 0);
  // round the axis top up to a 1-2-5 step so it does not jitter every window
  const mag = 10 ** Math.floor(Math.log10(Math.max(peak, 1e-6)));
  const yMax = [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= peak * 1.05) ?? peak;
  const x = (order: number) => left + (order / SPECTRUM_ORDERS) * pw;
  const barW = Math.max(1.2, pw / nBins - 0.8);
  const fmt = (v: number) => (v >= 10 ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Order spectrum in ${unit}`}
    >
      {[0, 0.5, 1].map((f) => (
        <g key={f}>
          <line
            x1={left}
            x2={W - right}
            y1={top + ph * (1 - f)}
            y2={top + ph * (1 - f)}
            stroke={f === 0 ? color.line : color.raised}
          />
          <text
            x={left - 8}
            y={top + ph * (1 - f) + 3}
            textAnchor="end"
            fontFamily="JetBrains Mono"
            fontSize="10"
            fill={color.fg3}
          >
            {fmt(yMax * f)}
          </text>
        </g>
      ))}
      {Array.from({ length: nBins }, (_, i) => {
        const k = i + 1;
        const a = spectrum[k] ?? 0;
        const h = Math.max(0, Math.min(1, a / yMax)) * ph;
        const isHalf = k === 8;
        return (
          <rect
            key={k}
            x={x(k / BINS_PER_ORDER) - barW / 2}
            y={top + ph - h}
            width={barW}
            height={h}
            fill={isHalf && halfAlert ? color.warn : color.accent}
            opacity={a > 0.004 * yMax || isHalf ? 1 : 0.5}
            style={{ transition: 'y 300ms, height 300ms' }}
          />
        );
      })}
      {(
        [
          [0.5, '0.5×'],
          [1, '1×'],
          [2, '2×'],
        ] as const
      ).map(([o, l]) => (
        <g key={l}>
          <line
            x1={x(o)}
            x2={x(o)}
            y1={top - 4}
            y2={top + ph}
            stroke={color.twin}
            strokeDasharray="2 3"
            opacity="0.6"
          />
          <text
            x={x(o)}
            y={top - 10}
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
      {Array.from({ length: SPECTRUM_ORDERS + 1 }, (_, o) => (
        <text
          key={o}
          x={x(o)}
          y={H - 16}
          textAnchor="middle"
          fontFamily="JetBrains Mono"
          fontSize="10"
          fill={color.fg3}
        >
          {o}×
        </text>
      ))}
      <text
        x={left + pw / 2}
        y={H - 2}
        textAnchor="middle"
        fontFamily="JetBrains Mono"
        fontSize="9"
        fill={color.fg3}
      >
        order (multiples of crank speed) · amplitude in {unit}
      </text>
    </svg>
  );
}

/** Sector labels sit in the corners, outside the circle, so they never cover the phasor. */
const SECTORS = ([1, 2, 3, 4] as const).map((cyl) => {
  const deg = misfirePhase_deg(cyl);
  const right = Math.cos((deg * Math.PI) / 180) > 0;
  const top = Math.sin((deg * Math.PI) / 180) > 0;
  return {
    cyl,
    deg,
    lx: right ? 226 : 14,
    ly: top ? 12 : 214,
    anchor: right ? ('end' as const) : ('start' as const),
  };
});

/**
 * Misfire polar plot. The 0.5× crank-speed phasor: its angle is the phase (the cylinder, four
 * 90° sectors) and its length is how much torque is missing (radius 1 = complete misfire).
 */
export function MisfirePolar({
  phase_deg,
  missing,
  cylinder,
  active,
}: {
  phase_deg: number;
  missing: number;
  cylinder: 1 | 2 | 3 | 4;
  /** a cylinder is being named */
  active: boolean;
}) {
  const a = (phase_deg * Math.PI) / 180;
  const r = 90 * Math.min(1, missing);
  const dx = r * Math.cos(a);
  const dy = -r * Math.sin(a);
  const sec = SECTORS.find((s) => s.cyl === cylinder) ?? SECTORS[0]!;
  const q = (d: number) => [
    120 + 90 * Math.cos((d * Math.PI) / 180),
    110 - 90 * Math.sin((d * Math.PI) / 180),
  ];
  const [x1, y1] = q(sec.deg - 45);
  const [x2, y2] = q(sec.deg + 45);
  const tone = active ? color.warn : color.fg3;
  return (
    <svg
      viewBox="0 0 240 224"
      className="mx-auto block h-auto w-full max-w-[340px]"
      role="img"
      aria-label={
        active
          ? `Misfire polar plot: cylinder ${cylinder} sector`
          : 'Misfire polar plot: no misfire'
      }
    >
      <path
        d={`M120 110 L${x1} ${y1} A90 90 0 0 0 ${x2} ${y2} Z`}
        fill="rgba(255,154,60,.22)"
        style={{ opacity: active ? 1 : 0, transition: 'opacity 300ms' }}
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
          textAnchor={s.anchor}
          fontFamily="JetBrains Mono"
          fontSize="11"
          fontWeight={active && s.cyl === cylinder ? 800 : 700}
          fill={active && s.cyl === cylinder ? color.warn : color.fg2}
        >
          CYL {s.cyl}
        </text>
      ))}
      <g style={{ transform: `translate(120px, 110px)` }}>
        <line
          x1="0"
          y1="0"
          x2={dx}
          y2={dy}
          stroke={tone}
          strokeWidth="2"
          style={{ transition: 'all 400ms cubic-bezier(.2,.8,.2,1)' }}
        />
        <rect
          x={dx - 6}
          y={dy - 6}
          width="12"
          height="12"
          fill={tone}
          transform={`rotate(45 ${dx} ${dy})`}
          style={{ transition: 'all 400ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </g>
    </svg>
  );
}

/** Dashed verticals at each cylinder's firing TDC (firing order 1-3-4-2, every 180°). */
function firingPlugin(): uPlot.Plugin {
  const order = PROFILE.geometry.firingOrder;
  return {
    hooks: {
      draw: (u) => {
        const { ctx, bbox } = u;
        const dpr = devicePixelRatio;
        ctx.save();
        ctx.font = `${10 * dpr}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        for (let i = 0; i < 8; i++) {
          const x = u.valToPos(i * 180, 'x', true);
          ctx.strokeStyle = color.lineStrong;
          ctx.setLineDash([2 * dpr, 4 * dpr]);
          ctx.beginPath();
          ctx.moveTo(x, bbox.top);
          ctx.lineTo(x, bbox.top + bbox.height);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color.fg3;
          ctx.fillText(`C${order[i % 4]}`, x + 12 * dpr, bbox.top + 12 * dpr);
        }
        ctx.restore();
      },
    },
  };
}

const CYCLE = 2 * PROFILE.crank.samplesPerRev;
const SPAN = 2 * CYCLE;
const DEG_PER_SAMPLE = 720 / CYCLE;

/**
 * Two 720° cycles of the latest window: vibration in m/s², or crank speed as ripple about its mean
 * in rpm. Each cylinder's firing TDC is marked; a weak cylinder shows as a missing speed rise.
 */
export function WaveChart({
  kind,
  height = 240,
  stroke = color.accent,
}: {
  kind: 'vib' | 'speed';
  height?: number;
  stroke?: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const xs = Float64Array.from({ length: SPAN }, (_, i) => i * DEG_PER_SAMPLE);
    const data = (): uPlot.AlignedData => {
      const w = useWindows.getState().windows;
      const src = w ? (kind === 'vib' ? w.vib : w.speed) : null;
      if (!src) return [xs, new Float64Array(SPAN)];
      const n = Math.min(SPAN, src.length);
      let mean = 0;
      if (kind === 'speed') {
        for (let i = 0; i < n; i++) mean += src[i]!;
        mean /= n;
      }
      const ys = new Float64Array(SPAN);
      for (let i = 0; i < n; i++) ys[i] = src[i]! - mean;
      return [xs, ys];
    };
    const u = new uPlot(
      {
        width: el.clientWidth,
        height,
        legend: { show: false },
        cursor: {
          points: { size: 5, fill: stroke, stroke: color.bg },
          drag: { x: false, y: false },
        },
        scales: { x: { time: false, range: [0, 1440] }, y: { auto: true } },
        axes: [
          {
            ...axis(),
            values: (_u, ticks) => ticks.map((v) => `${v}°`),
            splits: () => [0, 180, 360, 540, 720, 900, 1080, 1260, 1440],
          },
          axis(),
        ],
        series: [{}, { ...measured(kind, stroke), width: 1.5 }],
        plugins: [firingPlugin()],
      },
      data(),
      el,
    );
    const unsub = useWindows.subscribe((s, prev) => {
      if (s.windows !== prev.windows) u.setData(data());
    });
    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height }));
    ro.observe(el);
    return () => {
      unsub();
      ro.disconnect();
      u.destroy();
    };
  }, [kind, height, stroke]);

  return <div ref={box} className="w-full" />;
}
