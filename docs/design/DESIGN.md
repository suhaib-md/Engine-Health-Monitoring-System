# IgniSense Design System — handoff for Claude Code

Visual language for **IgniSense — Smart Engine Health Diagnostic** (Team Revora).
Direction: motorsport telemetry. Blue-steel surfaces, one electric-cyan accent, bold mono numerals, sharp angles.

Source: Claude Design project `IgniSense Design System` (files `IgniSense Design System.dc.html`, `Live Twin.dc.html`). The implemented code lives in `src/index.css` (tokens) and `src/ui/` (components).

> **Read the amendment at the bottom first.** Suhaib's direction (2026-09-28) changes spacing and layout: the app is airier, split across pages, and uses motion. Where the amendment and the original rules disagree, **the amendment wins**. Colour, type, shape, status mapping and wording rules are unchanged.

---

## Install (done in the repo)

1. `@fontsource/space-grotesk` and `@fontsource/jetbrains-mono` are self-hosted, because the demo must run offline.
2. `src/index.css` = `theme.css` + amendment utilities.
3. `public/favicon.svg` is the IgniSense mark. The header uses the same mark.
4. `src/ui/*` holds the design-system components. `tokens.ts` is the JS mirror for uPlot, three.js and canvas; keep it in sync with `index.css`.
5. uPlot is installed; use `uplotTheme.ts`.

`index.css` clears Tailwind's default palette (`--color-*: initial`), so `slate-*` etc. do not compile. Use only tokens.

## Rules

### Colour
- **Status colours are reserved.** `ok` green, `watch` yellow, `warn` orange, `crit` red and `invalid` grey mean engine/sensor state and nothing else.
- **Cyan (`accent`) is brand and interaction:** primary buttons, active segments, focus ring, selected state, measured-value series, INFO alerts.
- **Twin / expected is `twin` (#E8EEF5):** a white tick with a caret on gauges, dashed 1.5px on charts. Never cyan.
- Text on cyan is `accent-ink`. Text on status fills uses the matching `*-ink` token.
- Elevation comes from lines, not shadows: `bg` → `panel` + `line` → `raised` + `line-strong`. Only overlays (menus, drawers, the part side panel) get `shadow-overlay`.

### One status mapping for everything
| Token | Alert class | Sensor quality | Evidence class | 3D overlay |
| --- | --- | --- | --- | --- |
| accent | INFO | — | — | selection/hover |
| ok | NORMAL (no alert) | valid | weak < 0.30 | healthy |
| watch | WATCH | degraded | possible 0.30–0.55 | watch |
| warn | WARNING | — | probable 0.55–0.75 | warning |
| crit | CRITICAL | failed | strong > 0.75 | critical |
| invalid | certainty suppressed | unavailable | — | sensor invalid |

Helpers in `tokens.ts`: `evidenceClass()`, `scoreStatus()`, `alertStatus`, `qualityStatus`.

### Typography
- **Space Grotesk:** UI, headings, prose. Headings ≥ 20px are uppercase; smaller headings are sentence case.
- **JetBrains Mono:** every number, unit, label and badge. Always `tabular-nums` (the `num` utility).
- Labels use the `label` utility (11px mono, uppercase, +0.1em, `fg-3`).
- Units sit beside the number at about ⅓ its size, in `fg-3`.
- Scale: display 64 · h1 28 · h2 20 · h3 16 · body 14 · sm 13 · label 11 · num-lg 40 · num-hero 56 · gauge value 36 (amended from 32).
- Minimum 11px anywhere; 13px for body copy.

### Shape
- Radius 0–2px. No pills, no large rounding.
- `chamfer` (10px cut, bottom-right) on primary buttons and hero cards only.
- `skew-badge` + inner `unskew` (−14°) for all status and lifecycle badges.
- `panel-tab` (24×2 cyan, top-left) on the main regions of a page, not on every card.

### Components (`src/ui/`)
- `primitives.tsx`: `Panel`, `Label`, `Button` (primary / secondary / ghost / danger), `Segmented`, `Slider`, `Toggle`. One primary button per region. Buttons are 36px; primary actions are 44px.
- `status.tsx`: `AlertBadge` (filled; only CRITICAL pulses), `LifecycleBadge` (outlined), `QualityDot`, `EvidenceBar`.
- `Gauge.tsx`: bar gauge with Twin ghost. A `null` value = dropout: shows "— —" in grey on a hatched track. Never 0.
- `health.tsx`: `HealthRing` (40 segments; colour = overall alert state), `SubsystemBars`.
- `diagnostics.tsx`: `ExplanationCard` (draft §35.5 order) and `AlertItem`.
- `overlay3d.tsx`: `ViewportChrome` (camera presets, the mandatory **DISPLAY SLOWED 100×** tag, legend), `PartCallout`, `PartPanel`.
- `uplotTheme.ts`: axis, `measured`, `expected`, `residualBand`, `markersPlugin`.

### Charts (uPlot)
- Measured: 2px cyan. Twin: 1.5px dashed `twin`. Residual: cyan 14% band between them.
- Thresholds: dotted status lines. Fault injection: violet vertical (`fault-marker`). Alerts: rotated status squares on the x-axis.
- Multi-signal charts use `series-1…4`.
- Order spectrum: cyan bars. The bar under an active diagnostic cursor takes its evidence's status colour.
- Misfire polar: four 90° sectors (+45° cyl 1, +135° cyl 2, −45° cyl 3, −135° cyl 4) and a status-coloured diamond marker. The active sector tints at 22%.
- Legends are built in React. uPlot's legend is off.

### 3D
- Health overlay: status colours mixed into emissive at about 55%. The faulty subsystem pulses emissive 0.3 → 0.8 at 1 Hz; nothing else pulses.
- Block heat-map uses `heatRamp` (steel → cyan → white).
- Combustion flash is cyan-white. A misfiring cylinder shows none.

### Show the math (KaTeX)
- Live telemetry in `\textcolor{#35e0f0}{…}`. Health factors in their status colour. Constants default.
- Result line in JetBrains Mono, cyan. It must equal the gauge value.

### Report (print, light)
- Print tokens: `paper`, `ink`, `ink-2`, `rule`, `accent-print`, `warn-print`, `crit-print`.
- One page, 11pt minimum. Filename `ignisense-report-<timestamp>.pdf`.

### Motion tokens
| Token | Value | Use |
| --- | --- | --- |
| duration-fast | 120ms | hover, press, toggle knob |
| duration-base | 200ms | bar fills, state colour changes |
| duration-panel | 240ms | side panel, alert slide-in, route change |
| ease-out | cubic-bezier(.2,.8,.2,1) | everything entering |
| animate-crit-pulse | 1.2s loop | CRITICAL badge only |
| flash | 2 × 160ms | panel border flash when a new WARNING/CRITICAL arrives |

**Live numbers never tween**; they update in place. `prefers-reduced-motion` disables pulses, slide-ins and page transitions (CSS rule plus `<MotionConfig reducedMotion="user">`).

### Wording
- "Diagnostic evidence score", never "confidence %".
- Vibration limits are "engine-profile calibration values", never ISO.
- Show "demo calibration" wherever parameter values appear. Label sample/preview data as such.
- Brand strings come from `src/brand.ts`.

### Do not
- Use Tailwind default colours, gradients, glows, or rounded-2xl cards.
- Use a status colour for anything that isn't state.
- Show 0 or NaN for a dropped sensor.
- Put more than one primary button in a region.
- Animate numbers.

---

## Amendment A: airy layout and motion (Suhaib, 2026-09-28) — overrides the above

**Intent:** the original Live Twin crams controls, 3D, health, explanation, alerts and six gauges into one 12px-gap screen. IgniSense should feel spacious and calm, with room to breathe and smooth transitions between focused views.

### Space
| Thing | Original | Amended |
| --- | --- | --- |
| Page gutter | 12px | 24px mobile · 40px desktop (`px-6 lg:px-10`), content max-width 1440px |
| Gap between regions | 12px | 24px (`gap-6`); 32px between page sections (`gap-8`), 64px+ between major sections on scrolling pages |
| Panel padding | 16px | 24px (`p-6`); 28–32px for hero panels |
| Header height | 56px | 64px |
| Gauge value | 32px | 36px; gauges in a 3-column grid on desktop (not 6 across) |
| Section headings | — | Every page opens with a numbered section header (`01 · LIVE TWIN` in mono cyan + h1) and a one-line description in `fg-2` |

### Layout: one idea per view
- **Pages** (header tabs, hash-routed): Live Twin · Trends · Vibration · Math · Validation · Report.
- **Live Twin** is a vertical scroll of focused sections, not one dense grid:
  1. **Hero:** the 3D viewport, large (≈ 60vh), beside a health column (ring + current fault + RUL).
  2. **Signals:** six gauges, three per row, generous gaps.
  3. **Diagnosis:** full-width explanation card beside the alert list.
- **Test bench controls** (engine, sliders, fan, time-warp, fault injection, blind mode) live in a **slide-in drawer** opened from the header ("Test bench"), not in a permanent 280px sidebar. The drawer is an overlay (`raised` + `shadow-overlay`) with a dimmed backdrop.

### Motion (the `motion` library, `motion/react`)
- **Route change:** outgoing page fades out and lifts 8px; incoming page fades in from 16px below (`duration-panel`, ease-out).
- **Tab indicator:** the cyan underline slides between tabs (shared `layoutId`).
- **Section reveal:** sections and cards fade up 24px with a 60ms stagger as they scroll into view (`whileInView`, once).
- **Drawer:** slides in from the left with a spring (stiffness ≈ 380, damping ≈ 36); backdrop fades.
- **Hover:** cards lift 2px and their border brightens to `line-strong` (`duration-fast`).
- **Alerts:** new alerts slide in from the right (`alert-in`); list reorders with `layout`.
- Bars, rings and ghost markers animate their *geometry* (`duration-base`). Numbers still never tween.
- Everything respects `prefers-reduced-motion`.
