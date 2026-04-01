'use client';

/**
 * SAVINGS RATE CELEBRATION BADGE
 *
 * Appears once per browser session when last month's savings rate exceeds the threshold.
 * Auto-dismisses after 3 seconds — no manual close needed.
 *
 * SHOW LOGIC:
 * All conditions must be true:
 * 1. Previous month income > 0 (data available)
 * 2. Savings rate >= SAVINGS_RATE_BADGE_THRESHOLD
 * 3. Today is not the very start of the month (day >= 5) — partial data before that
 * 4. Not already shown this session (sessionStorage flag)
 * 5. User hasn't set prefers-reduced-motion
 *
 * Why sessionStorage over useRef: useRef resets on page reload, but the spec
 * requires "shown at most once per browser session" (survives reload, not just remount).
 * sessionStorage.getItem returns null on new tab/window, matching "per session" semantics.
 *
 * TESTING:
 * To force the badge: open DevTools → Application → Session Storage →
 * delete `savings_rate_badge_shown`, then reload.
 * To lower threshold: change SAVINGS_RATE_BADGE_THRESHOLD temporarily to e.g. 1.
 * To simulate early month: the `italyDay < 5` guard can be temporarily removed.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { getItalyDate, getItalyMonthYear } from '@/lib/utils/dateHelpers';

const SAVINGS_RATE_BADGE_THRESHOLD = 30;
const SESSION_KEY = 'savings_rate_badge_shown';

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

interface SavingsRateBadgeProps {
  previousMonthIncome: number;
  previousMonthExpenses: number;
}

export function SavingsRateBadge({ previousMonthIncome, previousMonthExpenses }: SavingsRateBadgeProps) {
  const [visible, setVisible] = useState(false);
  // Guard against triggering twice within the same component lifecycle
  const triggered = useRef(false);

  const savingsRate = previousMonthIncome > 0
    ? ((previousMonthIncome - previousMonthExpenses) / previousMonthIncome) * 100
    : 0;

  // Derive previous month name from current Italy date
  const { month: currentMonth } = getItalyMonthYear();
  const previousMonthIndex = currentMonth === 1 ? 11 : currentMonth - 2; // 0-indexed
  const previousMonthName = ITALIAN_MONTHS[previousMonthIndex];

  useEffect(() => {
    // prefers-reduced-motion: skip any animated notification entirely
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;

    // Show only if we're past the first few days (early-month data is still partial)
    const italyDay = getItalyDate(new Date()).getDate();
    if (italyDay < 5) return;

    if (previousMonthIncome <= 0) return;
    if (savingsRate < SAVINGS_RATE_BADGE_THRESHOLD) return;

    // One per browser session — survives React remounts and page reloads
    if (sessionStorage.getItem(SESSION_KEY)) return;

    // Prevent double-trigger from React Strict Mode double-effect
    if (triggered.current) return;
    triggered.current = true;

    sessionStorage.setItem(SESSION_KEY, '1');
    setVisible(true);

    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, [previousMonthIncome, savingsRate]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="savings-badge"
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="fixed bottom-4 left-4 z-50 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-lg px-4 py-3 shadow-lg max-w-[280px]"
        >
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
            ✦ Ottimo risparmio a {previousMonthName}!
          </p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">
            Hai risparmiato il {savingsRate.toFixed(0)}% delle entrate
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
