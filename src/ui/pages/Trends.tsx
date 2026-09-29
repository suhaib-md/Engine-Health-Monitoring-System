import { SectionHeader } from '../shell/Brand';
import { Panel } from '../primitives';
import { Reveal, Stagger, StaggerItem } from '../motion';
import { LiveChart, LiveLegend } from '../charts/LiveChart';
import { color } from '../tokens';

/**
 * Trends (Phase 4): live measured-vs-Twin history with fault-injection and alert markers.
 * D² and CUSUM panels join in Phase 9.
 */
export function TrendsPage() {
  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="02"
        title="Trends"
        description="Measured against the Twin over simulated time. The shaded gap is the residual; violet lines mark fault injections, diamonds mark alerts. Statistical limits (D², CUSUM) join in Phase 9."
      />

      <Reveal>
        <Panel tab className="flex flex-col gap-6 p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-h2 font-bold">Oil pressure · measured vs Twin</h3>
            <LiveLegend />
          </div>
          <LiveChart
            measuredKey="press"
            expectedKey="pressExp"
            label="Oil pressure"
            height={300}
            thresholds={[{ y: 1, color: color.crit }]}
          />
          <p className="num m-0 text-label text-fg-3">bar · simulated time (mm:ss) →</p>
        </Panel>
      </Reveal>

      <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <StaggerItem>
          <Panel lift className="flex flex-col gap-5">
            <h3 className="text-h3 font-semibold">Coolant · °C</h3>
            <LiveChart
              measuredKey="coolant"
              expectedKey="coolantExp"
              label="Coolant"
              thresholds={[
                { y: 105, color: color.watch },
                { y: 120, color: color.crit },
              ]}
            />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel lift className="flex flex-col gap-5">
            <h3 className="text-h3 font-semibold">Oil temperature · °C</h3>
            <LiveChart measuredKey="oil" expectedKey="oilExp" label="Oil temp" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel lift className="flex flex-col gap-5">
            <h3 className="text-h3 font-semibold">Bus voltage · V</h3>
            <LiveChart measuredKey="busV" expectedKey="busVExp" label="Bus voltage" />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel lift className="flex flex-col gap-5">
            <h3 className="text-h3 font-semibold">Overall health · 0–100</h3>
            <LiveChart measuredKey="health" label="Health" yRange={[0, 100]} />
          </Panel>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
