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
