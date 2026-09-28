import { SectionHeader } from '../shell/Brand';
import { Panel } from '../primitives';
import { Reveal, Stagger, StaggerItem } from '../motion';

const REGISTRY = [
  {
    id: 'friction.fmep',
    name: 'Friction mean effective pressure',
    f: 'FMEP = (97 + 15n + 5n²)(1 + max(0, 90 − T_o)/70)',
  },
  { id: 'energy.fuel', name: 'Fuel power', f: 'Q̇_fuel = (P_b + T_fric·ω + P_acc) / η_i' },
  {
    id: 'cooling.ua',
    name: 'Radiator conductance',
    f: 'UA = H_cool · F_therm(T_c) · (600 + 1000·F_fan)',
  },
  { id: 'crank.f2', name: 'Second-order shaking force', f: 'F₂ = 4·m_rec·r·ω²·λ·cos 2θ' },
];

/** Show the math (layout preview). KaTeX rendering + live substitution arrive in Phase 8. */
export function MathPage() {
  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="04"
        title="Show the math"
        description="Every number on screen comes from a registered equation. Live values appear in cyan, fault-driven health factors in the status colour they cause."
      />

      <Reveal>
        <article className="flex flex-col border border-line border-l-4 border-l-accent bg-panel">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-8 py-5">
            <span className="label">oil.pressure · review form</span>
            <span className="label">demo calibration</span>
          </header>
          <div className="flex flex-col gap-6 overflow-x-auto px-8 py-10 font-serif text-[24px]">
            <div className="whitespace-nowrap text-fg">
              <i>P</i>
              <sub>oil</sub> = min[<i>P</i>
              <sub>relief</sub>, (<i>P</i>
              <sub>idle</sub> + <i>K</i>
              <sub>N</sub>(<i>N</i> − <i>N</i>
              <sub>idle</sub>)) · <i>μ</i>
              <sub>rel</sub>
              <sup>0.5</sup> · <i>H</i>
              <sub>pump</sub> / (1 + <i>K</i>
              <sub>c</sub>
              <i>W</i>
              <sub>b</sub>)]
            </div>
            <div className="whitespace-nowrap text-fg-2">
              = min[5, (1.5 + 0.0009(<span className="text-accent">3000</span> − 800)) ·{' '}
              <span className="text-accent">0.86</span>
              <sup>0.5</sup> · <span className="text-warn">0.40</span> / (1 + 1.5·
              <span className="text-accent">0</span>)] = <b className="num text-accent">1.29 bar</b>
            </div>
          </div>
          <footer className="num flex flex-wrap gap-x-8 gap-y-2 border-t border-line px-8 py-5 text-xs text-fg-2">
            <span>
              <span className="text-accent">■</span> live telemetry
            </span>
            <span>
              <span className="text-warn">■</span> fault-driven health factor
            </span>
            <span>
              <span className="text-fg-2">■</span> profile constant
            </span>
          </footer>
        </article>
      </Reveal>

      <section className="flex flex-col gap-6">
        <span className="label">Equation registry · preview</span>
        <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-2">
          {REGISTRY.map((eq) => (
            <StaggerItem key={eq.id}>
              <Panel lift className="flex h-full flex-col gap-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-h3 font-semibold">{eq.name}</span>
                  <span className="num text-label text-fg-3">{eq.id}</span>
                </div>
                <span className="overflow-x-auto whitespace-nowrap font-serif text-[18px] text-fg">
                  {eq.f}
                </span>
              </Panel>
            </StaggerItem>
          ))}
        </Stagger>
      </section>
    </div>
  );
}
