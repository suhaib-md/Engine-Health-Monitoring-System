import { PROFILE, type EngineProfile } from '../engine/profile';
import type { Rng } from '../lib/rng';
import { angleWindow, simulateCrank, synthesizeVibration, type CrankInput } from '../physics';

/**
 * The crank-speed and accelerometer sensors. The crank-angle model (physics/crankTorque.ts) runs
 * with the Plant's hidden combustion health; this class then adds sensor noise and returns what a
 * real ECU would log: crank speed and vibration over 16 revolutions at 512 samples per revolution,
 * in the crank-angle domain. It has its own seeded RNG stream so adding it never shifts the slow-channel noise.
 *
 * Noise comes from a pool of N(0,1) samples drawn once per seed; each window reads the pool from a
 * random (seeded) offset. That keeps a window well under a millisecond, which the 60× time-warp
 * needs (60 windows per wall second), and the windows are still deterministic.
 */

export interface CrankWindows {
  /** rpm per angle sample (512 per revolution) */
  speed: Float32Array;
  /** m/s² per angle sample */
  vib: Float32Array;
  /** speed-governor torque command, N·m */
  torqueCmd_Nm: number;
}

const POOL = 1 << 18;

export class CrankSensors {
  private pool: Float32Array | null = null;

  constructor(
    private readonly rng: Rng,
    private readonly p: EngineProfile = PROFILE,
  ) {}

  private noise() {
    if (!this.pool) {
      this.pool = new Float32Array(POOL);
      for (let i = 0; i < POOL; i++) this.pool[i] = this.rng.gaussian();
    }
    return this.pool;
  }

  /** One analysis window for an engine holding `input` steadily (quasi-steady assumption). */
  window(input: CrankInput, imbalance = 1): CrankWindows {
    const run = simulateCrank(input, this.p);
    const rpmPerRadps = 30 / Math.PI;
    const speedTrue = angleWindow(run.omega, this.p);
    const vibTrue = angleWindow(
      synthesizeVibration(run, input.resist_Nm, imbalance, this.p),
      this.p,
    );
    const n = speedTrue.length;
    const sigmaN = this.p.sensors.crankRpm.sigma;
    const sigmaA = this.p.sensors.vibMs2.sigma;
    const pool = this.noise();
    let oN = Math.floor(this.rng.next() * POOL);
    let oA = Math.floor(this.rng.next() * POOL);
    const speed = new Float32Array(n);
    const acc = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      speed[i] = speedTrue[i]! * rpmPerRadps + sigmaN * pool[oN]!;
      acc[i] = vibTrue[i]! + sigmaA * pool[oA]!;
      if (++oN === POOL) oN = 0;
      if (++oA === POOL) oA = 0;
    }
    return { speed, vib: acc, torqueCmd_Nm: run.torqueCmd_Nm };
  }
}
