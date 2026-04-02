'use client';

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
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
    ? `${greeting.greeting}, ${firstName}`
    : greeting.greeting;

  // Cycle through explicit states so the user can always get back to "follow system".
  // `theme` (not `resolvedTheme`) preserves the "system" value between renders.
  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark');
    else if (theme === 'dark') setTheme('system');
    else setTheme('light');
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
        <Button
          variant="ghost"
          size="icon"
          onClick={cycleTheme}
          title={themeLabel}
          className="rounded-full"
        >
          <ThemeIcon className="h-5 w-5" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full">
              <User className="h-5 w-5" />
            </Button>
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
