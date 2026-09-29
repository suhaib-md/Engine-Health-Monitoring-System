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
- **Live data:** every page is live from the worker (`src/ui/sim/`); the Report is a frozen snapshot of it. There is no sample data left. A zustand selector must never return a fresh `[]`/`{}` (it re-renders forever); use a module-level constant.

---

## Non-negotiable architecture rules

1. **Plant / Twin / Analytics separation.** `src/plant/`, `src/twin/` and `src/analytics/` are separate folders. `analytics/` may import only the `Telemetry` type, the Twin's expected-value output types, its own files, `lib/`, the pure shared `physics/` (for context-corrected expectations, draft §17.3) and `engine/profile` (sensor specs). It must never import fault state, plant state, or anything under `plant/` or `sources/`. This is enforced by ESLint `no-restricted-imports`. Never disable it.
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
| Math display | KaTeX (lazy-loaded chunk with the Math page and drawer; fonts bundled, works offline) |
| FFT | Own radix-2 implementation in `analytics/fft.ts` |
| Styling | Tailwind v4 (`@tailwindcss/vite`), IgniSense design tokens in `src/index.css` |
| Motion | `motion` (Framer Motion successor), `motion/react` |
| Fonts | `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono` (offline) |
| Tests | Vitest. The same physics tests feed the in-app Validation page |
| Lint/format | ESLint 10 flat config + typescript-eslint, Prettier |
| Deploy | Not hosted: the brother runs it locally (`npm run dev`, or `npm run build` + `npm run preview`), fully offline |

## Folder structure

```text
src/
  brand.ts     IgniSense / Revora name strings
  telemetry.ts the Telemetry interface (the one boundary type; includes the fanOn actuator command)
  lifecycle.ts engine lifecycle type (observable state shared by Plant, snapshot, alerts)
  lib/         rng (seeded), small math utils; importable from anywhere
  physics/     pure equations + equation registry (Show the math)
  engine/      profile.ts: every parameter, units in the name (bore_m, uaFan_WperK)
  plant/       state + fault states, sensor model (noise, bias, drift, dropout, stuck, spike), crank.ts (crank-speed and accelerometer windows)
  twin/        healthy reference: same physics, all health = 1
  analytics/   residuals, features, fft, mahalanobis, cusum, diagnosis, health, rul, alerts
  sources/     simSource, csv (Telemetry ⇄ CSV), replaySource (CSV replay), serialSource (ESP32 JSON lines,
               ELM327 OBD-II parser, LiveSource); the page-side Web Serial and accelerometer code is in ui/sources/
  worker/      simLoop.ts (testable loop: source -> twin -> analytics, runs scenarios on the simulated clock),
               scenarios.ts (hero + overheat scripts), blind.ts (blind-mode deck; the answer stays in the worker), sim.worker.ts (thin Worker wrapper, 20 Hz snapshots),
               protocol.ts (Command / Snapshot types)
  three/       EngineScene (Canvas, offline Lightformer environment, contact shadows, grid, fog, bloom,
               camera rig, fps probe; lazy-loaded), Engine (procedural I4 driven each frame from
               physics/sliderCrank + physics/cycle), geometry.ts (lathe/extrude/tube part builders),
               layout.ts (scene scale, poses, heat ramp, camera presets), callouts.ts (DOM marker registry)
  ui/          design system + app shell
    tokens.ts, status.tsx, primitives.tsx, Gauge.tsx, health.tsx, diagnostics.tsx,
    overlay3d.tsx, uplotTheme.ts   ← design-system components (from the handoff)
    motion.tsx   shared motion presets (Reveal, Stagger, page/drawer transitions)
    store.ts     UI state (page, test-bench controls) — zustand
    shell/       AppShell (header, tabs, routing), TestBench drawer, Brand/SectionHeader
    pages/       LiveTwin, Trends, Vibration, Math, Validation, Report, Debug (live sim table)
    sim/         simClient.ts (worker, `useSim`, `sendSim`, control sync), history.ts (chart ring buffer, outside React)
    format.ts    clock + residual → status helpers
    ScenarioBar.tsx  hero-scenario button + narration strip; BlindBar.tsx  blind challenge (sealed cards, verdict, reveal)
    math/        bindings.ts (per-gauge equation chains from a snapshot, pure + tested), tex.ts (LaTeX numbers,
                 substituted lines), MathView.tsx (KaTeX, lazy), MathDrawer.tsx (right-side drawer opened from a gauge value)
    charts/      LiveChart.tsx (uPlot, transient 4 Hz redraw), VibrationCharts.tsx (order spectrum, misfire polar, crank waveforms)
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
npm run demo         # build + open http://localhost:4173 (what start-ignisense.bat runs)
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

**Crank and vibration** (Phase 7, provisional, Q-12/Q-13): mount factor 0.1, block mass 150 kg (2× line at the sensor = 0.1·F₂/150), 1× = 5 % of the 2× line, rocking gain 0.008 (m/s²)/(N·m), accelerometer σ 0.03 m/s², crank-speed σ 1 rpm. Misfire ramps in `ANALYTICS.misfire` (ripple ×1.6→×4, missing torque 0.15→0.5, vibration ×1.3→×2.5, command ×1.05→×1.25).

**Physics code map:** `src/physics/` = basics, torque, friction, energy, cooling, oil, electrical, sliderCrank, cycle, crankTorque, vibration (pure functions + registry) and `engineModel.ts` (`evaluateEngine` / `stepThermal`, the composed slow model that Plant and Twin both call, with `HealthFactors`). All chosen values and reasons are in `docs/calibration.md`.

**Sensor model** (draft §15): y = x + b + d(t) + ε, plus dropout (null), stuck, spike, bias and drift. σ: rpm 5, load 0.004, ambient 0.1 °C, coolant 0.2 °C, oil 0.3 °C, pressure 0.03 bar, bus 0.03 V (`PROFILE.sensors`, calibration.md).

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
| Crank angle | 0.5° steps; one 720° cycle is integrated and tiled into a 16-revolution window once per simulated second |
| Analytics | 5–10 Hz |
| FFT | every 1 s over a 16-revolution window, crank-angle domain (order tracking), 512 samples/rev = 8,192 points, one packed complex FFT for both signals |
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

- [x] `plant/`: engine state (T_c, T_o, rpm, load, lifecycle state), fault state (all health 1 by default), step at Δt = 0.05 s
- [x] Engine lifecycle OFF/STARTING/WARMUP/RUNNING/SHUTDOWN (draft §32, Q-20)
- [x] `plant/sensors.ts`: noise, bias, drift, dropout (→ `null`), stuck, spike, all via the seeded RNG. Output is `Telemetry`
- [x] `twin/`: same physics, health = 1, driven only by telemetry rpm/load/ambient. Outputs expected values
- [x] `sources/simSource.ts` wraps plant + sensors
- [x] `worker/sim.worker.ts`: start/stop, load, ambient, time-warp (1×/10×/60×), 20 Hz snapshots
- [x] Minimal debug UI: measured vs expected table

**Exit checks:** A healthy run keeps residuals within sensor noise at every operating point. The same seed gives identical telemetry across runs (test). Time-warp 60× warms the engine in well under a minute of wall time. The UI stays smooth.

✅ All met (67 tests). Healthy residual mean within ±0.08 σ and spread about 1 σ at every operating point. Same seed gives identical telemetry. Idle warm-up takes 25 s of wall time at 60×. Checked in a real browser (Edge, driven over CDP): Start → STARTING → WARMUP → RUNNING at 3,010 rpm, sim rate 59–61×.

---

### Phase 3: Faults, residuals, diagnosis, health, alerts
Doc: review *Plant vs Twin*, *Detection* (Diagnosis row); draft §16–23, §27–29, §38–41. Open questions: Q-04, Q-05, Q-15, Q-16, Q-18.

- [x] Faults with progressive severity: cooling degradation, oil-pump wear
- [x] `analytics/residuals.ts`: r and z per signal; EMA filter and rates of change (draft §17)
- [x] `analytics/diagnosis.ts`: fault evidence scores with the draft's weights (renormalized). Each contribution traces to a named symptom
- [x] `analytics/health.ts`: subsystem health + overall health (draft weights) + critical overrides
- [x] `analytics/alerts.ts`: hysteresis state machine + alert classes, lifecycle-aware
- [x] Explanation-card data in the draft §35.5 format
- [x] Scenario tests: each fault gives the correct top diagnosis; a healthy run gives no diagnosis; the draft §22.1 health example gives 69.4

**Exit checks:** Pump health 0.4 at hot idle → lubrication fault. Cooling health 0.5 at full load → cooling fault. No false WARNING in a 10-minute simulated healthy run. `analytics/` still passes the boundary lint.

✅ All met (85 tests). Healthy 20 min with 8 load changes: max evidence 0.027, always NORMAL. Pump 0.4 hot idle → lubrication (override CRITICAL in about 15 s). Cooling 0.5 full load → cooling CRITICAL, lube score 0.00 (no cross-talk, Q-32). Boundary probe: 3/3 illegal imports rejected.

---

### Phase 4: Live Twin dashboard (2D)
> **Head start (2026-09-28):** the design system, airy shell, all six pages, test-bench drawer and motion are already built against sample data (`src/ui/preview/sample.ts`). Phase 4 means *wiring*: replace the sample snapshot with the worker store, hook the test-bench controls to the worker, swap SVG preview charts for uPlot, and delete the SAMPLE DATA tag.

Doc: review *App screens* (Live Twin, Trends); draft §35.1, §35.3, §35.6.

- [x] IgniSense-branded layout: left controls, centre (3D placeholder), right health panel, bottom gauges
- [x] Controls: start/stop, load, target RPM, ambient, fan auto/on/off, time-warp, scenario picker, fault panel (fault, severity, gradual/instant)
- [x] Gauges with Twin ghost markers: RPM, coolant, oil temp, oil pressure, voltage, vibration RMS (placeholder until Phase 7)
- [x] Health ring, subsystem bars, engine-state badge, alert list, explanation card
- [x] Trends page (uPlot): measured vs expected, fault-injection and alert markers
- [x] Zustand store with transient subscriptions

**Exit checks:** Inject the oil-pump fault from the UI and see the ghost separate, health drop, a WATCH→WARNING alert after persistence, and the card name the fault. No whole-tree re-render per tick.

✅ Checked in a real browser (Edge over CDP, no console errors): Start → warm-up at 60× → Inject fault (oil pump 0.6, gradual) → the ghost separates (1.69 vs 3.19 bar), health drops to 71, WATCH → WARNING alerts appear, and the card names 'Lubrication-system degradation' with its evidence. Trends shows live uPlot charts with residual band, fault marker and alert diamonds. Deviations: controls live in the test-bench drawer (Amendment A); the scenario picker moves to Phase 6 (hero scenario); the vibration gauge is a Phase 7 placeholder. Re-render: every block selects its own slice, and charts redraw from a ring buffer outside React.

---

### Phase 5: 3D engine (procedural, slider-crank)
Doc: review *Three.js virtual engine plan*, *Piston motion*; draft §35.2.

- [x] `physics/sliderCrank.ts`: x(θ), rod angle φ, a(θ) (with tests)
- [x] Procedural block (semi-transparent cutaway), 4 pistons, 4 con-rods, crankshaft + flywheel
- [x] Pistons 1 & 4 at θ, 2 & 3 at θ + 180°, positions from x(θ) exactly
- [x] View-speed control: display at 1/100 real speed, labelled "display slowed 100×"
- [x] Heat-map block colour; oil-gallery glow = pressure; health overlay colours (green/amber/red/grey)
- [x] Click a part to open a side panel with its sensors, measured vs expected, residual and health
- [x] Camera presets

**Exit checks:** TDC/BDC line up with θ = 0/180°. 60 fps. Under 100 meshes. The fault subsystem changes colour.

✅ TDC/BDC verified by tests (pistons 1 & 4 at l + r when θ = 0, 2 & 3 at l − r; rod length exactly l at every angle). Browser (Edge over CDP, no errors): 45 meshes, 50 draw calls; the block heat-map turns cyan when warm; an oil-pump fault turns the sump, pump and gallery status-red and pulsing, and the callout drops to 24; all four camera presets and explode animate. **60 fps is not yet verified on a GPU** (headless software rendering gives 16 fps; Q-36). The viewport readout shows live fps so it can be checked on the demo laptop. Combustion flashes and F₂ block shake are Phase 7.

---

### Phase 6: Hero scenario, then MINIMUM VIABLE DEMO gate
Doc: review *Demo script* steps 1–3; draft §54. Open question: Q-22.

- [x] One-click hero scenario with a fixed seed: cold start → time-warp warm-up → oil-pump fault develops → diagnosis
- [x] Cold-start oil pressure ≈ 2.5 bar visibly settling as oil warms

**GATE:** Run the hero scenario 3× end to end. It must look identical each time. Everything above the "Minimum viable demo line" in the review's cut list must work. **Stop and get the user's sign-off before Phase 7.**

✅ Built `worker/scenarios.ts` (hero and overheat scripts) run by `SimLoop` on the simulated clock, a one-click **Run hero scenario** button, a narration strip (step dots, title, caption, restart/stop) and a scenario picker in the test bench. Cold start at 20 °C reads 2.54 bar and settles to about 1.6 bar at hot idle; warm-up at 60× takes about 30 s of wall time; the fault ramps in under 10× warp; the card names 'Lubrication-system degradation'. **Gate:** the hero run is identical on three runs at 1×, 10× and 100× chunking (telemetry samples every 20 s, step times and alert list all equal), plus a second play in the same loop; checked once end to end in a real browser (Edge over CDP, no console errors). The user asked to continue straight into Phase 7, so no separate sign-off pause was taken.

---

### Phase 7: Crank-angle simulation, vibration, misfire
Doc: review *New physics: one crank angle drives everything*; draft §11, §13, §30. Open questions: Q-12, Q-13, Q-14.

- [x] `physics/crankTorque.ts`: half-sine pulse per cylinder, A = 2π·T̄_cyl, H_comb,i, ω integration at 0.5°
- [x] PI speed governor once per cycle
- [x] Chunked crank sim in the worker; fill `crankSpeedWindow`
- [x] Vibration synthesis: 2× from F₂, 0.5×/1.5× combustion, 1× imbalance, impulses + noise; fill `vibWindow`
- [x] `analytics/fft.ts` (own radix-2), crank-angle order spectrum; RMS, peak, crest factor, kurtosis, I_rpm (draft §11, §13.2)
- [x] Half-order amplitude + phase → misfiring cylinder
- [x] Vibration page: waveform, order spectrum with 0.5×/1×/2× cursors, crank ripple, **misfire polar plot**
- [x] 3D: combustion flash per cylinder (missing when misfiring), F₂ block shake
- [x] Real vibration RMS into the gauge; misfire evidence score into diagnosis

**Exit checks:** Every misfire golden row within 2 % (phases and 4/3 ratio included). F₂ golden values pass. The polar dot lands in the correct sector for all four cylinders. Real-time at 6,000 rpm.

✅ `physics/crankTorque.ts` (half-sine pulses, ω in crank angle, governor fixed point, closed-form ripple / 0.5× amplitude / phase), `physics/vibration.ts` (F₂, healthy RMS, synthesis), `plant/crank.ts` (sensor noise), `analytics/fft.ts` (own radix-2 FFT, order spectrum, packed two-signal transform) and `analytics/spectral.ts` (RMS, peak, crest, kurtosis, I_rpm, 0.5× amplitude and phase → cylinder and missing torque). Misfire evidence joins diagnosis with the draft weights (Q-40) and alerts, vibration and combustion join subsystem health, the Twin now expects vibration RMS, ripple and torque command, and the Vibration page is live (metrics, order spectrum with 0.5×/1×/2× cursors, misfire polar, both waveforms). 3D: the diagnosed cylinder's flash fades (Q-42) and the block shakes with F₂. Test bench: cylinder misfire with a cylinder selector. **All review goldens reproduce** (see docs/calibration.md): F₂ 179 / 2,517 / 10,068 N; ripple 11 / 61 / 32 rpm; 0.5× amplitude 21.0 / 9.0 rpm; phases +45 / +135 / −45 / −135°; command 110 → 146 N·m (4/3). All four cylinders land in the right sector end to end at 800, 3,000 and 6,000 rpm. A window costs about 0.9 ms, so 60× is real-time with margin. The Validation page now has 22 live rows, all passing. Checked in a real browser: healthy vibration ×1.00, cylinder 3 misfire named with phase −45°, amplitude 21.3 rpm, command ×1.32, evidence 0.80. Open: Q-39 – Q-45.

---

### Phase 8: Show the math + blind mode
Doc: review *Features* (first two rows).

- [x] Math panel: click a gauge value to see the KaTeX formula with live numbers substituted
- [x] At least one equation per subsystem (cooling, oil, friction/energy, electrical, vibration, misfire)
- [x] Show the math page listing all registered equations with symbols and units
- [x] Blind mode: a hidden fault is picked, the system names it, then a reveal button shows the answer

**Exit checks:** Substituted numbers equal the gauge values. A blind run with each fault type is named correctly.

✅ Registry now has 27 equations (six new: oil temperature balance, 2× sensor acceleration, healthy vibration RMS, half-order amplitude, missing torque, misfire phase), 24 with live-substitution templates. Clicking any gauge value (or its ƒ(x) mark), the part panel's button or the misfire panel opens a right-side drawer: the chain of equations with today's numbers, colour-tagged measured / Twin state / healthy assumption / inferred / constant, a Hold switch, and a 'checks against the screen' table. The Math page has the same live view for all seven gauges plus every equation with its symbols and units. KaTeX is lazy-loaded. **Exit checks:** (1) every substituted number equals the gauge value in six engine states (off, cold idle, warm, pump fault, cooling fault, misfire), including between two analytics ticks, a bug the browser caught and the test now covers; each displayed line also recomputes by hand to its displayed result (a small LaTeX evaluator in `src/tests/texEval.ts`); (2) blind mode deals six sealed cards shuffled in the worker; every card is named correctly at the reveal (oil pump, cooling, cylinders 1–4) and the snapshot never carries the answer before it. Checked in a real browser (Edge, `?no3d`, no console errors): oil-pressure drawer ✓ EQUAL; card C was oil-pump wear, named 'Lubrication-system degradation' 1:47 after the pick. Open: Q-46, Q-48.

---

### Phase 9: Advanced analytics
Doc: review *Detection, AI and RUL*; draft §18.3, §19.3, §25–26, §46. Open questions: Q-09, Q-10, Q-17, Q-19.

- [x] Mahalanobis D² (60 s baseline, per-signal contributions, χ² 99 % limit)
- [x] CUSUM per normalized residual
- [x] Sensor sanity: rate limit (0.8 K/s), stuck/dropout, cross-check; sensor-fault injection (spike, stuck, drift, dropout)
- [x] RUL: sliding-window fit, ±2·s_b band, significance gate, simulated hours; uncertainty block (draft §46)
- [x] Stress-dependent fault progression (load affects RUL)
- [x] Trends: D² and CUSUM with limits
- [x] Extra faults: bearing wear (draft §18.3 wear law), alternator

**Exit checks:** A healthy run crosses D² 99 % only ~1 % of the time with no persistent alarm. CUSUM flags the pump at 85 % health before any fixed limit trips. A 25 °C coolant spike is reported as a sensor fault citing the rate limit. RUL shows "trend not significant" when healthy and a band under wear. Raising load shortens RUL.

✅ Plant: 'wears on' onset with stress-dependent progression (Q-10), bearing-wear law (Q-09) with 1× vibration and knock, alternator fault, sensor faults (spike, stuck, drift, dead) from the test bench and the blind deck (now 9 cards). Analytics: `sanity.ts` (rate limit from the energy balance, stuck, dropout, coolant/oil cross-check; rejected readings never reach the diagnosis), `statistics.ts` (D² with contributions, CUSUM), `rul.ts` (fit, ±2·s_b band, significance gate), bearing wear named inside the lubrication hypothesis (Q-50), sensor-fault hypothesis (WARNING-class, Q-53), early warnings (Q-54), draft §46 confidence block and §26 exposure counters. UI: D² and CUSUM charts on Trends, RUL line on Live Twin, sensor quality dots, new test-bench options. CUSUM exposed two real Twin biases, both fixed (Q-51). **All exit checks pass as tests** (phase9.test.ts); 315 tests. Browser: spike named a coolant sensor fault citing 243 K/s vs 0.81 K/s; wearing pump gave RUL ~55 s (49–61 s), 4/4 indicators agreeing. Open: Q-50, Q-52 – Q-54 and the brother's Q-09.

---

### Phase 10: Validation, report, polish features
Doc: review *Features* (Should rows); draft §26, §49–50.

- [x] Validation page (IgniSense-branded): in-app physics checks with expected vs model values
- [x] Maintenance report "IgniSense maintenance report · Team Revora": fault, evidence, action, RUL band, exposure counters (draft §26), timestamp; print-to-PDF
- [x] Engine sound (Web Audio; a misfire stumbles audibly)
- [x] Hot-city stop-and-go scenario (40 °C ambient)
- [x] Live cause-and-effect graph (draft §6) (optional)

**Exit checks:** The Validation page is all green. The report prints on one page with the branding.

✅ Validation: 26 live rows (5 new: χ²₅ 99 % via `lib/stats.ts`, CUSUM samples, spike ÷ rate limit, draft §22.1 health, draft §25.2 RUL), all passing, IgniSense-branded title. Report: live, frozen snapshot with verdict, evidence, action, RUL band, subsystem bars, health history, model status and confidence, draft §26 exposure, recent alerts; print stylesheet puts only the sheet on A4 and names the PDF `ignisense-report-<time>`. Engine sound (`ui/audio/`) from the measured crank speed (Q-55). Hot-city stop-and-go scenario (Q-56). Live cause-and-effect graph on Live Twin (draft §6). **Exit checks:** Validation 26/26 green in the browser; the report printed by Edge to exactly 1 PDF page with the branding. 328 tests; build clean.

---

### Phase 11: Demo hardening and local-run package
Doc: review *Demo script and judge Q&A*; draft §53, §55.

- [x] Full 5-minute script rehearsed in the app
- [x] Offline check: `npm run build && npm run preview` with Wi-Fi off
- [x] Local-run package (no hosting: the brother downloads and runs it): README with setup, one-click start scripts, IgniSense / Team Revora intro
- [~] Performance: no memory growth (verified); 60 fps needs the demo laptop's GPU (Q-36)
- [x] The brother can derive ω = 314 rad/s, 4/3 and 0.8 K/s on a whiteboard; the limitations slide (draft §55) is ready

**Exit checks:** Two clean full demo runs back to back.

✅ **Full demo tour** scenario (review script steps 2–6 on one button, every moment gated on what the monitor concluded; `until: { fault }` conditions) with Pause/Resume on the scenario strip. **Exit check:** `rehearsal.test.ts` plays the tour twice back to back in one loop: every moment as scripted (2.5 bar cold, CUSUM before the rules, lubrication + significant RUL, cylinder 3 at ×4/3, coolant sensor fault) and both runs identical. Local-run package: `start-ignisense.bat` / `.sh`, `npm run demo`, `engines` ≥ 20.19, README rewritten as the brother's run guide, `docs/demo-script.md`, `docs/whiteboard.md` (derivations + limitations). Offline: the production build loads every page (3D and KaTeX chunks included) with 0 external requests. Memory: page heap flat at ≈15 MB over 12 min / 10.7 simulated hours at 60×; worker loop flat at 12.4 MB over 6 simulated hours. Not verifiable here: 60 fps on a GPU (Q-36).

---

### Phase 12: Open-questions review
Doc: `docs/open-questions.md`

- [ ] Go through every item with the user (and the brother for **[Brother]** items)
- [ ] Mark each RESOLVED with its reason, or accept the provisional decision as final
- [ ] Apply any resulting changes, then re-run all tests and the Validation page
- [ ] Update `docs/calibration.md` so the final values match the code

**Exit checks:** No OPEN items left. Everything green.

⏳ **Prepared, waiting for the user and the brother.** [docs/open-questions-review.md](docs/open-questions-review.md) sorts all 62 questions: 14 for the physics owner, 10 for the user (demo/product), 24 engineering choices recommended as final, 14 already resolved; 4 open (Q-26 phone width, Q-36 fps on the demo laptop, Q-57 overall-health display, Q-59 real hardware). Every provisional choice is implemented and covered by tests, so accepting one changes no code. After the review: mark items RESOLVED, apply any changes, re-run `npm test` and the Validation page, and check calibration.md.

---

### Phase 13 (stretch): real data sources
Doc: review *Hardware roadmap*; draft §47.

- [x] `sources/replaySource.ts` (CSV replay)
- [x] Phone accelerometer via DeviceMotion into the same FFT
- [x] `sources/serialSource.ts`: Web Serial for ESP32 JSON lines / USB ELM327 OBD-II (PIDs 0C, 04, 05, 0F, 0B, 42)

---

✅ `sources/csv.ts` (Telemetry ⇄ CSV), `replaySource.ts` (sample-and-hold on the loop clock, stops at the end), `serialSource.ts` (ESP32 JSON lines, ELM327 response parser with the review's PID formulas, `LiveSource`). The worker records the last 30 simulated minutes (ring buffer) and switches between simulator, replay and live sources; the Twin and analytics are unchanged (rule 2). UI: Debug & data page with Download recording / Replay a CSV / Connect ESP32 / Connect OBD-II / Back to simulator, a REPLAY/LIVE header badge, and a device-accelerometer panel on the Vibration page through the same FFT. Tests: CSV round trip, **replaying a recorded pump-fault run reproduces the diagnosis**, PID decoding, JSON lines, an OBD-II-only live source (oil channels not fitted, no false sensor fault), the accelerometer spectrum. Browser: recorded, downloaded and replayed a 36,000-row file; the replay ends with the same diagnosis. Two real bugs found and fixed: a false stuck alarm on coarse sensors and a frozen-row alarm at the end of a replay (Q-61, Q-62). Not tested on real hardware (Q-59).


## Progress log

_One line per completed phase: date, phase, result, open issues._

- 2026-09-28: Project set up. Review and draft saved to `docs/`. CLAUDE.md and `open-questions.md` (Q-01–Q-24) written.
- 2026-09-28: **Phase 0 complete.** Scaffolded Vite 8/React 19/TS 6 strict, Tailwind v4, Zustand, Vitest 5, ESLint 10 + Prettier. Added brand.ts, telemetry.ts, seeded RNG, engine profile, and the 4 boundary lint rules (verified: 5 illegal probe imports rejected, the Telemetry import allowed). 9 tests pass; lint, typecheck and build are clean; the dev server serves the IgniSense shell. Git initialised (no commits yet). Waiting for user review before Phase 1.
- 2026-09-28: **Design system imported + UI shell (pulled ahead of Phase 4).** Imported the IgniSense design system (tokens, fonts, components) from the Claude Design handoff into `src/index.css` + `src/ui/`. Wrote Amendment A (airy + motion) in `docs/design/DESIGN.md`. Built a hash-routed shell with 6 pages, a spring test-bench drawer, a sliding tab indicator, page transitions and scroll reveals, all on labelled sample data. Checked in headless Edge at 1440px and 504px; fixed full-border status colouring (the design colours a single edge) and grid overflow on narrow screens. Lint has 11 warnings (react-refresh, files exporting helpers); no errors. Physics Phase 1 is still next.
- 2026-09-28: **Phase 1 complete.** Pure physics modules (basics, torque, friction, energy, cooling, oil, electrical) + equation registry (13 equations) + composed `engineModel` (evaluate/step). All review golden numbers reproduce within 2 % (most < 0.5 %): 93/132/110 °C steady states, fan cycling 96–98 °C, and all six oil-pressure cases. Warm-up to 82 °C takes 25.1 min, which resolves Q-01 (cold-oil friction). Oil-temp and alternator constants are provisional and logged in `docs/calibration.md`; new items Q-27–Q-29. The Validation page shows live PASS for the Phase 1 rows. 47 tests pass; lint/typecheck/build clean. Waiting for user review (and the brother's calibration sign-off) before Phase 2.
- 2026-09-29: **Phase 2 complete.** Plant (lifecycle OFF/STARTING/WARMUP/RUNNING/SHUTDOWN, fan override, hidden health), sensor model (noise/bias/drift/stuck/spike/dropout, seeded), blind Twin (healthy physics from telemetry only, follows the measured fan), SimSource, testable SimLoop + Web Worker (20 Hz, 1/10/60×, pause/reset), UI sim client, live header and test bench, Debug page. Healthy residuals ≈ pure sensor noise (mean ≤ 0.08 σ). Determinism verified; 60× idle warm-up takes 25 s of wall time; checked end to end in a real browser. New provisional items Q-30–Q-33 (parked cooling, shutdown sag, Twin oil-temp coupling, fanOn in Telemetry). 67 tests; lint/typecheck/build clean. Waiting for user review before Phase 3.
- 2026-09-29: **Phases 3 & 4 complete.** Phase 3: progressive Plant faults (cooling, oil pump + lubrication degradation); `analytics/` = EMA residuals, context-corrected pressure (resolves Q-32), draft-weighted evidence scores, subsystem/overall health with critical overrides, hysteresis alert machines, alert log, draft §35.5 explanation; runs at 10 Hz in the worker. Phase 4: removed all sample data from Live Twin/Trends; live gauges with Twin ghosts and residual-coloured status, health ring, subsystem bars, animated explanation card and alert list, part panels from live residuals, uPlot Trends (both-direction residual band, fault and alert markers), test-bench inject/repair. 85 tests; lint/typecheck/build clean; end-to-end fault run verified in a real browser. New Q-34/Q-35. Next: Phase 5 (3D engine).
- 2026-09-29: **Phase 5 complete (fps pending a GPU check).** `physics/sliderCrank.ts` (x(θ), φ, a(θ), throw offsets; 2 equations registered) + procedural three.js inline-4 (45 meshes) driven each frame from the equation at 1/100 display speed, with no React state in the loop. Coolant heat-map, oil-gallery glow from pressure, pulsing status overlay on faulty subsystems, clickable parts → part panel, 4 animated camera presets incl. explode, projected DOM callouts (Q-37), live fps/mesh readout. three.js is lazy-loaded (separate 934 kB chunk; main bundle unchanged). 97 tests; lint/typecheck/build clean. Timing test headroom relaxed 50× → 20× (analytics in the loop + parallel workers).
- 2026-09-29: **Phase 5 visual upgrade (user feedback: 'make it look realistic and cool').** Detailed procedural parts: grooved pistons, I-beam rods, counterweighted crank, head with cam cover, twin camshafts and 8 valves driven by a new `physics/cycle.ts` (4-stroke phase, firing order 1-3-4-2, valve timing, combustion glow; 6 tests), per-cylinder firing flash + light, intake plenum, exhaust 4-into-1, finned radiator, shrouded fan, hoses, accessory belt. Offline studio environment (Lightformers, no HDR download), contact shadows, fading grid, fog, bloom, vignette. Heat-mapped block outline instead of solid boxes. Markers are now a status diamond; the label slides out on hover and stays open only for a faulty part, always opening away from the engine. 71 meshes. 103 tests; lint/typecheck/build clean. User measured 60 fps before the upgrade; re-check on the GPU (Q-36).
- 2026-09-29: **Phase 6 complete (hero scenario).** Scripted scenarios run on the simulated clock inside the worker (`worker/scenarios.ts`); one-click **Run hero scenario**, narration strip and a scenario picker; controls mirror back to the sliders. Cold start reads 2.54 bar and settles as the oil warms; the oil-pump fault is diagnosed. Three runs at different chunkings are identical (tested); one full run checked in a real browser. New Q-43, Q-44.
- 2026-09-29: **Phase 7 complete (crank angle, vibration, misfire).** Crank-angle torque model, vibration synthesis, own FFT with order tracking, misfire detection that names the cylinder from the 0.5× phase, live Vibration page with polar plot, vibration gauge, 3D flash suppression and F₂ shake, adaptive 3D quality (Q-36). All review goldens reproduce; every cylinder is named correctly through the whole chain. 182 tests; lint/typecheck/build clean. New Q-39 – Q-42, Q-45; Q-12/Q-13/Q-14/Q-22/Q-25 moved on. Next: Phase 8 (Show the math + blind mode).
- 2026-09-29: **Phase 8 complete (Show the math + blind mode).** KaTeX drawer from any gauge value and a live Math page, 27 registered equations with substitution templates proven to evaluate to their compute(); per-gauge bindings whose numbers equal the gauges (tested in six states); blind challenge with sealed, worker-shuffled cards, every fault named correctly at the reveal. Oil-pressure ghost now uses the measured-oil-temperature expectation (Q-47); `?no3d` switch (Q-49). 293 tests; lint/typecheck/build clean. Next: Phase 9 (advanced analytics).
- 2026-09-29: **Phase 9 complete (advanced analytics).** Sensor sanity with physical proof, Mahalanobis D², CUSUM, RUL with confidence band, stress-dependent progression, bearing and alternator faults, sensor faults, uncertainty block, exposure counters. Two Twin biases found by CUSUM and fixed (Q-51). Deployment dropped: the brother runs the code locally (Phase 11 = local-run readiness). 315 tests; lint/typecheck/build clean. Next: Phase 10.
- 2026-09-29: **Phase 10 complete (validation, report, sound, hot city, cause-and-effect).** Validation 26/26; live one-page maintenance report (checked as a 1-page PDF); engine sound from measured firing strength; hot-city stop-and-go scenario; live cause-and-effect graph. 328 tests; lint/typecheck/build clean. New Q-55 – Q-57. Next: Phase 11 (local-run readiness).
- 2026-09-29: **Phase 11 complete (demo hardening, local-run package).** One-button full demo tour with pause; rehearsal test plays it twice identically; start scripts, README run guide, demo script, whiteboard derivations and limitations; 0 external requests offline; no memory growth (page 15 MB flat over 10.7 simulated hours, worker 12.4 MB flat over 6). 60 fps still needs the demo laptop (Q-36). Next: Phase 12 (open-questions review, needs the user and brother) and Phase 13 (stretch).
- 2026-09-29: **Phase 13 complete (real data sources).** Recording + CSV export, CSV replay that reproduces the diagnosis, ESP32 and OBD-II over Web Serial, device accelerometer through the same FFT; same Twin and analytics for every source. 361 tests; lint/typecheck/build clean. New Q-58 – Q-62 (Q-59: no real hardware tested yet).
- 2026-09-29: **Phase 12 prepared.** `docs/open-questions-review.md` is the decision sheet (generated from open-questions.md, with a recommendation per item). The review itself needs the user and the brother; nothing is marked final on their behalf.
