# IgniSense on a whiteboard

**IgniSense — Smart Engine Health Diagnostic · Team Revora**

The derivations a reviewer may ask for, each small enough to do by hand. Engine: 2.0 L inline-4, bore = stroke = 86 mm, crank radius r = 43 mm, con-rod l = 145 mm (λ = r/l = 0.297), reciprocating mass 0.5 kg per cylinder, crank + flywheel inertia J = 0.20 kg·m², firing order 1-3-4-2. Operating point unless stated: **3,000 rpm, 80 N·m**. All values are demo calibration. Each result below is checked by a test and shown live on the Validation page.

---

## 1. Angular speed and frequencies

ω = 2πN/60 = 2π × 3,000 / 60 = **314.16 rad/s**

- Crank frequency f_r = N/60 = **50 Hz**.
- Four cylinders fire twice per revolution, so f_fire = 2 f_r = **100 Hz**.

Brake power P = Tω = 80 × 314.16 = **25.1 kW**.

## 2. Why an inline-4 shakes at 2× (F₂)

The piston acceleration is a ≈ rω²(cos θ + λ cos 2θ). Pistons 1 and 4 sit at θ and pistons 2 and 3 at θ + 180°, so the first-order terms cancel (cos θ + cos(θ + 180°) = 0). The second-order terms add (cos 2θ is the same for both pairs):

F₂ = 4 m r ω² λ cos 2θ, so the peak is F₂ = 4 × 0.5 × 0.043 × 314.16² × 0.297 = **2,517 N** at **100 Hz**.

It scales with ω²: 179 N at 800 rpm and 10,068 N at 6,000 rpm.

## 3. Cold-start oil pressure

P = (P_idle + K_N(N − N_idle)) · μ_rel^0.5 · H_pump, with μ_rel = e^(−0.015(T_o − 90)).

At 800 rpm and 20 °C oil: μ_rel = e^(1.05) = 2.858, √2.858 = 1.690, so P = 1.5 × 1.690 = **2.54 bar**.

Hot (100 °C) it falls to 1.39 bar. A weak pump (H_pump = 0.4) scales the whole pressure down, so it shows even at idle: **0.56 bar**.

## 4. The misfire: exactly 4/3

Each cylinder's power stroke is a half-sine torque pulse lasting 180° of the 720° cycle. A half-sine averages 2/π of its peak and covers a quarter of the cycle, so the peak A that delivers a mean T_cyl per cylinder is A = 2π T_cyl.

The speed governor holds the mean speed, so the mean gas torque must still equal the load. With one cylinder out, three pulses carry four pulses' worth:

T_cmd = 4 T / 3, i.e. **×4/3**. For the review's rounded figures that is 110 → 146 N·m; in the app about 111 → 148 N·m.

## 5. Which cylinder? The half-order phase

A missing pulse repeats once per two revolutions (order 0.5). At half order, 180° of crank is 90° of phase. With cylinder 1's firing TDC as the reference, the cylinder that fires at crank angle θ_fire gives the phase φ = 45° − θ_fire / 2:

| Cylinder | Fires at | 0.5× phase |
| --- | --- | --- |
| 1 | 0° | **+45°** |
| 3 | 180° | **−45°** |
| 4 | 360° | **−135°** |
| 2 | 540° | 45° − 270° = −225° ≡ **+135°** |

The size of the component tells how much torque is missing: a complete misfire gives 21.0 rpm, and half a cylinder gives 9.0 rpm at the same phase.

## 6. Healthy crank-speed ripple ≈ 11 rpm

The four pulses tile the cycle as A|sin φ| with A = πT/2 (T = 110 N·m, so A = 172.8 N·m). The crank speeds up while A sin φ > T, from φ₁ = asin(2/π) = 39.5° to 180° − φ₁. The energy gained is:

ΔE = A[2 cos φ₁ − (2/π)(π − 2φ₁)] = 172.8 × 0.421 = 72.7 J

Δω = ΔE / (J ω) = 72.7 / (0.20 × 314.16) = 1.157 rad/s = **11 rpm peak to peak**.

With one cylinder out it becomes **61 rpm**.

## 7. Proving a sensor lied: 0.8 K/s

The fastest the coolant can heat is all the coolant heat at full load, redline and zero cooling:

dT/dt|max = Q̇_cool,max / C_th = 81,500 W / 100,000 J/K ≈ **0.8 K/s**

A reading that jumps 25 °C in one 0.2 s sample implies 125 K/s, which is **153×** the physical limit. In the app the 0.1 s step gives about 250 K/s. The engine did not overheat; the sensor failed.

## 8. Statistics with a known false-alarm rate

**Mahalanobis D²:** D² = (z − μ)ᵀ Σ⁻¹ (z − μ), learned from 60 s of healthy running. For healthy data it follows χ² with k = 5 degrees of freedom. From the table, χ²₅ at 99 % = **15.09**, so about 1 healthy sample in 100 crosses the limit. An alarm needs 3 s of persistence.

**CUSUM:** S = max(0, S + z − κ) with κ = 0.5 and h = 5. A residual stuck at z = 1 never crosses a 3σ limit, but S grows by 0.5 per sample and passes 5 after **about 10 samples** (11 exactly).

## 9. Remaining useful life

RUL = (H − H_fail) / |b|, with the band (H − H_fail) / (|b| ± 2 s_b). It is shown only when the slope is negative and |b| > 2 s_b.

Draft example with a degradation index D: (1 − 0.62) / 0.008 per hour = **47.5 h**.

## 10. Health score

H = 100 (1 − Σ w R / Σ w), with weights lubrication 0.25, thermal 0.25, vibration 0.20, combustion 0.15, electrical 0.10, sensors 0.05.

Draft §22.1 example (risks thermal 0.47, lubrication 0.33, vibration 0.38, combustion 0.20): H = 100 (1 − 0.3065) = **69.4**.

---

## Limitations to state (draft §55, plus ours)

- The telemetry is synthetic. It is not a substitute for engine-test data, and every coefficient is demo calibration.
- The thermal model is lumped: one coolant temperature and one oil temperature, with no spatial gradients.
- The lubrication model is an empirical pressure law, not a Reynolds-equation bearing solver.
- The crank model ignores compression torque and cycle-to-cycle combustion scatter. The speed governor is modelled at its settled state, not as a transient controller.
- The vibration amplitudes (mount factor, imbalance, bearing knock) are calibrated to look sensible, not measured. The vibration thresholds are engine-profile calibration values, never ISO limits (ISO 10816-6 excludes road vehicles).
- A slow drift in the oil-pressure or voltage sensor looks exactly like pump or alternator wear, because no physical cross-check exists for those channels. The coolant has one (the oil must follow a real coolant rise).
- The RUL is conditional on the assumed degradation law and on the load continuing. Stop-and-go driving makes the trend noisy, so no RUL is shown until it is significant.
- The diagnostic evidence scores are weighted sums, not calibrated probabilities. That is why the app never says "confidence %".
- The overall health is a weighted average, so it can look mild beside one critical subsystem. The alert level, not the average, carries the critical override.
