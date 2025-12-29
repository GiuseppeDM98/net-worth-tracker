'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Wallet, Receipt, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { SecondaryMenuDrawer } from './SecondaryMenuDrawer';

const primaryNavigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Assets', href: '/dashboard/assets', icon: Wallet },
  { name: 'Cashflow', href: '/dashboard/cashflow', icon: Receipt },
];

export function BottomNavigation() {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      {/* Bottom Navigation Bar - Solo mobile portrait */}
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
