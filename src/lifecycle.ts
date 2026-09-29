/**
 * Engine lifecycle (draft §31–32). Observable engine state (the ECU knows it), so it is shared
 * by the Plant, the snapshot sent to the UI, and lifecycle-aware alerting.
 */
export type Lifecycle = 'OFF' | 'STARTING' | 'WARMUP' | 'RUNNING' | 'SHUTDOWN';
