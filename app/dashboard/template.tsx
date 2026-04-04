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

import { motion } from 'framer-motion';
import { pageVariants } from '@/lib/utils/motionVariants';

export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={pageVariants}
      // Belt-and-suspenders: CSS opacity:0 + translateY covers the single frame
      // before Framer Motion's useLayoutEffect runs on very slow JS threads.
      // Must match pageVariants.hidden values exactly.
      style={{ opacity: 0, transform: 'translateY(4px)' }}
    >
      {children}
    </motion.div>
  );
}
