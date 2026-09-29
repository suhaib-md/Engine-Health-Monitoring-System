import { PROFILE, type EngineProfile } from '../engine/profile';
import { HERO_SEED, createRng } from '../lib/rng';
import { BLIND_DECK, BLIND_SETTINGS } from './blind';
import type { Telemetry } from '../telemetry';
import { SimSource } from '../sources';
import { Twin, type TwinExpected } from '../twin';
import { Analytics, ANALYTICS, type AnalyticsState } from '../analytics';
import type {
  BlindStatus,
  Command,
  FaultEvent,
  ScenarioStatus,
  SimSettings,
  SimWindows,
  Snapshot,
  Warp,
} from './protocol';
import { MAX_WAIT_S, scenarioById, type Scenario, type Until } from './scenarios';

/** Progress of the running scripted scenario (all times are simulated seconds). */
interface ScenarioRun {
  def: Scenario;
  /** index of the next step to fire */
  next: number;
  /** when the previous step fired */
  armed_t: number;
  /** when the current step's `until` first became true */
  satisfied_t: number | null;
}

/**
 * The simulation loop, free of any Worker/DOM API so it can be unit-tested in Node.
 * source (Plant → sensors) → Telemetry → Twin. Analytics join in Phase 3.
 * Time: fixed 0.05 s simulated steps; wall time × warp decides how many steps to run.
 */
export class SimLoop {
  source!: SimSource;
  private twin!: Twin;
  private analytics!: Analytics;
  analyticsState: AnalyticsState | null = null;
  faultEvents: FaultEvent[] = [];
  private stepCount = 0;
  private seed = HERO_SEED;
  private accum_s = 0;
  paused = false;
  settings: SimSettings = {
    targetRpm: 3000,
    torque_Nm: 80,
    ambient_C: PROFILE.cooling.ambientRef_C,
    fanMode: 'auto',
    warp: 60,
  };
  telemetry!: Telemetry;
  expected!: TwinExpected;
  private simRate = 0;
  private run: ScenarioRun | null = null;
  /** the newest crank-angle window, and whether analytics / the UI have taken it yet */
  private windows: SimWindows | null = null;
  private windowSeq = 0;
  private windowForAnalytics = false;
  private postedSeq = 0;
  /** simulated time at which each step of the current scenario fired (for tests and captions) */
  scenarioFired_t: number[] = [];
  private settingsRev = 0;
  /** blind challenge: the shuffled deck stays here, in the worker (never in a snapshot) */
  private blind: { order: number[]; status: BlindStatus } | null = null;
  private deals = 0;

  constructor(
    seed: number = HERO_SEED,
    private readonly p: EngineProfile = PROFILE,
  ) {
    this.reset(seed);
  }

  reset(seed: number = this.seed) {
    this.seed = seed;
    this.source = new SimSource(seed, this.p, this.settings.ambient_C);
    this.source.setControls(this.plantControls());
    this.twin = new Twin(this.p);
    this.analytics = new Analytics();
    this.analyticsState = null;
    this.faultEvents = [];
    this.stepCount = 0;
    this.accum_s = 0;
    this.run = null;
    this.blind = null;
    this.windows = null;
    this.windowForAnalytics = false;
    this.postedSeq = 0;
    this.stepOnce(0);
  }

  /** Reset to the scenario's seed and initial controls, then start its script at t = 0. */
  private startScenario(def: Scenario) {
    this.settings = { ...def.initial };
    this.settingsRev++;
    this.reset(def.seed);
    this.run = { def, next: 0, armed_t: 0, satisfied_t: null };
    this.scenarioFired_t = [];
    this.advanceScript();
  }

  private conditionMet(u: Until) {
    if (u === 'running') return this.source.plant.state.lifecycle === 'RUNNING';
    const a = this.analyticsState;
    return !!a?.explanation && (a.overallLevel === 'WARNING' || a.overallLevel === 'CRITICAL');
  }

  /** Fire every script step that is due at the current simulated time. */
  private advanceScript() {
    const r = this.run;
    if (!r) return;
    const t = this.telemetry.t;
    for (let step = r.def.steps[r.next]; step; step = r.def.steps[r.next]) {
      if (step.until) {
        if (r.satisfied_t == null) {
          const timedOut = t - r.armed_t >= (step.maxWait_s ?? MAX_WAIT_S);
          if (!this.conditionMet(step.until) && !timedOut) break;
          r.satisfied_t = t;
        }
      }
      const ready_t = (step.until ? r.satisfied_t! : r.armed_t) + step.after_s;
      if (t < ready_t - 1e-9) break;
      for (const c of step.commands) {
        this.handle(c);
        if (c.type === 'set') this.settingsRev++;
      }
      r.armed_t = t;
      r.satisfied_t = null;
      r.next++;
      this.scenarioFired_t.push(t);
    }
  }

  private scenarioStatus(): ScenarioStatus | null {
    const r = this.run;
    if (!r) return null;
    const shown = r.def.steps[Math.max(0, r.next - 1)];
    if (!shown) return null;
    return {
      id: r.def.id,
      name: r.def.name,
      step: r.next,
      steps: r.def.steps.length,
      title: shown.title,
      caption: shown.caption,
      done: r.next >= r.def.steps.length,
    };
  }

  private plantControls() {
    const { targetRpm, torque_Nm, ambient_C, fanMode } = this.settings;
    return { targetRpm, torque_Nm, ambient_C, fanMode };
  }

  handle(cmd: Command) {
    switch (cmd.type) {
      case 'start':
        this.source.plant.start();
        break;
      case 'stop':
        this.source.plant.stop();
        break;
      case 'pause':
        this.paused = cmd.paused;
        break;
      case 'set':
        this.settings = { ...this.settings, ...cmd.settings };
        this.source.setControls(this.plantControls());
        break;
      case 'reset':
        this.reset(cmd.seed);
        break;
      case 'runScenario':
        this.startScenario(scenarioById(cmd.id));
        break;
      case 'stopScenario':
        this.run = null;
        break;
      case 'blindDeal':
        this.blindDeal();
        break;
      case 'blindPick':
        this.blindPick(cmd.card);
        break;
      case 'blindReveal':
        this.blindReveal();
        break;
      case 'blindEnd':
        if (this.blind) this.handle({ type: 'clearFaults' });
        this.blind = null;
        break;
      case 'injectFault': {
        this.source.plant.injectFault(cmd.fault, cmd.severity, cmd.onset);
        const name = this.blind
          ? 'HIDDEN FAULT'
          : cmd.fault === 'oilPump'
            ? 'PUMP FAULT'
            : cmd.fault === 'cooling'
              ? 'COOLING FAULT'
              : `MISFIRE C${cmd.fault.slice(-1)}`;
        this.faultEvents = [...this.faultEvents, { t: this.telemetry.t, label: name }].slice(-20);
        break;
      }
      case 'clearFaults':
        this.source.plant.clearFaults();
        this.faultEvents = [...this.faultEvents, { t: this.telemetry.t, label: 'REPAIRED' }].slice(
          -20,
        );
        break;
    }
  }

  private stepOnce(dt: number) {
    this.telemetry =
      dt > 0 ? this.source.step(dt) : this.source.sensors.measure(this.source.plant.truth());
    this.expected = this.twin.update(this.telemetry);
    const { crankSpeedWindow: speed, vibWindow: vib } = this.telemetry;
    if (speed && vib) {
      this.windows = { seq: ++this.windowSeq, t: this.telemetry.t, speed, vib };
      this.windowForAnalytics = true;
    }
    // Analytics at 10 Hz: it sees only telemetry + the Twin's expectation. A window that landed on a
    // tick between two analytics updates is handed over with the next one.
    if (dt > 0 && ++this.stepCount % ANALYTICS.everyNSteps === 0) {
      const tel =
        this.windowForAnalytics && this.windows && !speed
          ? { ...this.telemetry, crankSpeedWindow: this.windows.speed, vibWindow: this.windows.vib }
          : this.telemetry;
      if (tel.crankSpeedWindow) this.windowForAnalytics = false;
      this.analyticsState = this.analytics.update(tel, this.expected, dt * ANALYTICS.everyNSteps);
    }
    if (dt > 0) this.advanceScript();
    if (dt > 0) this.watchBlind();
  }

  /** Shuffle a fresh deck (seeded, so a replay deals the same order), heal the engine, run it at part load. */
  private blindDeal() {
    this.run = null;
    this.source.plant.clearFaults();
    const rng = createRng((this.seed ^ 0x9e3779b9) + 7919 * ++this.deals);
    const order = BLIND_DECK.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [order[i], order[j]] = [order[j]!, order[i]!];
    }
    this.handle({ type: 'set', settings: BLIND_SETTINGS });
    this.settingsRev++;
    this.source.plant.start();
    this.blind = {
      order,
      status: {
        cards: order.length,
        picked: null,
        pickedAt: null,
        firstWarningAt: null,
        answer: null,
      },
    };
  }

  private blindPick(card: number) {
    const b = this.blind;
    if (!b || b.status.picked != null || card < 0 || card >= b.order.length) return;
    const c = BLIND_DECK[b.order[card]!]!;
    this.handle({ type: 'injectFault', fault: c.fault, severity: c.severity, onset: c.onset });
    b.status = { ...b.status, picked: card, pickedAt: this.telemetry.t };
  }

  /** Records when the monitor first escalated after the pick (from analytics output only). */
  private watchBlind() {
    const b = this.blind;
    const a = this.analyticsState;
    if (!b || b.status.picked == null || b.status.firstWarningAt != null || !a) return;
    if (a.explanation && (a.overallLevel === 'WARNING' || a.overallLevel === 'CRITICAL'))
      b.status = { ...b.status, firstWarningAt: this.telemetry.t };
  }

  private blindReveal() {
    const b = this.blind;
    if (!b || b.status.picked == null) return;
    const c = BLIND_DECK[b.order[b.status.picked]!]!;
    const verdict = this.analyticsState?.explanation?.fault ?? null;
    b.status = {
      ...b.status,
      answer: { label: c.label, expected: c.expected, verdict, correct: verdict === c.expected },
    };
  }

  /** Run whole fixed steps covering `sim_s` simulated seconds (remainder carried over). */
  advanceSim(sim_s: number) {
    const dt = this.p.sim.slowDt_s;
    this.accum_s += sim_s;
    let n = 0;
    while (this.accum_s >= dt - 1e-9) {
      this.stepOnce(dt);
      this.accum_s -= dt;
      n++;
    }
    return n;
  }

  /** Advance by elapsed wall-clock milliseconds, scaled by the time-warp. */
  advanceWall(wall_ms: number) {
    if (this.paused) {
      this.simRate = 0;
      return 0;
    }
    // Guard against a backgrounded tab handing us a huge gap: cap at 1 s of wall time.
    const wall_s = Math.min(wall_ms, 1000) / 1000;
    const steps = this.advanceSim(wall_s * this.settings.warp);
    this.simRate = wall_s > 0 ? (steps * this.p.sim.slowDt_s) / wall_s : 0;
    return steps;
  }

  snapshot(): Snapshot {
    const plant = this.source.plant;
    const { crankSpeedWindow, vibWindow, ...telemetry } = this.telemetry;
    void crankSpeedWindow;
    void vibWindow;
    const fresh = this.windows && this.windows.seq > this.postedSeq ? this.windows : null;
    if (fresh) this.postedSeq = fresh.seq;
    return {
      seed: this.seed,
      paused: this.paused,
      warp: this.settings.warp as Warp,
      lifecycle: plant.state.lifecycle,
      transient: plant.transient,
      telemetry,
      expected: this.expected,
      simRate: this.simRate,
      analytics: this.analyticsState,
      faultEvents: this.faultEvents,
      windows: fresh,
      scenario: this.scenarioStatus(),
      blind: this.blind ? this.blind.status : null,
      settings: this.settings,
      settingsRev: this.settingsRev,
    };
  }
}
