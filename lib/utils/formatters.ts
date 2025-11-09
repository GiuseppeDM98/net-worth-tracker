import { format } from 'date-fns';
import { it } from 'date-fns/locale';

/**
 * Format a number as currency (Italian format)
 * @param amount - The amount to format
 * @param currency - The currency code (default: EUR)
 * @returns Formatted currency string
 */
export function formatCurrency(amount: number, currency: string = 'EUR'): string {
  return new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: currency,
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
