import type { ReactNode } from 'react';

/** IgniSense mark: cyan parallelogram with the red "spark" square. */
export function Mark({ size = 28, framed }: { size?: number; framed?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      {framed && <rect width="40" height="40" fill="#121b26" />}
      <polygon points="14,8 30,8 26,32 10,32" fill="#35e0f0" />
      <rect x="27" y="27" width="6" height="6" fill="#ff4d5e" />
    </svg>
  );
}

export function Wordmark({ className = 'text-lg' }: { className?: string }) {
  return (
    <span className={`font-bold tracking-[0.04em] ${className}`}>
      IGNI<span className="text-accent">SENSE</span>
    </span>
  );
}

/**
 * Amendment A page/section header: mono cyan index + uppercase h1 + one-line description.
 * `aside` sits on the right (buttons, badges).
 */
export function SectionHeader({
  index,
  title,
  description,
  aside,
  size = 'page',
}: {
  index: string;
  title: string;
  description?: ReactNode;
  aside?: ReactNode;
  size?: 'page' | 'section';
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="flex max-w-3xl flex-col gap-3">
        <div className="flex items-baseline gap-4">
          <span className="num text-sm font-bold text-accent">{index}</span>
          <h2
            className={`font-bold uppercase ${size === 'page' ? 'text-[34px] leading-none tracking-[-0.01em] sm:text-[40px]' : 'text-h1'}`}
          >
            {title}
          </h2>
        </div>
        {description && <p className="m-0 text-[15px] leading-relaxed text-fg-2">{description}</p>}
      </div>
      {aside && <div className="flex flex-wrap items-center gap-3">{aside}</div>}
    </header>
  );
}
