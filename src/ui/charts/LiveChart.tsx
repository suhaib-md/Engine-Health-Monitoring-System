import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import { history, type History } from '../sim/history';
import { useSim } from '../sim/simClient';
import { axis, expected, markersPlugin, measured, residualBand } from '../uplotTheme';
import { color } from '../tokens';
import { formatClock } from '../format';

type Col = Exclude<keyof History, 'version' | 't'>;

const ALERT_COLOR = {
  INFO: color.accent,
  WATCH: color.watch,
  WARNING: color.warn,
  CRITICAL: color.crit,
};

/**
 * Live measured-vs-Twin chart (design system §10). Reads the history buffer on a 4 Hz timer
 * instead of re-rendering React per snapshot. Markers: fault injections (violet) and alerts.
 */
export function LiveChart({
  measuredKey,
  expectedKey,
  label,
  height = 260,
  thresholds = [],
  yRange,
  showMarkers = true,
}: {
  measuredKey: Col;
  expectedKey?: Col;
  label: string;
  height?: number;
  thresholds?: { y: number; color: string }[];
  yRange?: [number, number];
  showMarkers?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    // markers are read live from the latest snapshot on every draw
    const markers = {
      thresholds,
      faults: [] as number[],
      alerts: [] as { x: number; color: string }[],
    };

    const series: uPlot.Series[] = [{}, measured(label)];
    if (expectedKey) series.push(expected());
    const opts: uPlot.Options = {
      width: el.clientWidth,
      height,
      legend: { show: false },
      cursor: {
        points: { size: 6, fill: color.accent, stroke: color.bg },
        drag: { x: false, y: false },
      },
      scales: {
        x: { time: false },
        y: yRange ? { range: yRange } : { auto: true },
      },
      axes: [
        { ...axis(), values: (_u, ticks) => ticks.map((v) => formatClock(v).slice(3)) },
        axis(),
      ],
      series,
      // uPlot fills a band only where the first series is above the second: add both directions
      bands: expectedKey ? [residualBand(1, 2), residualBand(2, 1)] : [],
      plugins: showMarkers ? [markersPlugin(markers)] : [],
    };

    const data = (): uPlot.AlignedData => {
      const cols: (number | null)[][] = [history.t, history[measuredKey]];
      if (expectedKey) cols.push(history[expectedKey]);
      return cols as uPlot.AlignedData;
    };

    const u = new uPlot(opts, data(), el);
    let seen = history.version;

    const tick = setInterval(() => {
      if (history.version === seen) return;
      seen = history.version;
      const snap = useSim.getState().snapshot;
      if (snap && showMarkers) {
        markers.faults = snap.faultEvents.map((f) => f.t);
        markers.alerts = (snap.analytics?.alerts ?? [])
          .filter((a) => a.cls !== 'INFO')
          .map((a) => ({ x: a.t, color: ALERT_COLOR[a.cls] }));
      }
      u.setData(data());
    }, 250);

    const ro = new ResizeObserver(() => u.setSize({ width: el.clientWidth, height }));
    ro.observe(el);

    return () => {
      clearInterval(tick);
      ro.disconnect();
      u.destroy();
    };
    // the chart is configured once per mount; thresholds/yRange are static per chart
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measuredKey, expectedKey, label, height]);

  return <div ref={box} className="w-full" />;
}

export function LiveLegend({ withTwin = true }: { withTwin?: boolean }) {
  return (
    <div className="num flex flex-wrap gap-5 text-label text-fg-2">
      <span className="flex items-center gap-2">
        <span className="h-0.5 w-4 bg-accent" />
        measured
      </span>
      {withTwin && (
        <>
          <span className="flex items-center gap-2">
            <span className="h-0 w-4 border-t-2 border-dashed border-twin" />
            twin
          </span>
          <span className="flex items-center gap-2">
            <span className="h-2.5 w-3 bg-accent/15" />
            residual
          </span>
        </>
      )}
      <span className="flex items-center gap-2">
        <span className="h-3 w-0.5 bg-fault-marker" />
        fault injected
      </span>
      <span className="flex items-center gap-2">
        <span className="size-2 rotate-45 bg-warn" />
        alert
      </span>
    </div>
  );
}
