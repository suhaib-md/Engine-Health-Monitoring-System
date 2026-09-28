import { SectionHeader } from '../shell/Brand';
import { Panel } from '../primitives';
import { Reveal, Stagger, StaggerItem } from '../motion';
import { TrendChart, TrendLegend, type TrendSpec } from '../charts/PreviewCharts';

const OIL: TrendSpec = {
  base: 3.23,
  drop: -1.55,
  yMin: 0.5,
  yMax: 4,
  ticks: [1, 2, 3, 4],
  watchAt: 2,
  critAt: 1,
  faultLabel: 'PUMP FAULT',
};
const COOLANT: TrendSpec = {
  base: 93,
  drop: 0.6,
  yMin: 80,
  yMax: 110,
  ticks: [85, 95, 105],
  faultLabel: 'PUMP FAULT',
};
const OILTEMP: TrendSpec = {
  base: 101,
  drop: 7,
  yMin: 90,
  yMax: 120,
  ticks: [95, 105, 115],
  watchAt: 112,
  faultLabel: 'PUMP FAULT',
};

export function TrendsPage() {
  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="02"
        title="Trends"
        description="Measured against the Twin over time, with fault-injection and alert markers. Statistical limits (D², CUSUM) join in Phase 9."
      />

      <Reveal>
        <Panel tab className="flex flex-col gap-6 p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-h2 font-bold">Oil pressure · measured vs Twin</h3>
            <TrendLegend />
          </div>
          <TrendChart spec={OIL} />
          <p className="num m-0 text-label text-fg-3">sample data · bar · simulated time →</p>
        </Panel>
      </Reveal>

      <Stagger className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
        <StaggerItem>
          <Panel lift className="flex flex-col gap-5">
            <h3 className="text-h3 font-semibold">Coolant · °C</h3>
            <TrendChart spec={COOLANT} />
          </Panel>
        </StaggerItem>
        <StaggerItem>
          <Panel lift className="flex flex-col gap-5">
            <h3 className="text-h3 font-semibold">Oil temperature · °C</h3>
            <TrendChart spec={OILTEMP} />
          </Panel>
        </StaggerItem>
      </Stagger>
    </div>
  );
}
