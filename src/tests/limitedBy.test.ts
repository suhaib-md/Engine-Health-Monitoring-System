import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import { limitedBy, type AlertLevel, type FaultKind } from '../analytics';

// Q-57 (decided in the Phase 12 review): the overall health is a weighted average, so beside a
// failing subsystem it can look mild. Whenever the overall level is WARNING or CRITICAL the
// monitor names the subsystem that drives it.

const all = (level: AlertLevel): Record<FaultKind, AlertLevel> => ({
  cooling: level,
  lubrication: level,
  charging: level,
  combustion: level,
  sensor: level,
});

describe('limitedBy (Q-57)', () => {
  it('is silent while NORMAL or WATCH', () => {
    expect(limitedBy(all('NORMAL'), 'NORMAL')).toBeNull();
    expect(limitedBy({ ...all('NORMAL'), lubrication: 'WATCH' }, 'WATCH')).toBeNull();
  });

  it('names the subsystem holding the overall WARNING / CRITICAL level', () => {
    expect(limitedBy({ ...all('NORMAL'), cooling: 'WARNING' }, 'WARNING')).toBe('Thermal');
    expect(limitedBy({ ...all('NORMAL'), charging: 'CRITICAL' }, 'CRITICAL')).toBe('Electrical');
    expect(limitedBy({ ...all('NORMAL'), sensor: 'WARNING' }, 'WARNING')).toBe('Sensor integrity');
  });

  it('breaks ties by evidence score', () => {
    const levels = {
      ...all('NORMAL'),
      cooling: 'CRITICAL' as const,
      lubrication: 'CRITICAL' as const,
    };
    expect(limitedBy(levels, 'CRITICAL', { cooling: 0.4, lubrication: 0.9 })).toBe('Lubrication');
  });
});

describe('limitedBy through the whole loop (Q-57)', () => {
  it('a healthy engine names nothing; a failing oil pump is named while the average stays mild', () => {
    const loop = new SimLoop(5);
    loop.handle({ type: 'set', settings: { targetRpm: 3000, torque_Nm: 80 } });
    loop.handle({ type: 'start' });
    loop.advanceSim(40 * 60);
    expect(loop.analyticsState!.limitedBy).toBeNull();

    loop.handle({ type: 'injectFault', fault: 'oilPump', severity: 0.9, onset: 'instant' });
    loop.advanceSim(10 * 60);
    const a = loop.analyticsState!;
    expect(['WARNING', 'CRITICAL']).toContain(a.overallLevel);
    expect(a.limitedBy).toBe('Lubrication');
    // the point of the feature: the weighted average is far above the failing subsystem
    const lube = a.subsystems.find((s) => s.id === 'lubrication')!.health!;
    expect(a.overallHealth).toBeGreaterThan(lube + 15);
  });
});
