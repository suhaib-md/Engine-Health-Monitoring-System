import { SectionHeader } from '../shell/Brand';
import { Panel } from '../primitives';
import { EvidenceBar } from '../status';
import { Stagger, StaggerItem } from '../motion';
import { MisfirePolar, OrderSpectrum } from '../charts/PreviewCharts';

export function VibrationPage() {
  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="03"
        title="Vibration & crank"
        description="Order spectrum in the crank-angle domain, so peaks stay sharp while RPM changes. A half-order (0.5×) component means one cylinder is firing weak; its phase names which one."
      />

      <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <StaggerItem>
          <Panel tab className="flex h-full flex-col gap-6 p-8">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-h2 font-bold">Order spectrum</h3>
              <span className="num text-label text-fg-3">
                crank-angle domain · 16-rev window · sample data
              </span>
            </div>
            <OrderSpectrum />
            <p className="m-0 text-sm leading-relaxed text-fg-2">
              The 2× line is always present in an inline-4 (secondary piston forces add). The 0.5×
              bar in orange is misfire evidence.
            </p>
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel tab className="flex h-full flex-col gap-6 p-8">
            <div className="flex flex-col gap-1.5">
              <h3 className="text-h2 font-bold">Misfire polar</h3>
              <span className="num text-label text-fg-3">0.5× phase · four 90° sectors</span>
            </div>
            <MisfirePolar cylinder={3} />
            <div className="flex flex-col gap-3 border-t border-line pt-5">
              <span className="label">Misfire · diagnostic evidence score</span>
              <EvidenceBar score={0.82} />
            </div>
          </Panel>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
