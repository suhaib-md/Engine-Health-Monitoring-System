# IgniSense — Open Questions & Knowledge Gaps

**Project:** IgniSense — Smart Engine Health Diagnostic · **Team:** Revora

This file lists anything that is unclear, missing or contradictory in the two source documents, or that shows up during the build. **Resolve these in the final open-questions review (see CLAUDE.md, Phase 12).**

**How to use this file**
- Add an item as soon as you spot a gap. Don't bury it in code comments.
- If a question **blocks** the current phase, make a *provisional decision*, write it in the "Provisional decision" column, and mark it `PROVISIONAL`. The build keeps moving and the choice gets reviewed at the end.
- Status values: `OPEN` (not decided) · `PROVISIONAL` (decided for now, needs review) · `RESOLVED` (final, with reason).
- Items marked **[Brother]** need an engineering sign-off from the physics owner.

Sources: **R** = [research-review-and-build-plan.md](research-review-and-build-plan.md), **D** = [draft-technical-research.md](draft-technical-research.md).

---

## Physics & calibration

| ID | Question | Where | Provisional decision | Status |
| --- | --- | --- | --- | --- |
| Q-01 | **Idle warm-up time mismatch.** R claims 30 → 82 °C in "about 25 min" at idle. With R's own numbers (2.55 kW coolant heat, C_th = 100 kJ/K, thermostat closed) it takes ~34 min *at warm-oil friction*. Cold oil nearly doubles FMEP (friction factor 1.86 at 30 °C), which raises fuel power and coolant heat early in warm-up, so the full model (with oil temperature, Q-02) may land near 25 min on its own. Check this once Q-02 is done. **[Brother]** | R Fix 1&2 | Resolved in Phase 1: cold-oil friction raises early idle heat, and the full model reaches 82 °C in 25.1 min with C_th = 100 kJ/K. See calibration.md. | RESOLVED |
| Q-02 | **Oil-temperature model constants.** D §10.3 gives the form C_o·dT_o/dt = Q_fric + K_co(T_c − T_o) − UA_o(T_o − T_amb) but no values for C_o, K_co, UA_o, K_f. T_o is needed by FMEP and oil pressure in Phase 1. **[Brother]** | D §10.3 | Phase 1: C_o 15 kJ/K, K_co 250 W/K, UA_o 15 W/K, friction share 0.35, K_f 0.5. Oil runs ≈ coolant + 9 K at 3,000 rpm. Needs sign-off. | PROVISIONAL |
| Q-03 | **Double-counting friction heat.** R puts friction into fuel power, then takes coolant heat as a fraction of fuel. D's coolant balance adds Q_fric as a separate term. Using both counts friction twice. | R Fix 2 vs D §9.1 | Implemented as proposed: coolant balance uses only the review heat fraction; oil exchange is one-way. All golden temps reproduce. | PROVISIONAL |
| Q-04 | **Cooling-fault range can't reach R's test case.** D §18.1/§29 uses H_cool = 1 − 0.7·S_cool (minimum 0.3), but R's fault check uses H_cool = 0.25. | D §29 vs R Fix 1&2 | Implemented: H_cool = 1 − 0.8 S (0.25 reachable at S = 0.9375), tested in Phase 3. | PROVISIONAL |
| Q-05 | **Pump severity mapping.** D §28: H_pump = 1 − 0.75·S_pump (minimum 0.25). R's golden case uses 0.4, which is reachable. Confirm 0.75 stays. | D §28 | k_p = 0.75 implemented and tested (pump 0.4 at S = 0.8). | RESOLVED |
| Q-06 | **Ambient loss term.** D §9.1 has a −Q_ambient term (block convection) besides the radiator. R omits it. Adding it would change the golden steady states. | D §9.1 | Omit it (R's golden numbers assume no extra term). | PROVISIONAL |
| Q-07 | **Load definition.** Neither doc defines load L exactly. L = T_brake / T_max(N) reproduces R's 3,000 rpm row exactly. Is the UI slider "load %" of T_max, or a torque in N·m? | R Fix 1&2 | L = T/T_max(N). UI slider = load % (0–100). The torque is shown as a derived value. | PROVISIONAL |
| Q-08 | **Oil temp in the "Hot, 3,000 rpm" golden case.** Not stated. 100 °C reproduces 3.23 bar. | R Fix 3 | Use 100 °C in the test. | RESOLVED |
| Q-09 | **Bearing-wear progression constants.** D §18.3 gives dW_b/dt = k_w·L^a(1 + k_T·R_T)(1 + k_P·R_lowP) with no values. **[Brother]** | D §18.3 | Pick values so wear 0 → 0.6 takes ~10 sim-minutes at 60 % load with a weak pump. | OPEN |
| Q-10 | **Stress-dependent fault progression.** D §19.3 dS/dt = k_0(1 + k_L·L)(1 + k_T·R_T)(1 + k_N·N_norm) has no constants. This is needed for the "increase load → RUL shrinks" demo step (D §54 steps 14–15). | D §19.3 | Linear progression for the MVP. Add stress dependence in Phase 9. | OPEN |

## Electrical

| ID | Question | Where | Provisional decision | Status |
| --- | --- | --- | --- | --- |
| Q-11 | **Alternator model values.** D §14 gives V_available = V_bat + H_alt·g(N)(V_reg − V_bat) but no V_reg, V_bat, g(N) or ΔV_load. **[Brother]** | D §14 | Implemented: V_reg 14.4 V (not 14.2), V_bat 12.6 V, g(N) = 1 − e^(−N/600), ΔV_load 0.2 V → 13.7 V idle, 14.2 V at 3,000 rpm. | PROVISIONAL |

## Vibration

| ID | Question | Where | Provisional decision | Status |
| --- | --- | --- | --- | --- |
| Q-12 | **Vibration units and magnitude.** D uses a "demo mm/s" RMS metric with warning 4 and critical 8. R derives block acceleration from F₂ (rigid upper bound 1.71 g at 3,000 rpm). A mount transmissibility factor is needed to turn F₂ into a sensor-level signal. Which unit is shown on the gauge? | D §43 vs R Vibration | Compute in m/s² from F₂ × a mount factor (e.g. 0.1). Show the RMS in m/s², with thresholds as profile calibration. | OPEN |
| Q-13 | **Amplitudes for 1× imbalance, bearing impulses and broadband noise.** No values in either doc. | R Vibration | Set them relative to the healthy 2× line and tune visually. Log the values. | OPEN |
| Q-14 | **Vibration sample rate.** D uses 2,048 Hz time-domain sampling with a 4,096 FFT. R uses crank-angle domain samples (0.5°, a 16-rev window). The phone and ESP32 paths deliver time-domain data. | D §11.7 vs R | Crank-angle domain for the simulator. Resample time-domain sources into the angle domain using measured RPM. | PROVISIONAL |

## Diagnostics & health

| ID | Question | Where | Provisional decision | Status |
| --- | --- | --- | --- | --- |
| Q-15 | **Fault-score symptoms we don't simulate.** D §20.2 weights include R_coolantLevel, R_fan/pump and R_combustion/oxygen. The `Telemetry` interface has no coolant level, fan state or lambda. Should these be added as signals, or should the weights be renormalized over the available symptoms? | D §20.2 | Implemented: coolant level and vibration dropped, weights renormalised; fan command used as the fan/pump symptom (Q-33). | PROVISIONAL |
| Q-16 | **Warning and critical limits for residual-based risk.** D §21 gives the risk formula, but its examples are absolute limits (105/120 °C, 2.2/1.0 bar). What are W and C for *normalized residuals* z? | D §21, §43 | Implemented: W = 2σ, C = 6σ on EMA-filtered residuals, σ_r = √(σ_sensor² + σ_model²); critical overrides from draft §22.2. | PROVISIONAL |
| Q-17 | **Which 5 signals feed Mahalanobis (k = 5)?** | R Anomaly | Coolant, oil temp, oil pressure, bus voltage and vibration RMS residuals. | PROVISIONAL |
| Q-18 | **Persistence timers under time-warp.** D §23 uses 5/10/5 s and 20 s to clear. Are these simulated seconds or wall-clock seconds? | D §23 | Implemented in simulated seconds; identical behaviour at every warp. | RESOLVED |
| Q-19 | **Degradation index D vs health index H for RUL.** D §25 uses a degradation index D rising to D_fail = 1. R fits the health index H falling to H_fail. Pick one convention. | D §25 vs R RUL | Use R's form (health falling to H_fail). Set H_fail per subsystem in the profile. | OPEN |

## Scope & UX

| ID | Question | Where | Provisional decision | Status |
| --- | --- | --- | --- | --- |
| Q-20 | **Engine lifecycle states.** D §31–32 has OFF/STARTING/WARMUP/RUNNING/TRANSIENT/SHUTDOWN with cranking, voltage sag and heat-soak. R doesn't mention these. What cranking speed, and how long does it last? | D §31–32 | Implemented in Phase 2: crank 250 rpm for 1.0 s, bus sags to 10.5 V below 400 rpm, oil pressure 0 when OFF, speed lag τ 0.6 s. See calibration.md. | PROVISIONAL |
| Q-21 | **Time-warp steps.** D suggests 1×/5×/20×; R suggests 1×/10×/60×. | D §19 vs R | 1×/10×/60× (R wins). | RESOLVED |
| Q-22 | **Hero scenario conflict.** D §54: warm steady state at 2,500 rpm/55 %, then oil-pump fault, then load up/down to change RUL. R: cold start → warm-up → blind oil-pump fault → misfire → sensor fault → RUL. | D §54 vs R Demo | Use R's 5-minute script as the master. Add D's "load changes RUL" step inside the prognosis segment if Q-10 is done. | OPEN |
| Q-23 | **Extra signals from D (EGT, MAP, IAT, coolant level, oil level, lambda).** These aren't in the Telemetry interface. | D §5.2 | Out of scope for the MVP. Revisit if time allows. | PROVISIONAL |
| Q-24 | **Exposure counters (D §26).** High-temp, low-oil-pressure and overspeed exposure integrals aren't in R's phase plan. | D §26 | Add them to the Report page in Phase 10 if cheap. | OPEN |

---

## Log of new items found during the build

_Append new items here with the next ID (Q-25, …), the phase where you found it, and a provisional decision._

| ID | Question | Where | Provisional decision | Status |
| --- | --- | --- | --- | --- |
| Q-25 | **Vibration unit on the gauge.** The design handoff's Live Twin sample shows vibration RMS in `mm/s` (0–10); Q-12 provisionally uses m/s². Pick one before Phase 7 and update the design sample, gauge ranges and thresholds together. | DESIGN Live Twin vs Q-12 | UI preview uses m/s² (0–10 range, placeholder). | OPEN |
| Q-26 | **Headless screenshot minimum width.** Headless Edge lays out at ≥ 504px, so true 375–400px phone widths weren't verified. | UI build | Check on a real phone or in DevTools device mode before Phase 11. | OPEN |
| Q-27 | **Oil pressure below idle speed.** The review formula gives 0.78 bar at N = 0. Found in Phase 1. | review Fix 3 | Below idle the speed term ramps linearly to 0 (P_idle·N/N_idle), so a stopped engine reads 0 bar. Only affects cranking/shutdown. | PROVISIONAL |
| Q-28 | **Fan hysteresis band.** The review only says "fan on above 98 °C". Found in Phase 1. | review Fix 1 | Off below 96 °C (2 K band). At full load the fan cycles with a period of about 13 s and coolant stays at 96–98 °C. | PROVISIONAL |
| Q-29 | **Hot-idle oil stays below 90 °C** (≈82 °C) with the provisional oil constants, so hot-idle friction is ~11 % above the review's warm-oil idle row. Found in Phase 1. **[Brother]** | Q-02 side effect | Accept. It is physically plausible, and the golden rows are defined at warm oil. Revisit if the hero demo's idle numbers look off. | PROVISIONAL |
| Q-30 | **A parked engine never cooled.** With the thermostat shut and no ambient loss (Q-06), a stopped engine below 82 °C kept its heat forever. Found in Phase 2. | Q-06 side effect | Add 25 W/K natural convection **only while rpm = 0**, so every running golden number is unchanged. | PROVISIONAL |
| Q-31 | **Starter-sag rule also fires during shutdown.** The shared physics pulls the bus to 10.5 V whenever 0 < rpm < 400, so a coasting-down engine shows the sag for about 0.5 s. Found in Phase 2. | Q-20 | Accept for now: Plant and Twin agree, so there is no false residual. Fix by adding a `cranking` flag to Telemetry if it shows on the voltage gauge. | PROVISIONAL |
| Q-32 | **Twin's expected oil pressure uses the Twin's own oil temperature,** not the measured one (the review: the Twin sees only RPM, load, ambient). An oil-temperature fault therefore also moves the pressure residual. Found in Phase 2. **[Brother]** | review Plant vs Twin | Resolved by draft §17.3: analytics compares oil pressure at the MEASURED oil temperature (via the shared physics). A severe cooling fault now leaves the lube score at 0.00 (tested). | RESOLVED |
| Q-33 | **Fan state in Telemetry.** Added `fanOn` (an actuator command, not a sensor) so the Twin follows a forced fan (test bench ON/OFF) instead of reporting a cooling fault. Found in Phase 2. | Rule 2 / Q-15 | Keep it. It also gives Phase 3 a real fan/pump symptom for the cooling score (Q-15). | PROVISIONAL |
| Q-34 | **Evidence score vs alert level can disagree.** A pump at 40 % shows evidence 0.65 ("probable", severity Medium) but CRITICAL, because the oil-pressure override fires. Found in Phase 3. | draft §22.2 | Keep. The override exists for this. The card shows both honestly. Revisit the wording in Phase 8. | PROVISIONAL |
| Q-35 | **Analytics imports shared physics + sensor specs.** Needed for the context-corrected pressure (Q-32) and σ_r. Neither carries fault state. Found in Phase 3. | CLAUDE.md rule 1 | Allowed and documented in rule 1. Lint still blocks plant/sources/worker/ui/three. | RESOLVED |
| Q-36 | **60 fps not yet verified on a real GPU.** Headless Edge renders WebGL in software (SwiftShader), which gives 16 fps and says nothing about GPU speed. Scene budget is met: 45 meshes, 50 draw calls, about 2.7k triangles. Found in Phase 5. | Phase 5 exit check | The user measured 60 fps on their laptop with the first scene. The 3D view was then upgraded (offline environment map, contact shadows, bloom, 71 meshes). Re-check the readout on the demo laptop; if it drops, disable ContactShadows first, then Bloom. | OPEN |
| Q-37 | **drei `<Html>` labels vanished intermittently** (a separate React root per label races with React 19 StrictMode double-mount). Found in Phase 5. | 3D callouts | Replaced with plain DOM callouts in the viewport, moved each frame by projecting 3D anchors (`three/callouts.ts`). No extra React roots. | RESOLVED |
| Q-38 | **Valve timing values** (IVO 350°, IVC 590°, EVO 130°, EVC 370° in cycle degrees, lift 9 mm) are typical SI demo values, used only for the 3D valve train. Found in the Phase 5 visual upgrade. **[Brother]** | profile `valveTiming_deg` | Keep as demo calibration; no diagnostic depends on them. | PROVISIONAL |
