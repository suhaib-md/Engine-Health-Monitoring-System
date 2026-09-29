import type { Telemetry } from '../telemetry';

/**
 * Telemetry ⇄ CSV (Phase 13, CSV replay). One row per sample; empty cells are sensor dropouts
 * (null, never 0 or NaN). Crank-angle windows are not stored, so a replay has no vibration or
 * misfire analysis. The header names are the Telemetry field names.
 */

export const CSV_COLUMNS = [
  't',
  'rpm',
  'load',
  'ambientC',
  'coolantC',
  'oilC',
  'oilPressBar',
  'busV',
  'fanOn',
  'torqueCmdNm',
] as const;
type Column = (typeof CSV_COLUMNS)[number];

/** Columns a file must have; the rest are optional. */
const REQUIRED: readonly Column[] = ['t', 'rpm'];

const fmt = (v: number | null | undefined, d: number) => (v == null ? '' : v.toFixed(d));

export function telemetryToCsvRow(tel: Telemetry): string {
  return [
    fmt(tel.t, 3),
    fmt(tel.rpm, 3),
    fmt(tel.load, 6),
    fmt(tel.ambientC, 4),
    fmt(tel.coolantC, 5),
    fmt(tel.oilC, 5),
    fmt(tel.oilPressBar, 6),
    fmt(tel.busV, 6),
    tel.fanOn == null ? '' : tel.fanOn ? '1' : '0',
    fmt(tel.torqueCmdNm, 2),
  ].join(',');
}

export const csvHeader = () => CSV_COLUMNS.join(',');

export class CsvError extends Error {}

/** Parse a telemetry CSV. Rows are sorted by t; unknown columns are ignored. */
export function parseTelemetryCsv(text: string): Telemetry[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
  if (lines.length < 2) throw new CsvError('The file has no data rows.');
  const head = lines[0]!.split(',').map((h) => h.trim());
  for (const r of REQUIRED)
    if (!head.includes(r))
      throw new CsvError(`Missing the "${r}" column (header: ${head.join(', ')}).`);
  const col = (name: Column) => head.indexOf(name);
  const idx = Object.fromEntries(CSV_COLUMNS.map((c) => [c, col(c)])) as Record<Column, number>;

  const rows: Telemetry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(',');
    const num = (c: Column): number | null => {
      const k = idx[c];
      if (k < 0) return null;
      const raw = cells[k]?.trim() ?? '';
      if (raw === '') return null;
      const v = Number(raw);
      if (!Number.isFinite(v))
        throw new CsvError(`Row ${i + 1}: "${raw}" in column ${c} is not a number.`);
      return v;
    };
    const t = num('t');
    const rpm = num('rpm');
    if (t == null || rpm == null) throw new CsvError(`Row ${i + 1}: t and rpm are required.`);
    const fan = num('fanOn');
    rows.push({
      t,
      rpm: Math.max(0, rpm),
      load: Math.min(1, Math.max(0, num('load') ?? 0)),
      ambientC: num('ambientC') ?? 25,
      coolantC: num('coolantC'),
      oilC: num('oilC'),
      oilPressBar: num('oilPressBar'),
      busV: num('busV'),
      fanOn: fan == null ? null : fan >= 0.5,
      torqueCmdNm: num('torqueCmdNm'),
    });
  }
  return rows.sort((a, b) => a.t - b.t);
}
