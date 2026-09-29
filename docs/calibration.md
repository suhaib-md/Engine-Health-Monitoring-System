# IgniSense — Calibration Log

**Project:** IgniSense — Smart Engine Health Diagnostic · **Team:** Revora

Every value here is **demo calibration**. Each entry says where the value came from, why it was chosen, and what checks it. Code: [src/engine/profile.ts](../src/engine/profile.ts). Physics: [src/physics/](../src/physics/). Tests: `src/physics/*.test.ts`.

Status: **FIXED** = from the source docs · **DERIVED** = back-calculated from the docs' verified numbers · **PROVISIONAL** = chosen by us, needs the brother's sign-off (tracked in [open-questions.md](open-questions.md)).

---

## Phase 1 results (2026-09-28)

All review golden numbers reproduce within 2 %, most within 0.5 %:

| Check | Doc | Model |
| --- | --- | --- |
| Fuel power, 3,000 rpm / 80 N·m | 110.8 kW | 110.8 kW |
| Coolant heat, 3,000 rpm / 80 N·m | 31.9 kW | 31.88 kW |
| Fuel power, 6,000 rpm full load | 370.4 kW | 370.3 kW |
| Fuel rate, 4,000 rpm / 190 N·m | 28.6 L/h | 28.54 L/h |
| Steady coolant, 3,000 rpm / 80 N·m | 93 °C | 92.97 °C |
| 4,000 & 6,000 rpm (healthy) | 98 °C, fan cycling | fan cycles 96–98 °C |
| Cooling health 0.5, full load | 132 °C | 131.8 °C |
| Cooling health 0.25, 3,000 rpm | 110 °C | 109.7 °C |
| Idle warm-up 30 → 82 °C | "about 25 min" | **25.1 min** |
| Oil pressure (all 6 cases) | 2.54 / 1.39 / 3.23 / 0.56 / 1.29 / 1.70 bar | all within 1 % |

---

## Engine & energy

| Value | Status | Source / reason |
| --- | --- | --- |
| Geometry (86×86 mm, l = 145 mm, 0.5 kg, J = 0.20) | FIXED | review, "Engine geometry" |
| Torque curve 190[1 − 0.53((N−4000)/4000)²] | FIXED | review Fix 4 |
| **Load L = T / T_max(N)**, clamped 0–1 | DERIVED | Reproduces the 3,000 rpm row exactly (L = 0.435). Q-07 |
| FMEP (97 + 15n + 5n²)(1 + max(0, 90 − T_o)/70) | FIXED | review Fix 1&2 |
| η_i = 0.38 (0.70 + 0.30 L), P_acc = 500 W | FIXED | review |
| Coolant heat fraction 0.34 − 0.12 L | FIXED | review |
| Fuel LHV 43 MJ/kg, density 0.74 kg/L | FIXED | draft §8.3; reproduces the L/h column within 0.3 % |
| Stopped engine (N = 0) burns no fuel | DERIVED | Otherwise P_acc/η_i would heat a stopped engine |

## Cooling

| Value | Status | Source / reason |
| --- | --- | --- |
| UA = H_cool · F_therm · (600 + 1000 F_fan), C_th = 100 kJ/K | FIXED | review Fix 1 |
| Thermostat linear 82 → 95 °C | FIXED | draft §34. Also the only ramp that gives 93 °C at 3,000 rpm |
| **Fan on > 98 °C, off < 96 °C** (2 K hysteresis) | PROVISIONAL | The review only says "on above 98 °C". 2 K keeps the full-load fan cycle at a period of about 13 s, which looks realistic |
| Coolant balance has no separate Q̇_fric or Q̇_ambient terms | DERIVED | The review's golden steady states assume none. Q-03, Q-06 |

**Q-01 resolved.** The warm-up gap was in my quick estimate, not in the doc. With cold oil, FMEP is 1.86× higher at 30 °C, so idle fuel power starts near 12 kW instead of 7.5 kW. The full model reaches 82 °C in 25.1 min, matching the review. C_th stays at 100 kJ/K.

## Lubrication

| Value | Status | Source / reason |
| --- | --- | --- |
| Oil pressure (review form), P_idle 1.5, K_N 0.0009, K_c 1.5, relief 5 bar, μ exponent 0.5 | FIXED | review Fix 3 |
| Viscosity e^(−0.015(T_o − 90)) | FIXED | draft §10.1 / review |
| **Below idle speed: speed term = P_idle · N/N_idle** (0 bar at N = 0) | PROVISIONAL | The review formula gives 0.78 bar at N = 0, which is wrong for a stopped engine. Only affects cranking/shutdown. Q-27 |
| **C_o = 15 kJ/K** | PROVISIONAL | ~4 L oil (≈7 kJ/K) plus wetted metal. Time constant C_o/(K_co + UA_o) ≈ 57 s |
| **K_co = 250 W/K** (oil ↔ coolant) | PROVISIONAL | Chosen with the next two so hot oil runs 5–10 °C above coolant at part load |
| **UA_o = 15 W/K** (sump → ambient) | PROVISIONAL | Small. Keeps hot-idle oil close to coolant (82 °C) |
| **Oil friction heat share s = 0.35** | PROVISIONAL | 3,000 rpm/80 N·m → oil 101.7 °C (coolant 93 °C). Full load → ≈142 °C. Cooling fault 0.5 → ≈175 °C |
| **K_f = 0.5** (friction heat per unit D_lube) | PROVISIONAL | D_lube = 1 raises part-load oil temp by more than 3 K. Tuned further in Phase 3 |
| Oil balance is one-way (coolant not charged for K_co) | PROVISIONAL | Keeps the review's golden coolant temperatures. Q-03 |

Side effect to know about: at **hot idle** the steady oil temperature is about 82 °C (< 90 °C), so friction there is about 11 % above the review's warm-oil idle row. The golden rows are evaluated with warm oil (100 °C), as the review intends.

## Electrical (provisional, Q-11)

| Value | Status | Reason |
| --- | --- | --- |
| V_bat 12.6 V, V_reg 14.4 V, ΔV_load 0.2 V | PROVISIONAL | Typical 12 V system. Gives 13.7 V at idle and 14.2 V at 3,000 rpm |
| g(N) = 1 − e^(−N/600) | PROVISIONAL | Alternator is about 74 % regulated at idle and about 99 % by 3,000 rpm |
| Stopped engine → battery voltage | DERIVED | No alternator output at N = 0 |

## Faults (used from Phase 3)

| Value | Status | Reason |
| --- | --- | --- |
| H_pump = 1 − 0.75 S | FIXED | draft §28 (Q-05) |
| H_cool = 1 − 0.8 S | PROVISIONAL | The draft's 0.7 can't reach the review's H_cool = 0.25 test (Q-04) |

---

## Phase 2 additions (2026-09-29)

### Lifecycle (draft §31–32, Q-20)

| Value | Status | Reason |
| --- | --- | --- |
| Cranking 250 rpm for 1.0 s | PROVISIONAL | Typical starter speed. Long enough to be visible on the Debug page |
| Starter sag: bus 10.5 V below 400 rpm | PROVISIONAL | In the shared physics, so Plant and Twin agree (no false residual at start). Side effect: the bus also reads 10.5 V for about 0.5 s while a shutdown coasts through 400 rpm (Q-31) |
| Speed lag τ = 0.6 s toward target, shutdown decay τ = 0.4 s | PROVISIONAL | The slow model has no crank dynamics yet (Phase 7). Speed reaches target within a few seconds |
| TRANSIENT when \|rpm − target\| > 100 rpm | PROVISIONAL | Draft §32: short transients must not become faults |
| WARMUP ↔ RUNNING at the thermostat opening point (82 °C) | DERIVED | Draft §32: "thermostat initially restricted" |

### Parked engine (Q-30)

| Value | Status | Reason |
| --- | --- | --- |
| Natural convection 25 W/K, **only while stopped** | PROVISIONAL | Without it a stopped engine below 82 °C never cools (the thermostat is shut, and Q-06 left out ambient loss). Applied only at rpm = 0, so every golden number is unchanged. A hot engine loses more than 10 °C in the first parked hour |

### Sensor noise σ (draft §15; demo calibration)

| Channel | σ | Reason |
| --- | --- | --- |
| rpm | 5 rpm | Crank sensor jitter at the slow-loop rate |
| load | 0.004 | ECU-calculated value, lightly noisy |
| ambient | 0.1 °C | |
| coolant | 0.2 °C | Thermistor |
| oil temp | 0.3 °C | Thermocouple |
| oil pressure | 0.03 bar | 0–100 psi transducer via a 16-bit ADC |
| bus voltage | 0.03 V | |

Faults per channel: bias, drift (per simulated s), stuck, one-sample spike, dropout (probability; returns `null`). rpm/load/ambient are required fields in Telemetry, so they don't drop out.

### Phase 2 result

Healthy residuals over 60 s at each operating point (idle, 3,000/80, 4,000/190, 6,000 full load): mean within ±0.08 σ, spread 0.95–1.07 σ on every channel. The Twin tracks the healthy Plant to within sensor noise. The idle warm-up takes 25.2 s of wall time at 60×. One simulated hour computes in about 0.2 s.


---

## Phase 3 additions: faults & analytics (2026-09-29)

Code: [src/analytics/config.ts](../src/analytics/config.ts). All PROVISIONAL demo calibration unless marked.

| Value | Status | Reason |
| --- | --- | --- |
| Gradual fault onset: linear ramp to target over 120 simulated s | PROVISIONAL | Draft §19.1 linear progression. At 1× it's a visible two-minute decline; at 60× it takes 2 s |
| D_lube = 1 − H_pump (weak pump → more friction heat) | PROVISIONAL | Draft §10.3/§28: low pressure → poorer film → hotter oil. Gives the "oil temp rising" symptom |
| Analytics at 10 Hz (every 2nd slow step) | FIXED | CLAUDE.md timing table (5–10 Hz) |
| Residual EMA τ = 3 s | PROVISIONAL | Filters sensor noise to about 0.13σ, so \|z\| > 2 is never noise. Adds about 3 s of lag |
| σ_r = √(σ_sensor² + σ_model²), model floor: coolant 0.3 °C, oil 0.5 °C, pressure 0.05 bar, bus 0.05 V | PROVISIONAL | A real Twin is never perfect. The floor keeps thresholds honest for Phase 13 hardware |
| Residual risk: 0 at 2σ, 1 at 6σ (Q-16) | PROVISIONAL | |
| Pressure-ratio risk: 0 at 0.85, 1 at 0.50 of expected | PROVISIONAL | 15 % low starts to count; half pressure is certain |
| Coolant residual rate: 0.5 → 3 K/min; pressure decay: 0.1 → 1 bar/min | PROVISIONAL | |
| Absolute coolant limits 105 / 120 °C | FIXED | draft §43 prototype values |
| **Oil pressure compared at the MEASURED oil temperature** | DERIVED | Draft §17.3 context normalisation. Removes cooling → lubrication cross-talk (Q-32). Verified: a severe cooling fault keeps the lube score < 0.3 |
| Lube oil-temp symptom = oil residual − coolant residual | DERIVED | Oil hot *because* coolant is hot is not a lubrication symptom |
| Hysteresis 0.30/5 s, 0.55/10 s, 0.85/5 s; clear at (enter − 0.15) for 20 s | FIXED + DERIVED | Draft §23 gives the entries and "WARNING clears < 0.40 for 20 s"; the same 0.15 margin is applied to every level |
| Critical override held 2 s → CRITICAL | PROVISIONAL | Draft §22.2. The hold rejects a single bad sample |
| Alerts armed only when rpm > 0.8·idle for ≥ 10 s | PROVISIONAL | Draft §31: low pressure with the engine stopped is normal |
| Fault weights: draft §20.2, renormalised over available symptoms | FIXED + DERIVED | Cooling drops coolant level (not simulated); lube drops vibration (Phase 7). Fan symptom uses the telemetry fan command (Q-33) |

### Phase 3 result

- Healthy, 20 min with 8 operating-point changes: max evidence 0.027, never above NORMAL. Cold start and warm-up: never above NORMAL.
- Pump health 0.4 at hot idle: lubrication 0.65–0.76, override CRITICAL (pressure 60 % low) within about 15 s.
- Cooling health 0.5 at full load: cooling CRITICAL within 30 s; lubrication score stays 0.00.
- Gradual cooling fault to 0.25 at 3,000 rpm: WARNING after 60 s, when coolant is only 2.3 °C above the Twin.
- Pump health 0.85 (gradual): lube score 0.24 (weak). Catching this early is CUSUM's job (Phase 9).

## Phase 6–7: hero scenario, crank-angle model, vibration

| Value | Status | Reason |
| --- | --- | --- |
| Hero scenario: 20 °C ambient, idle warm-up at 60×, drive at 2,500 rpm / 55 N·m, oil-pump wear S = 0.6 gradual | PROVISIONAL | Cold 800 rpm at 20 °C reads the review's 2.54 bar (Q-44). 2,500 rpm / 55 N·m is draft §54's warm steady state. Warm-up at idle ends at T+29 min (about 30 s of wall time at 60×) |
| Scenario steps fire on the simulated clock (`after_s` from the previous step, or from a condition: engine RUNNING, alert WARNING+ with an explanation) | FIXED | Rule 6: identical at 1×, 10×, 60× and on every run. Tested at three different chunkings |
| Crank model: half-sine pulse A = 2π·T̄_cyl, ω stepped in crank angle at 0.5°, governor at its converged state | FIXED + DERIVED | Review equations. The step is integrated in kinetic-energy form d(ω²)/dθ = 2·net/J, the exact form of the same ODE, so all four cylinders give the same ripple (Q-39) |
| Telemetry window: 16 revolutions × 512 samples/rev = 8,192 points, sample 0 at cylinder 1 firing TDC, once per simulated second | PROVISIONAL | Power of two for the radix-2 FFT: bin k = order k/16 (Q-14) |
| Mount factor 0.1; block mass 150 kg; F₂ → sensor acceleration = 0.1·F₂/150 | PROVISIONAL | Review's rigid-body table gives 1.71 g at 3,000 rpm; mounts take most of it (Q-12) |
| 1× imbalance 5 % of the 2× line; rocking gain 0.008 (m/s²)/(N·m); accelerometer noise 0.03 m/s²; crank-speed jitter 1 rpm | PROVISIONAL | No values in either doc (Q-13). The rocking gain makes the misfire's 0.5× vibration line about a quarter of the 2× line at 3,000 rpm |
| Healthy vibration RMS: closed form ½(a₂ + k·⅔T)² + ½a₁² + higher torque harmonics + σ² | DERIVED | Twin's expectation. The torque-ripple 2× line has amplitude ⅔T because the four pulses tile A\|sin φ\| with A = πT/2 |
| Misfire severity from the 0.5× amplitude: m = 4A/(K·T + A), K from the closed form | DERIVED | Inverts A = K·T·m/(4 − m). Cylinder 3 at 50 % reads m = 0.5 |
| Symptom ramps (ripple ×1.6→×4, missing 0.15→0.5, vibration ×1.3→×2.5, command ×1.05→×1.25) | PROVISIONAL | Engine-profile calibration values (Q-40), never ISO limits |
| Overall health now averages six subsystems (vibration and combustion join at weights 0.20 and 0.15) | FIXED | Draft §22 weights. One failed subsystem now moves overall health less: the hero fault ends at about 84 (was 74 before vibration and combustion were monitored) |
| 3D flash fades with the diagnosed missing fraction; block shake = 0.007 × a₂ × cos 2θ × vibration excess | PROVISIONAL | Visual only (Q-42) |

### Phase 7 result (crank model at 3,000 rpm, resisting torque 110 N·m as in the review)

| Case | Ripple p-p (rpm) | 0.5× amplitude (rpm) | 0.5× phase | Command (N·m) |
| --- | --- | --- | --- | --- |
| Healthy | 11.06 (review 11) | 0.00 | none | 110.0 (110) |
| Cylinder 1 out | 61.21 (61) | 21.20 (21.0) | +45.0° | 146.7 (146) |
| Cylinder 2 out | 60.15 (61) | 20.84 (21.0) | +135.0° | 146.7 (146) |
| Cylinder 3 out | 60.85 (61) | 21.08 (21.0) | −45.0° | 146.7 (146) |
| Cylinder 4 out | 60.49 (61) | 20.96 (21.0) | −135.0° | 146.7 (146) |
| Cylinder 3 at 50 % | 32.13 (32) | 9.02 (9.0) | −45.1° | 125.7 (125) |

- F₂: 179.0 N at 800 rpm, 2,517.1 N at 3,000, 10,068.4 N at 6,000 (review 179 / 2,517 / 10,068).
- The per-cylinder spread in ripple (±0.6 rpm) comes from linear interpolation onto the 512-per-revolution grid; it is within 1.5 % of the review's 61.
- Through the whole chain (Plant → sensors → Twin → analytics): every cylinder is named correctly at 800, 3,000 and 6,000 rpm; command ratio 1.33; healthy engine at three operating points never raises combustion evidence above 0.1.
- Cost: one window (crank model + sensors + analysis) takes about 0.9 ms, so 60× time-warp uses about 5 % of a core for it.

## Phase 8: Show the math and blind mode

| Value | Status | Reason |
| --- | --- | --- |
| Registry: 27 equations, 24 with live substitution templates | FIXED | New: oil.tempRate, vib.sensorAccel, vib.healthyRms, crank.halfOrder, crank.missing, crank.misfirePhase. Tested: every template evaluates to its compute() and renders in KaTeX strict mode |
| Display precision: temperatures in the balances 3 dp, ambient 2 dp, inferred health 3 dp, UA 2 dp | DERIVED | Chosen so a judge redoing the displayed arithmetic gets the displayed result (tested for every step in six engine states) |
| K = 120·c½/(J·ω), c½ = 4√2/(3·2π) | DERIVED | Closed form behind A₀.₅ = K·T·m/(4 − m); K·T = 63.2 rpm at 3,000 rpm and 110 N·m |
| Blind deck severities and operating point | PROVISIONAL | Q-48 |
