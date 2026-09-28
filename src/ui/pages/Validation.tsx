import { useMemo } from 'react';
import { motion } from 'motion/react';
import { SectionHeader } from '../shell/Brand';
import { Reveal, fadeUp, stagger } from '../motion';
import { CHECKS, passes } from './validationChecks';

const fmt = (v: number, d: number) =>
  v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

export function ValidationPage() {
  // Physics is cheap; compute once per visit.
  const rows = useMemo(() => CHECKS.map((c) => ({ ...c, value: c.model ? c.model() : null })), []);
  const done = rows.filter((r) => r.value != null);
  const passed = done.filter((r) => passes(r.value!, r.expected)).length;

  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="05"
        title="Validation"
        description="Hand-calculated values beside the model's, computed live from the same physics the simulator runs. Rows pass within 2 %, the same rule as the test suite."
        aside={
          <span className="num text-sm text-fg-2">
            <b className={passed === done.length ? 'text-ok' : 'text-crit'}>
              {passed}/{done.length}
            </b>{' '}
            passing · {rows.length - done.length} pending
          </span>
        }
      />
      <Reveal>
        <div className="overflow-x-auto border border-line bg-panel">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="label text-left">
                <th className="border-b border-line px-8 py-4 font-medium">Check</th>
                <th className="border-b border-line px-4 py-4 text-right font-medium">Expected</th>
                <th className="border-b border-line px-4 py-4 text-right font-medium">Model</th>
                <th className="border-b border-line px-8 py-4 text-right font-medium">Status</th>
              </tr>
            </thead>
            <motion.tbody
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true }}
            >
              {rows.map((r) => {
                const ok = r.value != null && passes(r.value, r.expected);
                return (
                  <motion.tr
                    key={r.check}
                    variants={fadeUp}
                    className="transition-colors duration-fast hover:bg-raised"
                  >
                    <td className="border-b border-line px-8 py-4">{r.check}</td>
                    <td className="num border-b border-line px-4 py-4 text-right font-bold">
                      {fmt(r.expected, r.decimals)} <span className="text-fg-3">{r.unit}</span>
                    </td>
                    <td
                      className={`num border-b border-line px-4 py-4 text-right ${r.value == null ? 'text-fg-3' : 'text-fg'}`}
                    >
                      {r.value == null ? '— —' : fmt(r.value, r.decimals)}
                    </td>
                    <td className="border-b border-line px-8 py-4 text-right">
                      {r.value == null ? (
                        <span className="num text-label text-invalid">
                          PENDING · PHASE {r.phase}
                        </span>
                      ) : (
                        <span
                          className={`num text-label font-bold ${ok ? 'text-ok' : 'text-crit'}`}
                        >
                          {ok ? 'PASS' : 'FAIL'}
                        </span>
                      )}
                    </td>
                  </motion.tr>
                );
              })}
            </motion.tbody>
          </table>
        </div>
      </Reveal>
    </div>
  );
}
