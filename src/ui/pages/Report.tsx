import { BRAND } from '../../brand';
import { SectionHeader } from '../shell/Brand';
import { Button } from '../primitives';
import { Reveal } from '../motion';

/** Printable maintenance report (light, print tokens). Content is sample data until Phase 10. */
export function ReportPage() {
  return (
    <div className="flex flex-col gap-14">
      <SectionHeader
        index="06"
        title="Report"
        description="A one-page maintenance report: fault, evidence, recommended action and RUL band. Printed on paper colours so it reads in daylight."
        aside={
          <Button variant="secondary" onClick={() => window.print()}>
            Print / save PDF
          </Button>
        }
      />
      <Reveal className="flex justify-center">
        <div className="flex aspect-[1/1.414] w-full max-w-[680px] flex-col gap-6 bg-paper p-10 text-[12px] text-ink sm:p-12">
          <div className="flex items-start justify-between border-b-[3px] border-ink pb-4">
            <div className="flex items-center gap-3">
              <svg width="28" height="28" viewBox="0 0 40 40" aria-hidden="true">
                <polygon points="14,8 30,8 26,32 10,32" fill="#0a8a9a" />
                <rect x="27" y="27" width="6" height="6" fill="#d8283a" />
              </svg>
              <div className="flex flex-col">
                <b className="text-[15px] tracking-[0.04em]">IGNISENSE</b>
                <span className="text-ink-2">{BRAND.reportTitle}</span>
              </div>
            </div>
            <span className="num text-right text-ink-2">
              2026-09-28 14:32
              <br />
              sample data
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-end gap-4">
            <div className="flex flex-col gap-1">
              <span className="num text-[10px] tracking-[0.1em] text-ink-2">PROBABLE FAULT</span>
              <b className="text-[22px] leading-tight">Lubrication-system degradation</b>
            </div>
            <span className="num bg-warn-print px-3 py-1 text-[10px] font-extrabold tracking-[0.08em] text-white">
              WARNING
            </span>
          </div>
          <div className="grid grid-cols-3 border border-rule">
            {[
              ['HEALTH', '61.0'],
              ['EVIDENCE', '0.71'],
              ['RUL BAND', '46–62 h'],
            ].map(([k, v], i) => (
              <div
                key={k}
                className={`flex flex-col gap-1 p-3 ${i < 2 ? 'border-r border-rule' : ''}`}
              >
                <span className="num text-[10px] text-ink-2">{k}</span>
                <b className="num text-[22px]">{v}</b>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <span className="num text-[10px] tracking-[0.1em] text-ink-2">EVIDENCE</span>
            <span>✓ Oil pressure is 47% below twin expectation</span>
            <span>✓ Pressure residual persisted for 27 s</span>
            <span>✓ Oil temperature trend is rising</span>
          </div>
          <div className="num flex h-24 items-center justify-center border border-rule text-ink-2 [background:repeating-linear-gradient(-45deg,#eef1f4_0_6px,#f7f8fa_6px_12px)]">
            trend chart · print palette
          </div>
          <div className="flex flex-col gap-2">
            <span className="num text-[10px] tracking-[0.1em] text-ink-2">RECOMMENDED ACTION</span>
            <span>
              Inspect oil level, oil-pump operation, filter restriction and bearing-clearance
              condition.
            </span>
          </div>
          <div className="num mt-auto flex justify-between border-t border-rule pt-3 text-[10px] text-ink-2">
            <span>All values are demo calibration</span>
            <span>{BRAND.fileSlug}-report-20260928-1432.pdf</span>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
