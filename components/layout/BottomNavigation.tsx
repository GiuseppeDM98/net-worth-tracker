'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, Receipt, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { SecondaryMenuDrawer } from './SecondaryMenuDrawer';

// WARNING: If you add/remove navigation items here, also update:
// - Sidebar.tsx (9 total items including these 3 primary routes)
// - SecondaryMenuDrawer.tsx (6 secondary items)
// Primary routes (bottom nav): Overview, Assets, Cashflow
// These were chosen as the most frequently accessed pages for quick mobile access.
const primaryNavigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Assets', href: '/dashboard/assets', icon: Wallet },
  { name: 'Cashflow', href: '/dashboard/cashflow', icon: Receipt },
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
 * - 1 menu button: Opens SecondaryMenuDrawer with 6 additional routes
 * - Total 9 routes accessible: 3 direct + 6 via drawer
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

  return (
    <>
      {/* Bottom Navigation Bar - Visible only on mobile portrait.
          Custom Tailwind modifiers combine screen size and orientation:
          - max-desktop:portrait: = @media (max-width: 1439px) and (orientation: portrait)
          - max-desktop:landscape:hidden = hide on landscape even if < 1440px */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 desktop:hidden max-desktop:portrait:flex max-desktop:landscape:hidden">
        <div className="flex items-center justify-around w-full h-16">
          {primaryNavigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs transition-colors',
                  isActive
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                )}
              >
                <item.icon className="h-6 w-6" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}

          {/* Menu Button */}
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full gap-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
          >
            <Menu className="h-6 w-6" />
            <span className="font-medium">Menu</span>
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
