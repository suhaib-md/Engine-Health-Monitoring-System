import type { AlertClass } from './tokens';
import { alertStatus, color, scoreStatus } from './tokens';
import { statusBg, statusText } from './status';

/** Overall health ring. Colour follows the overall alert state, not score bands. 40 segments. */
export function HealthRing({
  score,
  state,
  size = 132,
}: {
  score: number;
  state: AlertClass | 'NORMAL';
  size?: number;
}) {
  const r = 80;
  const c = 2 * Math.PI * r;
  const st = state === 'NORMAL' ? 'ok' : alertStatus[state];
  const stroke = st === 'info' ? color.accent : color[st];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 190 190"
      role="img"
      aria-label={`Overall health ${score.toFixed(1)}`}
    >
      <circle cx="95" cy="95" r={r} fill="none" stroke={color.raised} strokeWidth="14" />
      <circle
        cx="95"
        cy="95"
        r={r}
        fill="none"
        stroke={stroke}
        strokeWidth="14"
        strokeDasharray={`${(c * score) / 100} ${c}`}
        transform="rotate(-90 95 95)"
        style={{ transition: 'stroke-dasharray 200ms cubic-bezier(.2,.8,.2,1), stroke 200ms' }}
      />
      {/* segment gaps */}
      <circle
        cx="95"
        cy="95"
        r={r}
        fill="none"
        stroke={color.panel}
        strokeWidth="15"
        strokeDasharray={`2 ${c / 40 - 2}`}
        transform="rotate(-90 95 95)"
      />
      <circle cx="95" cy="95" r="64" fill="none" stroke={color.line} strokeWidth="1" />
      <text
        x="95"
        y="104"
        textAnchor="middle"
        fontFamily="JetBrains Mono"
        fontWeight="800"
        fontSize="46"
        fill={color.fg}
      >
        {score.toFixed(1)}
      </text>
      <text
        x="95"
        y="128"
        textAnchor="middle"
        fontFamily="JetBrains Mono"
        fontSize="11"
        letterSpacing="1.5"
        fill={color.fg3}
      >
        HEALTH
      </text>
    </svg>
  );
}

export function SubsystemBars({
  items,
}: {
  items: { name: string; health: number | null; weight?: number }[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {items.map(({ name, health, weight }) => {
        const s = scoreStatus(health);
        return (
          <div key={name} className="grid grid-cols-[1fr_44px] items-center gap-x-4 gap-y-2">
            <div className="flex justify-between text-sm">
              <span>{name}</span>
              {weight != null && (
                <span className="num text-label text-fg-3">w {weight.toFixed(2)}</span>
              )}
            </div>
            <span
              className={`num row-span-2 text-right text-h2 font-extrabold ${health == null || health < 70 ? statusText[s] : 'text-fg'}`}
            >
              {health == null ? '—' : Math.round(health)}
            </span>
            <div className="relative h-1.5 bg-raised">
              {health != null && (
                <div
                  className={`absolute inset-y-0 left-0 transition-[width] duration-base ease-out ${statusBg[s]}`}
                  style={{ width: `${health}%` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
