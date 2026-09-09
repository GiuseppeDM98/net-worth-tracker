'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { motion, MotionConfig } from 'framer-motion';
import { PageVerdict } from '@/components/ui/page-verdict';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { cardItem, staggerContainer } from '@/lib/utils/motionVariants';
import type { PageVerdictModel } from '@/lib/utils/narrative';

interface AuthShellProps {
  verdict: PageVerdictModel;
  /** What the verdict is about, for the section's accessible name. */
  verdictAriaLabel: string;
  /** The one secondary path off this page ("Non hai un account? Registrati"). */
  footer: { question: string; linkLabel: string; href: string };
  /** The page's single tile: the form. */
  children: ReactNode;
}

/**
 * The frame both authentication pages share: the cadence of a redesigned page compressed
 * into one 420px column — eyebrow, verdict, ONE tile, the secondary link.
 *
 * There is no 12-column grid here because there is nothing to lay out on it: a form is one
 * tile, and a grid of one cell is a grid pretending. Everything is left-aligned like the
 * rest of the app, so the column reads as a page and not as a modal.
 *
 * These routes sit outside the dashboard layout, so they carry their own `MotionConfig`
 * (AGENTS.md → Motion: reduced-motion is propagated at the layout root, and this is theirs).
 */
export function AuthShell({ verdict, verdictAriaLabel, footer, children }: AuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* The hairline the app's page headers use as their separator — the only chrome above
          the verdict, so nothing competes with the first sentence. */}
      <div className="h-px w-full bg-border" />

      <div className="flex justify-end px-4 pt-2 desktop:px-6 desktop:pt-2.5">
        <ThemePicker />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-10 desktop:px-6 desktop:pb-14">
        <MotionConfig reducedMotion="user">
          <motion.div
            className="flex w-full max-w-[420px] flex-col"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.div variants={cardItem} className="flex flex-col gap-3">
              <p className={TILE_EYEBROW_CLASS}>Portfolio Tracker</p>
              <PageVerdict verdict={verdict} ariaLabel={verdictAriaLabel} />
            </motion.div>

            <motion.div variants={cardItem} className="mt-6 flex flex-col">
              {children}
            </motion.div>

            <motion.p variants={cardItem} className="mt-4 text-sm text-muted-foreground">
              {footer.question}{' '}
              <Link
                href={footer.href}
                className="font-medium text-foreground underline underline-offset-4 transition-colors hover:text-foreground/70 motion-reduce:transition-none"
              >
                {footer.linkLabel}
              </Link>
            </motion.p>
          </motion.div>
        </MotionConfig>
      </div>
    </div>
  );
}

/**
 * The rule between the form's own submit and the third-party ways in. The word takes the
 * app's one eyebrow so the divider reads as a label of the group below it, not as a third
 * type size inside the tile (DESIGN.md → The One-Eyebrow Rule).
 */
export function AuthDivider() {
  return (
    <div className="mt-5 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className={TILE_EYEBROW_CLASS}>oppure</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
