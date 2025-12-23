'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PieChart, History, Trophy, Flame, Settings, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const secondaryNavigation = [
  { name: 'Allocation', href: '/dashboard/allocation', icon: PieChart },
  { name:'Performance', href: '/dashboard/performance', icon: TrendingUp },
  { name: 'History', href: '/dashboard/history', icon: History },
  { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy },
  { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface SecondaryMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SecondaryMenuDrawer({ open, onOpenChange }: SecondaryMenuDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();

  const handleNavigation = (href: string) => {
    router.push(href);
    onOpenChange(false); // Close drawer dopo navigazione
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
