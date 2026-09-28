# CLAUDE.md — IgniSense (Team Revora)

**IgniSense — Smart Engine Health Diagnostic**, built by **Team Revora** for a hackathon.

IgniSense is a browser-only digital twin of a 2.0 L inline-4 petrol engine. A **Plant** (the "real" engine with hidden faults) produces sensor telemetry. A healthy **Twin** predicts what those sensors should read. **Analytics** diagnose faults from the residuals, score health, estimate remaining useful life (RUL) and explain the evidence. A procedural Three.js engine is driven by the same physics as the numbers.

## Source documents (read before building any part)

| Doc | Role |
| --- | --- |
| [docs/research-review-and-build-plan.md](docs/research-review-and-build-plan.md) | **Primary source of truth.** Corrected physics, architecture, verified numbers, features, demo script, judge Q&A |
| [docs/draft-technical-research.md](docs/draft-technical-research.md) | The brother's original draft. **Secondary:** fills gaps the review doesn't cover (oil-temp balance, alternator, sensor model, risk functions, health weights, fault scores, hysteresis, alerts, lifecycle). Its header lists the superseded parts |
| [docs/open-questions.md](docs/open-questions.md) | Running list of gaps and contradictions. **Add to it whenever something is unclear.** |
| `docs/calibration.md` | Created in Phase 1. Every chosen demo-calibration value with its reason |
| [docs/design/DESIGN.md](docs/design/DESIGN.md) | **Design system** (from the IgniSense Claude Design project) + **Amendment A: airy layout & motion**. Read before any UI work |

**Precedence:** on physics, review > draft. On process, this file > both. If the review and the draft disagree and it isn't already in `open-questions.md`, add it.

**Team:** Suhaib (full-stack dev, builds the app) and his brother (physics owner; handles engineering explanations, parameters and the pitch). The brother must be able to explain every calculation shown in the app. Keep code readable enough for that.

## Branding (use everywhere)

- Product name: **IgniSense**. Full name: **IgniSense — Smart Engine Health Diagnostic**. Team: **Revora**.
- Use them in: `package.json` name (`ignisense`), HTML `<title>`, app header/logo text, the report page header ("IgniSense maintenance report · Team Revora"), the README, the Validation page title, and any exported file names (`ignisense-report-<timestamp>`).
- Put the strings in one place (`src/brand.ts`) and import them. Don't hard-code them.
- Tagline for the header/footer: "Physics-informed engine digital twin".

## Design system & UI rules (summary; full spec in docs/design/DESIGN.md)

- **Tokens only.** Colours, type, motion come from `src/index.css` (`@theme`) and its JS mirror `src/ui/tokens.ts`. Tailwind's default palette is cleared, so `slate-*` etc. don't exist. Keep `index.css` and `tokens.ts` in sync.
- **Status colours are reserved** for engine/sensor state (`ok`, `watch`, `warn`, `crit`, `invalid`). Cyan `accent` is brand + interaction. Twin/expected is `twin` white, never cyan.
- **Fonts:** Space Grotesk (UI) + JetBrains Mono (every number/label, `num` utility for tabular figures). Self-hosted via @fontsource, so the app works offline.
- **Airy (Amendment A, overrides the original handoff):** 24/40px page gutters, max width 1440px, 24px gaps between regions, 24px+ panel padding, a numbered section header on each page, and one idea per view. Test-bench controls live in a slide-in drawer, not a sidebar.
- **Motion:** `motion` (`motion/react`). Page transitions, sliding tab indicator, scroll-reveal stagger, spring drawer, hover lift. Shared presets are in `src/ui/motion.tsx`. **Live numbers never tween**; only geometry animates. `MotionConfig reducedMotion="user"` plus the CSS reduced-motion rule.
- **Sample data:** until the worker streams real snapshots, the UI reads from `src/ui/preview/sample.ts`, and the header shows a SAMPLE DATA tag. Delete that tag and file once Phase 4 wires the real store.

---

## Non-negotiable architecture rules

1. **Plant / Twin / Analytics separation.** `src/plant/`, `src/twin/` and `src/analytics/` are separate folders. `analytics/` may import only the `Telemetry` type, the Twin's expected-value output types, its own files, and `lib/`. It must never import fault state, plant state, or anything under `plant/` or `sources/`. This is enforced by ESLint `no-restricted-imports`. Never disable it.
2. **One telemetry format.** Every source (simulator, CSV replay, ESP32, OBD-II) emits the same `Telemetry` object (`src/telemetry.ts`). Adding hardware means adding one adapter in `sources/`. Analytics never changes.
3. **The Twin is blind.** The Twin runs the same `physics/` functions with every health factor = 1. It is driven only by *measured* RPM, load and ambient from telemetry.
4. **Physics is pure and shared.** `src/physics/` holds pure functions with no state and no imports from plant/twin/analytics/sources/worker/ui. Each equation is registered as `{ id, latex, inputs, compute }` so "Show the math" can render it with live numbers.
5. **One crank angle drives everything.** Piston positions in 3D, the vibration signal and misfire detection all come from the same slider-crank / crank-angle model. No looped animations, no downloaded engine models.
6. **Deterministic.** All randomness goes through the seeded RNG in `src/lib/rng.ts`. The hero scenario must play identically every run.
7. **No backend.** It's a static Vite app with the simulation in a Web Worker. No FastAPI, no database, no login.
8. **Label calibration honestly.** Parameter values are "demo calibration". Don't claim real-engine accuracy in UI text.
9. **Honest wording (from the draft, §20.2 and §44).** A weighted fault score is a **"diagnostic evidence score"**, never "confidence %". Evidence classes: < 0.30 weak, 0.30–0.55 possible, 0.55–0.75 probable, > 0.75 strong. Vibration thresholds are "engine-profile calibration values", never ISO limits (ISO 10816-6 excludes road vehicles). Never label a crank journal-bearing fault with BPFO/BPFI (rolling-element formulas don't apply).

### Deliberately NOT built (don't add these)
Login, database server, fleet/multi-engine views, Isolation Forest, neural networks trained on simulator data, Python backend, Recharts.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Vite + React + TypeScript (strict) |
| Simulation | Plain TS in a Web Worker, fixed timestep, seeded RNG |
| State | Zustand, with transient subscriptions for 60 fps values (no React re-render per tick) |
| 3D | three.js via @react-three/fiber + @react-three/drei (installed in Phase 5) |
| Charts | uPlot (installed; theme in `src/ui/uplotTheme.ts`). SVG preview charts in `src/ui/charts/` until live data |
| Math display | KaTeX (installed in Phase 8) |
| FFT | Own radix-2 implementation in `analytics/fft.ts` |
| Styling | Tailwind v4 (`@tailwindcss/vite`), IgniSense design tokens in `src/index.css` |
| Motion | `motion` (Framer Motion successor), `motion/react` |
| Fonts | `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono` (offline) |
| Tests | Vitest. The same physics tests feed the in-app Validation page |
| Lint/format | ESLint 10 flat config + typescript-eslint, Prettier |
| Deploy | Static build → Cloudflare Pages or Vercel. Must also run offline via `npm run preview` |

## Folder structure

```text
src/
  brand.ts     IgniSense / Revora name strings
  telemetry.ts the Telemetry interface (the one boundary type)
  lib/         rng (seeded), small math utils; importable from anywhere
  physics/     pure equations + equation registry (Show the math)
  engine/      profile.ts: every parameter, units in the name (bore_m, uaFan_WperK)
  plant/       state + fault states, sensor model (noise, bias, drift, dropout, stuck, spike)
  twin/        healthy reference: same physics, all health = 1
  analytics/   residuals, features, fft, mahalanobis, cusum, diagnosis, health, rul, alerts
  sources/     simSource, replaySource (CSV), serialSource (ESP32 / OBD-II stub)
  worker/      sim.worker.ts: runs source -> twin -> analytics, posts snapshots
  three/       Engine, Crank, Piston, CoolantFlow, heat-map materials
  ui/          design system + app shell
    tokens.ts, status.tsx, primitives.tsx, Gauge.tsx, health.tsx, diagnostics.tsx,
    overlay3d.tsx, uplotTheme.ts   ← design-system components (from the handoff)
    motion.tsx   shared motion presets (Reveal, Stagger, page/drawer transitions)
    store.ts     UI state (page, test-bench controls) — zustand
    shell/       AppShell (header, tabs, routing), TestBench drawer, Brand/SectionHeader
    pages/       LiveTwin, Trends, Vibration, Math, Validation, Report
    charts/      SVG preview charts (replaced by uPlot with live data)
    preview/     sample.ts — DESIGN PREVIEW DATA, removed when the worker is wired
  tests/       cross-module/scenario tests (unit tests sit next to their files as *.test.ts)
docs/          source documents, open questions, calibration log
```

## Coding conventions

- **Units in names:** `bore_m`, `uaFan_WperK`, `oilPress_bar`, `coolant_C`, `omega_radps`. SI internally; convert only at the UI edge.
- All engine parameters live in `src/engine/profile.ts`. No magic numbers inside physics functions.
- Physics functions take a plain inputs object and return numbers. No hidden globals.
- 3D: mutate transforms in `useFrame` from refs, never via React state. Under 100 meshes.
- Worker ↔ UI: 20 Hz snapshot via `postMessage`. Use transferable `Float32Array`s for windows.
- Sensor dropout is `null`, never `NaN` or `0`.
- Every new physics function gets a Vitest test against a hand-calculated or doc-verified value.
- When a value isn't in the docs, choose one, put it in `profile.ts` with a comment, and log it in `docs/calibration.md` (and in `docs/open-questions.md` if it needs sign-off).

## Commands

```bash
npm run dev          # Vite dev server
npm test             # Vitest (run once)
npm run test:watch   # Vitest watch mode
npm run lint         # ESLint (includes the Plant/Twin/Analytics import-boundary rules)
npm run typecheck    # tsc -b (noEmit is set in tsconfig)
npm run format       # Prettier write
npm run build        # typecheck + production build
npm run preview      # serve the build locally (offline demo)
```

---

## Key parameters (demo calibration)

**Geometry and dynamics** (review)

| Parameter | Value |
| --- | --- |
| Bore × stroke | 86 × 86 mm, crank radius r = 43 mm |
| Con-rod l | 145 mm, λ = r/l = 0.297 |
| Displacement V_d | 1,998 cc (0.001998 m³) |
| Firing order | 1-3-4-2; throws 0°, 180°, 180°, 0° |
| Reciprocating mass | 0.5 kg per cylinder |
| Crank + flywheel J | 0.20 kg·m² |
| Idle / max speed | 800 / 6,000 rpm |
| Torque curve | T_max(N) = 190 [1 − 0.53((N−4000)/4000)²] N·m |
| Load | L = T_brake / T_max(N) (open-questions Q-07) |

**Energy and cooling** (review, with thermostat values from the draft)

| Parameter | Value |
| --- | --- |
| FMEP | (97 + 15n + 5n²)(1 + max(0, 90 − T_o)/70) kPa, n = N/1000 |
| Accessory power P_acc | 500 W |
| Indicated efficiency | η_i = 0.38 (0.70 + 0.30 L) |
| Coolant heat fraction | 0.34 − 0.12 L (of fuel power) |
| Radiator | UA = H_cool · F_therm(T_c) · (600 + 1000 · F_fan) W/K; fan on above 98 °C (add hysteresis) |
| Thermostat | linear 0 → 1 from **82 °C to 95 °C** (draft §34; also reproduces the review's steady states) |
| Coolant thermal mass C_th | 100 kJ/K |
| Fuel | LHV 43 MJ/kg, density 0.74 kg/L (draft §8.3) |
| Ambient (reference) | 30 °C |

**Lubrication**

| Parameter | Value |
| --- | --- |
| Oil pressure | min[P_relief, (P_idle + K_N(N − N_idle)) · μ_rel^0.5 · H_pump/(1 + K_c·W_b)] (the **review's** form, not the draft's) |
| | P_idle 1.5 bar, K_N 0.0009 bar/rpm, K_c 1.5, P_relief 5 bar |
| Viscosity | μ_rel = e^(−0.015(T_o − 90)) |
| Oil temperature | C_o·dT_o/dt = Q_fric(1 + K_f·D_lube) + K_co(T_c − T_o) − UA_o(T_o − T_amb) (draft §10.3). Provisional: C_o 15 kJ/K, K_co 250 W/K, UA_o 15 W/K, friction-heat share 0.35, K_f 0.5 (Q-02). One-way coupling (Q-03) |

**Electrical** (draft §14): V = V_bat + H_alt·g(N)(V_reg − V_bat) − ΔV_load + noise. Provisional: V_bat 12.6, V_reg 14.4, g(N) = 1 − e^(−N/600), ΔV_load 0.2 V (Q-11).

**Physics code map:** `src/physics/` = basics, torque, friction, energy, cooling, oil, electrical (pure functions + registry) and `engineModel.ts` (`evaluateEngine` / `stepThermal`, the composed slow model that Plant and Twin both call, with `HealthFactors`). All chosen values and reasons are in `docs/calibration.md`.

**Sensor model** (draft §15): y = x + b + d(t) + ε, plus dropout (null), stuck-at, spike, delay and scale error. σ per signal to be chosen in Phase 2.

**Fault severity** (draft §18–19): severity S ∈ [0,1] maps to a health factor (H_pump = 1 − 0.75·S; for cooling see Q-04). Progression: linear S = min(1, S₀ + r·t) for the MVP; stress-dependent later (Q-10).

## Diagnostics and health model (from the draft; the review adds D²/CUSUM/RUL)

- **Residual:** r = y − ŷ, z = r/σ_r (draft §16).
- **Risk functions** (draft §21): R_high = clip((x−W)/(C−W),0,1), R_low = clip((W−x)/(W−C),0,1).
- **Fault evidence score** (draft §20.2): S_j = Σw_ji·R_i / Σw_ji. Weights:
  - cooling: 0.40 temp residual, 0.20 temp rate, 0.25 coolant level, 0.15 fan/pump
  - lube: 0.35 low oil pressure, 0.20 pressure residual, 0.20 oil temp, 0.15 vibration, 0.10 pressure decay
  - misfire: 0.35 rpm irregularity, 0.25 firing spectrum, 0.20 vibration impulse, 0.20 combustion
  - Renormalize over symptoms we don't simulate (Q-15).
- **Subsystem health weights** (draft §22): lubrication 0.25, thermal 0.25, mechanical vibration 0.20, combustion 0.15, electrical 0.10, sensor integrity 0.05. Overall H = 100(1 − Σw·R/Σw).
- **Critical overrides** (draft §22.2): oil-pressure risk > 0.95 → CRITICAL; coolant risk > 0.95 persisting → CRITICAL; unknown sensor integrity → suppress certainty.
- **Hysteresis** (draft §23, in *simulated* seconds, Q-18): NORMAL→WATCH risk > 0.30 for 5 s; WATCH→WARNING > 0.55 for 10 s; WARNING→CRITICAL > 0.85 for 5 s; WARNING clears < 0.40 for 20 s.
- **Alert classes** (draft §40): INFO / WATCH / WARNING / CRITICAL. Each alert carries timestamp, subsystem, measured, expected, residual, persistence, probable cause, action, and source (rule / statistical).
- **Sensor quality colours** (draft §39): green valid, amber degraded, red failed, grey unavailable.
- **Engine lifecycle** (draft §31–32): OFF → STARTING → WARMUP → RUNNING (steady/transient) → SHUTDOWN. Low oil pressure when OFF is normal. Alerts must know the lifecycle state.
- **Explanation card format:** follow draft §35.5 exactly (probable fault, severity, "why the system thinks this" checklist, recommended action, model status).
- **Review additions:** Mahalanobis D² (χ²(5) 99% = 15.09), CUSUM (κ 0.5, h 5), physical rate-limit sensor check (0.8 K/s), and RUL via linear fit with ±2·s_b band, shown only if significant.

## Golden numbers (tests must reproduce these)

**Energy flow** (ambient 30 °C, P_acc 500 W):

| Point | P_b kW | Fric+acc kW | Fuel kW | Coolant kW | Fuel L/h | Steady T_c |
| --- | --- | --- | --- | --- | --- | --- |
| Idle 800 rpm, no load | 0 | 2.0 | 7.5 | 2.6 | 0.85 | 82 °C (warm-up) |
| 3,000 rpm, 80 N·m | 25.1 | 9.9 | 110.8 | 31.9 | 12.5 | 93 °C |
| 4,000 rpm, 190 N·m | 79.6 | 16.3 | 252.3 | 55.5 | 28.6 | 98 °C (fan cycling) |
| 6,000 rpm, full load | 103.6 | 37.2 | 370.4 | 81.5 | 41.9 | 98 °C (fan cycling) |

Faults: cooling health 0.5 at full load → 132 °C; cooling health 0.25 at 3,000/80 → 110 °C. (These energy numbers assume warm oil, T_o ≥ 90 °C.)

**Oil pressure (bar):** cold 800 rpm 20 °C → 2.54; hot idle 100 °C → 1.39; hot 3,000 (100 °C) → 3.23; pump 0.4 hot idle → 0.56; pump 0.4 at 3,000 → 1.29; bearing wear 0.6 at 3,000 → 1.70.

**Basics:** ω = 314.16 rad/s at 3,000 rpm; f_r = 50 Hz; f_fire = 100 Hz; BMEP at 80 N·m = 5.03 bar (draft §7).

**Vibration F₂:** 800 rpm → 179 N (26.7 Hz); 3,000 → 2,517 N (100 Hz); 6,000 → 10,068 N (200 Hz).

**Misfire at 3,000 rpm / 80 N·m:** healthy ripple 11 rpm p-p, torque command 110 N·m. Single-cylinder misfire → ripple 61 rpm, 0.5× amplitude 21.0 rpm, command 146 N·m (4/3). 0.5× phase: cyl 1 +45°, cyl 2 +135°, cyl 3 −45°, cyl 4 −135°. Cyl 3 at 50 % → 32 rpm ripple, 9.0 amplitude, −45°, 125 N·m.

**Health example** (draft §22.1): risks thermal 0.47, lube 0.33, vib 0.38, combustion 0.20 → H = 69.4.

**Statistics:** χ²(5) 99 % = 15.09. CUSUM κ = 0.5, h = 5. Max coolant heating rate ≈ 0.8 K/s.

Use a relative tolerance of ~2 % (these came from a Python sim with rounding). If a result is off by more, find out why before moving on. Don't loosen the tolerance.

## Timing loops

| Loop | Rate |
| --- | --- |
| Slow physics | 20 Hz simulated (Δt = 0.05 s) × time-warp (1×, 10×, 60×) |
| Crank angle | 0.5° steps, run in chunks each slow tick |
| Analytics | 5–10 Hz |
| FFT | every 1 s over a 16-revolution window, crank-angle domain (order tracking) |
| UI snapshot | 20 Hz postMessage |
| 3D render | 60 fps, interpolating crank angle; display slowed 100× (labelled on screen) |

---

## Phase-by-phase build plan

### How to work through the phases (rules for Claude)

- **Work on one phase at a time.** Don't start the next phase until the current phase's exit checks all pass *and* the user has reviewed it and said to continue.
- At the start of a phase, re-read this section, the listed doc sections, and any `open-questions.md` items tagged to it. Then state which tasks you'll do.
- Before starting the next phase, run `npm test`, `npm run lint`, `npm run typecheck` and `npm run build` and confirm they pass. For UI phases, also run the app and look at it.
- At the end of each phase: tick the boxes below, add a one-line entry to the **Progress log**, and summarise for the user what was built, what was checked, and any open issues.
- **Gaps:** when something is unclear or missing, add it to `docs/open-questions.md` straight away. If it blocks the phase, make a provisional decision, mark it `PROVISIONAL`, and carry on. All of them get reviewed in Phase 12.
- If a golden number doesn't reproduce, stop and report it. Don't adjust constants to force a pass without logging the reason in `docs/calibration.md`.
- Breadth before depth. Phases 0–6 form the **minimum viable demo**. Everything after is additive and can be cut from the bottom up.

---

### Phase 0: Scaffold and guard rails
Doc: review *Tech stack and software architecture*

- [x] Vite 8 + React 19 + TS 6 (strict), Tailwind v4, Zustand 5, Vitest 5, ESLint 10, Prettier
- [x] Folder structure above with placeholder `index.ts` files
- [x] `src/brand.ts` (IgniSense / Revora) used in `<title>` and the app shell header
- [x] `src/telemetry.ts` with the `Telemetry` interface
- [x] ESLint `no-restricted-imports` boundaries: `analytics/**` must not import plant/sources/worker/ui/three; `physics/**` must not import plant/twin/analytics/sources/worker/ui/three; `twin/**` must not import plant
- [x] `src/engine/profile.ts` with every parameter from "Key parameters" (units in names)
- [x] Seeded RNG (mulberry32 + Gaussian) in `src/lib/rng.ts` with determinism tests
- [x] Commands section filled in

**Exit checks:** `npm run dev` shows the dark IgniSense shell. `npm test` passes. A deliberately bad import from `analytics/` into `plant/` fails lint (verified, then removed). `npm run build` passes.

---

### Phase 1: Slow physics core (pure functions)
Doc: review *Physics corrections* (Fix 1–3), *Proving a sensor fault*; draft §7, §9.2, §10.3, §14. Open questions: Q-01, Q-02, Q-03, Q-06, Q-07, Q-11.

- [x] `physics/basics.ts`: ω(N), P = Tω, BMEP, f_r, f_fire
- [x] `physics/torque.ts`: T_max(N), load L = T/T_max
- [x] `physics/friction.ts`: FMEP with cold-oil factor, T_fric = FMEP·V_d/4π
- [x] `physics/energy.ts`: η_i, fuel power, coolant heat fraction, fuel L/h
- [x] `physics/cooling.ts`: F_therm (82→95 °C), fan with hysteresis, UA_eff, coolant ODE
- [x] `physics/oil.ts`: oil pressure (review form), viscosity, oil-temperature ODE (draft §10.3)
- [x] `physics/electrical.ts`: alternator voltage (draft §14)
- [x] Equation registry: each function exports `{ id, latex, inputs, compute }`
- [x] `docs/calibration.md`: record oil-temp constants, alternator values, fan hysteresis, warm-up result
- [x] Vitest: every energy, oil and basics golden number; steady-state integration for 93 °C, 132 °C, 110 °C and fan cycling at ~98 °C; warm-up time reported

**Exit checks:** All golden numbers pass within 2 %. Q-01/Q-02/Q-03 are resolved or provisional. The brother reviews `docs/calibration.md`.

✅ Golden numbers pass (47 tests). Q-01 is resolved; Q-02, Q-03 and Q-11 are provisional. **Still to do: the brother's review of `docs/calibration.md`.** Bonus: the Validation page now computes the 7 Phase 1 checks live from the physics.

---

### Phase 2: Plant, sensors, Twin, worker loop
Doc: review *Plant vs Twin*, *Timing*; draft §15, §31–33.

- [ ] `plant/`: engine state (T_c, T_o, rpm, load, lifecycle state), fault state (all health 1 by default), step at Δt = 0.05 s
- [ ] Engine lifecycle OFF/STARTING/WARMUP/RUNNING/SHUTDOWN (draft §32, Q-20)
- [ ] `plant/sensors.ts`: noise, bias, drift, dropout (→ `null`), stuck, spike, all via the seeded RNG. Output is `Telemetry`
- [ ] `twin/`: same physics, health = 1, driven only by telemetry rpm/load/ambient. Outputs expected values
- [ ] `sources/simSource.ts` wraps plant + sensors
- [ ] `worker/sim.worker.ts`: start/stop, load, ambient, time-warp (1×/10×/60×), 20 Hz snapshots
- [ ] Minimal debug UI: measured vs expected table

**Exit checks:** A healthy run keeps residuals within sensor noise at every operating point. The same seed gives identical telemetry across runs (test). Time-warp 60× warms the engine in well under a minute of wall time. The UI stays smooth.

---

### Phase 3: Faults, residuals, diagnosis, health, alerts
Doc: review *Plant vs Twin*, *Detection* (Diagnosis row); draft §16–23, §27–29, §38–41. Open questions: Q-04, Q-05, Q-15, Q-16, Q-18.

- [ ] Faults with progressive severity: cooling degradation, oil-pump wear
- [ ] `analytics/residuals.ts`: r and z per signal; EMA filter and rates of change (draft §17)
- [ ] `analytics/diagnosis.ts`: fault evidence scores with the draft's weights (renormalized). Each contribution traces to a named symptom
- [ ] `analytics/health.ts`: subsystem health + overall health (draft weights) + critical overrides
- [ ] `analytics/alerts.ts`: hysteresis state machine + alert classes, lifecycle-aware
- [ ] Explanation-card data in the draft §35.5 format
- [ ] Scenario tests: each fault gives the correct top diagnosis; a healthy run gives no diagnosis; the draft §22.1 health example gives 69.4

**Exit checks:** Pump health 0.4 at hot idle → lubrication fault. Cooling health 0.5 at full load → cooling fault. No false WARNING in a 10-minute simulated healthy run. `analytics/` still passes the boundary lint.

---

### Phase 4: Live Twin dashboard (2D)
> **Head start (2026-09-28):** the design system, airy shell, all six pages, test-bench drawer and motion are already built against sample data (`src/ui/preview/sample.ts`). Phase 4 means *wiring*: replace the sample snapshot with the worker store, hook the test-bench controls to the worker, swap SVG preview charts for uPlot, and delete the SAMPLE DATA tag.

Doc: review *App screens* (Live Twin, Trends); draft §35.1, §35.3, §35.6.

- [ ] IgniSense-branded layout: left controls, centre (3D placeholder), right health panel, bottom gauges
- [ ] Controls: start/stop, load, target RPM, ambient, fan auto/on/off, time-warp, scenario picker, fault panel (fault, severity, gradual/instant)
- [ ] Gauges with Twin ghost markers: RPM, coolant, oil temp, oil pressure, voltage, vibration RMS (placeholder until Phase 7)
- [ ] Health ring, subsystem bars, engine-state badge, alert list, explanation card
- [ ] Trends page (uPlot): measured vs expected, fault-injection and alert markers
- [ ] Zustand store with transient subscriptions

**Exit checks:** Inject the oil-pump fault from the UI and see the ghost separate, health drop, a WATCH→WARNING alert after persistence, and the card name the fault. No whole-tree re-render per tick.

---

### Phase 5: 3D engine (procedural, slider-crank)
Doc: review *Three.js virtual engine plan*, *Piston motion*; draft §35.2.

- [ ] `physics/sliderCrank.ts`: x(θ), rod angle φ, a(θ) (with tests)
- [ ] Procedural block (semi-transparent cutaway), 4 pistons, 4 con-rods, crankshaft + flywheel
- [ ] Pistons 1 & 4 at θ, 2 & 3 at θ + 180°, positions from x(θ) exactly
- [ ] View-speed control: display at 1/100 real speed, labelled "display slowed 100×"
- [ ] Heat-map block colour; oil-gallery glow = pressure; health overlay colours (green/amber/red/grey)
- [ ] Click a part to open a side panel with its sensors, measured vs expected, residual and health
- [ ] Camera presets

**Exit checks:** TDC/BDC line up with θ = 0/180°. 60 fps. Under 100 meshes. The fault subsystem changes colour.

---

### Phase 6: Hero scenario, then MINIMUM VIABLE DEMO gate
Doc: review *Demo script* steps 1–3; draft §54. Open question: Q-22.

- [ ] One-click hero scenario with a fixed seed: cold start → time-warp warm-up → oil-pump fault develops → diagnosis
- [ ] Cold-start oil pressure ≈ 2.5 bar visibly settling as oil warms

**GATE:** Run the hero scenario 3× end to end. It must look identical each time. Everything above the "Minimum viable demo line" in the review's cut list must work. **Stop and get the user's sign-off before Phase 7.**

---

### Phase 7: Crank-angle simulation, vibration, misfire
Doc: review *New physics: one crank angle drives everything*; draft §11, §13, §30. Open questions: Q-12, Q-13, Q-14.

- [ ] `physics/crankTorque.ts`: half-sine pulse per cylinder, A = 2π·T̄_cyl, H_comb,i, ω integration at 0.5°
- [ ] PI speed governor once per cycle
- [ ] Chunked crank sim in the worker; fill `crankSpeedWindow`
- [ ] Vibration synthesis: 2× from F₂, 0.5×/1.5× combustion, 1× imbalance, impulses + noise; fill `vibWindow`
- [ ] `analytics/fft.ts` (own radix-2), crank-angle order spectrum; RMS, peak, crest factor, kurtosis, I_rpm (draft §11, §13.2)
- [ ] Half-order amplitude + phase → misfiring cylinder
- [ ] Vibration page: waveform, order spectrum with 0.5×/1×/2× cursors, crank ripple, **misfire polar plot**
- [ ] 3D: combustion flash per cylinder (missing when misfiring), F₂ block shake
- [ ] Real vibration RMS into the gauge; misfire evidence score into diagnosis

**Exit checks:** Every misfire golden row within 2 % (phases and 4/3 ratio included). F₂ golden values pass. The polar dot lands in the correct sector for all four cylinders. Real-time at 6,000 rpm.

---

### Phase 8: Show the math + blind mode
Doc: review *Features* (first two rows).

- [ ] Math panel: click a gauge value to see the KaTeX formula with live numbers substituted
- [ ] At least one equation per subsystem (cooling, oil, friction/energy, electrical, vibration, misfire)
- [ ] Show the math page listing all registered equations with symbols and units
- [ ] Blind mode: a hidden fault is picked, the system names it, then a reveal button shows the answer

**Exit checks:** Substituted numbers equal the gauge values. A blind run with each fault type is named correctly.

---

### Phase 9: Advanced analytics
Doc: review *Detection, AI and RUL*; draft §18.3, §19.3, §25–26, §46. Open questions: Q-09, Q-10, Q-17, Q-19.

- [ ] Mahalanobis D² (60 s baseline, per-signal contributions, χ² 99 % limit)
- [ ] CUSUM per normalized residual
- [ ] Sensor sanity: rate limit (0.8 K/s), stuck/dropout, cross-check; sensor-fault injection (spike, stuck, drift, dropout)
- [ ] RUL: sliding-window fit, ±2·s_b band, significance gate, simulated hours; uncertainty block (draft §46)
- [ ] Stress-dependent fault progression (load affects RUL)
- [ ] Trends: D² and CUSUM with limits
- [ ] Extra faults: bearing wear (draft §18.3 wear law), alternator

**Exit checks:** A healthy run crosses D² 99 % only ~1 % of the time with no persistent alarm. CUSUM flags the pump at 85 % health before any fixed limit trips. A 25 °C coolant spike is reported as a sensor fault citing the rate limit. RUL shows "trend not significant" when healthy and a band under wear. Raising load shortens RUL.

---

### Phase 10: Validation, report, polish features
Doc: review *Features* (Should rows); draft §26, §49–50.

- [ ] Validation page (IgniSense-branded): in-app physics checks with expected vs model values
- [ ] Maintenance report "IgniSense maintenance report · Team Revora": fault, evidence, action, RUL band, exposure counters (draft §26), timestamp; print-to-PDF
- [ ] Engine sound (Web Audio; a misfire stumbles audibly)
- [ ] Hot-city stop-and-go scenario (40 °C ambient)
- [ ] Live cause-and-effect graph (draft §6) (optional)

**Exit checks:** The Validation page is all green. The report prints on one page with the branding.

---

### Phase 11: Demo hardening and deploy
Doc: review *Demo script and judge Q&A*; draft §53, §55.

- [ ] Full 5-minute script rehearsed in the app
- [ ] Offline check: `npm run build && npm run preview` with Wi-Fi off
- [ ] Deploy (Cloudflare Pages or Vercel); README with the IgniSense / Team Revora intro
- [ ] Performance: 60 fps, no memory growth over 30 minutes
- [ ] The brother can derive ω = 314 rad/s, 4/3 and 0.8 K/s on a whiteboard; the limitations slide (draft §55) is ready

**Exit checks:** Two clean full demo runs back to back.

---

### Phase 12: Open-questions review
Doc: `docs/open-questions.md`

- [ ] Go through every item with the user (and the brother for **[Brother]** items)
- [ ] Mark each RESOLVED with its reason, or accept the provisional decision as final
- [ ] Apply any resulting changes, then re-run all tests and the Validation page
- [ ] Update `docs/calibration.md` so the final values match the code

**Exit checks:** No OPEN items left. Everything green.

---

### Phase 13 (stretch): real data sources
Doc: review *Hardware roadmap*; draft §47.

- [ ] `sources/replaySource.ts` (CSV replay)
- [ ] Phone accelerometer via DeviceMotion into the same FFT
- [ ] `sources/serialSource.ts`: Web Serial for ESP32 JSON lines / USB ELM327 OBD-II (PIDs 0C, 04, 05, 0F, 0B, 42)

---

## Progress log

_One line per completed phase: date, phase, result, open issues._

- 2026-09-28: Project set up. Review and draft saved to `docs/`. CLAUDE.md and `open-questions.md` (Q-01–Q-24) written.
- 2026-09-28: **Phase 0 complete.** Scaffolded Vite 8/React 19/TS 6 strict, Tailwind v4, Zustand, Vitest 5, ESLint 10 + Prettier. Added brand.ts, telemetry.ts, seeded RNG, engine profile, and the 4 boundary lint rules (verified: 5 illegal probe imports rejected, the Telemetry import allowed). 9 tests pass; lint, typecheck and build are clean; the dev server serves the IgniSense shell. Git initialised (no commits yet). Waiting for user review before Phase 1.
- 2026-09-28: **Design system imported + UI shell (pulled ahead of Phase 4).** Imported the IgniSense design system (tokens, fonts, components) from the Claude Design handoff into `src/index.css` + `src/ui/`. Wrote Amendment A (airy + motion) in `docs/design/DESIGN.md`. Built a hash-routed shell with 6 pages, a spring test-bench drawer, a sliding tab indicator, page transitions and scroll reveals, all on labelled sample data. Checked in headless Edge at 1440px and 504px; fixed full-border status colouring (the design colours a single edge) and grid overflow on narrow screens. Lint has 11 warnings (react-refresh, files exporting helpers); no errors. Physics Phase 1 is still next.
- 2026-09-28: **Phase 1 complete.** Pure physics modules (basics, torque, friction, energy, cooling, oil, electrical) + equation registry (13 equations) + composed `engineModel` (evaluate/step). All review golden numbers reproduce within 2 % (most < 0.5 %): 93/132/110 °C steady states, fan cycling 96–98 °C, and all six oil-pressure cases. Warm-up to 82 °C takes 25.1 min, which resolves Q-01 (cold-oil friction). Oil-temp and alternator constants are provisional and logged in `docs/calibration.md`; new items Q-27–Q-29. The Validation page shows live PASS for the Phase 1 rows. 47 tests pass; lint/typecheck/build clean. Waiting for user review (and the brother's calibration sign-off) before Phase 2.
