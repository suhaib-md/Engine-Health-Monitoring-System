/**
 * IgniSense reference engine profile: generic 2.0 L inline-4, 4-stroke petrol.
 * Every value is DEMO CALIBRATION (see docs/research-review-and-build-plan.md), not OEM data.
 * Units are in the names. Values the docs leave open are marked with their open-question ID
 * (docs/open-questions.md) and are filled in during the phase that needs them.
 */

const bore_m = 0.086;
const stroke_m = 0.086;
const conRod_m = 0.145;
const cylinders = 4;

export const PROFILE = {
  name: 'Generic 2.0 L inline-4 petrol (demo calibration)',

  geometry: {
    cylinders,
    strokesPerCycle: 4,
    bore_m,
    stroke_m,
    crankRadius_m: stroke_m / 2,
    conRod_m,
    /** λ = r / l */
    lambda: stroke_m / 2 / conRod_m,
    /** 4 × π/4 × bore² × stroke ≈ 1,998 cc */
    displacement_m3: cylinders * (Math.PI / 4) * bore_m ** 2 * stroke_m,
    /** cylinder numbers in firing order */
    firingOrder: [1, 3, 4, 2] as const,
    /** crank throw angle per cylinder 1..4, degrees */
    crankThrow_deg: [0, 180, 180, 0] as const,
    recipMassPerCyl_kg: 0.5,
    /**
     * Valve timing in 4-stroke cycle degrees, 0 = firing TDC (demo calibration, typical SI values):
     * intake opens 10° before overlap TDC (350) and closes 50° after BDC (590);
     * exhaust opens 50° before BDC (130) and closes 10° after TDC (370).
     */
    valveTiming_deg: { intakeOpen: 350, intakeClose: 590, exhaustOpen: 130, exhaustClose: 370 },
    maxValveLift_m: 0.009,
    crankInertia_kgm2: 0.2,
  },

  speed: {
    idle_rpm: 800,
    max_rpm: 6000,
  },

  torque: {
    /** T_max(N) = peak [1 − shape((N − peakRpm)/peakRpm)²] */
    peak_Nm: 190,
    peakAt_rpm: 4000,
    curveShape: 0.53,
  },

  friction: {
    /** FMEP = (a + b·n + c·n²)(1 + max(0, coldRef − T_o)/coldSpan) kPa, n = N/1000 */
    fmepA_kPa: 97,
    fmepB_kPa: 15,
    fmepC_kPa: 5,
    coldRef_C: 90,
    coldSpan_K: 70,
  },

  energy: {
    accessoryPower_W: 500,
    /** η_i = base (offset + slope·L) */
    etaIndicatedBase: 0.38,
    etaIndicatedOffset: 0.7,
    etaIndicatedLoadSlope: 0.3,
    /** coolant heat fraction = a − b·L of fuel power */
    coolantFracA: 0.34,
    coolantFracB: 0.12,
    /** draft §8.3 */
    fuelLhv_Jperkg: 43e6,
    fuelDensity_kgperL: 0.74,
  },

  cooling: {
    ambientRef_C: 30,
    /** effective engine + coolant thermal capacitance */
    thermalCapacity_JperK: 100_000,
    uaBase_WperK: 600,
    uaFan_WperK: 1000,
    /** thermo-fan switches on above this */
    fanOn_C: 98,
    /** hysteresis band: fan switches off below fanOn_C − this. Provisional, logged in calibration in Phase 1 */
    fanHysteresis_K: 2,
    /** thermostat linear ramp (draft §34) */
    thermostatOpen_C: 82,
    thermostatFull_C: 95,
    /** Parked engine only: natural convection so a stopped engine cools down (Q-30). Not applied while running. */
    parkedLoss_WperK: 25,
  },

  lubrication: {
    pressureIdle_bar: 1.5,
    speedGain_barPerRpm: 0.0009,
    wearSensitivity: 1.5,
    pressureRelief_bar: 5.0,
    viscosityRef_C: 90,
    viscosityTempCoeff_perK: 0.015,
    viscosityExponent: 0.5,
    // Oil-temperature balance (draft §10.3). PROVISIONAL (Q-02), see docs/calibration.md.
    /** oil + wetted metal effective thermal capacitance */
    oilThermalCapacity_JperK: 15_000,
    /** K_co: oil ↔ coolant exchange */
    oilCoolantCoupling_WperK: 250,
    /** UA_o: sump → ambient */
    oilAmbientUA_WperK: 15,
    /** share of friction power that heats the oil */
    oilFrictionHeatShare: 0.35,
    /** K_f: extra friction heat per unit lubrication degradation */
    lubeFrictionGain: 0.5,
  },

  electrical: {
    // Alternator / bus (draft §14). PROVISIONAL (Q-11), see docs/calibration.md.
    batteryV: 12.6,
    regulatorV: 14.4,
    /** g(N) = 1 − exp(−N / this): alternator reaches regulation as speed rises */
    alternatorSpeedConst_rpm: 600,
    /** ΔV_load: drop from the vehicle's electrical load */
    loadDrop_V: 0.2,
    /** Starter draw: below this speed (cranking) the bus sags to crankingV (Q-20) */
    crankingBelow_rpm: 400,
    crankingV: 10.5,
  },

  lifecycle: {
    // Draft §31–32. PROVISIONAL (Q-20), see docs/calibration.md.
    crankingRpm: 250,
    crankingDuration_s: 1.0,
    /** first-order lag of engine speed toward the target (slow model; crank dynamics come in Phase 7) */
    rpmTimeConst_s: 0.6,
    shutdownTimeConst_s: 0.4,
    /** |rpm − target| above this = TRANSIENT */
    transientBand_rpm: 100,
  },

  /**
   * Sensor model y = x + b + d(t) + ε (draft §15). σ values are PROVISIONAL demo calibration.
   * bias/drift are 0 for healthy sensors; sensor faults set them (Phase 9).
   */
  sensors: {
    rpm: { sigma: 5, unit: 'rpm' },
    load: { sigma: 0.004, unit: '' },
    ambientC: { sigma: 0.1, unit: '°C' },
    coolantC: { sigma: 0.2, unit: '°C' },
    oilC: { sigma: 0.3, unit: '°C' },
    oilPressBar: { sigma: 0.03, unit: 'bar' },
    busV: { sigma: 0.03, unit: 'V' },
    /** crank-speed sensor jitter per 0.5° sample (toothed wheel + timer), PROVISIONAL (Q-13) */
    crankRpm: { sigma: 1, unit: 'rpm' },
    /** accelerometer broadband noise, PROVISIONAL (Q-13) */
    vibMs2: { sigma: 0.03, unit: 'm/s²' },
  },

  /**
   * Crank-angle model and vibration synthesis (Phase 7). PROVISIONAL demo calibration, see
   * docs/calibration.md and Q-12/Q-13/Q-25/Q-39.
   */
  crank: {
    /** the analysed window: 16 revolutions = 8 four-stroke cycles, in the crank-angle domain */
    windowRevs: 16,
    /**
     * Samples per revolution in the telemetry window (order-tracked). 512 x 16 = 8,192 points, a
     * power of two for the radix-2 FFT, so bin k is order k/16. The crank model itself steps at
     * `sim.crankStep_deg` (0.5 deg) and is resampled to this grid (Q-41).
     */
    samplesPerRev: 512,
    /** a fresh window is produced every this many simulated seconds (draft §11: analyse each second) */
    windowEvery_s: 1,
  },
  vibration: {
    /** engine block mass used for the rigid-body upper bound in the review's table */
    blockMass_kg: 150,
    /** share of the rigid-body acceleration that reaches the sensor through the engine mounts (Q-12) */
    mountFactor: 0.1,
    /** healthy 1× (residual imbalance) as a fraction of the healthy 2× line (Q-13) */
    imbalance1xFraction: 0.05,
    /** phase of the 1× line against cylinder-1 firing TDC, deg */
    imbalance1xPhase_deg: 30,
    /** block rocking from the net crank torque: a = −gain · (T_gas − T_load), m/s² per N·m (Q-13) */
    rockGain_ms2perNm: 0.008,
  },

  faults: {
    /** H_pump = 1 − k·S (draft §28) */
    pumpSeverityGain: 0.75,
    /** H_cool = 1 − k·S. Draft uses 0.7; 0.8 lets H_cool reach the review's 0.25 test case (Q-04) */
    coolingSeverityGain: 0.8,
    /** gradual onset: severity ramps from 0 to its target over this many simulated seconds */
    gradualRamp_s: 120,
    /** lubrication degradation from a weak pump: D_lube = gain · (1 − H_pump) (draft §10.3, §28) */
    lubeFromPumpGain: 1,
  },

  sim: {
    slowDt_s: 0.05,
    crankStep_deg: 0.5,
    timeWarpOptions: [1, 10, 60] as const,
    uiSnapshot_Hz: 20,
    displaySlowdown: 100,
  },
} as const;

export type EngineProfile = typeof PROFILE;
