# Smart Engine Health Monitor — Research Review & Build Plan

**Project:** IgniSense — Smart Engine Health Diagnostic · **Team:** Revora

Sep 28, 2026 · @suhaib

> Companion documents: [draft-technical-research.md](draft-technical-research.md) (the original draft this review corrects) and [open-questions.md](open-questions.md) (gaps still to resolve).

## Summary

The draft is an unusually strong engineering foundation; keep its physics and diagnosis chain, fix four calculation bugs, and build it as a browser-only TypeScript app with a Three.js engine driven by the same equations as the dashboard.

The draft already covers the right chain: simulate, predict expected values, compute residuals and features, diagnose, score health, estimate RUL, explain. What it lacks is what judges test in the first five minutes: a working demo, an answer to "isn't the AI just reading the fault you injected?", and visible proof that the numbers are real.

The five changes that matter most:

1. **Fix the model's numbers.** With the draft's own values, a healthy engine overheats to about 166 °C at full load, never warms at idle, and hides an oil-pump fault at idle. Each fix is below with worked numbers.
2. **Split the engine into a Plant and a Twin.** The Plant is the "real" engine with hidden faults; the Twin is a healthy model that sees only sensor data. Diagnosis may never read fault settings. This makes residuals honest and makes real hardware a drop-in later.
3. **One physics model drives the 3D engine and the numbers.** Piston motion comes from the slider-crank equation, and the same equation produces the engine's second-order vibration. The animation becomes evidence, not decoration.
4. **Detect a misfire and name the cylinder.** A single-cylinder misfire creates a half-order (0.5×) crank-speed component; its phase identifies which cylinder. This is real OBD-style practice and a memorable demo moment.
5. **"Show the math" on every number.** Clicking any value shows its formula with live numbers substituted. For a first-year presenting to judges, this is the strongest credibility feature available.

Scope assumption: a 2-day build by one experienced full-stack developer (you) with your brother owning the engineering explanations, physics parameters and the pitch.

## Physics corrections to the draft

Four bugs in the draft's calibration would break the live demo; each fix below was checked by simulation, and all values stay labelled "demo calibration", as the draft rightly insists.

| # | Problem in the draft | What happens in the demo | Fix |
| --- | --- | --- | --- |
| 1 | Radiator UA fixed at 500 W/K | Healthy engine at full load settles near 166 °C | Split into base + fan: 600 W/K + 1,000 W/K when fan runs (thermo-fan on above 98 °C) |
| 2 | Heat comes only from brake power (η\_b × fuel) | At idle, brake power is 0, so the engine never warms up | Fuel covers brake + friction + accessory power; use indicated efficiency |
| 3 | Pump health and wear multiply only the rise above idle pressure | Oil-pump fault is invisible at idle | Apply health and wear terms to the whole pressure |
| 4 | Flat 180 N·m torque up to 6,000 rpm; 2× and firing components listed separately | 113 kW at redline is unrealistic; for an inline-4, 2× and firing frequency are the same 100 Hz line at 3,000 rpm | Parabolic torque curve; vibration built from its physical sources (next sections) |

### Fix 1 and 2: energy flow

Friction from a quadratic FMEP correlation, the standard form used in engine ECUs and in the Sandoval–Heywood friction model:

```latex
FMEP = \left(97 + 15n + 5n^2\right)\left(1 + \frac{\max(0,\,90 - T_o)}{70}\right)\ \text{kPa},\quad n = N/1000
```

The second bracket doubles friction for cold oil, matching the Sandoval–Heywood finding that cold friction is about twice warm friction. Friction torque, fuel power and coolant heat follow:

```latex
T_{fric} = \frac{FMEP \cdot V_d}{4\pi},\qquad \dot Q_{fuel} = \frac{P_b + T_{fric}\,\omega + P_{acc}}{\eta_i},\qquad \eta_i = 0.38\,(0.70 + 0.30L)
```

```latex
\dot Q_{cool} = (0.34 - 0.12L)\,\dot Q_{fuel},\qquad UA_{eff} = H_{cool}\,F_{therm}(T_c)\,\left(600 + 1000\,F_{fan}\right)
```

The torque curve peaks at 190 N·m at 4,000 rpm:

```latex
T_{max}(N) = 190\left[1 - 0.53\left(\frac{N - 4000}{4000}\right)^2\right]
```

Verified operating points (2.0 L, ambient 30 °C, P\_acc = 500 W):

| Operating point | Brake power (kW) | Friction + acc. (kW) | Fuel power (kW) | Brake efficiency | Coolant heat (kW) | Fuel (L/h) | Steady coolant temp, healthy (°C) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Idle, 800 rpm, no load | 0 | 2.0 | 7.5 | 0% | 2.6 | 0.85 | reaches 82 °C in about 25 min |
| 3,000 rpm, 80 N·m | 25.1 | 9.9 | 110.8 | 22.7% | 31.9 | 12.5 | 93 |
| 4,000 rpm, 190 N·m | 79.6 | 16.3 | 252.3 | 31.5% | 55.5 | 28.6 | 98 (fan cycling) |
| 6,000 rpm, full load | 103.6 | 37.2 | 370.4 | 28.0% | 81.5 | 41.9 | 98 (fan cycling) |

Fault check: cooling health 0.5 at full load settles at 132 °C; cooling health 0.25 at 3,000 rpm/80 N·m settles at 110 °C. Healthy stays safe, faulty clearly overheats. Idle fuel of 0.85 L/h is in the normal range for a 2.0 L petrol engine. The 25-minute warm-up is realistic, so the app needs a time-warp control (1×, 10×, 60×).

### Fix 3: oil pressure

```latex
\hat P_o = \min\left[P_{relief},\ \left(P_{idle} + K_N(N - N_{idle})\right)\,\mu_{rel}^{0.5}\,\frac{H_{pump}}{1 + K_c W_b}\right],\qquad \mu_{rel} = e^{-0.015(T_o - 90)}
```

With P\_idle = 1.5 bar, K\_N = 0.0009 bar/rpm, K\_c = 1.5, relief 5 bar:

| Case | Oil pressure (bar) |
| --- | --- |
| Cold start, 800 rpm, 20 °C oil | 2.54 |
| Hot idle, 800 rpm, 100 °C | 1.39 |
| Hot, 3,000 rpm | 3.23 |
| Pump health 0.4, hot idle | 0.56 |
| Pump health 0.4, 3,000 rpm | 1.29 |
| Bearing wear 0.6, 3,000 rpm | 1.70 |

The square root on viscosity keeps cold-oil pressure believable instead of pinning at the relief valve. The pump fault is now visible at idle, where real low-oil-pressure warnings usually first appear.

## Plant vs Twin: the architecture that makes the AI honest

Run two copies of the engine model: a Plant with hidden faults that produces sensor data, and a healthy Twin that predicts what those sensors should read. Diagnosis compares the two and never touches the fault sliders.

The draft computes residuals as actual minus expected, but if one simulator produces both, the residual is either always zero or the "AI" is secretly reading the injected fault. A judge who spots this sinks the project. The split fixes it:

> *(Diagram in the original: "Plant vs Twin architecture · the telemetry boundary". Text version:)*
>
> ```text
>  Fault panel ──► PLANT (hidden faults) ──► Sensor model (noise, bias, drift, dropout)
>                                                    │
>                                          ══ Telemetry boundary ══
>                                                    │
>                     ┌──────────────────────────────┴───────────────┐
>                     ▼                                              ▼
>        TWIN (all health = 1, driven by                 measured values
>        measured RPM, load, ambient) ──► expected ──► ANALYTICS: residual = measured − expected
>                                                      → features → diagnosis → health → RUL → explanation
> ```

The Twin runs the same equations with every health factor set to 1, driven only by measured RPM, load and ambient temperature. When the Plant's oil pump degrades, the Twin still predicts healthy pressure, so the residual grows. That residual is the fault evidence.

Three rules to enforce in code:

- **Separate modules.** `plant/`, `twin/` and `analytics/` are separate folders. `analytics/` imports only the `Telemetry` type. A lint rule or code review blocks any import of fault state.
- **One telemetry format.** Every source (simulator, CSV replay, ESP32, OBD-II) emits the same `Telemetry` object. Swapping in hardware later changes one adapter, not the analytics.
- **Blind mode for the demo.** A button lets a judge secretly set a fault while the presenter looks away. The system then names it. This is the single most convincing moment you can stage.

## New physics: one crank angle drives everything

Add a fast crank-angle simulation alongside the draft's slow thermal model; it drives the 3D pistons, the vibration signal and misfire detection from the same equations, and it can name the misfiring cylinder.

### Engine geometry

| Parameter | Value | Check |
| --- | --- | --- |
| Bore × stroke | 86 × 86 mm | Square engine, common for 2.0 L |
| Crank radius r | 43 mm | Half the stroke |
| Con-rod length l | 145 mm | λ = r / l = 0.297 |
| Displacement | 1,998 cc | 4 × π/4 × 0.086² × 0.086 |
| Firing order | 1-3-4-2 | Crank throws at 0°, 180°, 180°, 0° |
| Reciprocating mass per cylinder | 0.5 kg | Piston, pin, rings, part of rod (demo value) |
| Crank + flywheel inertia J | 0.20 kg·m² | Draft value, reasonable |

### Piston motion (drives the Three.js model)

The slider-crank equation gives piston position from crank angle θ. Each cylinder uses its own phase offset.

```latex
x(\theta) = r\cos\theta + \sqrt{l^2 - r^2\sin^2\theta}
```

```latex
a(\theta) \approx r\omega^2\left(\cos\theta + \lambda\cos 2\theta\right)
```

The animation is not a looped clip; the pistons are at exactly the positions the equation says. Your brother can put the equation on a slide and point at the moving model.

### Vibration from real sources

In an inline-4, the first-order (cos θ) forces of pistons 1 and 4 cancel those of pistons 2 and 3. The second-order (λ cos 2θ) forces all add. That is why inline-4 engines shake at twice crank speed:

```latex
F_2 = 4\,m_{rec}\,r\,\omega^2\,\lambda\cos 2\theta
```

| Speed (rpm) | 2nd-order frequency (Hz) | Peak F₂ (N) | Block acceleration on 150 kg, rigid (g) |
| --- | --- | --- | --- |
| 800 | 26.7 | 179 | 0.12 |
| 3,000 | 100 | 2,517 | 1.71 |
| 6,000 | 200 | 10,068 | 6.84 |

The last column is an upper bound; engine mounts reduce it. It explains why the 2× line dominates a healthy inline-4 spectrum, and it replaces the draft's separate 2× and firing-frequency terms, which are the same 100 Hz line at 3,000 rpm. The full synthetic signal becomes:

- **2× from F₂:** always present, grows with ω².
- **0.5× and 1.5× from uneven combustion:** misfire or weak cylinder.
- **1× from imbalance:** grows with bearing wear or looseness.
- **Impulses and broadband noise:** bearing distress raises kurtosis and crest factor before RMS.

### Crank-angle torque model

Each cylinder's expansion stroke is a half-sine torque pulse over 180° of its 720° cycle, scaled by its combustion health H\_i. A half-sine averages 2/π over its pulse, and the pulse covers a quarter of the cycle, so the amplitude that delivers mean torque T̄ per cylinder is:

```latex
A = 2\pi\,\bar T_{cyl},\qquad \omega_{k+1} = \omega_k + \frac{\Delta\theta}{\omega_k J}\left(\sum_i H_i A\,\sin\theta_i^{+} - T_{load} - T_{fric}\right)
```

It ignores compression torque, which is a stated simplification. Run it at 0.5° steps in a Web Worker: 3,000 rpm is 36,000 steps per second, trivial for a browser. A PI speed governor (the ECU or dyno controller) adjusts the torque command once per cycle to hold the set speed.

### Misfire detection that names the cylinder

A single-cylinder misfire repeats once per two revolutions, so it produces a half-order (0.5×) crank-speed component. Patent literature describes the half-order magnitude as a strong misfire indicator and uses its phase to identify the cylinder. Verified with the model above at 3,000 rpm, 80 N·m load:

| Case | Crank speed ripple, peak to peak (rpm) | 0.5× amplitude (rpm) | 0.5× phase | Torque command (N·m) |
| --- | --- | --- | --- | --- |
| Healthy | 11 | 0.0 | none | 110 |
| Cylinder 1 misfire | 61 | 21.0 | +45° | 146 |
| Cylinder 2 misfire | 61 | 21.0 | +135° | 146 |
| Cylinder 3 misfire | 61 | 21.0 | −45° | 146 |
| Cylinder 4 misfire | 61 | 21.0 | −135° | 146 |
| Cylinder 3 at 50% | 32 | 9.0 | −45° | 125 |

Three findings a judge can check by hand: the four phases are 90° apart because cylinders fire 180° of crank apart, which is 90° at half order; the governor raises torque by exactly 4/3 (110 → 146) because three cylinders now do four cylinders' work; and a partially weak cylinder shows the same phase at a smaller amplitude, so severity is measurable.

Compute the spectrum in the crank-angle domain (samples per degree, not per second). Peaks then stay sharp while RPM changes, a technique called order tracking.

## Detection, AI and RUL in the browser

Keep the draft's three layers (rules, anomaly detection, prognosis) but swap Isolation Forest for four methods that run in TypeScript and can each be worked on a whiteboard.

Isolation Forest needs Python or a port, and its output is hard for a first-year to explain. The methods below are simpler, faster and more defensible.

| Layer | Method | What it catches | Why judges accept it |
| --- | --- | --- | --- |
| Anomaly | Mahalanobis distance on the residual vector | Any unusual combination of residuals | Learned from a healthy baseline; threshold from statistics, not guessed |
| Slow drift | CUSUM on each normalized residual | Gradual degradation, sensor drift | Detects small persistent shifts long before a fixed limit trips |
| Sensor sanity | Physical rate limit + cross-check | Sensor spikes, stuck or dropped sensors | Uses energy balance to prove a reading is impossible |
| Diagnosis | Draft's weighted fault-symptom matrix | Which fault, with evidence list | Every point in the score traces to a named symptom |
| Prognosis | Linear fit on health index with confidence band | Time to reach the failure threshold | Shown only when the trend is statistically real |

### Anomaly score

During the first 60 s of a healthy run ("learning baseline"), record the normalized residual vector z for k signals and compute its mean μ and covariance Σ. Then, every tick:

```latex
D^2 = (\mathbf z - \boldsymbol\mu)^{\top}\,\Sigma^{-1}\,(\mathbf z - \boldsymbol\mu)
```

For healthy data, D² follows a chi-square distribution with k degrees of freedom. With k = 5 signals, the 99% threshold is 15.09, so the alarm limit comes from a table, not a guess. The dashboard can show each signal's share of D², which answers "why is it anomalous?".

### Slow drift (CUSUM)

```latex
S_k = \max\left(0,\ S_{k-1} + z_k - \kappa\right),\qquad \text{alarm when } S_k > h
```

Typical values are κ = 0.5 and h = 5 (in σ units). A residual sitting at 1σ never crosses a 3σ limit, but CUSUM flags it after about 10 samples. This is how the demo catches an oil pump at 85% health, before the pressure looks alarming.

### Proving a sensor fault with physics

The fastest the coolant can heat is all coolant heat with zero cooling. At full load that is 81.5 kW into 100 kJ/K:

```latex
\left.\frac{dT_c}{dt}\right|_{max} = \frac{\dot Q_{cool,max}}{C_{th}} = \frac{81{,}500}{100{,}000} \approx 0.8\ \text{K/s}
```

A 25 °C jump in one 0.2 s sample implies 125 K/s, over 150 times the physical limit. The system can state that the engine did not overheat and the sensor failed. Combine with cross-checks: oil temperature and the Twin disagree with the coolant reading.

### Remaining useful life

Fit a straight line to the subsystem health index over a sliding window (for example the last 120 s of simulated time). With current health H, failure threshold H\_fail and slope b:

```latex
RUL = \frac{H - H_{fail}}{|b|},\qquad RUL_{low/high} = \frac{H - H_{fail}}{|b| \pm 2\,s_b}
```

s\_b is the slope's standard error from the regression. Show RUL only when the slope is negative and |b| > 2 s\_b; otherwise show "trend not significant". This follows the draft's own advice and the NASA framing of RUL as a prediction with uncertainty. Label units as simulated hours, driven by the time-warp setting.

## Features that raise hackathon chances

The winning features are the ones that let judges verify the engineering themselves: live math, a blind fault test and in-app validation beat extra charts.

| Feature | Why it wins | Effort (h) | Priority |
| --- | --- | --- | --- |
| "Show the math" on every value | Click oil pressure → formula with live numbers substituted (KaTeX). Turns every number into a proof. | 3 | Must |
| Blind-mode fault challenge | A judge secretly injects a fault; the system names it. Proves diagnosis isn't reading the slider. | 1 | Must |
| One-click hero scenario + fixed random seed | The demo runs the same way every time, even under stage nerves. | 2 | Must |
| Explanation card with evidence | Draft section 35.5, fed by real residuals and D² contributions. | 2 | Must |
| Validation page | Auto-runs physics checks with pass/fail: energy balance closes, f₂ = 2 × f\_r, misfire torque ratio = 4/3, steady state matches the hand calculation. | 2 | Should |
| Live cause-and-effect graph | The draft's causal network (section 6) with edges lighting up as a fault propagates. | 2 | Should |
| Engine sound from the simulator | Web Audio pulse at each firing event; a misfire is audible as a stumble. Memorable, cheap. | 2 | Should |
| Maintenance report export | Print-to-PDF of fault, evidence, action and RUL. Shows it's a product, not a toy. | 1.5 | Should |
| Hot-city stop-and-go scenario | 40 °C ambient, idle-to-load cycling, low airflow. Relatable local use case. | 0.5 | Should |
| Phone as a real vibration sensor | Open the app on a phone; the browser's motion API feeds real accelerometer data into the same FFT. Limited to roughly 60–100 Hz sampling, so it shows low orders only. | 3 | Stretch |
| OBD-II live data | USB ELM327 adapter + browser Web Serial reads a real car's RPM, coolant temp, load, voltage. Most cheap Bluetooth clones won't work from a browser. | 4 | Stretch |

Skip these; they cost time and judges don't score them: login, a database server, multi-engine fleet views, and training a neural network on synthetic data (it only learns your own equations back).

## Tech stack and software architecture

Build a single static web app in TypeScript with the whole simulation in a Web Worker; drop the draft's FastAPI backend.

A Python backend adds WebSockets, deployment and a dependency on venue Wi-Fi, and buys nothing: every calculation here runs in well under a millisecond per tick in a browser. A static build runs offline from the laptop and deploys to Cloudflare Pages or Vercel for a shareable link.

| Layer | Choice | Reason |
| --- | --- | --- |
| App | Vite + React + TypeScript | Fast setup, you already know it |
| Simulation | Plain TS in a Web Worker, fixed timestep | UI never stutters; deterministic with a seeded RNG |
| State | Zustand, with transient subscriptions for 60 fps values | Avoids re-rendering React on every tick |
| 3D | three.js via @react-three/fiber + drei | Declarative scene, easy click-to-select parts |
| Charts | uPlot for streaming trends and FFT | Handles thousands of points at 60 fps; Recharts struggles with streaming |
| Math display | KaTeX | Renders the "Show the math" formulas instantly |
| FFT | Own radix-2 (about 40 lines) or fft.js | Own version is explainable to judges |
| Styling | Tailwind | Fast dark dashboard styling |
| Tests | Vitest | The same physics tests power the in-app Validation page |

### Timing

| Loop | Rate | Contents |
| --- | --- | --- |
| Slow physics | 20 Hz simulated (Δt = 0.05 s), multiplied by time-warp | Thermal, lubrication, electrical, fault progression |
| Crank angle | 0.5° steps, run in chunks each slow tick | Torque, speed ripple, vibration samples |
| Analytics | 5–10 Hz | Residuals, D², CUSUM, diagnosis, health, RUL |
| FFT | Every 1 s over a 16-revolution window | Order spectrum |
| UI snapshot | 20 Hz postMessage | Latest telemetry + analytics |
| 3D render | 60 fps | Interpolates crank angle between snapshots |

### Folder structure

The key idea is a shared `physics/` folder of pure functions that both Plant and Twin call. Each equation is registered with its LaTeX and inputs, which is what powers "Show the math".

```text
src/
  physics/     pure equations: friction, heat, thermal, oil pressure, slider-crank, torque
               each registered as { id, latex, inputs, compute } for Show the math
  engine/      profile.ts: every parameter, units in the name (bore_m, uaFan_WperK)
  plant/       state + fault states, sensor model (noise, bias, drift, dropout)
  twin/        healthy reference: same physics, all health = 1
  analytics/   residuals, features, fft, mahalanobis, cusum, diagnosis, health, rul
  sources/     simSource, replaySource (CSV), serialSource (ESP32 / OBD-II stub)
  worker/      sim.worker.ts: runs plant -> sensors -> twin -> analytics
  three/       Engine, Crank, Piston, CoolantFlow, heat-map materials
  ui/          pages, gauges, charts, explanation card, math panel
  tests/       physics sanity tests, reused by the Validation page
```

### The one interface that matters

```ts
// Every source (simulator, CSV, ESP32, OBD-II) emits this. analytics/ imports nothing else.
interface Telemetry {
  t: number;                 // s, simulated time
  rpm: number;               // measured
  load: number;              // 0..1, or torque demand
  ambientC: number;
  coolantC: number | null;   // null = sensor dropout
  oilC: number | null;
  oilPressBar: number | null;
  busV: number | null;
  crankSpeedWindow?: Float32Array; // rpm per 0.5 deg, last 16 revs
  vibWindow?: Float32Array;        // m/s^2, same window
}
```

## Three.js virtual engine plan

Build the engine procedurally from primitives, not from a downloaded model, so every moving part is positioned by the physics and every part is clickable.

A downloaded model brings licensing questions, is rarely rigged for per-piston motion, and invites the judge question "did you just animate a model?". A procedural inline-4 cutaway takes about 5–6 hours and answers that question for you.

| Part | Built from | Driven by |
| --- | --- | --- |
| Block (cutaway, semi-transparent) | Box geometry with cylinder bores | Colour = coolant/metal temperature heat map |
| Pistons ×4 | Cylinder geometry | Slider-crank x(θ); pistons 1 and 4 at θ, 2 and 3 at θ + 180° |
| Con-rods ×4 | Box between pin and crank-pin | Rod angle φ = asin(λ sin θ) |
| Crankshaft + flywheel | Cylinders and boxes in a group | Rotation = simulated θ |
| Combustion flash | Point light + emissive sprite in each chamber | Fires at each cylinder's power stroke; missing when that cylinder misfires |
| Oil sump + galleries | Tube geometry along curves | Glow intensity = oil pressure; red when low |
| Coolant hoses + radiator | Tube geometry with scrolling texture | Flow speed ∝ pump flow × thermostat opening |
| Radiator fan | Blades group | Spins when the fan is on |
| Alternator + belt | Cylinder + tube | Spin ∝ RPM; amber when charging voltage is low |
| Whole engine | Parent group | Small shake from the computed 2nd-order acceleration (scaled) |

### Slow-motion view (required, not optional)

At 3,000 rpm the crank turns 50 times per second, which is 300° per frame at 60 fps. The pistons would appear frozen or turn backwards (the wagon-wheel effect). Add a view-speed control: physics runs at real speed, and the display crank angle advances at 1/100 of real speed (30 rpm on screen). Label it on screen as "display slowed 100×" so nobody thinks the physics is slowed.

### Interactions

- **Click a part:** side panel with its sensors, measured vs expected values, residual and health.
- **Health overlay:** green, amber, red, grey (sensor invalid), as in the draft.
- **Camera presets:** front, side cutaway, top, plus an exploded-view toggle.
- **Fault cues:** the faulty subsystem pulses; the misfiring cylinder shows no flash.

### Performance budget

Under 100 meshes, MeshStandardMaterial, one environment map, optional bloom for the flashes. Mutate positions in `useFrame` from a ref, never through React state; that keeps 60 fps on an ordinary laptop.

## App screens

Six screens, but the first one carries the whole demo; the rest are for judges who want to dig.

| Screen | Contents | Must for day 1? |
| --- | --- | --- |
| Live Twin (home) | 3D engine centre. Left: start/stop, throttle/load, ambient, fan, time-warp, view speed, scenario picker, fault panel with blind mode. Right: overall health ring, subsystem health bars, explanation card. Bottom: gauges for RPM, coolant, oil temp, oil pressure, voltage, vibration RMS, each with a faint "ghost" marker at the Twin's expected value so the residual is visible at a glance. | Yes |
| Trends | Measured vs expected lines per signal, fault-injection and alert markers, D² with its chi-square limit, CUSUM with its limit | Yes, basic |
| Vibration and crank | Order spectrum with 0.5×, 1×, 2× cursors; crank-speed ripple over one cycle; misfire polar plot with the 0.5× phase dot landing in one of four cylinder sectors | Spectrum yes, polar plot day 2 |
| Show the math | Every registered equation with symbols, units and today's live numbers substituted | One equation per subsystem on day 1 |
| Validation | Physics sanity tests with pass/fail and the expected hand-calculated value beside the model value | Day 2 |
| Report | Printable maintenance report: fault, evidence, recommended action, RUL band, timestamp | Day 2 |

The misfire polar plot is worth the effort: a dot that jumps into the "Cylinder 3" sector when cylinder 3 misfires is instantly understood by any judge.

## Two-day build plan

The rule is breadth first: by the end of day 1 the full chain runs end to end with two faults, so day 2 can only add, never rescue.

> *(Diagram in the original: "Two-day build plan · two lanes, two gates" — a developer lane and a brother/engineering lane running in parallel, with a gate at end of day 1 (full chain end to end with two faults) and a gate at end of day 2 (demo-ready). The phase plan in `CLAUDE.md` replaces this with a finer-grained, checkpointed sequence.)*

Hours are build hours, not clock hours. Your brother's lane runs in parallel and feeds you numbers; he should own every calculation he will present.

### Cut lines if time runs short

Drop items from the bottom of this list first. Everything above the line "minimum viable demo" is non-negotiable.

- [ ] Plant + Twin slow physics with corrected calibration
- [ ] Cooling fault and oil-pump fault, progressive severity
- [ ] Residuals, rule-based diagnosis, explanation card
- [ ] Live Twin screen with gauges and ghost markers
- [ ] 3D engine with pistons moving by slider-crank, slow-mo view
- [ ] One-click hero scenario with fixed seed
- [ ] **Minimum viable demo line**
- [ ] Misfire with half-order detection and polar plot
- [ ] Show the math for one equation per subsystem
- [ ] Blind-mode fault challenge
- [ ] Mahalanobis anomaly score and CUSUM
- [ ] RUL with confidence band
- [ ] Validation page
- [ ] Sensor fault with physical rate-limit proof
- [ ] Bearing wear and alternator faults
- [ ] Maintenance report export
- [ ] Engine sound
- [ ] Phone vibration sensor or OBD-II source

## Hardware roadmap

Every simulated signal maps to a common, low-cost sensor or a standard OBD-II code, and the hardware only has to emit the same `Telemetry` object; the analytics code does not change.

### Path A: sensors on a lab engine (ESP32)

| Signal | Sensor | Interface to ESP32 | Note |
| --- | --- | --- | --- |
| Crank speed, per tooth | Hall-effect sensor on a toothed wheel (e.g. 60-2 pattern) or the engine's own crank sensor | Interrupt timer | Per-tooth timing is what makes half-order misfire detection possible |
| Coolant temperature | DS18B20 waterproof probe (to 125 °C) | 1-Wire |  |
| Oil temperature | K-type thermocouple + MAX31855 or MAX6675 | SPI |  |
| Oil pressure | 0–100 psi ratiometric transducer (0.5–4.5 V) | ADS1115 16-bit ADC | ESP32's own ADC is too noisy and limited to about 3.3 V |
| Vibration | ADXL345 accelerometer (up to 3,200 Hz output rate) | SPI | Covers the draft's 2,048 Hz vibration sampling |
| Bus voltage | INA219 or a resistor divider | I²C / ADC |  |
| Throttle / load | Potentiometer or dynamometer reading | ADC |  |

The ESP32 streams JSON lines over USB serial, which the browser reads with the Web Serial API, or over Wi-Fi WebSocket. A CSV logged from the same rig can be replayed through `replaySource` with no hardware present.

**The best near-term step:** most Indian mechanical engineering departments have an engine test rig used for heat-balance and Morse-test lab experiments. One heat-balance run on that rig gives measured fractions for brake, coolant and exhaust energy, replacing the demo calibration with real data. That is a strong "next steps" slide.

### Path B: any car through OBD-II

Standard mode-01 PIDs cover four of the core signals ([source](https://en.wikipedia.org/wiki/OBD-II_PIDs)):

| PID | Signal | Formula (A, B = response bytes) |
| --- | --- | --- |
| 0C | Engine speed (rpm) | (256A + B) / 4 |
| 04 | Calculated load (%) | 100A / 255 |
| 05 | Coolant temperature (°C) | A − 40 |
| 0F | Intake air temperature (°C) | A − 40 |
| 0B | Manifold absolute pressure (kPa) | A |
| 42 | Control module voltage (V) | (256A + B) / 1000 |

Oil pressure and per-tooth crank speed are not standard PIDs, so OBD-II supports the thermal, electrical and load parts of the system but not lubrication or misfire phase. Use a USB ELM327 adapter with Web Serial; most cheap Bluetooth clones use Bluetooth Classic, which browsers cannot reach.

## Demo script and judge Q&A

A five-minute demo built around three moments judges remember: a fault they choose themselves, a misfire that names its cylinder, and a sensor fault the system refuses to believe.

### Five-minute script

1. **0:00–0:40, Problem.** Fixed-interval maintenance either wastes parts or misses failures; condition monitoring watches the engine and predicts. One sentence on the Plant vs Twin idea.
2. **0:40–1:20, Cold start.** Start the engine. Oil pressure reads high (about 2.5 bar) because cold oil is thick; time-warp the warm-up. Pistons move by the slider-crank equation in slow-mo. Ghost markers sit on the needles: measured equals expected.
3. **1:20–2:20, Blind fault.** A judge secretly picks a fault (oil pump works well). CUSUM flags it while pressure still looks acceptable. The explanation card lists the evidence. Click "Show the math" on oil pressure.
4. **2:20–3:20, Misfire.** Inject a cylinder 3 misfire. The engine sound stumbles, the polar dot jumps to the cylinder 3 sector, and the torque command rises from 110 to 146 N·m, exactly 4/3.
5. **3:20–3:50, Sensor fault.** Spike the coolant sensor by 25 °C. The system reports a sensor fault, citing the 0.8 K/s physical limit.
6. **3:50–4:30, Prognosis.** Let the oil-pump fault progress; RUL appears with its confidence band. Export the maintenance report.
7. **4:30–5:00, Hardware path.** Same telemetry interface for ESP32 sensors, OBD-II, and a calibration run on the college engine test rig.

### Likely judge questions

| Question | Answer |
| --- | --- |
| Isn't the AI just reading the fault you injected? | No. Analytics only receives telemetry; the fault state lives in a separate module it cannot import. The blind-mode test you just ran proves it. |
| How accurate is the model? | It is a reduced-order model with demo calibration, checked against hand calculations on the Validation page. Absolute accuracy needs real-engine calibration; the plan is a heat-balance test on the lab rig. |
| Why not deep learning? | There is no real failure data. A network trained on our simulator would learn our own equations back. Statistical methods give a known false-alarm rate; ML becomes useful once real data is logged. |
| What is your false-alarm rate? | The D² limit is the 99th percentile, so about 1 in 100 healthy samples crosses it; requiring persistence over several seconds cuts that sharply. |
| Why does an inline-4 vibrate at twice crank speed? | Primary piston forces cancel between cylinder pairs; secondary forces (λ cos 2θ) add. 2,517 N peak at 3,000 rpm in our engine. |
| How do you know which cylinder misfired? | The phase of the half-order crank-speed component; cylinders are 90° apart at half order. |
| Why not a simple temperature threshold? | 105 °C is normal at full load and suspicious at idle. Comparing against the Twin's expected value for the current load removes that ambiguity. |
| Where does RUL come from? | A linear trend of the health index with a confidence band, shown only when the trend is statistically significant. Production systems fit models to run-to-failure data. |

Your brother should be able to derive three numbers on a whiteboard without notes: ω = 314 rad/s at 3,000 rpm, the 4/3 torque ratio, and the 0.8 K/s heating limit. That alone signals real understanding to judges.

## References

All new numbers in this review were computed from the stated equations and checked in a Python simulation; the sources below support the methods. The draft's own reference list (its section 56) remains valid.

- [Sandoval and Heywood, An Improved Friction Model for Spark Ignition Engines (MIT)](https://dspace.mit.edu/bitstream/handle/1721.1/80657/52940875-MIT.pdf?sequence=2) — FMEP modelling; cold-oil friction about twice warm friction.
- [Patton, Nitschke and Heywood, SAE 890836: Development and Evaluation of a Friction Model for SI Engines](https://saemobilus.sae.org/papers/development-evaluation-a-friction-model-spark-ignition-engines-890836) — the base friction model.
- [US7292933B2, Engine misfire detection](https://patents.google.com/patent/US7292933) — single-cylinder misfire produces a strong half-order speed variation.
- [US8091410B2, Phase-based misfire detection in engine rotation frequency domain](https://patents.google.com/patent/US8091410B2/en) — using the order phase to identify the misfiring cylinder.
- [OBD-II PIDs (Wikipedia)](https://en.wikipedia.org/wiki/OBD-II_PIDs) — mode-01 PID formulas.
- [CSS Electronics, OBD2 PID table](https://www.csselectronics.com/pages/obd2-pid-table-on-board-diagnostics-j1979) — decoding example for PID 0C.
- Your brother's draft, *Smart Engine Health Monitoring System: Technical Research* — the base model this review corrects and extends.
