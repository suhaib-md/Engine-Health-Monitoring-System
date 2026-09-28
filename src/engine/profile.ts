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
  },

  faults: {
    /** H_pump = 1 − k·S (draft §28) */
    pumpSeverityGain: 0.75,
    /** H_cool = 1 − k·S. Draft uses 0.7; 0.8 lets H_cool reach the review's 0.25 test case (Q-04) */
    coolingSeverityGain: 0.8,
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
