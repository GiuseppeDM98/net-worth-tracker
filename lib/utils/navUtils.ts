/**
 * Returns true when the given nav item href matches the current pathname.
 * Uses exact match for /dashboard to avoid treating every sub-route as active,
 * and prefix match for all other routes so nested paths stay highlighted.
 */
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/dashboard') return pathname === href;
  return pathname === href || pathname.startsWith(href + '/');
}

/**
 * Whether the bottom nav draws the «+» that adds an expense: on Cashflow › Tracciamento alone
 * (`?tab=` absent or `tracking` — on Dividendi and Budget the tab's own add button sits under
 * the verdict, and a FAB that still added an EXPENSE there read as the tab's add affordance)
 * and never in demo (2026-10-12: the demo account is shared by every visitor and `useDemoMode`
 * gates every mutation, but the FAB was the one add control it did not reach — a save from it
 * wrote to the shared account).
 */
export function isAddExpenseFabShown({ pathname, tab, isDemo }: { pathname: string; tab: string | null; isDemo: boolean }): boolean {
  if (isDemo) return false;
  const isOnCashflow = pathname === '/dashboard/cashflow' || pathname.startsWith('/dashboard/cashflow/');
  return isOnCashflow && (tab === null || tab === 'tracking');
}

/**
 * Whether Cashflow shows «Chiedi all'Assistente», the link into Registra (2026-11): the Assistente
 * is configured (the key exists on the server), the visitor is not in the demo (Registra writes
 * rows), and its flag is not off (`NEXT_PUBLIC_ASSISTANT_AI_ENABLED`, absent means on — as the
 * sidebar reads it).
 */
export function isAssistantBridgeShown({ assistantConfigured, isDemo, flagValue }: { assistantConfigured: boolean; isDemo: boolean; flagValue: string | undefined }): boolean {
  return assistantConfigured && !isDemo && flagValue !== 'false';
}
