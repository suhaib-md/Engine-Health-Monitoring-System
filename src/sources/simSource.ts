import { PROFILE, type EngineProfile } from '../engine/profile';
import { createRng } from '../lib/rng';
import type { Lifecycle } from '../lifecycle';
import type { Telemetry } from '../telemetry';
import { Plant, SensorModel, type PlantControls } from '../plant';

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

  constructor(
    seed: number,
    p: EngineProfile = PROFILE,
    ambient_C: number = PROFILE.cooling.ambientRef_C,
  ) {
    this.plant = new Plant(p, ambient_C);
    this.sensors = new SensorModel(createRng(seed), p);
  }

  step(dt: number): Telemetry {
    this.plant.step(dt);
    return this.sensors.measure(this.plant.truth());
  }

  setControls(patch: Partial<PlantControls>) {
    Object.assign(this.plant.controls, patch);
  }

  get lifecycle(): Lifecycle {
    return this.plant.state.lifecycle;
  }
}
