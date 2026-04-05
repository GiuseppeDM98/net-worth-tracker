'use client';

import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PieChart, History, Trophy, Flame, Settings, TrendingUp, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawerContainer, drawerItem } from '@/lib/utils/motionVariants';

// WARNING: If you add/remove navigation items here, also update:
// - Sidebar.tsx (10 total items including these 7 secondary routes)
// - BottomNavigation.tsx (secondaryHrefs array must match all hrefs in navigationGroups)
//
// Secondary routes are grouped by information architecture:
// Analisi = analytical/reporting views, Pianificazione = forward-looking simulation,
// Preferenze = non-financial settings. All 7 routes also appear in Sidebar.

// Groups reflect the app's information architecture.
// Singleton groups (Pianificazione, Preferenze) are intentional:
// FIRE e Simulazioni is architecturally distinct from analytical views,
// and Impostazioni is always separated from content sections.
const navigationGroups = [
  {
    label: 'Analisi',
    items: [
      { name: 'Allocazione', href: '/dashboard/allocation', icon: PieChart },
      { name: 'Rendimenti', href: '/dashboard/performance', icon: TrendingUp },
      { name: 'Storico', href: '/dashboard/history', icon: History },
      { name: 'Assistente AI', href: '/dashboard/assistant', icon: Bot },
      // Hall of Fame: kept in English as an intentional premium brand choice
      { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy },
    ],
  },
  {
    label: 'Pianificazione',
    items: [
      // FIRE: acronym (Financial Independence, Retire Early) — intentional hybrid
      { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame },
    ],
  },
  {
    label: 'Preferenze',
    items: [
      { name: 'Impostazioni', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

interface SecondaryMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Bottom sheet drawer for secondary navigation routes on mobile portrait.
 *
 * Relationship to other navigation components:
 * - Opened by: BottomNavigation "Altro" button
 * - Complements: 3 primary routes in BottomNavigation (Overview, Assets, Cashflow)
 * - Duplicates: All 7 routes also in Sidebar (for desktop/landscape consistency)
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
 * - Routes are grouped with eyebrow labels (Analisi, Pianificazione, Preferenze)
 *   to communicate the app's information architecture at a glance
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
          <SheetTitle>Altro</SheetTitle>
        </SheetHeader>
        {/* Staggered entrance: each group staggers its items as the sheet opens.
            drawerContainer/drawerItem live in motionVariants for consistency. */}
        <motion.nav
          className="mt-4 space-y-4"
          variants={drawerContainer}
          initial="hidden"
          animate="visible"
        >
          {navigationGroups.map((group) => (
            <div key={group.label}>
              <motion.p
                variants={drawerItem}
                className="px-4 mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60"
              >
                {group.label}
              </motion.p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <motion.button
                      key={item.name}
                      variants={drawerItem}
                      onClick={() => handleNavigation(item.href)}
                      className={cn(
                        'flex items-center gap-3 w-full rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.name}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          ))}
        </motion.nav>
      </SheetContent>
    </Sheet>
  );
}
