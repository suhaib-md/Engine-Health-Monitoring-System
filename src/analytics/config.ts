/**
 * Analytics calibration (demo values; reasons in docs/calibration.md).
 * Thresholds on residuals are in σ units of the residual noise σ_r = √(σ_sensor² + σ_model²).
 */
export const ANALYTICS = {
  /** analytics runs every N slow-loop steps (20 Hz / 2 = 10 Hz, CLAUDE.md timing table) */
  everyNSteps: 2,
  /** EMA time constant for residual filtering (draft §17.1) */
  emaTau_s: 3,
  /** window for residual rates of change (draft §17.2) */
  rateWindow_s: 10,
  /** model-error floor added to sensor noise (the Twin is never perfect on real hardware) */
  modelSigma: { coolantC: 0.3, oilC: 0.5, oilPressBar: 0.05, busV: 0.05 },
  /** residual risk ramps: R = 0 at |z| = warn, 1 at |z| = crit (Q-16) */
  zWarn: 2,
  zCrit: 6,
  /** coolant residual rising, K/min → risk 0..1 */
  coolRate_KperMin: { warn: 0.5, crit: 3 },
  /** oil-pressure residual falling, bar/min → risk 0..1 */
  pressDecay_barPerMin: { warn: 0.1, crit: 1 },
  /** measured / expected oil pressure → risk (low side) */
  pressRatio: { warn: 0.85, crit: 0.5 },
  /** absolute coolant limits for the thermal subsystem (draft §43 prototype values) */
  coolantAbs_C: { warn: 105, crit: 120 },
  /** analytics treats the engine as running above this fraction of idle speed */
  runningRpmFraction: 0.8,
  /** ignore alerts for this long after the engine starts (warm-up transients) */
  settleAfterStart_s: 10,
  /** coolant temperature at which the INFO "operating temperature" event fires */
  operatingTemp_C: 82,
  /** draft §23 hysteresis, in simulated seconds (Q-18) */
  levels: [
    { name: 'WATCH', enter: 0.3, hold_s: 5 },
    { name: 'WARNING', enter: 0.55, hold_s: 10 },
    { name: 'CRITICAL', enter: 0.85, hold_s: 5 },
  ],
  /** a level clears when the score stays below (enter − margin) for clearHold_s. WARNING clears < 0.40 for 20 s. */
  clearMargin: 0.15,
  clearHold_s: 20,
  /** critical overrides (draft §22.2) must persist this long */
  overrideHold_s: 2,
  maxAlerts: 30,
} as const;

/** Fault evidence weights (draft §20.2). Symptoms we don't simulate are dropped and the rest renormalised (Q-15). */
export const WEIGHTS = {
  cooling: { tempResidual: 0.4, tempRate: 0.2, fanIneffective: 0.15 },
  lubrication: { lowPressure: 0.35, pressureResidual: 0.2, oilTemp: 0.2, pressureDecay: 0.1 },
  charging: { voltageResidual: 1 },
} as const;

/** Subsystem health weights (draft §22). */
export const SUBSYSTEM_WEIGHTS = {
  lubrication: 0.25,
  thermal: 0.25,
  vibration: 0.2,
  combustion: 0.15,
  electrical: 0.1,
  sensors: 0.05,
} as const;
