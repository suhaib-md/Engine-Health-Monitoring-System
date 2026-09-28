/**
 * The one boundary type. Every source (simulator, CSV replay, ESP32, OBD-II) emits this,
 * and analytics/ consumes nothing else from the engine side.
 * `null` means sensor dropout — never use NaN or 0 for a missing reading.
 */
export interface Telemetry {
  /** s, simulated time */
  t: number;
  /** measured engine speed, rpm */
  rpm: number;
  /** 0..1, normalized load L = T_brake / T_max(N) */
  load: number;
  /** °C */
  ambientC: number;
  /** °C, null = sensor dropout */
  coolantC: number | null;
  /** °C */
  oilC: number | null;
  /** bar (gauge) */
  oilPressBar: number | null;
  /** V */
  busV: number | null;
  /** rpm per 0.5° crank step, last 16 revolutions */
  crankSpeedWindow?: Float32Array;
  /** m/s², same crank-angle window */
  vibWindow?: Float32Array;
}
