import type uPlot from 'uplot';
import { color } from './tokens';

const font = '11px "JetBrains Mono", monospace';

export const axis = (label?: string): uPlot.Axis => ({
  stroke: color.fg3,
  font,
  labelFont: font,
  label,
  grid: { stroke: color.raised, width: 1 },
  ticks: { stroke: color.line, width: 1, size: 4 },
});

/** Measured series: 2px cyan. */
export const measured = (label: string, stroke: string = color.accent): uPlot.Series => ({
  label,
  stroke,
  width: 2,
  points: { show: false },
});

/** Twin / expected series: 1.5px dashed white. */
export const expected = (label = 'Twin'): uPlot.Series => ({
  label,
  stroke: color.twin,
  width: 1.5,
  dash: [5, 4],
  points: { show: false },
});

/** Residual band between measured (series a) and expected (series b). */
export const residualBand = (a: number, b: number): uPlot.Band => ({
  series: [a, b],
  fill: 'rgba(53,224,240,0.14)',
});

/** Draw hook: threshold lines, fault-injection lines, alert markers. */
export function markersPlugin(opts: {
  thresholds?: { y: number; color: string }[];
  faults?: number[]; // x values
  alerts?: { x: number; color: string }[];
}): uPlot.Plugin {
  return {
    hooks: {
      draw: (u) => {
        const { ctx, bbox } = u;
        ctx.save();
        const dpr = devicePixelRatio;
        for (const t of opts.thresholds ?? []) {
          const y = u.valToPos(t.y, 'y', true);
          ctx.strokeStyle = t.color;
          ctx.setLineDash([2 * dpr, 4 * dpr]);
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(bbox.left, y);
          ctx.lineTo(bbox.left + bbox.width, y);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        for (const x of opts.faults ?? []) {
          const px = u.valToPos(x, 'x', true);
          ctx.strokeStyle = color.faultMarker;
          ctx.lineWidth = 1.5 * dpr;
          ctx.beginPath();
          ctx.moveTo(px, bbox.top);
          ctx.lineTo(px, bbox.top + bbox.height);
          ctx.stroke();
        }
        const s = 5 * dpr;
        for (const a of opts.alerts ?? []) {
          const px = u.valToPos(a.x, 'x', true);
          const py = bbox.top + bbox.height - s;
          ctx.fillStyle = a.color;
          ctx.beginPath();
          ctx.moveTo(px, py - s);
          ctx.lineTo(px + s, py);
          ctx.lineTo(px, py + s);
          ctx.lineTo(px - s, py);
          ctx.fill();
        }
        ctx.restore();
      },
    },
  };
}

export const baseOpts: Partial<uPlot.Options> = {
  legend: { show: false }, // legends are built in React with the design-system swatches
  cursor: { points: { size: 6, fill: color.accent, stroke: color.bg } },
  axes: [axis(), axis()],
};
