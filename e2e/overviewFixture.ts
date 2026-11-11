/**
 * The Panoramica's overview response, patched on the wire for the two `overview.*` specs (since
 * 2026-10-11): `page.route` + `route.fetch()` + `route.fulfill` as `panoramica.snapshot.spec.ts`
 * does, so the specs never write and never depend on the month the base fixture was seeded in.
 * Round, invented figures (no real account's): +3000 € this month, +25.000 € the year, a salary of
 * 4000 € received and 2000 € of expenses of which 350 € still in the calendar — 59% saved so far;
 * last month saved 12,5%, so the celebration badge (from the 5th, over 30%) never covers the pill;
 * a curve with last December, January and the running month, so the YTD window exists;
 * `hasTERTracking` on, so the Costi row renders (seven rows; `overview.tablet.spec.ts` reuses it). The tax
 * scenarios pass a tax of ≥ 10.000 €: the container's Chromium groups «1.100 €» where the pinned
 * one does not (doc/guide/e2e-playwright.md § Browser-Driven E2E).
 *
 * A helper, not a spec: no project collects it (`testMatch`), it only exports.
 */

import type { Page } from '@playwright/test';

type Json = Record<string, unknown>;

/** The running month and year, as the app reads them on the machine's clock. */
function runningMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export const BASE_EXPENSE_STATS = {
  currentMonth: { income: 4000, expenses: 2000, net: 2000, expensesScheduled: 350, incomeScheduled: 0 },
  previousMonth: { income: 4000, expenses: 3500, net: 500 },
  delta: { income: 0, expenses: -42.86, net: 300 },
  topExpenseCategories: [{ category: 'Casa', categoryKey: 'casa', expenseType: 'fixed', amount: 900, percentage: 45 }],
  topIncomeCategories: [{ category: 'Stipendio', categoryKey: 'stipendio', expenseType: 'income', amount: 4000, percentage: 100 }],
};

/** A taxed sale on an invented instrument; the amounts are the scenario's. */
export function sale(estimatedTax: number) {
  return {
    proceeds: 50000,
    realizedGain: 40000,
    estimatedTax,
    instruments: [{ id: 'fenicottero', name: 'Fenicottero ETF', proceeds: 50000, realizedGain: 40000, estimatedTax }],
    brokenLedgers: 0,
    purchases: null,
  };
}

/** What every spec overrides on the real response; a scenario spreads its own fields over it. */
export function baseOverviewPatch(): Json {
  const { year, month } = runningMonth();
  return {
    variations: { monthly: { value: 3000, percentage: 1.6 }, yearly: { value: 25000, percentage: 15 } },
    expenseStats: BASE_EXPENSE_STATS,
    sparklineData: [
      { year: year - 1, month: 12, totalNetWorth: 165000 },
      { year, month: 1, totalNetWorth: 170000 },
      { year, month, totalNetWorth: 190000 },
    ],
    marketEffect: 2000,
    topMovers: [{ assetClass: 'equity', label: 'Azioni', delta: 1500 }],
    topInstrumentMovers: [],
    monthSales: null,
    goalProgress: null,
    goalProgressList: [],
    ath: { previousAllTimeHigh: null, isNewATH: false },
  };
}

/**
 * Routes the overview request: the real body, the base patch, then `overrides` — `metrics` and
 * `flags` are merged one level deep so a scenario can set one field of them.
 */
export async function patchOverview(page: Page, overrides: Json = {}): Promise<void> {
  await page.route('**/api/dashboard/overview*', async (route) => {
    const response = await route.fetch();
    let body: Json;
    try {
      body = (await response.json()) as Json;
    } catch (error) {
      // A `page.reload()` disposes the response of the request it abandons before its body is read
      // («Response has been disposed», Patrimonio and Panoramica «remembered across a reload» on 2026-10-15
      // and 2026-10-16): let that one go — the reload's own request comes through here again.
      if (!String(error).includes('disposed')) throw error;
      await route.continue().catch(() => {});
      return;
    }
    const patched: Json = {
      ...body,
      ...baseOverviewPatch(),
      ...overrides,
      metrics: { ...(body.metrics as Json), totalValue: 190000, ...((overrides.metrics as Json | undefined) ?? {}) },
      flags: { ...(body.flags as Json), hasTERTracking: true, ...((overrides.flags as Json | undefined) ?? {}) },
    };
    await route.fulfill({ response, json: patched });
  });
}

/** Opens the Panoramica and waits for its verdict (never `networkidle`: Firestore keeps its sockets open). */
export async function openOverview(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.getByRole('region', { name: 'Verdetto del mese' }).waitFor({ timeout: 45_000 });
}
