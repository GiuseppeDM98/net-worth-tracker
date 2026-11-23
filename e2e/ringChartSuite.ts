/**
 * The ring on its homes (DESIGN.md → The Ring Rule, 2026-11-12), ONE body for three widths:
 * `ring-chart.spec.ts` (1440), `ring-chart.mobile.spec.ts` (390) and `ring-chart.tablet.spec.ts`
 * (768×1024 and 1024×768) each make the one call. Below `desktop:` every home is a closed row, so
 * `openRows` opens it first — at 768 into the grid, in landscape in place in the index.
 *
 * What only a browser can prove: the figure that really rendered stays inside its hole
 * (`expectRingFiguresInside`), at most the characters the ring declared; the words, the shares and
 * the fold are Vitest's (`ringChart.test.ts`, `compositionRing.test.ts`, `categoryRing.test.ts`).
 *
 * The data, invented and round, never written where a patch suffices:
 * - Panoramica and Patrimonio: the overview answer PATCHED on the wire (`patchOverview`) with seven
 *   classes summing to 1.000.000 € → «1 Mln €» in the hole and «Altre 2 classi» captioned with the
 *   two names (the page remaps the colours, so every class arrives in `--chart-1`).
 * - The Panoramica's «Entrate per categoria» (2026-11-15, the owner's tour: aligned with Tracciamento's): the
 *   overview's `expenseStats` PATCHED with two income categories, 34.400 € → «34,4k €»; «Spese per categoria» keeps
 *   its bars.
 * - Previdenza: the base seed's 2026 (three natures, 821 €) and 2025 (one nature, no ring).
 * - Tracciamento: two income rows planted by REST on day 1 of the running month — 24.000 € on the
 *   seed's «Stipendio» (with the seed's 2500 € the month reads 26.500 €) and 7900 € on «Affitto», a
 *   category with no document (the name is the row's) — in their OWN describe, registered LAST, so
 *   the overview tests above never fetch a body that holds them; removed in `afterAll`.
 *
 * Seen red on 2026-11-15 with `formatRingCenter` returning the full form: the Composizione's
 * «1.000.000 €» leaves the hole at every width.
 *
 * A helper, not a spec: no project collects it (`testMatch`), it only exports.
 */

import { test, expect, type Page, type Locator } from '@playwright/test';
import { BASE_EXPENSE_STATS, openOverview, patchOverview } from './overviewFixture';
import { expectRingFiguresInside } from './ringFit';

const NBSP = ' ';
const USER_ID = 'test-user-1';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** The shape of `PieChartData` (types/assets.ts), each name the one `getAssetClassName` gives. */
const CLASSES = [
  ['equity', 'Azioni', 520_000],
  ['bonds', 'Obbligazioni', 180_000],
  ['realestate', 'Immobili', 140_000],
  ['crypto', 'Criptovalute', 60_000],
  ['cash', 'Liquidità', 40_000],
  ['commodity', 'Materie Prime', 30_000],
  ['trendFollowing', 'Trend Following', 30_000],
].map(([assetClass, name, value]) => ({
  assetClass,
  name,
  value,
  percentage: (value as number) / 10_000,
  color: 'var(--chart-1)',
}));

const INCOME_ROWS = [
  { id: 'e2e-exp-ornitorinco-ring-1', amount: 24_000, categoryId: 'seed-cat-income', categoryName: 'Stipendio' },
  { id: 'e2e-exp-ornitorinco-ring-2', amount: 7_900, categoryId: 'e2e-cat-ornitorinco-affitto', categoryName: 'Affitto' },
];

async function openHome(page: Page, rowId: string, openRows: boolean): Promise<void> {
  if (!openRows) return;
  const trigger = page.locator(`#${rowId}-trigger`);
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
}

async function expectClassesRing(tile: Locator): Promise<void> {
  await expectRingFiguresInside(tile);
  await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(`1${NBSP}Mln${NBSP}€`);
  await expect(tile.locator('[data-class-caption]')).toHaveText('Materie Prime, Trend Following');
}

async function plantIncome(): Promise<void> {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 12, 0)).toISOString();
  for (const row of INCOME_ROWS) {
    const res = await fetch(`${FIRESTORE}/expenses/${row.id}`, {
      method: 'PATCH',
      headers: OWNER,
      body: JSON.stringify({
        fields: {
          userId: { stringValue: USER_ID },
          type: { stringValue: 'income' },
          categoryId: { stringValue: row.categoryId },
          categoryName: { stringValue: row.categoryName },
          amount: { doubleValue: row.amount },
          currency: { stringValue: 'EUR' },
          notes: { stringValue: 'entrata ornitorinco' },
          date: { timestampValue: date },
          createdAt: { timestampValue: date },
          updatedAt: { timestampValue: date },
        },
      }),
    });
    expect(res.ok).toBe(true);
  }
}

async function removeIncome(): Promise<void> {
  for (const row of INCOME_ROWS) await fetch(`${FIRESTORE}/expenses/${row.id}`, { method: 'DELETE', headers: OWNER });
  for (const row of INCOME_ROWS) {
    const res = await fetch(`${FIRESTORE}/expenses/${row.id}`, { headers: OWNER });
    expect(res.status, `${row.id} removed`).toBe(404);
  }
}

export function registerRingChartSuite({ openRows }: { openRows: boolean }): void {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('Panoramica: the classes’ ring holds «1 Mln €» inside its hole', async ({ page }) => {
    await patchOverview(page, { charts: { assetClassData: CLASSES }, metrics: { totalValue: 1_000_000 } });
    await openOverview(page);
    await openHome(page, 'panoramica-composizione', openRows);
    await expectClassesRing(page.getByRole('region', { name: 'Composizione', exact: true }));
  });

  test('Panoramica: the month’s «Entrate per categoria» is the same ring as Tracciamento’s, «34,4k €» inside', async ({ page }) => {
    await patchOverview(page, {
      expenseStats: {
        ...BASE_EXPENSE_STATS,
        currentMonth: { ...BASE_EXPENSE_STATS.currentMonth, income: 34_400, net: 32_400 },
        topIncomeCategories: [
          { category: 'Stipendio', categoryKey: 'stipendio', expenseType: 'income', amount: 26_500, percentage: 77.03 },
          { category: 'Affitto', categoryKey: 'affitto', expenseType: 'income', amount: 7_900, percentage: 22.97 },
        ],
      },
    });
    await openOverview(page);
    await openHome(page, 'panoramica-entrate', openRows);
    const tile = page.getByRole('region', { name: 'Entrate per categoria' });
    await expectRingFiguresInside(tile);
    await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(`34,4k${NBSP}€`);
    await expect(page.getByRole('region', { name: 'Spese per categoria' }).locator('[data-ring]')).toHaveCount(0);
  });

  test('Patrimonio: the Classi ring holds «1 Mln €» inside its hole', async ({ page }) => {
    await patchOverview(page, { charts: { assetClassData: CLASSES }, metrics: { totalValue: 1_000_000 } });
    await page.goto('/dashboard/assets');
    const tile = page.getByRole('region', { name: 'Classi', exact: true });
    await expect(tile).toBeVisible({ timeout: 45_000 });
    await openHome(page, 'patrimonio-classi', openRows);
    await expectClassesRing(tile);
  });

  test('Previdenza: 2026’s three natures are a ring with «821 €» inside; 2025’s one nature keeps its bar', async ({ page }) => {
    await page.goto('/dashboard/pension');
    const tile = page.getByRole('region', { name: 'Versato nel 2026' });
    await expect(tile).toBeVisible({ timeout: 45_000 });
    await openHome(page, 'prev-versato', openRows);
    await expectRingFiguresInside(tile);
    await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(`821${NBSP}€`);

    await page.getByRole('radiogroup', { name: 'Anno fiscale' }).filter({ visible: true }).getByRole('radio', { name: '2025' }).click();
    const previous = page.getByRole('region', { name: 'Versato nel 2025' });
    await expect(previous.getByRole('list', { name: 'Versato per natura' })).toBeVisible();
    await expect(previous.locator('[data-ring]')).toHaveCount(0);
  });

  test.describe('Tracciamento, with two income rows planted', () => {
    test.beforeAll(plantIncome);
    test.afterAll(removeIncome);

    test('Entrate per categoria: the month’s ring holds its abbreviated total inside its hole', async ({ page }) => {
      await page.goto('/dashboard/cashflow');
      await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 45_000 });
      await openHome(page, 'trk-entrate', openRows);
      const tile = page.getByRole('region', { name: 'Entrate per categoria' });
      await expectRingFiguresInside(tile);
      await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(`34,4k${NBSP}€`);
    });
  });
}
