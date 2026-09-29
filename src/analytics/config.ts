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
  /**
   * Misfire symptom ramps (engine-profile calibration values, never ISO limits): risk 0 at `warn`,
   * 1 at `crit`. Ratios are measured / the healthy Twin's expectation at the same speed and load.
   */
  misfire: {
    /** crank-speed ripple, peak to peak */
    rippleRatio: { warn: 1.6, crit: 4 },
    /** estimated missing fraction of the worst cylinder's torque, from the 0.5x amplitude */
    missing: { warn: 0.15, crit: 0.5 },
    /** vibration RMS */
    vibRatio: { warn: 1.3, crit: 2.5 },
    /** governor torque command */
    cmdRatio: { warn: 1.05, crit: 1.25 },
    /** below this missing fraction no cylinder is named */
    nameAbove: 0.12,
  },
  /** bearing wear shows as a 1× vibration rise and impacts (kurtosis) beside the pressure deficit */
  bearing: {
    firstRatio: { warn: 2, crit: 6 },
    kurtosis: { warn: 2.2, crit: 4 },
    /** vibration evidence above this names the lubrication fault "bearing wear" */
    nameAbove: 0.3,
  },
  /** sensor sanity (review "Proving a sensor fault with physics"; draft §15, §39) */
  sanity: {
    /** a jump must beat the physical rate limit plus this many σ of sample-to-sample noise */
    noiseAllowanceSigma: 6,
    /** keep reporting an impossible jump this long after it happened */
    violationLatch_s: 30,
    /** identical consecutive readings (10 Hz) before a sensor counts as stuck */
    stuckSamples: 30,
    /** …from a sensor whose readings changed on at least this share of samples before (τ below) */
    stuckNoisyShare: 0.8,
    changeRateTau_s: 10,
    /** dropout share over the last N readings: risk 0 at warn, 1 at crit */
    dropoutWindow: 50,
    dropoutWarn: 0.2,
    dropoutCrit: 0.5,
    /** coolant/oil cross-check */
    crossCheckTau_s: 10,
    driftCoolantSigma: 4,
    driftGapSigma: 5,
    driftHold_s: 30,
  },
  /** sensor faults are WARNING-class: the engine is fine, a sensor is not */
  sensorScoreCap: 0.84,
  /** statistical layer (review "Detection, AI and RUL"; Q-17) */
  stats: {
    baseline_s: 60,
    /** χ²(5) 99 % */
    chi2Limit: 15.09,
    d2Hold_s: 3,
    d2Clear_s: 20,
    /** variance floor on the learned covariance diagonal (z units) */
    minVarZ: 0.25,
    /** vibration RMS in σ units: (ratio − 1) / this */
    vibSigmaRel: 0.05,
    cusumKappa: 0.5,
    cusumH: 5,
    cusumEvery_s: 1,
    /** cap on S, so an alarm clears within ~25 s of the cause going away */
    cusumCap: 15,
    /** speed must stay within this band for 10 s to count as steady */
    steadyBand_rpm: 150,
    steadyWindow_s: 10,
  },
  /** RUL (review; draft §25; Q-19): straight-line fit of subsystem health */
  rul: {
    window_s: 120,
    every_s: 1,
    minSpan_s: 60,
    /** health index at which a subsystem counts as failed (the critical evidence level) */
    failHealth: 15,
    /** slopes flatter than this are "not significant" even if the fit is tight */
    minSlopePerMin: 0.5,
  },
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
  lubrication: {
    lowPressure: 0.35,
    pressureResidual: 0.2,
    oilTemp: 0.2,
    /** draft 0.15: used only when the vibration evidence names bearing wear (Q-50) */
    vibration: 0.15,
    pressureDecay: 0.1,
  },
  charging: { voltageResidual: 1 },
  /** draft section 20.2 misfire weights: rpm irregularity, firing spectrum, vibration, combustion (torque) */
  combustion: {
    rpmIrregularity: 0.35,
    firingSpectrum: 0.25,
    vibrationLevel: 0.2,
    torqueCommand: 0.2,
  },
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
