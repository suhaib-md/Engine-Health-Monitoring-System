import { SectionHeader } from '../shell/Brand';
import { Panel } from '../primitives';
import { Reveal, Stagger, StaggerItem } from '../motion';
import { LiveChart, LiveLegend } from '../charts/LiveChart';
import { color } from '../tokens';
import { D2_CAP } from '../sim/history';

/**
 * Trends: live measured-vs-Twin history with fault-injection and alert markers, plus the
 * statistical layer (Phase 9): Mahalanobis D² against its χ² limit and the largest CUSUM.
 */
export function TrendsPage() {
  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="02"
        title="Trends"
        description="Measured against the Twin over simulated time. The shaded gap is the residual; violet lines mark fault injections, diamonds mark alerts. Below, the statistical layer: D² flags an unusual combination of residuals, CUSUM a small shift that persists."
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

      <section className="flex flex-col gap-8">
        <SectionHeader
          size="section"
          index="02b"
          title="Statistics"
          description="Learned from the first 60 s of settled running. D² above 15.09 (the χ² 99 % point for 5 signals) for 3 s is an anomaly; CUSUM above 5 on any residual is a slow drift. Both raise WATCH alerts before any rule trips."
        />
        <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
          <StaggerItem>
            <Panel tab className="flex flex-col gap-5">
              <h3 className="text-h3 font-semibold">Mahalanobis D² · 5 residuals</h3>
              <LiveChart
                measuredKey="d2"
                label="D²"
                yRange={[0, D2_CAP]}
                thresholds={[{ y: 15.09, color: color.warn }]}
              />
              <p className="num m-0 text-label text-fg-3">
                orange line: χ²₅ 99 % = 15.09 · shown up to {D2_CAP}
              </p>
            </Panel>
          </StaggerItem>
          <StaggerItem>
            <Panel tab className="flex flex-col gap-5">
              <h3 className="text-h3 font-semibold">CUSUM · largest of 5 residuals</h3>
              <LiveChart
                measuredKey="cusum"
                label="CUSUM"
                yRange={[0, 16]}
                thresholds={[{ y: 5, color: color.warn }]}
              />
              <p className="num m-0 text-label text-fg-3">
                orange line: h = 5 σ · κ = 0.5 · updated once per simulated second
              </p>
            </Panel>
          </StaggerItem>
        </Stagger>
      </section>
    </div>
  );
}
