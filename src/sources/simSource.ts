import { PROFILE, type EngineProfile } from '../engine/profile';
import { createRng } from '../lib/rng';
import type { Lifecycle } from '../lifecycle';
import type { Telemetry } from '../telemetry';
import { CrankSensors, Plant, SensorModel, type PlantControls } from '../plant';

/**
 * Telemetry source backed by the simulator: Plant → sensor model → Telemetry.
 * Every other source (CSV replay, ESP32, OBD-II) must emit the same Telemetry (CLAUDE.md rule 2).
 */
export interface TelemetrySource {
  /** advance the source by dt simulated seconds and return the newest sample */
  step(dt: number): Telemetry;
}

export class SimSource implements TelemetrySource {
  readonly plant: Plant;
  readonly sensors: SensorModel;
  private readonly crank: CrankSensors;
  private lastWindow = 0;

  constructor(
    seed: number,
    p: EngineProfile = PROFILE,
    ambient_C: number = PROFILE.cooling.ambientRef_C,
  ) {
    this.plant = new Plant(p, ambient_C);
    this.sensors = new SensorModel(createRng(seed), p);
    // separate stream: the crank windows must not shift the slow-channel noise
    this.crank = new CrankSensors(createRng(seed ^ 0x5bd1e995), p);
    this.everyS = p.crank.windowEvery_s;
  }

  private readonly everyS: number;

  step(dt: number): Telemetry {
    this.plant.step(dt);
    const tel = this.sensors.measure(this.plant.truth());
    // A fresh crank-angle window once per simulated second while the engine fires.
    const idx = Math.floor(this.plant.state.t / this.everyS + 1e-9);
    if (idx > this.lastWindow) {
      this.lastWindow = idx;
      const input = this.plant.crankInput();
      if (input) {
        const w = this.crank.window(input);
        tel.crankSpeedWindow = w.speed;
        tel.vibWindow = w.vib;
      }
    }
    return tel;
  }

  setControls(patch: Partial<PlantControls>) {
    Object.assign(this.plant.controls, patch);
  }

  get lifecycle(): Lifecycle {
    return this.plant.state.lifecycle;
  }
}
