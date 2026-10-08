/**
 * Client reader of the dividend yields (Yield on Cost, current yield): one call to
 * `POST /api/performance/yields` for every period asked. The computation needs the Admin SDK
 * (`lib/services/dividendService.ts` is server-only), so the browser and the PDF go through the route.
 */

import { authenticatedFetch } from '@/lib/utils/authFetch';
import type { PerformanceYieldPeriod, PerformanceYields } from '@/lib/utils/dividendYield';

/**
 * The yields of each period, by the period's key.
 *
 * Rejects when the route does not answer 200: the caller decides what a missing yield means
 * (Rendimenti and the PDF show the metrics without it — a yield is never the page's verdict).
 *
 * @param ownerId - The data-owner account
 * @param periods - The dividend windows; `dividendEndDate` already capped at today
 */
export async function fetchPerformanceYields(ownerId: string, periods: PerformanceYieldPeriod[]): Promise<Record<string, PerformanceYields>> {
  const response = await authenticatedFetch('/api/performance/yields', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The dates travel as ISO strings (`JSON.stringify` of a Date); the route coerces them back.
    body: JSON.stringify({ userId: ownerId, periods }),
  });
  if (!response.ok) {
    throw new Error(`Dividend yields not read: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
