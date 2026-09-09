'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { MoreHorizontal, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Suspense, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { SecondaryMenuDrawer } from './SecondaryMenuDrawer';
import { isNavItemActive } from '@/lib/utils/navUtils';
import { primaryNav, secondaryHrefs } from '@/lib/constants/navigation';

const BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 12px)';
const PILL_STYLE = {
  background: 'var(--sidebar)',
  border: '1px solid var(--sidebar-border)',
  boxShadow: '0 4px 24px rgba(0,0,0,0.28)',
};

/**
 * The «+» that adds an expense. It belongs to Cashflow › Tracciamento and nowhere else: on
 * Dividendi and Budget the tab's own add button sits under the verdict, and a FAB that still
 * added an EXPENSE there read as the tab's add affordance. The tab is the URL's `?tab=`
 * (the Cashflow page canonicalises it on mount), absent = Tracciamento.
 */
function AddExpenseFab({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams();
  const isOnCashflow = pathname === '/dashboard/cashflow' || pathname.startsWith('/dashboard/cashflow/');
  const tab = searchParams.get('tab');
  const isOnTracciamento = isOnCashflow && (tab === null || tab === 'tracking');

  return (
    <AnimatePresence mode="popLayout">
      {isOnTracciamento && (
        <motion.button
          type="button"
          aria-label="Aggiungi nuova voce"
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.6, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          onClick={() => window.dispatchEvent(new CustomEvent('cashflow:add-expense'))}
          className="flex size-14 flex-none items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
        >
          <Plus className="size-5" aria-hidden="true" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}

export function BottomNavigation() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Framer Motion's hook reads prefers-reduced-motion from the OS.
  const prefersReducedMotion = useReducedMotion();

  const isAltroActive = secondaryHrefs.some(
    (href) => pathname === href || pathname.startsWith(href + '/')
  );
  // Zero-duration transition disables the sliding-pill animation for users
  // who have requested reduced motion at the OS level.
  const pillTransition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 400, damping: 35 };

  return (
    <>
      {/* Full-width fixed container: inner flex group is centered.
          aria-label on motion.nav distinguishes this landmark from the
          desktop sidebar <nav> when a screen reader lists nav regions. */}
      <div
        className="fixed z-30 left-0 right-0 desktop:hidden max-desktop:portrait:flex max-desktop:landscape:hidden items-center justify-center"
        style={{ bottom: BOTTOM }}
      >
        <div className="flex items-center gap-2">
          {/* Nav pill — layout-animates its position when the "+" FAB appears */}
          <motion.nav
            layout
            aria-label="Navigazione principale"
            className="flex rounded-full"
            style={PILL_STYLE}
            transition={pillTransition}
          >
            <div className="flex items-center gap-1 px-2 py-1.5">
              {primaryNav.map((item) => {
                const isActive = isNavItemActive(item.href, pathname);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
                      isActive
                        ? 'text-sidebar-foreground'
                        : 'text-sidebar-foreground/55 hover:text-sidebar-foreground'
                    )}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="bottom-nav-active-pill"
                        className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                        transition={pillTransition}
                      />
                    )}
                    <item.icon className="relative z-10 h-5 w-5" aria-hidden="true" />
                    <span className="relative z-10 text-[11px] font-medium leading-none">{item.name}</span>
                  </Link>
                );
              })}

              <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={drawerOpen}
                aria-current={isAltroActive ? 'page' : undefined}
                onClick={() => setDrawerOpen(true)}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
                  isAltroActive
                    ? 'text-sidebar-foreground'
                    : 'text-sidebar-foreground/55 hover:text-sidebar-foreground'
                )}
              >
                {isAltroActive && (
                  <motion.div
                    layoutId="bottom-nav-active-pill"
                    className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                    transition={pillTransition}
                  />
                )}
                <MoreHorizontal className="relative z-10 h-5 w-5" aria-hidden="true" />
                <span className="relative z-10 text-[11px] font-medium leading-none">Altro</span>
              </button>
            </div>
          </motion.nav>

          {/* Add expense button — the Tracciamento tab only, matches pill height. Its own
              component because `useSearchParams` wants a Suspense boundary in a layout. */}
          <Suspense fallback={null}>
            <AddExpenseFab pathname={pathname} />
          </Suspense>
        </div>
      </div>

      <SecondaryMenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
