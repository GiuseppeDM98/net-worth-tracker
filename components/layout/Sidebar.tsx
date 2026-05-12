'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AssistenteBanner } from '@/components/layout/AssistenteBanner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Wallet,
  PieChart,
  History,
  Receipt,
  Flame,
  Trophy,
  TrendingUp,
  Settings,
  LogOut,
  MoreVertical,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

// Primary routes — appear unlabeled at the top of the sidebar and as the 3 main
// tabs in BottomNavigation. If you change these, update BottomNavigation.tsx too.
const primaryNav = [
  { name: 'Panoramica', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Patrimonio', href: '/dashboard/assets', icon: Wallet },
  { name: 'Cashflow', href: '/dashboard/cashflow', icon: Receipt },
];

// Analysis routes — also in SecondaryMenuDrawer under "Analisi".
const analysisNav = [
  { name: 'Allocazione', href: '/dashboard/allocation', icon: PieChart },
  { name: 'Rendimenti', href: '/dashboard/performance', icon: TrendingUp },
  { name: 'Storico', href: '/dashboard/history', icon: History },
  { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy },
];

// Planning routes — also in SecondaryMenuDrawer under "Pianificazione".
const planningNav = [
  { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame },
];

function NavItems({ items }: { items: typeof primaryNav }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive =
          item.href === '/dashboard'
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + '/');
        return (
          <SidebarMenuItem key={item.name}>
            {isActive && (
              <motion.div
                layoutId="sidebar-active-pill"
                className="absolute inset-0 rounded-md bg-sidebar-accent"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
            <SidebarMenuButton
              asChild
              isActive={isActive}
              tooltip={item.name}
              className="relative z-10 data-[active=true]:bg-transparent"
            >
              <Link href={item.href} onClick={handleClick}>
                <item.icon />
                <span>{item.name}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { isMobile, setOpenMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Logout effettuato con successo');
      router.push('/login');
    } catch {
      toast.error('Errore durante il logout');
    }
  };

  const displayName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const initials = user?.displayName
    ? user.displayName.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
    : (user?.email?.[0].toUpperCase() ?? '?');

  return (
    <>
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" onClick={closeMobile}>
                <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                  NW
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">Portfolio Tracker</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Primary routes — no label, acts as visual anchor */}
        <SidebarGroup>
          <SidebarGroupContent>
            <NavItems items={primaryNav} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Analysis routes */}
        <SidebarGroup>
          <SidebarGroupLabel>Analisi</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={analysisNav} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Planning routes */}
        <SidebarGroup>
          <SidebarGroupLabel>Pianificazione</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={planningNav} />
          </SidebarGroupContent>
        </SidebarGroup>

      </SidebarContent>

      <SidebarFooter>
        {process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' && (
          <AssistenteBanner onClick={closeMobile} />
        )}
        <SidebarMenu className={process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' ? 'mt-[22px]' : undefined}>
          <SidebarMenuItem>
            <div className="flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1.5">
              <Avatar className="size-8 shrink-0 rounded-lg">
                <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 overflow-hidden text-left text-sm leading-tight">
                <span className="truncate font-medium text-sidebar-foreground">{displayName}</span>
                <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground">
                    <MoreVertical className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-52">
                  <DropdownMenuGroup>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard/settings" onClick={closeMobile}>
                        <Settings className="size-4" />
                        Impostazioni
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                    Preferenze
                  </DropdownMenuLabel>
                  {/* Theme selector — plain div so clicking buttons doesn't close the menu */}
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-sm">Tema</span>
                    <div className="flex items-center gap-0.5 rounded-md border bg-muted/50 p-0.5">
                      {([
                        { value: 'system', icon: Monitor, label: 'Sistema' },
                        { value: 'light',  icon: Sun,     label: 'Chiaro'  },
                        { value: 'dark',   icon: Moon,    label: 'Scuro'   },
                      ] as const).map(({ value, icon: Icon, label }) => (
                        <button
                          key={value}
                          onClick={() => setTheme(value)}
                          title={label}
                          className={cn(
                            'flex size-6 items-center justify-center rounded transition-colors',
                            theme === value
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground'
                          )}
                        >
                          <Icon className="size-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConfirmLogout(true)}>
                    <LogOut className="size-4" />
                    Esci
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>

    <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Esci dall&apos;account?</AlertDialogTitle>
          <AlertDialogDescription>
            Verrai disconnesso da questo dispositivo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction onClick={handleSignOut}>Esci</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
