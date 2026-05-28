'use client';

/**
 * PAGE TRANSITION WRAPPER
 *
 * template.tsx re-mounts on every navigation (unlike layout.tsx which persists).
 * This guarantees Framer Motion treats the mount as truly new — so initial="hidden"
 * is always applied before the first browser paint, preventing the 1-frame flash
 * of visible content that occurs when React Query returns cached data immediately.
 *
 * Why not layout.tsx + AnimatePresence: Next.js App Router wraps navigations in
 * startTransition (React 18 concurrent), which can cause AnimatePresence to inherit
 * the previous variant context ("visible") and skip initial="hidden" on the new child.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { pageVariants } from '@/lib/utils/motionVariants';

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      // Belt-and-suspenders: CSS opacity:0 + translateY covers the single frame
      // before Framer Motion's useLayoutEffect runs on very slow JS threads.
      // Omitted when reduced motion is preferred — MotionConfig in layout.tsx already
      // skips durations, so this inline style would cause a one-frame invisible flash
      // without any animation payoff for reduced-motion users.
      // Values must match pageVariants.hidden exactly when applied.
      style={!prefersReducedMotion ? { opacity: 0, transform: 'translateY(4px)' } : undefined}
    >
      {children}
    </motion.div>
  );
}
