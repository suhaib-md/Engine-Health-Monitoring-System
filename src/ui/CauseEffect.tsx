import { useSim } from './sim/simClient';
import { color } from './tokens';
import { riskStatus, type AnalyticsState } from '../analytics';

/**
 * Live cause-and-effect graph (draft §6, "parameters must affect one another"). Left: faults the
 * monitor can name. Middle: the physical effect each one has. Right: the sensor that sees it. Every
 * node lights from the analytics' own symptom risks (never from the hidden fault), so the path from
 * a reading back to its cause is visible while the evidence builds.
 */

type Node = { id: string; label: string; sub?: string };

const CAUSES: Node[] = [
  { id: 'pump', label: 'Oil-pump wear' },
  { id: 'bearing', label: 'Bearing wear' },
  { id: 'radiator', label: 'Radiator / cooling' },
  { id: 'misfire', label: 'Misfire' },
  { id: 'alternator', label: 'Alternator' },
  { id: 'sensor', label: 'Sensor failure' },
];
const EFFECTS: Node[] = [
  { id: 'press', label: 'Oil pressure ↓', sub: 'pump flow, clearance leak' },
  { id: 'oilT', label: 'Oil temperature ↑', sub: 'friction heat, jacket' },
  { id: 'coolT', label: 'Coolant temperature ↑', sub: 'less heat rejected' },
  { id: 'ripple', label: 'Crank-speed ripple ↑', sub: '0.5× order' },
  { id: 'vib', label: 'Vibration ↑', sub: '1×, impacts, rocking' },
  { id: 'cmd', label: 'Torque command ↑', sub: 'governor makes up' },
  { id: 'volt', label: 'Bus voltage ↓', sub: 'less charging' },
  { id: 'impossible', label: 'Implausible reading', sub: 'exceeds physical limits' },
];
const SENSORS: Node[] = [
  { id: 's_press', label: 'Oil-pressure sensor' },
  { id: 's_oil', label: 'Oil-temp sensor' },
  { id: 's_cool', label: 'Coolant sensor' },
  { id: 's_crank', label: 'Crank-speed sensor' },
  { id: 's_acc', label: 'Accelerometer' },
  { id: 's_ecu', label: 'ECU governor' },
  { id: 's_volt', label: 'Voltage sensor' },
];

const CAUSE_EDGES: [string, string][] = [
  ['pump', 'press'],
  ['pump', 'oilT'],
  ['bearing', 'press'],
  ['bearing', 'vib'],
  ['radiator', 'coolT'],
  ['radiator', 'oilT'],
  ['misfire', 'ripple'],
  ['misfire', 'vib'],
  ['misfire', 'cmd'],
  ['alternator', 'volt'],
  ['sensor', 'impossible'],
];
const SENSOR_EDGES: [string, string][] = [
  ['press', 's_press'],
  ['oilT', 's_oil'],
  ['coolT', 's_cool'],
  ['ripple', 's_crank'],
  ['vib', 's_acc'],
  ['cmd', 's_ecu'],
  ['volt', 's_volt'],
  ['impossible', 's_cool'],
  ['impossible', 's_oil'],
  ['impossible', 's_press'],
];

/** Activation 0..1 of every node, from the analytics output only. */
function activations(a: AnalyticsState | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!a) return out;
  const ev = (id: string) => a.evidence.find((e) => e.id === id);
  const sym = (id: string, s: string) => ev(id)?.symptoms.find((x) => x.id === s)?.risk ?? 0;
  const lube = ev('lubrication');
  const bearingNamed = !!lube?.name.startsWith('Bearing');
  out.pump = bearingNamed ? 0 : (lube?.score ?? 0);
  out.bearing = bearingNamed ? (lube?.score ?? 0) : 0;
  out.radiator = ev('cooling')?.score ?? 0;
  out.misfire = ev('combustion')?.score ?? 0;
  out.alternator = ev('charging')?.score ?? 0;
  out.sensor = Math.min(1, (ev('sensor')?.score ?? 0) / 0.84);
  out.press = Math.max(sym('lubrication', 'lowPressure'), sym('lubrication', 'pressureResidual'));
  out.oilT = sym('lubrication', 'oilTemp');
  out.coolT = sym('cooling', 'tempResidual');
  out.ripple = Math.max(sym('combustion', 'rpmIrregularity'), sym('combustion', 'firingSpectrum'));
  const vibHealth = a.subsystems.find((s) => s.id === 'vibration')?.health;
  out.vib = vibHealth == null ? 0 : 1 - vibHealth / 100;
  out.cmd = sym('combustion', 'torqueCommand');
  out.volt = sym('charging', 'voltageResidual');
  out.impossible = out.sensor;
  for (const [m, s] of SENSOR_EDGES) out[s] = Math.max(out[s] ?? 0, out[m] ?? 0);
  return out;
}

const W = 1080;
const COL = [30, 410, 800];
const NODE_W = 250;
const ROW = 56;
const TOP = 36;

function layout(nodes: Node[], col: number, height: number) {
  const gap = (height - TOP - 20) / nodes.length;
  return Object.fromEntries(
    nodes.map((n, i) => [n.id, { x: COL[col]!, y: TOP + gap * i + (gap - 40) / 2, n }]),
  );
}

const statusColor = (r: number) => {
  const st = riskStatus(r);
  return st === 'ok' ? null : color[st];
};

export function CauseEffect() {
  const a = useSim((s) => s.snapshot?.analytics);
  const act = activations(a);
  const H = TOP + EFFECTS.length * ROW + 20;
  const pos = { ...layout(CAUSES, 0, H), ...layout(EFFECTS, 1, H), ...layout(SENSORS, 2, H) };

  const edge = (from: string, to: string, key: string) => {
    const p = pos[from]!;
    const q = pos[to]!;
    const x1 = p.x + NODE_W;
    const y1 = p.y + 20;
    const x2 = q.x;
    const y2 = q.y + 20;
    const on = Math.min(act[from] ?? 0, act[to] ?? 0);
    const c = statusColor(on);
    return (
      <path
        key={key}
        d={`M${x1} ${y1} C${x1 + 70} ${y1}, ${x2 - 70} ${y2}, ${x2} ${y2}`}
        fill="none"
        stroke={c ?? color.lineStrong}
        strokeWidth={c ? 2.5 : 1}
        opacity={c ? 1 : 0.55}
        style={{ transition: 'stroke 300ms, stroke-width 300ms, opacity 300ms' }}
      />
    );
  };

  const node = (id: string) => {
    const { x, y, n } = pos[id]!;
    const r = act[id] ?? 0;
    const c = statusColor(r);
    return (
      <g key={id} style={{ transition: 'opacity 300ms' }}>
        <rect
          x={x}
          y={y}
          width={NODE_W}
          height={40}
          fill={color.panel}
          stroke={c ?? color.line}
          strokeWidth={c ? 2 : 1}
          style={{ transition: 'stroke 300ms' }}
        />
        <rect x={x} y={y} width={4} height={40} fill={c ?? color.lineStrong} />
        <text x={x + 16} y={y + (n.sub ? 17 : 25)} fontSize={13} fontWeight={600} fill={color.fg}>
          {n.label}
        </text>
        {n.sub && (
          <text x={x + 16} y={y + 32} fontSize={10} fill={color.fg3} fontFamily="JetBrains Mono">
            {n.sub}
          </text>
        )}
        {r >= 0.05 && (
          <text
            x={x + NODE_W - 10}
            y={y + 25}
            fontSize={11}
            fontWeight={700}
            textAnchor="end"
            fill={c ?? color.fg2}
            fontFamily="JetBrains Mono"
          >
            {r.toFixed(2)}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block h-auto w-full min-w-[760px]"
        role="img"
        aria-label="Live cause-and-effect graph"
      >
        {['Cause', 'Physical effect', 'Seen by'].map((t, i) => (
          <text
            key={t}
            x={COL[i]}
            y={16}
            fontSize={11}
            fontFamily="JetBrains Mono"
            letterSpacing={1.2}
            fill={color.fg3}
          >
            {t.toUpperCase()}
          </text>
        ))}
        {CAUSE_EDGES.map(([f, t]) => edge(f, t, `${f}-${t}`))}
        {SENSOR_EDGES.map(([f, t]) => edge(f, t, `${f}-${t}`))}
        {[...CAUSES, ...EFFECTS, ...SENSORS].map((n) => node(n.id))}
      </svg>
    </div>
  );
}
