'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, Receipt, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SecondaryMenuDrawer } from './SecondaryMenuDrawer';
import { isNavItemActive } from '@/lib/utils/navUtils';

// WARNING: If you add/remove navigation items here, also update:
// - Sidebar.tsx (primaryNav array)
// - SecondaryMenuDrawer.tsx (navigationGroups)
const primaryNavigation = [
  { name: 'Panoramica', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Patrimonio', href: '/dashboard/assets', icon: Wallet },
  { name: 'Cashflow', href: '/dashboard/cashflow', icon: Receipt },
];

const secondaryHrefs = [
  // Statistiche
  '/dashboard/analisi',
  '/dashboard/performance',
  '/dashboard/history',
  '/dashboard/hall-of-fame',
  // Pianificazione
  '/dashboard/allocation',
  '/dashboard/fire-simulations',
  // Other
  ...(process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' ? ['/dashboard/assistant'] : []),
  '/dashboard/settings',
];

const activeClass = 'text-sidebar-foreground';
const inactiveClass =
  'text-sidebar-foreground/55 hover:text-sidebar-foreground';

export function BottomNavigation() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Framer Motion's hook reads prefers-reduced-motion from the OS.
  // Matches the pattern used in AssistantStreamingResponse, AssistantMemoryPanel, etc.
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
      {/*
        aria-label distinguishes this landmark from the desktop sidebar <nav>
        when a screen reader lists navigation regions on the page.
      */}
      <nav
        aria-label="Navigazione mobile"
        className="fixed z-30 desktop:hidden max-desktop:portrait:flex max-desktop:landscape:hidden rounded-full left-1/2 -translate-x-1/2"
        style={{
          background: 'var(--sidebar)',
          border: '1px solid var(--sidebar-border)',
          // color-mix keeps the shadow tinted to the sidebar foreground rather
          // than using a hardcoded black that looks off on warm themes.
          boxShadow: '0 4px 24px color-mix(in oklch, var(--sidebar-foreground) 22%, transparent)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        }}
      >
        <div className="flex items-center gap-1 px-2 py-1.5">
          {primaryNavigation.map((item) => {
            const isActive = isNavItemActive(item.href, pathname);
            return (
              <Link
                key={item.name}
                href={item.href}
                // aria-current="page" mirrors the pattern in Sidebar.tsx (line 109)
                // and lets screen readers announce the active route.
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
                  isActive ? activeClass : inactiveClass
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                    transition={pillTransition}
                  />
                )}
                <item.icon className="relative z-10 h-5 w-5" />
                <span className="relative z-10 text-[11px] font-medium leading-none">{item.name}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setDrawerOpen(true)}
            // aria-haspopup="dialog" signals that this button opens an overlay.
            // aria-expanded lets AT announce whether the drawer is currently open.
            // aria-current="page" matches the pattern on primary nav links when
            // the user is on a secondary route reachable through this button.
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-current={isAltroActive ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
              isAltroActive ? activeClass : inactiveClass
            )}
          >
            {isAltroActive && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                transition={pillTransition}
              />
            )}
            <MoreHorizontal className="relative z-10 h-5 w-5" />
            <span className="relative z-10 text-[11px] font-medium leading-none">Altro</span>
          </button>
        </div>
      </nav>

      <SecondaryMenuDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
    </>
  );
}
