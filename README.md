# IgniSense — Smart Engine Health Diagnostic

**Team Revora** · a physics-informed engine digital twin

IgniSense simulates a 2.0 L inline-4 petrol engine (the **Plant**) that can develop hidden, progressive faults. A blind, healthy **Twin** predicts what every sensor should read. The **analytics** see only the sensor telemetry, never the fault. They name the fault from the gaps (residuals), score each subsystem's health, estimate the remaining useful life (RUL) and explain their evidence. A procedural 3D engine is driven by the same slider-crank physics as the numbers.

Everything runs in the browser on your own computer. There is no server, no account and no internet needed once it is installed.

All engine parameters are **demo calibration**, not manufacturer data.

---

## Running it

### What you need

- **Node.js 20.19 or newer** (the LTS version from [nodejs.org](https://nodejs.org)). Check with `node --version`.
- A recent Chrome, Edge or Firefox.
- Internet **once**, for the first install. After that it runs offline.

### Easiest: double-click

| System | Do this |
| --- | --- |
| Windows | Double-click **`start-ignisense.bat`** |
| macOS / Linux | Run `sh start-ignisense.sh` in a terminal |

The first run installs the dependencies (a minute or two), builds the app and opens **http://localhost:4173** in your browser. Later runs skip the install and take a few seconds. Close the window (or press Ctrl+C) to stop it.

### From a terminal

```bash
npm install          # once (needs internet)
npm run demo         # build and open the app at http://localhost:4173 (offline from here on)
npm run dev          # development mode with live reload, http://localhost:5173
npm test             # all physics, analytics and scenario tests (≈ 330)
```

### If something goes wrong

| Problem | Fix |
| --- | --- |
| "Port 4173 is in use" | IgniSense is probably already running in another window. Close it, or open http://localhost:4173 directly. |
| The 3D view is slow (fps in the viewport's top-right corner stays low) | The view lowers its own effects under 28 fps. As a last resort open **http://localhost:4173/?no3d**: everything works, just without the 3D engine. |
| No sound | Click **Sound off → Sound on** on the Live Twin page. Browsers only start audio after a click. |
| `npm install` fails | Check the internet connection and that `node --version` is 20.19 or newer. |

---

## Using it

The header has seven pages, a clock (simulated time and time-warp) and the **Test bench** drawer.

| Page | What it shows |
| --- | --- |
| **Live Twin** | 3D engine, health ring, subsystem health, gauges with the Twin's expected value as a white ghost, the diagnosis card, alerts, and a live cause-and-effect graph |
| **Trends** | Measured vs Twin over time, fault and alert markers, Mahalanobis D² and CUSUM |
| **Vibration** | Order spectrum, misfire polar plot (which cylinder), crank-speed ripple |
| **Math** | Every equation with today's numbers substituted. Click any gauge value to open this for that gauge. |
| **Validation** | Hand-calculated values beside the model's, computed live (all green) |
| **Report** | A one-page maintenance report; **Print / save PDF** |
| **Debug** | Raw telemetry beside the Twin |

**Demo buttons**

- **Run hero scenario** (Live Twin): cold start → warm-up → the oil pump wears → diagnosis, identical every time.
- **Test bench → Scenario → Full demo tour** is the whole five-minute demo in one button, with **Pause** to talk over it. See [docs/demo-script.md](docs/demo-script.md).
- **Test bench → Blind challenge** deals nine sealed fault cards. A judge picks one, the monitor names it, and **Reveal** shows whether it was right.
- **Test bench → Fault injection**: oil-pump wear, cooling, cylinder misfire, bearing wear, alternator, sensor faults. **Wears on** keeps a fault growing, faster under load, so the RUL has a trend to follow.

---

## For the presenter

- [docs/demo-script.md](docs/demo-script.md): the five-minute demo, click by click, with what to say and likely judge questions
- [docs/whiteboard.md](docs/whiteboard.md): the derivations to do by hand (ω = 314 rad/s, the 4/3 torque ratio, 0.8 K/s and more) and the limitations to state

## Project documents

- [docs/research-review-and-build-plan.md](docs/research-review-and-build-plan.md): physics, architecture and build plan (source of truth)
- [docs/draft-technical-research.md](docs/draft-technical-research.md): original technical research draft
- [docs/calibration.md](docs/calibration.md): every chosen value and why
- [docs/open-questions.md](docs/open-questions.md): open calibration and design questions
- [docs/open-questions-review.md](docs/open-questions-review.md): the decision sheet for reviewing them (Phase 12)
- [CLAUDE.md](CLAUDE.md): phase-by-phase build plan and project rules

## How it is built

Vite + React + TypeScript, simulation in a Web Worker (20 Hz physics, crank-angle model at 0.5°), three.js for the engine, uPlot for charts, KaTeX for the math. The Plant, Twin and analytics are separate folders, and a lint rule stops the analytics from importing anything that knows the fault. Adding real sensors (ESP32 over Web Serial, OBD-II, CSV replay) means adding one source that emits the same `Telemetry` object; the analytics do not change.
