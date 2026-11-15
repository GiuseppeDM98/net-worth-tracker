/**
 * Analisi's two rings at a tablet's widths (NOVE-10, criterion 7; DESIGN → The Ring Rule): one spec,
 * two projects — `tablet` (768×1024) and `tablet-landscape` (1024×768) — on the base account, because
 * the tablet projects ignore `/analisi\./` (`playwright.config.ts`). The seed's one income category
 * («Stipendio») and two spending types would draw one ring only: two rows are planted by the REST PATCH,
 * dated today at noon UTC — a second income category and a debt instalment — so «Entrate» rings two
 * categories and «Dove vanno i soldi» three types; both removed after, each checked gone.
 */

import { test, expect, type Page } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const PLANTED = [
  { id: 'e2e-exp-classifica-ornitorinco-in', type: 'income', categoryId: 'e2e-cat-ring-extra', categoryName: 'Extra', amount: 42500 },
  { id: 'e2e-exp-classifica-ornitorinco-out', type: 'debt', categoryId: 'e2e-cat-ring-debt', categoryName: 'Rata', amount: -300 },
] as const;

test.use({ contextOptions: { reducedMotion: 'reduce' } });

test.describe('Analisi «Classifica» on a tablet', () => {
  test.beforeAll(async () => {
    const now = new Date();
    const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12)).toISOString();
    for (const row of PLANTED) {
      const res = await fetch(`${FIRESTORE}/expenses/${row.id}`, {
        method: 'PATCH',
        headers: OWNER,
        body: JSON.stringify({
          fields: {
            userId: { stringValue: 'test-user-1' },
            type: { stringValue: row.type },
            categoryId: { stringValue: row.categoryId },
            categoryName: { stringValue: row.categoryName },
            amount: { doubleValue: row.amount },
            currency: { stringValue: 'EUR' },
            notes: { stringValue: 'ornitorinco' },
            date: { timestampValue: date },
            createdAt: { timestampValue: date },
            updatedAt: { timestampValue: date },
          },
        }),
      });
      expect(res.ok).toBe(true);
    }
  });
  test.afterAll(async () => {
    for (const row of PLANTED) {
      await fetch(`${FIRESTORE}/expenses/${row.id}`, { method: 'DELETE', headers: OWNER });
      // A DELETE on a missing document answers 200 too: the GET is what proves it is gone.
      expect((await fetch(`${FIRESTORE}/expenses/${row.id}`, { headers: OWNER })).status).toBe(404);
    }
  });

  async function openEntrate(page: Page): Promise<void> {
    const trigger = page.locator('#analisi-entrate-trigger');
    if ((await trigger.count()) > 0 && (await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
  }

  test('both rings hold their totals inside their holes', async ({ page }) => {
    await page.goto('/dashboard/analisi');
    await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 45_000 });
    const classifica = page.getByRole('region', { name: 'Dove vanno i soldi', exact: true });
    await expect(classifica.getByRole('list', { name: 'Spese per tipo' }).getByRole('listitem')).toHaveCount(3);
    await expectRingFiguresInside(classifica);

    await openEntrate(page);
    const entrate = page.getByRole('region', { name: 'Entrate', exact: true });
    await expect(entrate.getByRole('button', { name: /^Extra, / })).toBeVisible();
    await expectRingFiguresInside(entrate);
  });

  // The Scheda's «Trend mensile» prints its ticks whole (owner, 2026-11-15, the NOVE-10 mirror tour:
  // «1200 €» read «200 €» under a fixed 56px axis and a −16px margin). The planted 42.500 € puts a
  // five-digit tick on the axis. Seen red with the old width and margin.
  test('the Scheda trend axis prints every tick inside the chart', async ({ page }) => {
    await page.goto('/dashboard/analisi');
    await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 45_000 });
    await openEntrate(page);
    await page.getByRole('region', { name: 'Entrate', exact: true }).getByRole('button', { name: /^Extra, / }).click();
    const chart = page.getByRole('img', { name: /^Entrate per mese, ultimi 24 mesi/ });
    await expect(chart).toBeVisible();
    // The y ticks are the tick labels that print euros (the x ticks print months).
    await expect(chart.locator('.recharts-cartesian-axis-tick-label', { hasText: /€$/ }).first()).toBeVisible();
    const clipped = await chart.evaluate((svg) => {
      const left = svg.getBoundingClientRect().left;
      return [...svg.querySelectorAll('.recharts-cartesian-axis-tick-label')]
        .filter((text) => /€$/.test(text.textContent ?? ''))
        .map((text) => ({ text: text.textContent, left: text.getBoundingClientRect().left - left }))
        .filter((tick) => tick.left < -0.5);
    });
    expect(clipped).toEqual([]);
  });
});
