'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
import { LogoutDialog } from '@/components/layout/LogoutDialog';
import { ThemePicker } from '@/components/layout/ThemePicker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLogout } from '@/lib/hooks/useLogout';
import { isNavItemActive } from '@/lib/utils/navUtils';
import { getDisplayInfo } from '@/lib/utils/userDisplayUtils';
import { primaryNav, analysisNav, planningNav, type NavItem } from '@/lib/constants/navigation';
import {
  Bot,
  Settings,
  LogOut,
  ChevronsUpDown,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

function NavItems({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile } = useSidebar();

  const handleClick = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <SidebarMenu>
      {items.map((item) => {
        const isActive = isNavItemActive(item.href, pathname);
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
              {/* aria-current="page" is on the <a> so screen readers announce the active route */}
              <Link href={item.href} onClick={handleClick} aria-current={isActive ? 'page' : undefined}>
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
  const { user } = useAuth();
  const { isMobile, setOpenMobile, toggleSidebar, state } = useSidebar();
  const { confirmLogout, setConfirmLogout, handleSignOut } = useLogout();
  const pathname = usePathname();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const { displayName, initials } = getDisplayInfo(user);
  const showAssistant = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';
  const isAssistantActive =
    pathname === '/dashboard/assistant' || pathname.startsWith('/dashboard/assistant/');

  return (
    <>
      <Sidebar collapsible="icon">
        {/*
          Header — visible in both desktop and Sheet (tablet landscape / mobile).
          Collapse toggle is desktop-only (hidden desktop:flex).
          Logo+name hides only in desktop icon-collapsed mode via group CSS selector.
        */}
        <SidebarHeader className="p-2">
          <div className="flex items-center gap-1">
            {/* Logo + name */}
            <Link
              href="/dashboard"
              onClick={closeMobile}
              className="flex flex-1 min-w-0 items-center gap-2 rounded-md px-1 py-1 hover:bg-sidebar-accent transition-colors group-data-[state=collapsed]:hidden"
            >
              <div className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                NW
              </div>
              <span className="truncate text-sm font-semibold">Portfolio Tracker</span>
            </Link>
            {/* Collapse/expand toggle — desktop only */}
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleSidebar}
                    className="hidden desktop:flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors group-data-[state=collapsed]:mx-auto"
                  >
                    {state === 'expanded'
                      ? <PanelLeftClose className="size-4" />
                      : <PanelLeftOpen className="size-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {state === 'expanded' ? 'Comprimi sidebar' : 'Espandi sidebar'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </SidebarHeader>

        {/*
          role="navigation" + aria-label turns this <div> into a nav landmark.
          SidebarContent is a plain div in the shadcn primitive; spreading these
          props is the cleanest way to add semantics without modifying the primitive
          or introducing an extra DOM wrapper that would break the flex layout.
        */}
        <SidebarContent role="navigation" aria-label="Navigazione principale">
          {/* Primary routes — no label, acts as visual anchor */}
          <SidebarGroup>
            <SidebarGroupContent>
              <NavItems items={primaryNav} />
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Thin rule separates core navigation from analytical/planning sections */}
          <div className="mx-3 border-t border-sidebar-border" />

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

          {/* AI assistant — full banner when expanded, violet icon square when icon-only */}
          {showAssistant && (
            <SidebarGroup className="mt-2 pb-3">
              <SidebarGroupContent>
                {/* Full banner card — hidden in desktop icon-collapsed mode */}
                <div className="group-data-[state=collapsed]:hidden">
                  <AssistenteBanner onClick={closeMobile} />
                </div>
                {/* Violet rounded icon — desktop icon-collapsed mode only */}
                <div className="hidden group-data-[state=collapsed]:flex justify-center">
                  <Link
                    href="/dashboard/assistant"
                    onClick={closeMobile}
                    title="Assistente AI"
                    className={cn(
                      'flex size-8 items-center justify-center rounded-xl transition-colors duration-150',
                      isAssistantActive
                        ? 'bg-violet-500/25 text-violet-500 dark:text-violet-400'
                        : 'bg-violet-500/15 text-violet-500 dark:text-violet-400 hover:bg-violet-500/25'
                    )}
                  >
                    <Bot className="size-4" />
                  </Link>
                </div>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
        </SidebarContent>

        {/* Footer — SidebarMenuButton size="lg" auto-collapses to avatar-only in icon mode */}
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={displayName}
                    className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <Avatar className="size-8 shrink-0 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 overflow-hidden text-left text-sm leading-tight">
                      <span className="truncate font-medium text-sidebar-foreground">{displayName}</span>
                      {/* text-sidebar-foreground/50: footer sits on --sidebar, not --background */}
                      <span className="truncate text-xs text-sidebar-foreground/50">{user?.email}</span>
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/50" />
                  </SidebarMenuButton>
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
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-sm">Tema</span>
                    <ThemePicker />
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setConfirmLogout(true)}>
                    <LogOut className="size-4" />
                    Esci
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <LogoutDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        onConfirm={handleSignOut}
      />
    </>
  );
}
