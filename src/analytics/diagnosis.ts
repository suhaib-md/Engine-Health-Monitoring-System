import { ANALYTICS, WEIGHTS } from './config';
import { riskHigh, riskLow } from './risk';
import type { Features } from './residuals';
import type { SpectralFeatures } from './spectral';
import type { FaultEvidence, Symptom } from './types';

/**
 * Transparent fault evidence scores (draft §20.2): S_j = Σ w_ji R_i / Σ w_ji, where every R_i is
 * a named symptom with its live number. Weights follow the draft; symptoms the simulator can't
 * produce yet (coolant level, vibration) are left out and the remaining weights renormalised.
 */

const zRisk = (z: number) => riskHigh(z, ANALYTICS.zWarn, ANALYTICS.zCrit);
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const sgn = (x: number, d: (x: number) => string) => `${x >= 0 ? '+' : '−'}${d(Math.abs(x))}`;

function score(symptoms: Symptom[]) {
  const w = symptoms.reduce((a, s) => a + s.weight, 0);
  return w > 0 ? symptoms.reduce((a, s) => a + s.weight * s.risk, 0) / w : 0;
}

function cooling(f: Features): FaultEvidence {
  const c = f.channels.coolantC;
  const w = WEIGHTS.cooling;
  const symptoms: Symptom[] = [
    {
      id: 'tempResidual',
      weight: w.tempResidual,
      risk: c.valid ? zRisk(c.z) : 0,
      text: `Coolant is ${sgn(c.r, f1)} °C against twin expectation (${sgn(c.z, f1)}σ)`,
    },
    {
      id: 'tempRate',
      weight: w.tempRate,
      risk: riskHigh(
        c.ratePerMin,
        ANALYTICS.coolRate_KperMin.warn,
        ANALYTICS.coolRate_KperMin.crit,
      ),
      text: `Coolant residual changing ${sgn(c.ratePerMin, f1)} °C/min`,
    },
  ];
  if (f.fanOn != null) {
    symptoms.push({
      id: 'fanIneffective',
      weight: w.fanIneffective,
      risk: f.fanOn && c.z > ANALYTICS.zWarn ? 1 : 0,
      text: f.fanOn
        ? 'Radiator fan is on but not pulling the temperature back'
        : 'Radiator fan is off',
    });
  }
  return {
    id: 'cooling',
    name: 'Cooling-system degradation',
    subsystem: 'thermal',
    score: score(symptoms),
    symptoms,
    action: 'Check coolant level, radiator airflow and fan, water pump and thermostat operation.',
  };
}

function lubrication(f: Features): FaultEvidence {
  const p = f.channels.oilPressBar;
  const w = WEIGHTS.lubrication;
  const deficitPct = (1 - f.pressRatio) * 100;
  const symptoms: Symptom[] = [
    {
      id: 'lowPressure',
      weight: w.lowPressure,
      risk: p.valid
        ? riskLow(f.pressRatio, ANALYTICS.pressRatio.warn, ANALYTICS.pressRatio.crit)
        : 0,
      text:
        deficitPct >= 0
          ? `Oil pressure is ${deficitPct.toFixed(0)}% below twin expectation`
          : `Oil pressure is ${(-deficitPct).toFixed(0)}% above twin expectation`,
    },
    {
      id: 'pressureResidual',
      weight: w.pressureResidual,
      risk: p.valid ? zRisk(-p.z) : 0,
      text:
        p.persistLow_s > 0
          ? `Pressure residual ${sgn(p.z, f1)}σ, persisted ${p.persistLow_s.toFixed(0)} s`
          : `Pressure residual ${sgn(p.z, f1)}σ`,
    },
    {
      id: 'oilTemp',
      weight: w.oilTemp,
      risk: zRisk(f.oilExcessZ),
      text: `Oil running ${sgn(f.oilExcessZ * f.channels.oilC.sigma, f1)} °C beyond what the coolant explains`,
    },
    {
      id: 'pressureDecay',
      weight: w.pressureDecay,
      risk: riskHigh(
        -p.ratePerMin,
        ANALYTICS.pressDecay_barPerMin.warn,
        ANALYTICS.pressDecay_barPerMin.crit,
      ),
      text: `Oil-pressure residual changing ${sgn(p.ratePerMin, f2)} bar/min`,
    },
  ];
  return {
    id: 'lubrication',
    name: 'Lubrication-system degradation',
    subsystem: 'lubrication',
    score: score(symptoms),
    symptoms,
    action:
      'Inspect oil level, oil-pump operation, filter restriction and bearing-clearance condition.',
  };
}

function charging(f: Features): FaultEvidence {
  const v = f.channels.busV;
  const symptoms: Symptom[] = [
    {
      id: 'voltageResidual',
      weight: WEIGHTS.charging.voltageResidual,
      risk: v.valid ? zRisk(-v.z) : 0,
      text: `Bus voltage ${sgn(v.r, f2)} V against twin expectation`,
    },
  ];
  return {
    id: 'charging',
    name: 'Charging-system fault',
    subsystem: 'electrical',
    score: score(symptoms),
    symptoms,
    action: 'Check alternator output, drive belt tension and the voltage regulator.',
  };
}

/**
 * Misfire / combustion irregularity (draft sections 13, 30; weights 20.2). The 0.5x crank-speed
 * component's amplitude measures how much torque one cylinder is missing and its phase names the
 * cylinder. "Do not diagnose misfire from vibration alone" (draft 13.3): vibration is one of four symptoms.
 */
function combustion(s: SpectralFeatures | null): FaultEvidence {
  const w = WEIGHTS.combustion;
  const c = ANALYTICS.misfire;
  const named = !!s && s.misfire.missing >= c.nameAbove;
  const cyl = s?.misfire.cylinder ?? 1;
  const symptoms: Symptom[] = s
    ? [
        {
          id: 'rpmIrregularity',
          weight: w.rpmIrregularity,
          risk: riskHigh(s.ratios.ripple, c.rippleRatio.warn, c.rippleRatio.crit),
          text: `Crank-speed ripple ${f1(s.ripplePPRpm)} rpm peak to peak, ${f1(s.ratios.ripple)}× the healthy expectation`,
        },
        {
          id: 'firingSpectrum',
          weight: w.firingSpectrum,
          risk: riskHigh(s.misfire.missing, c.missing.warn, c.missing.crit),
          text: named
            ? `0.5× crank-speed component ${f1(s.speed.halfAmp_rpm)} rpm at ${sgn(s.speed.halfPhase_deg, (x) => x.toFixed(0))}°: cylinder ${cyl} sector, about ${(s.misfire.missing * 100).toFixed(0)}% of its torque missing`
            : `0.5× crank-speed component ${f1(s.speed.halfAmp_rpm)} rpm (no cycle-synchronous disturbance)`,
        },
        {
          id: 'vibrationLevel',
          weight: w.vibrationLevel,
          risk: riskHigh(s.ratios.rms, c.vibRatio.warn, c.vibRatio.crit),
          text: `Vibration ${f2(s.vib.rms)} m/s² RMS, ${f1(s.ratios.rms)}× the healthy expectation`,
        },
        {
          id: 'torqueCommand',
          weight: w.torqueCommand,
          risk: riskHigh(s.ratios.torqueCmd, c.cmdRatio.warn, c.cmdRatio.crit),
          text: `Governor asks for ${sgn((s.ratios.torqueCmd - 1) * 100, (x) => x.toFixed(0))}% torque against the healthy twin`,
        },
      ]
    : [
        {
          id: 'awaiting',
          weight: 1,
          risk: 0,
          text: 'Awaiting a crank-angle window (the engine must be running)',
        },
      ];
  return {
    id: 'combustion',
    name: named ? `Cylinder ${cyl} misfire` : 'Combustion irregularity',
    subsystem: 'combustion',
    score: score(symptoms),
    symptoms,
    action: named
      ? `Check the ignition coil, spark plug and injector on cylinder ${cyl}, then its compression.`
      : 'Check ignition, fuelling and compression for a weak cylinder.',
  };
}

/** All fault hypotheses, highest evidence first. */
export function diagnose(f: Features, s: SpectralFeatures | null = null): FaultEvidence[] {
  return [cooling(f), lubrication(f), charging(f), combustion(s)].sort((a, b) => b.score - a.score);
}
