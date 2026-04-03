/**
 * Shared Framer Motion animation variants for consistent motion across pages.
 *
 * All durations use ease-out-quart [0.25, 1, 0.5, 1] — the same easing as
 * the existing useCountUp hook — for a coherent motion language.
 *
 * Usage pattern:
 *   <motion.div variants={staggerContainer} initial="hidden" animate="visible">
 *     <motion.div variants={cardItem}>...</motion.div>
 *   </motion.div>
 *
 * Accessibility: wrap pages with <MotionConfig reducedMotion="user"> to
 * automatically disable all animations for users with prefers-reduced-motion.
 */
import type { Transition, Variants } from "framer-motion";

/** Ease-out-quart cubic-bezier — matches useCountUp easing */
const easeOutQuart = [0.25, 1, 0.5, 1] as const;

/** Shared spring for layout reflow when conditional sections appear or resize. */
export const springLayoutTransition: Transition = {
  type: "spring",
  stiffness: 280,
  damping: 30,
  mass: 0.9,
};

/** Full-page fade-in on mount (used as outermost wrapper after loading resolves).
 *  y: 4 on hidden provides a native-app-style subtle slide-up on enter. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 4 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: easeOutQuart },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.15, ease: "easeIn" },
  },
};

/** Stagger container for card grids (80ms between children) */
export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

/** Stagger container for long lists (40ms between children, e.g. table rows, record cards) */
export const fastStaggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0 },
  },
};

/** Card item: slide-up 16px + fade in */
export const cardItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: easeOutQuart },
  },
};

/** Hero KPI settle: slightly tighter spring to make the primary number feel precise. */
export const heroMetricSettle: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.985 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 220,
      damping: 24,
      mass: 0.95,
      delay: 0.04,
    },
  },
};

/** List item: subtle slide-up 8px + fade in (for rows, compact cards) */
export const listItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: easeOutQuart },
  },
};

/** Slide-down reveal for collapsible sections (use with AnimatePresence) */
export const slideDown: Variants = {
  hidden: { opacity: 0, height: 0, overflow: "hidden" },
  visible: {
    opacity: 1,
    height: "auto",
    transition: { duration: 0.3, ease: easeOutQuart },
  },
  exit: {
    opacity: 0,
    height: 0,
    overflow: "hidden",
    transition: { duration: 0.2, ease: easeOutQuart },
  },
};

/** Subtle chart reveal once the card body is already expanding into place. */
export const chartReveal: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.995 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.28, ease: easeOutQuart },
  },
  exit: {
    opacity: 0,
    y: -6,
    transition: { duration: 0.18, ease: easeOutQuart },
  },
};

/** Stagger container for bottom-sheet drawer items (50ms stagger, small delay for sheet open) */
export const drawerContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

/** Drawer list item: subtle slide-left + fade in (matches bottom-sheet direction) */
export const drawerItem: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: easeOutQuart },
  },
};

/** Simple fade for cross-fade transitions (e.g. chart view switcher) */
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.25, ease: easeOutQuart },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.15 },
  },
};
