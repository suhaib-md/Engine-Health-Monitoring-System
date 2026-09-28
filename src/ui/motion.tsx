import type { ReactNode } from 'react';
import { motion, type Transition, type Variants } from 'motion/react';

/**
 * Shared motion language (docs/design/DESIGN.md, Amendment A).
 * Geometry and layout animate; live numbers never tween.
 * Reduced motion is honoured globally via <MotionConfig reducedMotion="user"> in AppShell.
 */
export const EASE_OUT = [0.2, 0.8, 0.2, 1] as const;

export const pageTransition: Transition = { duration: 0.24, ease: EASE_OUT };

export const drawerSpring: Transition = { type: 'spring', stiffness: 380, damping: 36 };

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const inView = { once: true, margin: '0px 0px -10% 0px' } as const;

/** Fades a block up once as it scrolls into view. */
export function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={inView}
    >
      {children}
    </motion.div>
  );
}

/** Container whose <StaggerItem> children reveal one after another (60ms apart). */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={inView}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={fadeUp}>
      {children}
    </motion.div>
  );
}
