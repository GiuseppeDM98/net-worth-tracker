import type { AccessibleAccount } from '@/types/account';
import type { User } from '@/types/assets';

/**
 * Derives a short display name and avatar initials from a Firebase user object.
 * Used in both AppSidebar and SecondaryMenuDrawer to avoid duplicated logic.
 */
export function getDisplayInfo(user: User | null | undefined): {
  displayName: string;
  initials: string;
} {
  const displayName =
    user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || '';
  const initials = user?.displayName
    ? user.displayName
        .split(' ')
        .slice(0, 2)
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
    : (user?.email?.[0].toUpperCase() ?? '?');
  return { displayName, initials };
}

/**
 * Human label for an account the viewer can reach: the viewer's own account, or a
 * shared one identified by name, then email, then a generic fallback.
 *
 * Shared by both account switchers (AppSidebar and SecondaryMenuDrawer) so the two
 * surfaces can never name the same account differently.
 */
export function getAccountLabel(account: AccessibleAccount): string {
  if (account.isOwn) return 'Il mio account';
  return account.displayName || account.email || 'Account condiviso';
}
