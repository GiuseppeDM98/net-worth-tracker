'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AssistenteBanner } from '@/components/layout/AssistenteBanner';
import { LogoutDialog } from '@/components/layout/LogoutDialog';
import { ThemePicker } from '@/components/layout/ThemePicker';
import { Settings, LogOut, MoreVertical, Users, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawerContainer, drawerItem } from '@/lib/utils/motionVariants';
import { useLogout } from '@/lib/hooks/useLogout';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveAccount } from '@/contexts/ActiveAccountContext';
import { getAccountLabel, getDisplayInfo } from '@/lib/utils/userDisplayUtils';
import { analysisNav, planningNav } from '@/lib/constants/navigation';

interface SecondaryMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Returns all keyboard-focusable elements within a container in DOM order.
 * Used by the focus-trap and autofocus effects to cycle Tab within the dialog.
 */
function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

export function SecondaryMenuDrawer({ open, onOpenChange }: SecondaryMenuDrawerProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  // The account switcher lives here too, not only in AppSidebar: in portrait the
  // sidebar is unreachable (its only trigger sits in the landscape-only header bar),
  // so this drawer is a delegate's sole way to switch accounts on a phone.
  const { ownerId, accessibleAccounts, switchAccount, isSharedView } = useActiveAccount();
  const { confirmLogout, setConfirmLogout, handleSignOut } = useLogout(() => onOpenChange(false));

  // Ref on the dialog panel — used for focus management and Tab trapping.
  const panelRef = useRef<HTMLDivElement>(null);
  // Capture the element that opened the drawer so focus returns to it on close.
  const returnFocusRef = useRef<Element | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Focus management: autofocus the first item on open, return focus to the
  // trigger on close. requestAnimationFrame defers until after the panel is
  // painted so the element is actually reachable when focus() is called.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement;
      const raf = requestAnimationFrame(() => {
        if (!panelRef.current) return;
        getFocusable(panelRef.current)[0]?.focus();
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // Return focus to whatever triggered the drawer (the "Altro" bottom-nav button).
      (returnFocusRef.current as HTMLElement | null)?.focus();
      returnFocusRef.current = null;
    }
  }, [open]);

  // Tab trap: cycle Tab and Shift+Tab within the panel while it is open.
  // Without this, Tab leaks to background elements behind the opaque backdrop.
  useEffect(() => {
    if (!open) return;
    const trapTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', trapTab);
    return () => window.removeEventListener('keydown', trapTab);
  }, [open]);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const { displayName, initials } = getDisplayInfo(user);
  const activeAccount = accessibleAccounts.find((a) => a.ownerId === ownerId);

  // py-3 (12px × 2) + text-sm line-height (~20px) = 44px — meets WCAG 2.5.5 touch target minimum.
  const navItemCn = (active: boolean) =>
    cn(
      'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium transition-colors',
      active
        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
        : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
    );

  const sectionLabel = 'px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40';

  return (
    <>
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop — color-mix tints the overlay toward the sidebar foreground
                so it reads as neutral across all 6 color themes without hardcoding
                black, which looks harsh on warm themes (solar-dusk, elegant-luxury).
                aria-hidden keeps it out of the AT tree; pointer events still fire. */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden="true"
              className="fixed inset-0 z-40"
              style={{ background: 'color-mix(in oklch, var(--sidebar-foreground) 45%, transparent)' }}
              onClick={() => onOpenChange(false)}
            />

            {/* Dialog panel.
                role="dialog" + aria-modal="true" tells assistive technology that
                this is a modal layer and background content is inert — without these,
                screen readers don't announce the overlay or confine navigation to it.
                aria-label provides the accessible name in place of a visible heading. */}
            <motion.div
              key="panel"
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-label="Menu secondario"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[82vh] flex-col rounded-t-2xl border-t border-sidebar-border bg-sidebar text-sidebar-foreground"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {/* Drag handle — visual affordance for swipe-to-dismiss */}
              <div className="flex shrink-0 justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-sidebar-foreground/20" />
              </div>

              {/* Scrollable navigation area.
                  motion.nav doubles as the stagger container, eliminating a redundant
                  wrapper div while adding the <nav> landmark for AT discovery. */}
              <motion.nav
                aria-label="Navigazione secondaria"
                className="flex-1 overflow-y-auto px-2 pb-3 pt-1"
                variants={drawerContainer}
                initial="hidden"
                animate="visible"
              >
                {/* Statistiche group */}
                <div className="mb-1">
                  <motion.p variants={drawerItem} className={sectionLabel}>Statistiche</motion.p>
                  {/* motion.li carries the stagger variant; the inner Link keeps
                      aria-current, Next.js prefetching, and right-click semantics. */}
                  <ul className="m-0 list-none p-0">
                    {analysisNav.map((nav) => (
                      <motion.li key={nav.href} variants={drawerItem}>
                        <Link
                          href={nav.href}
                          aria-current={isActive(nav.href) ? 'page' : undefined}
                          onClick={() => onOpenChange(false)}
                          className={navItemCn(isActive(nav.href))}
                        >
                          <nav.icon className="size-5 shrink-0" />
                          {nav.name}
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Pianificazione group */}
                <div className="mb-1">
                  <motion.p variants={drawerItem} className={cn(sectionLabel, 'pt-2')}>
                    Pianificazione
                  </motion.p>
                  <ul className="m-0 list-none p-0">
                    {planningNav.map((nav) => (
                      <motion.li key={nav.href} variants={drawerItem}>
                        <Link
                          href={nav.href}
                          aria-current={isActive(nav.href) ? 'page' : undefined}
                          onClick={() => onOpenChange(false)}
                          className={navItemCn(isActive(nav.href))}
                        >
                          <nav.icon className="size-5 shrink-0" />
                          {nav.name}
                        </Link>
                      </motion.li>
                    ))}
                  </ul>
                </div>

                {/* Assistente AI banner */}
                {process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' && (
                  <motion.div variants={drawerItem} className="py-2">
                    <AssistenteBanner onClick={() => onOpenChange(false)} />
                  </motion.div>
                )}
              </motion.nav>

              {/* Footer: user identity + account options dropdown */}
              <div className="shrink-0 border-t border-sidebar-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-8 shrink-0 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    {/* When viewing a shared account, surface WHOSE data is active
                        instead of the viewer's own email — otherwise the account
                        being edited is invisible. Same rule as AppSidebar. */}
                    {isSharedView && activeAccount ? (
                      <p className="truncate text-xs text-primary">
                        Vedi: {getAccountLabel(activeAccount)}
                      </p>
                    ) : (
                      <p className="truncate text-xs text-sidebar-foreground/50">{user?.email}</p>
                    )}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-label="Opzioni account"
                        className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      >
                        <MoreVertical className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent side="top" align="end" className="w-52">
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
                          <Link href="/dashboard/settings" onClick={() => onOpenChange(false)}>
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
                        <ThemePicker />
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setConfirmLogout(true)}>
                        <LogOut className="size-4" />
                        Esci
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <LogoutDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        onConfirm={handleSignOut}
      />
    </>
  );
}
