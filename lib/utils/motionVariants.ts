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

/** Metric settle spring for KPI values that should update precisely, not bounce. */
export const metricSettleTransition: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 34,
  mass: 0.8,
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

/** Chapter reveal: controlled section entry for long editorial pages. */
export const chapterReveal: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: easeOutQuart },
  },
};

/** Period switch shell: slight fade/settle used when dense data re-computes in place. */
export const periodContentSettle: Variants = {
  idle: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  settle: {
    opacity: [0.985, 1],
    y: [4, 0],
    scale: [0.998, 1],
    transition: { duration: 0.24, ease: easeOutQuart },
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

/** Controlled tab panel switch: short fade + slight settle, tuned for dense data views. */
export const tabPanelSwitch: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: easeOutQuart },
  },
};

/** Section-level refresh feedback: brief pulse for the active shell only. */
export const sectionRefreshPulse: Variants = {
  idle: {
    opacity: 1,
    scale: 1,
  },
  pulse: {
    opacity: [1, 1, 1],
    scale: [1, 1.004, 1],
    transition: { duration: 0.42, ease: easeOutQuart },
  },
};

/** Chart shell settle: short container continuity around data changes. */
export const chartShellSettle: Variants = {
  idle: {
    opacity: 1,
    y: 0,
  },
  settle: {
    opacity: [0.985, 1],
    y: [6, 0],
    transition: { duration: 0.22, ease: easeOutQuart },
  },
};

/** Simulation shell settle: slightly stronger than chartShellSettle for scenario recalculations. */
export const simulationShellSettle: Variants = {
  idle: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  settle: {
    opacity: [0.985, 1],
    y: [8, 0],
    scale: [0.995, 1],
    transition: { duration: 0.28, ease: easeOutQuart },
  },
};

/** Progressive build for simulation cards/bins without replaying the whole page. */
export const simulationStagger: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
};

/** Short goal-link reveal used when summary, pie, and details respond to the same selection. */
export const goalLinkSettle: Variants = {
  idle: {
    opacity: 1,
    y: 0,
    scale: 1,
  },
  settle: {
    opacity: [0.98, 1],
    y: [6, 0],
    scale: [0.996, 1],
    transition: { duration: 0.24, ease: easeOutQuart },
  },
};

/** Table shell settle: subtle container continuity without animating table geometry. */
export const tableShellSettle: Variants = {
  inactive: {
    opacity: 0.985,
    y: 4,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: easeOutQuart },
  },
};

/** Allocation drill-down shell: quick structural swap without animating rows/cells. */
export const drillDownShell: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: easeOutQuart },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: 0.14, ease: easeOutQuart },
  },
};

/** Contextual sheet content swap: settle the shell first, then reveal children. */
export const contextualSheetPanel: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.2,
      ease: easeOutQuart,
      when: "beforeChildren",
      staggerChildren: 0.04,
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    transition: { duration: 0.14, ease: easeOutQuart },
  },
};

/** Dialog surface settle: contextual fallback when transform-origin continuity is available. */
export const contextualDialogSurface: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
    scale: 0.975,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.2,
      ease: easeOutQuart,
    },
  },
  exit: {
    opacity: 0,
    y: 4,
    scale: 0.985,
    transition: { duration: 0.14, ease: easeOutQuart },
  },
};

/** Progress bar settle: short spring with no visible bounce. */
export const progressSettleTransition: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 34,
  mass: 0.78,
};
