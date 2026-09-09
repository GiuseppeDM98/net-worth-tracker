import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import { TimePeriod } from '@/types/performance';

// === Formatter Cache ===
//
// Intl.NumberFormat construction is expensive — creating a new instance on every
// render (e.g. inside a count-up rAF loop at 60fps) wastes CPU budget.
// These module-level instances are created once and reused for the lifetime of
// the client session. Add a new entry only when a genuinely distinct format is needed.
//
// WARNING: If you add a new cached formatter here, update cachedFormatCurrency
// below so callers can access it through a unified entry point.

/** Standard EUR, 2 decimal places — used by all Overview KPI cards. */
const _fmtEUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

/** EUR with 0 decimal places — useful for compact summary values. */
const _fmtEURCompact = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Cached EUR currency formatter.
 *
 * Returns the same Intl.NumberFormat instance across calls, avoiding per-render
 * object allocation. Use this inside animation loops (e.g. count-up rAF ticks)
 * or frequently re-rendered components.
 *
 * @param amount - The amount to format
 * @param compact - When true, uses 0 decimal places (e.g. for large KPI displays)
 */
export function cachedFormatCurrencyEUR(amount: number, compact = false): string {
  return compact ? _fmtEURCompact.format(amount) : _fmtEUR.format(amount);
}

/**
 * Format a number as currency (Italian format)
 * @param amount - The amount to format
 * @param currency - The currency code (default: EUR)
 * @param decimals - Optional number of decimal places (default: currency default, typically 2)
 * @returns Formatted currency string
 */
export function formatCurrency(
  amount: number,
  currency: string = 'EUR',
  decimals?: number
): string {
  // For the common EUR + default decimals case, reuse the cached instance.
  // All other combinations fall back to constructing a fresh formatter.
  if (currency === 'EUR' && decimals === undefined) {
    return _fmtEUR.format(amount);
  }
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
    ...(decimals !== undefined && {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }),
  }).format(amount);
}

/**
 * Format a number as a percentage
 * @param value - The value to format (e.g., 12.34 for 12.34%)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * The it-IT percentage — `40,71%`, comma decimals — and THE one implementation of it.
 *
 * It used to live in `lib/services/chartService.ts`, which every narrative module imported it
 * from; `chartService` now delegates here, so nothing about the two-formatters situation above
 * changed (`formatPercentage` is still the `toFixed` one, and the rule is still "import it from
 * the same module the surrounding component uses").
 *
 * What moving it buys is reach: `chartService` top-level-imports the client Firebase SDK, so a
 * narrative module that took its formatter from there could never be read by SERVER code — the
 * periodic emails would initialise `firebase/auth` inside a Lambda just to print a percent sign.
 * This module imports nothing but date-fns, so a narrative built on it travels everywhere.
 */
export function formatPercentageIt(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value / 100);
}

/**
 * The it-IT number with a FIXED number of decimals — `1,67`, the coverage ratio's face.
 *
 * Not the same function as `formatNumber` above, which takes no `decimals` and therefore prints
 * `1,67` and `2` differently: a column of ratios needs them all to the same width. Moved out of
 * `chartService` for the same reason as `formatPercentageIt` — the narrative layer it serves is
 * read by server code, and `chartService` carries the client Firebase SDK.
 */
export function formatNumberIt(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a date in Italian format (DD/MM/YYYY)
 * @param date - The date to format
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  return format(date, 'dd/MM/yyyy', { locale: it });
}

/**
 * Format a date with time
 * @param date - The date to format
 * @returns Formatted date and time string
 */
export function formatDateTime(date: Date): string {
  return format(date, 'dd/MM/yyyy HH:mm', { locale: it });
}

/**
 * Format a large number with thousand separators
 * @param value - The number to format
 * @returns Formatted number string
 */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('it-IT').format(value);
}

/**
 * Format time period label in Italian for display
 *
 * Shows exact date range for all periods using Italian date formatting.
 * Always returns "MMM yy - MMM yy" format when metrics are available.
 *
 * CONVENTIONS:
 * - All periods: "gen 25 - apr 25" (abbreviated month + 2-digit year)
 * - Format matches existing conventions in charts (lowercase month abbreviations)
 * - Requires metrics with startDate and endDate for proper formatting
 *
 * @param timePeriod - TimePeriod enum value
 * @param metrics - PerformanceMetrics with startDate and endDate for date extraction
 * @returns Formatted Italian date range label
 */
export function formatTimePeriodLabel(
  timePeriod: TimePeriod,
  metrics?: { startDate: Date; endDate: Date }
): string {
  // Return generic label if no metrics provided
  if (!metrics) {
    switch (timePeriod) {
      case 'YTD':
        return `Anno Corrente ${new Date().getFullYear()}`;
      case '1Y':
        return 'Ultimo Anno';
      case '3Y':
        return 'Ultimi 3 Anni';
      case '5Y':
        return 'Ultimi 5 Anni';
      case 'ALL':
        return 'Storico Completo';
      case 'CUSTOM':
        return 'Periodo Personalizzato';
      default:
        return timePeriod;
    }
  }

  // Format date range for all period types (YTD, 1Y, 3Y, 5Y, ALL, CUSTOM)
  // Format: "gen 25 - apr 25" (abbreviated month + 2-digit year)
  const start = format(metrics.startDate, 'MMM yy', { locale: it });
  const end = format(metrics.endDate, 'MMM yy', { locale: it });
  return `${start} - ${end}`;
}
