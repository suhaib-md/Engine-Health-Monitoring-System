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
  /**
   * Radiator fan command (an actuator state the ECU knows, not a sensor reading).
   * Lets the Twin follow a forced fan instead of flagging it as a cooling fault. null = unknown.
   */
  fanOn?: boolean | null;
  /**
   * Speed-governor torque command, N·m. Like `fanOn`, an ECU-internal value the monitor may read;
   * it rises when a cylinder stops contributing (one cylinder out gives ×4/3). null = engine not firing.
   */
  torqueCmdNm?: number | null;
  /**
   * Crank speed, rpm, over the last 16 revolutions (8 four-stroke cycles) at 512 samples per
   * revolution: an order-tracked, crank-angle-domain window of 8,192 points (bin k of its FFT is
   * order k/16). Sample 0 is cylinder 1's firing TDC (the cam-sync reference of a real ECU).
   * Present once per second of simulated time, on the sample that completed a window.
   */
  crankSpeedWindow?: Float32Array;
  /** m/s², same 8,192-point crank-angle window as crankSpeedWindow */
  vibWindow?: Float32Array;
}
