'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, Receipt, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { motion } from 'framer-motion';
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
  '/dashboard/allocation',
  '/dashboard/performance',
  '/dashboard/history',
  ...(process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' ? ['/dashboard/assistant'] : []),
  '/dashboard/hall-of-fame',
  '/dashboard/fire-simulations',
  '/dashboard/settings',
];

const activeClass = 'text-sidebar-foreground';
const inactiveClass =
  'text-sidebar-foreground/55 hover:text-sidebar-foreground';

export function BottomNavigation() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isAltroActive = secondaryHrefs.some(
    (href) => pathname === href || pathname.startsWith(href + '/')
  );

  return (
    <>
      <nav
        className="fixed z-30 desktop:hidden max-desktop:portrait:flex max-desktop:landscape:hidden rounded-full left-1/2 -translate-x-1/2"
        style={{
          background: 'var(--sidebar)',
          border: '1px solid var(--sidebar-border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.28)',
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
                className={cn(
                  'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
                  isActive ? activeClass : inactiveClass
                )}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-pill"
                    className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                    transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                  />
                )}
                <item.icon className="relative z-10 h-5 w-5" />
                <span className="relative z-10 text-[11px] font-medium leading-none">{item.name}</span>
              </Link>
            );
          })}

          <button
            onClick={() => setDrawerOpen(true)}
            className={cn(
              'relative flex flex-col items-center justify-center gap-1 rounded-full px-3 py-2 transition-colors',
              isAltroActive ? activeClass : inactiveClass
            )}
          >
            {isAltroActive && (
              <motion.div
                layoutId="active-pill"
                className="absolute inset-0 rounded-full bg-[var(--sidebar-foreground)]/[0.12]"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
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
