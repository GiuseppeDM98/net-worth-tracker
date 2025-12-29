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

export function Sidebar({ isOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();

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

  const handleLinkClick = () => {
    // Close sidebar on mobile after navigation
    if (onClose && window.innerWidth < 1024) {
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
