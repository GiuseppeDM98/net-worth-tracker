'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import {
  PieChart,
  History,
  Trophy,
  Flame,
  Settings,
  TrendingUp,
  LogOut,
  MoreVertical,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { drawerContainer, drawerItem } from '@/lib/utils/motionVariants';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';

// WARNING: If you add/remove navigation items here, also update:
// - Sidebar.tsx (analysisNav / planningNav arrays)
// - BottomNavigation.tsx (secondaryHrefs array)

type NavEntry = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };

const analisiNav: NavEntry[] = [
  { name: 'Allocazione', href: '/dashboard/allocation', icon: PieChart },
  { name: 'Rendimenti', href: '/dashboard/performance', icon: TrendingUp },
  { name: 'Storico', href: '/dashboard/history', icon: History },
  { name: 'Hall of Fame', href: '/dashboard/hall-of-fame', icon: Trophy },
];

const pianificazioneNav: NavEntry[] = [
  { name: 'FIRE e Simulazioni', href: '/dashboard/fire-simulations', icon: Flame },
];

interface SecondaryMenuDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SecondaryMenuDrawer({ open, onOpenChange }: SecondaryMenuDrawerProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [confirmLogout, setConfirmLogout] = useState(false);

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

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const navigate = (href: string) => {
    router.push(href);
    onOpenChange(false);
  };

  const displayName = user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const initials = user?.displayName
    ? user.displayName.split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()
    : (user?.email?.[0].toUpperCase() ?? '?');

  const handleSignOut = async () => {
    onOpenChange(false);
    try {
      await signOut();
      toast.success('Logout effettuato con successo');
      router.push('/login');
    } catch {
      toast.error('Errore durante il logout');
    }
  };

  const navItemCn = (active: boolean) =>
    cn(
      'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
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
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/40"
              onClick={() => onOpenChange(false)}
            />

            {/* Panel */}
            <motion.div
              key="panel"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 38 }}
              className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[82vh] flex-col rounded-t-2xl border-t border-sidebar-border bg-sidebar text-sidebar-foreground"
              style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            >
              {/* Drag handle */}
              <div className="flex shrink-0 justify-center pb-1 pt-3">
                <div className="h-1 w-10 rounded-full bg-sidebar-foreground/20" />
              </div>

              {/* Scrollable nav */}
              <motion.div
                className="flex-1 overflow-y-auto px-2 pb-3 pt-1"
                variants={drawerContainer}
                initial="hidden"
                animate="visible"
              >
                {/* Analisi */}
                <div className="mb-1">
                  <motion.p variants={drawerItem} className={sectionLabel}>Analisi</motion.p>
                  {analisiNav.map((nav) => (
                    <motion.button
                      key={nav.href}
                      variants={drawerItem}
                      onClick={() => navigate(nav.href)}
                      className={navItemCn(isActive(nav.href))}
                    >
                      <nav.icon className="size-5 shrink-0" />
                      {nav.name}
                    </motion.button>
                  ))}
                </div>

                {/* Pianificazione */}
                <div className="mb-1">
                  <motion.p variants={drawerItem} className={cn(sectionLabel, 'pt-2')}>
                    Pianificazione
                  </motion.p>
                  {pianificazioneNav.map((nav) => (
                    <motion.button
                      key={nav.href}
                      variants={drawerItem}
                      onClick={() => navigate(nav.href)}
                      className={navItemCn(isActive(nav.href))}
                    >
                      <nav.icon className="size-5 shrink-0" />
                      {nav.name}
                    </motion.button>
                  ))}
                </div>

                {/* Assistente AI banner */}
                {process.env.NEXT_PUBLIC_ASSISTANT_AI_ENABLED !== 'false' && (
                  <motion.div variants={drawerItem} className="py-2">
                    <AssistenteBanner onClick={() => onOpenChange(false)} />
                  </motion.div>
                )}

              </motion.div>

              {/* Footer */}
              <div className="shrink-0 border-t border-sidebar-border">
                <div className="flex items-center gap-3 px-4 py-3">
                  <Avatar className="size-8 shrink-0 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{displayName}</p>
                    <p className="truncate text-xs text-sidebar-foreground/50">{user?.email}</p>
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
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
