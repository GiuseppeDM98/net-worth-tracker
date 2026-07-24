import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  BarChart3,
  PieChart,
  TrendingUp,
  CalendarRange,
  Trophy,
  Flame,
  PiggyBank,
} from 'lucide-react';

export type NavItem = {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

// Primary routes — shown in Sidebar (top group) and BottomNavigation main tabs.
export const primaryNav: NavItem[] = [
  { name: 'Panoramica', href: '/dashboard',          icon: LayoutDashboard },
  { name: 'Patrimonio', href: '/dashboard/assets',   icon: Wallet          },
  { name: 'Cashflow',   href: '/dashboard/cashflow', icon: ArrowRightLeft  },
];

// Analysis routes — Sidebar "Analisi" group and SecondaryMenuDrawer.
export const analysisNav: NavItem[] = [
  { name: 'Analisi',      href: '/dashboard/analisi',      icon: BarChart3     },
  { name: 'Rendimenti',   href: '/dashboard/performance',  icon: TrendingUp    },
  { name: 'Storico',      href: '/dashboard/history',      icon: CalendarRange },
  { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy        },
];

// Planning routes — Sidebar "Pianificazione" group and SecondaryMenuDrawer.
// Allocazione is here (not Analisi) because it has action chips — it's a rebalancing
// tool, not a read-only stat view.
export const planningNav: NavItem[] = [
  { name: 'Allocazione',        href: '/dashboard/allocation',       icon: PieChart  },
  { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame     },
  { name: 'Previdenza',         href: '/dashboard/pension',          icon: PiggyBank },
];

// All secondary hrefs — used by BottomNavigation to determine "Altro" active state.
export const secondaryHrefs: string[] = [
  ...analysisNav.map((i) => i.href),
  ...planningNav.map((i) => i.href),
  '/dashboard/assistant',
  '/dashboard/settings',
];
