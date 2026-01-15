'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PieChart, History, Trophy, Flame, Settings, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

// WARNING: If you add/remove navigation items here, also update:
// - Sidebar.tsx (9 total items including these 6 secondary routes)
// - BottomNavigation.tsx (3 primary routes: Overview, Assets, Cashflow)
//
// Secondary routes (drawer menu): Allocation, Performance, History, Hall of Fame, FIRE, Settings
// These are less frequently accessed pages compared to the 3 primary bottom nav routes.
// All 6 routes also appear in Sidebar for desktop/landscape users.
const secondaryNavigation = [
  { name: 'Allocation', href: '/dashboard/allocation', icon: PieChart },
  { name: 'Performance', href: '/dashboard/performance', icon: TrendingUp },
  { name: 'History', href: '/dashboard/history', icon: History },
  { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy },
  { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface SecondaryMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Bottom sheet drawer for secondary navigation routes on mobile portrait.
 *
 * Relationship to other navigation components:
 * - Opened by: BottomNavigation menu button
 * - Complements: 3 primary routes in BottomNavigation (Overview, Assets, Cashflow)
 * - Duplicates: All 6 routes also in Sidebar (for desktop/landscape consistency)
 *
 * Why these 6 routes are "secondary"?
 * They are accessed less frequently than the 3 primary routes in BottomNavigation.
 * The primary routes (Overview, Assets, Cashflow) are core daily-use pages,
 * while secondary routes (analytics, history, settings) are accessed occasionally.
 *
 * UI implementation:
 * - Uses Shadcn Sheet component for bottom drawer
 * - Slides up from bottom with backdrop overlay
 * - Max height 80vh (80% of viewport) to prevent covering entire screen
 * - Auto-closes after navigation to free up screen space
 *
 * @param open - Controls drawer visibility
 * @param onOpenChange - Callback to update open state (from BottomNavigation)
 */
export function SecondaryMenuDrawer({ open, onOpenChange }: SecondaryMenuDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();

  /**
   * Handles navigation to a route and closes the drawer.
   *
   * Why use router.push() with buttons instead of Link components?
   * Allows us to close the drawer immediately after navigation is triggered,
   * providing better UX by clearing the overlay before the new page loads.
   */
  const handleNavigation = (href: string) => {
    router.push(href);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-auto max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav className="mt-4 space-y-1">
          {secondaryNavigation.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <button
                key={item.name}
                onClick={() => handleNavigation(item.href)}
                className={cn(
                  'flex items-center gap-3 w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.name}
              </button>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
