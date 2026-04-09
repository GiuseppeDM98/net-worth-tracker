'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

// motion.create(Button) lets us apply Framer Motion props (whileTap) directly
// on the shadcn Button without an extra wrapper element.
const MotionButton = motion.create(Button);
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LogOut, User, Sun, Moon, Monitor } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { getGreeting } from '@/lib/utils/getGreeting';
import { getItalyDate } from '@/lib/utils/dateHelpers';

/**
 * Top header bar displayed on all dashboard pages.
 *
 * Provides:
 * - Theme toggle (light / dark / system)
 * - User profile dropdown menu with logout
 *
 * Fixed height of 64px (h-16) to match BottomNavigation for consistent spacing.
 * Always visible on all screen sizes (desktop, tablet, mobile).
 */
export function Header() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  // Panoramica already shows a contextual greeting (Buongiorno/Buon pomeriggio/etc.) as h1.
  // Hide the header greeting on that page to avoid duplication.
  const showGreeting = pathname !== '/dashboard';

  const greeting = getGreeting(getItalyDate(new Date()).getHours());
  const firstName = user?.displayName?.split(' ')[0];
  const greetingLabel = firstName && firstName.length <= 20
    ? `${greeting.greeting} ${firstName}`
    : greeting.greeting;

  // Cycle through explicit states so the user can always get back to "follow system".
  // Uses View Transitions API when available for a circle-reveal animation from the
  // button position. Falls back to instant swap on unsupported browsers.
  const cycleTheme = (e: React.MouseEvent<HTMLButtonElement>) => {
    const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';

    if (!('startViewTransition' in document)) {
      setTheme(next);
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const cx = Math.round(rect.left + rect.width / 2);
    const cy = Math.round(rect.top + rect.height / 2);
    const maxR = Math.hypot(
      Math.max(cx, window.innerWidth - cx),
      Math.max(cy, window.innerHeight - cy)
    );

    const root = document.documentElement;
    root.style.setProperty('--vt-cx', `${cx}px`);
    root.style.setProperty('--vt-cy', `${cy}px`);
    root.style.setProperty('--vt-r', `${Math.ceil(maxR)}px`);

    document.startViewTransition(() => setTheme(next));
  };

  const ThemeIcon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  const themeLabel =
    theme === 'dark' ? 'Scuro (clicca per: Sistema)' :
    theme === 'light' ? 'Chiaro (clicca per: Scuro)' :
    'Sistema (clicca per: Chiaro)';

  /**
   * Handles user logout with error handling and user feedback.
   *
   * Flow:
   * 1. Call Firebase signOut via AuthContext
   * 2. Show success toast notification
   * 3. Redirect to login page
   * 4. On error, show generic error toast (doesn't expose auth details to user)
   */
  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Logout effettuato con successo');
      router.push('/login');
    } catch (error) {
      // Don't expose specific error details to user for security
      toast.error('Errore durante il logout');
    }
  };

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center">
        {showGreeting && (
          <span className="text-sm font-medium text-foreground">{greetingLabel}</span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <MotionButton
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          title={themeLabel}
          className="rounded-full"
          whileTap={{ scale: 0.88 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        >
          {/* AnimatePresence mode="wait" re-mounts the icon on every theme change,
              so exit completes before the new icon enters — clean swap with no overlap. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={theme}
              initial={{ opacity: 0, rotate: -30, scale: 0.6 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 30, scale: 0.6 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="flex items-center justify-center"
            >
              <ThemeIcon className="h-5 w-5" />
            </motion.span>
          </AnimatePresence>
        </MotionButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <MotionButton
              variant="ghost"
              size="icon"
              className="rounded-full"
              whileTap={{ scale: 0.88 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            >
              <User className="h-5 w-5" />
            </MotionButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Il mio account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
