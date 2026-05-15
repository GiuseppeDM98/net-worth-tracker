import { formatCurrency } from '@/lib/services/chartService';

/**
 * Cast-safe Recharts tooltip formatter for EUR currency values.
 * Recharts passes ValueType (string | number | array) — we cast to number and format.
 * Use as `formatter={fmtCurrency}` on <Tooltip> when no label override is needed.
 */
export const fmtCurrency = (value: unknown): string =>
  formatCurrency(value as number);
