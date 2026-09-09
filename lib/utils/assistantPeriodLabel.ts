import { MONTH_NAMES } from '@/lib/constants/months';

/**
 * Returns a human-readable label for the period encoded in selector.
 * Shared between the server prompt builders (prompts.ts) and the client
 * context tiles (PatrimonioContestoTile, CashflowContestoTile) — a single source avoids the two copies drifting
 * (the client one used to lack a branch the server one had).
 *   month > 0   → "Marzo 2025"
 *   month === 0  → "Anno 2025"
 *   month === -1 → "YTD 2025"
 *   month === -2 → "Storico da 2020"
 */
export function getAssistantPeriodLabel(selector: { year: number; month: number }): string {
  if (selector.month > 0) return `${MONTH_NAMES[selector.month - 1]} ${selector.year}`;
  if (selector.month === 0) return `Anno ${selector.year}`;
  if (selector.month === -1) return `YTD ${selector.year}`;
  if (selector.month === -2) return `Storico da ${selector.year}`;
  return `${selector.year}`;
}
