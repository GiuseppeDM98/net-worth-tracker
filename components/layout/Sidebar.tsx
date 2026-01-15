'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Wallet,
  PieChart,
  History,
  Settings,
  Receipt,
  BarChart3,
  Flame,
  Trophy,
  Dices,
  TrendingUp,
} from 'lucide-react';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

/**
 * Main navigation sidebar for the dashboard.
 *
 * Responsive behavior (progressive enhancement approach):
 * - Desktop (≥1440px): Always visible, fixed width 256px (w-64), positioned relative
 * - Mobile landscape (<1440px + landscape): Slide-in overlay (fixed, z-50) controlled by isOpen prop
 * - Mobile portrait (<1440px + portrait): Hidden (uses BottomNavigation instead)
 *
 * Navigation architecture:
 * - 9 total routes in this sidebar
 * - 6 of these also appear in SecondaryMenuDrawer (Allocation, Performance, History, Hall of Fame, FIRE, Settings)
 * - 3 are unique to Sidebar: Overview, Assets, Cashflow
 * - Mobile portrait gets 3 primary routes in BottomNavigation + 6 secondary in drawer
 *
 * Custom Tailwind breakpoints:
 * - `desktop:` = @media (min-width: 1440px)
 * - `max-desktop:` = @media (max-width: 1439px)
 * - `landscape:` and `portrait:` = orientation modifiers
 *
 * @param isOpen - Controls sidebar visibility on mobile landscape (ignored on desktop)
 * @param onClose - Callback to close sidebar, called after navigation on mobile
 */
export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  // WARNING: If you add/remove navigation items here, also update:
  // - SecondaryMenuDrawer.tsx (6 secondary items: Allocation, Performance, History, Hall of Fame, FIRE, Settings)
  // - BottomNavigation.tsx (3 primary items: Overview, Assets, Cashflow)
  // Total navigation: 9 routes (this sidebar contains all 9)
  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Assets', href: '/dashboard/assets', icon: Wallet },
    { name: 'Allocation', href: '/dashboard/allocation', icon: PieChart },
    { name: 'Performance', href: '/dashboard/performance', icon: TrendingUp },
    { name: 'History', href: '/dashboard/history', icon: History },
    { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy },
    { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame },
    { name: 'Cashflow', href: '/dashboard/cashflow', icon: Receipt },
    { name: 'Settings', href: '/dashboard/settings', icon: Settings },
  ];

  /**
   * Auto-closes sidebar on mobile landscape after navigation.
   *
   * Why 1440px threshold?
   * Matches the Tailwind `desktop:` breakpoint defined in tailwind.config.ts.
   * On smaller screens, close the overlay sidebar after navigation to free up
   * screen space and show the selected page content.
   *
   * Desktop view keeps sidebar open for persistent navigation.
   */
  const handleLinkClick = () => {
    if (onClose && window.innerWidth < 1440) {
      onClose();
    }
  };

  return (
    <div
      className={cn(
        'flex h-full w-64 flex-col bg-gray-900 text-white transition-transform duration-300 ease-in-out',
        // Desktop (≥desktop): sempre relativo, sempre visibile
        'desktop:relative desktop:translate-x-0',
        // Mobile landscape SOLO (< desktop + landscape): fixed, slide in/out
        'max-desktop:landscape:fixed max-desktop:landscape:inset-y-0 max-desktop:landscape:left-0 max-desktop:landscape:z-50',
        // Mobile portrait SOLO (< desktop + portrait): nascosta
        'max-desktop:portrait:hidden',
        // Show/hide su mobile landscape
        isOpen ? 'translate-x-0' : 'max-desktop:landscape:-translate-x-full'
      )}
    >
      {/* Desktop header (hidden on mobile since we show it in the hamburger menu bar) */}
      <div className="hidden desktop:flex h-16 items-center px-6">
        <h1 className="text-xl font-bold">Portfolio Tracker</h1>
      </div>

      {/* Mobile header */}
      <div className="flex desktop:hidden h-16 items-center px-6 border-b border-gray-800">
        <h1 className="text-xl font-bold">Portfolio Tracker</h1>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={handleLinkClick}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
