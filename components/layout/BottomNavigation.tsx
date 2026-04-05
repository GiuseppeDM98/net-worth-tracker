'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Wallet, Receipt, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { SecondaryMenuDrawer } from './SecondaryMenuDrawer';

// WARNING: If you add/remove navigation items here, also update:
// - Sidebar.tsx (9 total items including these 3 primary routes)
// - SecondaryMenuDrawer.tsx (6 secondary items in navigationGroups)
// Primary routes (bottom nav): Panoramica, Patrimonio, Cashflow
// These were chosen as the most frequently accessed pages for quick mobile access.
const primaryNavigation = [
  { name: 'Panoramica', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Patrimonio', href: '/dashboard/assets', icon: Wallet },
  // Cashflow: established financial term used as-is in Italian finance
  { name: 'Cashflow', href: '/dashboard/cashflow', icon: Receipt },
];

// Secondary routes are in the drawer; when the user is on one, the Altro button
// should reflect that so they always know where they are in the app.
const secondaryHrefs = [
  '/dashboard/allocation',
  '/dashboard/performance',
  '/dashboard/history',
  '/dashboard/assistant',
  '/dashboard/hall-of-fame',
  '/dashboard/fire-simulations',
  '/dashboard/settings',
];

/**
 * Bottom tab navigation bar exclusively for mobile portrait mode.
 *
 * Responsive behavior:
 * - Desktop (≥1440px): Hidden (uses Sidebar instead)
 * - Mobile landscape (<1440px + landscape): Hidden (uses Sidebar with hamburger menu)
 * - Mobile portrait (<1440px + portrait): Visible (this component)
 *
 * Navigation structure:
 * - 3 primary routes: Overview, Assets, Cashflow (most frequently accessed)
 * - 1 "Altro" button: Opens SecondaryMenuDrawer with 7 additional routes grouped
 *   by information architecture (Analisi, Pianificazione, Preferenze)
 * - Total 10 routes accessible: 3 direct + 7 via drawer
 * - "Altro" button shows active state when current route is any secondary route,
 *   so users always have a visual cue of where they are in the app
 *
 * Why these 3 primary routes?
 * Overview: Dashboard landing page - users check this most frequently
 * Assets: Portfolio management - core functionality
 * Cashflow: Income/expense tracking - frequently updated
 *
 * Z-index layering:
 * - z-30 (BottomNavigation): Above page content
 * - z-40 (SecondaryMenuDrawer): Above bottom nav when open
 * - z-50 (Sidebar overlay): Above all when open on mobile landscape
 *
 * Fixed height of 64px (h-16) to match Header for consistent spacing.
 *
 * @returns Bottom navigation bar component with drawer for additional routes
 */
export function BottomNavigation() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAltroActive = secondaryHrefs.some(
    (href) => pathname === href || pathname.startsWith(href + '/')
  );

  return (
    <>
      {/* Bottom Navigation Bar - Visible only on mobile portrait.
          Custom Tailwind modifiers combine screen size and orientation:
          - max-desktop:portrait: = @media (max-width: 1439px) and (orientation: portrait)
          - max-desktop:landscape:hidden = hide on landscape even if < 1440px */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-background border-t border-border desktop:hidden max-desktop:portrait:flex max-desktop:landscape:hidden">
        <div className="flex items-center justify-around w-full h-16">
          {primaryNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              // relative positioning anchors the per-tab top-border indicator.
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'relative flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors',
                  isActive
                    ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                {/* Per-tab fade-in indicator — no layoutId here.
                    layoutId requires DOM layout measurement, which breaks inside
                    fixed containers because Framer Motion's coordinate math
                    relative to the offset parent produces incorrect transforms. */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      key="indicator"
                      initial={{ opacity: 0, scaleX: 0.5 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      exit={{ opacity: 0, scaleX: 0.5 }}
                      transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                      className="absolute top-0 left-0 right-0 h-0.5 bg-blue-600 origin-center"
                    />
                  )}
                </AnimatePresence>
                <item.icon className="h-6 w-6" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}

          {/* Altro button: active when current route is any secondary (drawer) route.
              MoreHorizontal (three dots) is the universal "more items" affordance;
              Menu (hamburger) implies a top-level app menu which is semantically wrong here. */}
          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'relative flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors',
              isAltroActive
                ? 'text-blue-600 bg-blue-50 dark:bg-blue-950/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            )}
          >
            <AnimatePresence>
              {isAltroActive && (
                <motion.div
                  key="indicator"
                  initial={{ opacity: 0, scaleX: 0.5 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  exit={{ opacity: 0, scaleX: 0.5 }}
                  transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
                  className="absolute top-0 left-0 right-0 h-0.5 bg-blue-600 origin-center"
                />
              )}
            </AnimatePresence>
            <MoreHorizontal className="h-6 w-6" />
            <span className="font-medium">Altro</span>
          </button>
        </div>
      </nav>

      {/* Secondary Menu Drawer */}
      <SecondaryMenuDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
      />
    </>
  );
}
