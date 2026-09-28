# IgniSense — Smart Engine Health Diagnostic

**Team Revora** · A physics-informed engine digital twin

IgniSense simulates a 2.0 L inline-4 engine (the _Plant_) with hidden, progressive faults. A blind, healthy _Twin_ predicts what every sensor should read. The analytics layer sees only telemetry. It diagnoses faults from the residuals, scores subsystem health, estimates remaining useful life and explains its evidence. A procedural 3D engine is driven by the same slider-crank physics as the numbers.

It runs entirely in the browser (Vite + React + TypeScript, simulation in a Web Worker) and works offline.

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # physics and analytics tests
npm run build && npm run preview   # offline demo build
```

## Documentation

- [docs/research-review-and-build-plan.md](docs/research-review-and-build-plan.md): physics, architecture and build plan (source of truth)
- [docs/draft-technical-research.md](docs/draft-technical-research.md): original technical research draft
- [docs/open-questions.md](docs/open-questions.md): open calibration and design questions
- [CLAUDE.md](CLAUDE.md): phase-by-phase build plan and project rules

All engine parameters are **demo calibration**, not OEM data.
