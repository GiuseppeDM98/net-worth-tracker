'use client';

/**
 * FireReachedBanner Component
 *
 * Design Approach — One-Shot Celebration Pattern:
 *
 * The banner appears when currentNetWorth >= fireNumber (and fireNumber > 0).
 * Two independent localStorage keys are used:
 *
 * 1. `celebrated_fire_reached_{userId}` (via celebrationUtils) — tracks whether
 *    the confetti burst has already fired. Confetti runs exactly once per browser,
 *    even if the user dismisses and re-opens the banner later (e.g. after clearing
 *    the dismissed flag).
 *
 * 2. `fire_reached_dismissed_{userId}` — tracks whether the user explicitly closed
 *    the banner. Permanent; never reset automatically.
 *
 * Why separate keys? Confetti is a one-time delight effect. Banner visibility is
 * a user preference (they may want to dismiss it without losing the confetti
 * memory, or vice-versa).
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flame } from 'lucide-react';
import { slideDown } from '@/lib/utils/motionVariants';
import { hasCelebrated, markCelebrated, shouldReduceMotion } from '@/lib/utils/celebrationUtils';

interface FireReachedBannerProps {
  currentNetWorth: number;
  fireNumber: number;
  userId: string;
  /** Formatted EUR strings for display — pre-formatted by caller to keep this component pure */
  currentNetWorthFormatted: string;
  fireNumberFormatted: string;
}

const DISMISS_KEY_PREFIX = 'fire_reached_dismissed_';
const CONFETTI_KEY_PREFIX = 'fire_reached_';

/**
 * Celebratory banner shown when the user's FIRE-adjusted net worth meets or
 * exceeds their FIRE number. Fires a one-shot confetti burst on first view.
 * User can permanently dismiss via the X button.
 */
export function FireReachedBanner({
  currentNetWorth,
  fireNumber,
  userId,
  currentNetWorthFormatted,
  fireNumberFormatted,
}: FireReachedBannerProps) {
  const dismissKey = `${DISMISS_KEY_PREFIX}${userId}`;
  const confettiKey = `${CONFETTI_KEY_PREFIX}${userId}`;

  // Track dismissed state in React so AnimatePresence can animate the exit
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(dismissKey) === 'true';
    } catch {
      return false;
    }
  });

  const isFireReached = currentNetWorth >= fireNumber && fireNumber > 0;

  // Trigger confetti once per browser when banner first becomes visible
  useEffect(() => {
    if (!isFireReached || isDismissed) return;
    if (hasCelebrated(confettiKey)) return;
    if (shouldReduceMotion()) return;

    // Lazy-load canvas-confetti to keep it out of the main bundle
    import('canvas-confetti').then(({ default: confetti }) => {
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.3 },
        colors: ['#10b981', '#34d399', '#6ee7b7', '#fbbf24', '#f59e0b'],
      });
      markCelebrated(confettiKey);
    });
  }, [isFireReached, isDismissed, confettiKey]);

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey, 'true');
    } catch {
      // Silently ignore — losing the dismissed state just means the banner
      // reappears next session, which is acceptable
    }
    setIsDismissed(true);
  };

  const shouldShow = isFireReached && !isDismissed;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          key="fire-reached-banner"
          variants={slideDown}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-green-50 dark:border-emerald-800 dark:from-emerald-950/20 dark:to-green-950/20"
        >
          <div className="flex items-start justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              {/* Flame icon as visual anchor for the FIRE metaphor */}
              <Flame className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div>
                <h3 className="text-base font-semibold text-emerald-900 dark:text-emerald-100">
                  Obiettivo FIRE Raggiunto! 🔥
                </h3>
                <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
                  Il tuo patrimonio attuale di{' '}
                  <span className="font-semibold">{currentNetWorthFormatted}</span> ha raggiunto o
                  superato il tuo FIRE Number di{' '}
                  <span className="font-semibold">{fireNumberFormatted}</span>.
                  Hai raggiunto la Financial Independence!
                </p>
              </div>
            </div>

            {/* Dismiss button — permanently hides the banner for this user/browser */}
            <button
              onClick={handleDismiss}
              aria-label="Chiudi banner FIRE raggiunto"
              className="shrink-0 rounded-md p-1 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
