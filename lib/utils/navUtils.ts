/**
 * Returns true when the given nav item href matches the current pathname.
 * Uses exact match for /dashboard to avoid treating every sub-route as active,
 * and prefix match for all other routes so nested paths stay highlighted.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}
