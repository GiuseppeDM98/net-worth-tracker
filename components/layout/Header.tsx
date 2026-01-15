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
import { LogOut, User } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Top header bar displayed on all dashboard pages.
 *
 * Provides:
 * - User greeting with personalized name
 * - User profile dropdown menu
 * - Logout functionality
 *
 * Fixed height of 64px (h-16) to match BottomNavigation for consistent spacing.
 * Always visible on all screen sizes (desktop, tablet, mobile).
 */
export function Header() {
  const { user, signOut } = useAuth();
  const router = useRouter();

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
    <header className="flex h-16 items-center justify-between border-b bg-white px-6">
      <div className="flex items-center gap-4">
        {/* User name display with fallback chain:
            1. displayName (set via Firebase profile)
            2. email (always present for authenticated users)
            3. 'Utente' (generic fallback if both are missing, though unlikely)

            displayName can be empty even when authenticated because Firebase
            doesn't require it during email/password sign-up. */}
        <h2 className="text-lg font-semibold text-gray-900">
          Benvenuto, {user?.displayName || user?.email || 'Utente'}
        </h2>
      </div>
      <div className="flex items-center gap-4">
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
