import { describe, expect, it } from 'vitest';
import { SimLoop } from '../worker/simLoop';
import { BLIND_DECK } from '../worker/blind';

// Phase 8 exit check: "A blind run with each fault type is named correctly."

function warmLoop(seed = 3) {
  const loop = new SimLoop(seed);
  loop.handle({ type: 'set', settings: { targetRpm: 3000, torque_Nm: 80 } });
  loop.handle({ type: 'start' });
  loop.advanceSim(300);
  return loop;
}

function playCard(card: number, seed = 3) {
  const loop = warmLoop(seed);
  loop.handle({ type: 'blindDeal' });
  loop.advanceSim(20); // the healed engine settles after the deal
  loop.handle({ type: 'blindPick', card });
  const before = JSON.stringify(loop.snapshot());
  loop.advanceSim(240);
  const beforeReveal = loop.snapshot();
  loop.handle({ type: 'blindReveal' });
  return { loop, before, beforeReveal, after: loop.snapshot() };
}

describe('every card is named correctly without the monitor being told', () => {
  const played = BLIND_DECK.map((_, card) => playCard(card));

  it('the six positions cover the whole deck', () => {
    const labels = played.map((p) => p.after.blind!.answer!.label).sort();
    expect(labels).toEqual(BLIND_DECK.map((c) => c.label).sort());
  });

  played.forEach((p, card) => {
    const answer = p.after.blind!.answer!;
    it(`card ${String.fromCharCode(65 + card)}: ${answer.label}`, () => {
      expect(answer.verdict).toBe(answer.expected);
      expect(answer.correct).toBe(true);
      expect(p.after.blind!.firstWarningAt).not.toBeNull();
    });
  });

  it('before the reveal the snapshot never says which fault is on the card', () => {
    for (const p of played) {
      const b = p.beforeReveal.blind!;
      expect(b.answer).toBeNull();
      expect(p.beforeReveal.faultEvents.map((e) => e.label)).toEqual(['HIDDEN FAULT']);
      // no card label anywhere in the serialized snapshot taken right after the pick
      for (const c of BLIND_DECK) expect(p.before).not.toContain(c.label);
    }
  });
});

describe('dealing', () => {
  const order = (seed: number) => {
    const loop = new SimLoop(seed);
    loop.handle({ type: 'blindDeal' });
    loop.handle({ type: 'blindPick', card: 0 });
    loop.handle({ type: 'blindReveal' });
    return loop.snapshot().blind!.answer!.label;
  };

  it('is deterministic for a seed (rule 6) and differs between seeds', () => {
    expect(order(1)).toBe(order(1));
    const labels = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(order));
    expect(labels.size).toBeGreaterThan(1);
  });

  it('a second pick is ignored and the end command heals the engine', () => {
    const loop = warmLoop();
    loop.handle({ type: 'blindDeal' });
    loop.handle({ type: 'blindPick', card: 2 });
    loop.handle({ type: 'blindPick', card: 3 });
    expect(loop.snapshot().blind!.picked).toBe(2);
    expect(loop.snapshot().faultEvents.filter((e) => e.label === 'HIDDEN FAULT')).toHaveLength(1);
    loop.handle({ type: 'blindEnd' });
    expect(loop.snapshot().blind).toBeNull();
    loop.advanceSim(120);
    expect(loop.snapshot().analytics!.overallLevel).toBe('NORMAL');
  });
});
