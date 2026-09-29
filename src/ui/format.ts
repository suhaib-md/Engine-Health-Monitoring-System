import type { Status } from './tokens';

/** Simulated seconds → hh:mm:ss */
export function formatClock(t: number) {
  const s = Math.floor(t);
  return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

/** Gauge colour from the filtered residual (σ units): the Twin gap drives the status. */
export function residualStatus(z: number | undefined): Status {
  const a = Math.abs(z ?? 0);
  if (a > 6) return 'crit';
  if (a > 4) return 'warn';
  if (a > 2) return 'watch';
  return 'ok';
}
