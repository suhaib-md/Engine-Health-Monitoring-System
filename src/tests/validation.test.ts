import { describe, expect, it } from 'vitest';
import { CHECKS, passes } from '../ui/pages/validationChecks';

// The in-app Validation page must be all green: every row with a model passes its own rule.
describe('Validation page rows', () => {
  for (const c of CHECKS) {
    if (!c.model) continue;
    it(c.check, () => {
      const v = c.model!();
      expect(
        passes(v, c.expected, c.tolAbs),
        `${c.check}: expected ${c.expected}, model ${v}`,
      ).toBe(true);
    });
  }
  it('has no pending rows left after Phase 7', () => {
    expect(CHECKS.filter((c) => !c.model && c.phase <= 7)).toEqual([]);
  });
});
