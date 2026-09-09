'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
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
import { LogoutDialog } from '@/components/layout/LogoutDialog';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { SIDEBAR_AVATAR_CLASS } from '@/components/layout/shellStyles';
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
import { getAccountLabel, getDisplayInfo } from '@/lib/utils/userDisplayUtils';
import {
  primaryNav,
  analysisNav,
  planningNav,
  assistantNavItem,
  type NavItem,
} from '@/lib/constants/navigation';
import { Settings, LogOut, ChevronsUpDown, PanelLeftClose, PanelLeftOpen, Check, Users } from 'lucide-react';

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

/**
 * The desktop sidebar (and the Sheet it becomes below 1440px). Chrome is kept to what
 * separates: a wordmark, three groups of routes with the tiles' eyebrow as group label, one
 * hairline before the assistant, the account at the bottom. The active route is the only
 * highlighted surface and it is `--sidebar-accent` — no hue in the navigation of the default
 * theme (DESIGN.md → The Zero-Chroma Rule). Collapsed to the icon rail every target is 44px.
 */
export function AppSidebar() {
  const { user } = useAuth();
  const { ownerId, accessibleAccounts, switchAccount, isSharedView } =
    useActiveAccount();
  const { isMobile, setOpenMobile, toggleSidebar, state } = useSidebar();
  const { confirmLogout, setConfirmLogout, handleSignOut } = useLogout();

  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const { displayName, initials } = getDisplayInfo(user);
  const activeAccount = accessibleAccounts.find((a) => a.ownerId === ownerId);

  const showAssistant = process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false';

  return (
    <>
      <Sidebar collapsible="icon">
        {/*
          Header — visible in both desktop and Sheet (tablet landscape / mobile).
          Collapse toggle is desktop-only (hidden desktop:flex); in the icon rail it is the
          only thing left and grows to the rail's 44px target.
          The wordmark hides only in desktop icon-collapsed mode via group CSS selector.
        */}
        <SidebarHeader>
          <div className="flex items-center gap-1">
            <Link
              href="/dashboard"
              onClick={closeMobile}
              className="flex h-8 flex-1 min-w-0 items-center rounded-md px-2 text-[13px] font-semibold tracking-[-0.01em] hover:bg-sidebar-accent transition-colors group-data-[state=collapsed]:hidden"
            >
              <span className="truncate">Portfolio Tracker</span>
            </Link>
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label={state === 'expanded' ? 'Comprimi sidebar' : 'Espandi sidebar'}
                    className="hidden desktop:flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors group-data-[state=collapsed]:mx-auto group-data-[state=collapsed]:size-11"
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

          <SidebarGroup>
            <SidebarGroupLabel className={cn(TILE_EYEBROW_CLASS, 'h-6 text-sidebar-foreground/60')}>Analisi</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavItems items={analysisNav} />
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel className={cn(TILE_EYEBROW_CLASS, 'h-6 text-sidebar-foreground/60')}>Pianificazione</SidebarGroupLabel>
            <SidebarGroupContent>
              <NavItems items={planningNav} />
            </SidebarGroupContent>
          </SidebarGroup>

          {/* The assistant is a route like the others: a row after a hairline, no banner. */}
          {showAssistant && (
            <>
              <div className="mx-3 border-t border-sidebar-border" />
              <SidebarGroup>
                <SidebarGroupContent>
                  <NavItems items={[assistantNavItem]} />
                </SidebarGroupContent>
              </SidebarGroup>
            </>
          )}
        </SidebarContent>

        {/* Footer — in icon mode the button becomes a 44px square around the avatar */}
        <SidebarFooter className="border-t border-sidebar-border">
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton
                    size="lg"
                    tooltip={displayName}
                    className="h-11 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                  >
                    <span className={SIDEBAR_AVATAR_CLASS} aria-hidden="true">{initials}</span>
                    <div className="grid flex-1 overflow-hidden text-left leading-tight">
                      <span className="truncate text-[13px] font-medium text-sidebar-foreground">{displayName}</span>
                      {/* When viewing a shared account, surface WHOSE data is active
                          instead of the viewer's own email — otherwise the account
                          being edited is invisible. */}
                      {isSharedView && activeAccount ? (
                        <span className="truncate text-[11px] text-primary">
                          Vedi: {getAccountLabel(activeAccount)}
                        </span>
                      ) : (
                        /* text-sidebar-foreground/50: footer sits on --sidebar, not --background */
                        <span className="truncate text-[11px] text-sidebar-foreground/50">{user?.email}</span>
                      )}
                    </div>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 text-sidebar-foreground/50" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end" className="w-56">
                  {/* Account switcher — only when the viewer can reach >1 account */}
                  {accessibleAccounts.length > 1 && (
                    <>
                      <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                        Account
                      </DropdownMenuLabel>
                      <DropdownMenuGroup>
                        {accessibleAccounts.map((account) => (
                          <DropdownMenuItem
                            key={account.ownerId}
                            onSelect={() => switchAccount(account.ownerId)}
                          >
                            <Users className="size-4" />
                            <span className="flex-1 truncate">
                              {getAccountLabel(account)}
                            </span>
                            {account.ownerId === ownerId && (
                              <Check className="ml-auto size-4 shrink-0 text-primary" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                    </>
                  )}
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
