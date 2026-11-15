/**
 * Cashflow › Dividendi «Chi paga di più» at 1440: the held payers are a ring (The Ring Rule,
 * 2026-11-12) whose figure stays INSIDE its hole — in a `desktop:col-span-4` cell, the ring stacked
 * above its rows. The base account has no dividends: two are created through the app's own form, as
 * `cashflow.dividendi.spec.ts` creates its coupon, on two held instruments of the base seed — invented
 * round nets of 300 € (20 × 15 € on the ETF) and 200 € (5 × 40 € on the BTP), no withholding, the note
 * «dividendo ornitorinco» — and removed after the test through the app's two-click delete, the emulator
 * polled until no document carries the note. The parts and the colours are Vitest's
 * (`dividendAnalytics.test.ts` V1, `pagatoriTile.test.tsx` V2). Seen red on 2026-11-15 with the figure drawn at three times
 * its font size (`ring-chart.tsx`): it leaves the hole.
 */

import { test, expect, type Page } from '@playwright/test';
import { expectRingFiguresInside } from './ringFit';

const DECOY_NOTE = 'dividendo ornitorinco';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const DIVIDENDS = [
  { search: 'VWCE', option: /^VWCE\.DE - Vanguard/, grossPerUnit: '15' },
  { search: 'BTP', option: /BTP - BTP Valore 2030/, grossPerUnit: '40' },
];

/** The base account's dividends carrying the decoy note, read from the emulator (not from the page). */
async function decoyDividendIds(): Promise<string[]> {
  const res = await fetch(`${FIRESTORE}/dividends?pageSize=300`, { headers: { Authorization: 'Bearer owner' } });
  if (!res.ok) return [];
  const body = (await res.json()) as {
    documents?: Array<{ name: string; fields?: { userId?: { stringValue?: string }; notes?: { stringValue?: string } } }>;
  };
  return (body.documents ?? [])
    .filter((d) => d.fields?.userId?.stringValue === 'test-user-1' && d.fields?.notes?.stringValue === DECOY_NOTE)
    .map((d) => d.name.split('/').pop() as string);
}

const isoDaysAgo = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
};

async function openDividendi(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow?tab=dividends');
  await expect(page.getByRole('region', { name: 'Verdetto sui dividendi' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Pagamenti' })).toBeVisible();
}

/** Every row of the two instruments, through the app's own two-click delete (the base account has no other dividend). */
async function removeDecoyRows(page: Page): Promise<void> {
  const pagamenti = page.getByRole('region', { name: 'Pagamenti' });
  const del = pagamenti.getByRole('button', { name: /^Elimina .* di (VWCE\.DE|BTP) del/ });
  for (let i = 0; i < 4; i++) {
    const before = await del.count();
    if (before === 0) break;
    await del.first().click();
    const armed = pagamenti.getByRole('button', { name: /^Premi di nuovo per eliminare/ });
    await expect(armed).toBeVisible();
    const deleted = page.waitForResponse((r) => r.url().includes('/api/dividends/') && r.request().method() === 'DELETE');
    await armed.click();
    expect((await deleted).status()).toBe(200);
    // The list re-reads after each delete: wait for the row to leave it, or the next press arms a row
    // the refetch is about to re-render (an armed button detached mid-click, 2026-11-15).
    await expect(del).toHaveCount(before - 1, { timeout: 15_000 });
  }
  await expect.poll(decoyDividendIds).toEqual([]);
}

async function createDividend(page: Page, dividend: (typeof DIVIDENDS)[number]): Promise<void> {
  await page.getByRole('button', { name: 'Aggiungi dividendo', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#assetId').fill(dividend.search);
  await dialog.getByRole('button', { name: dividend.option }).click();
  await dialog.locator('#grossAmountPerShare').fill(dividend.grossPerUnit);
  await dialog.locator('#withholdingTax').fill('0');
  await dialog.locator('#exDate').fill(isoDaysAgo(2));
  await dialog.locator('#paymentDate').fill(isoDaysAgo(1));
  await dialog.locator('#notes').fill(DECOY_NOTE);
  const created = page.waitForResponse((r) => r.url().endsWith('/api/dividends') && r.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Registra pagamento', exact: true }).click();
  expect((await created).status()).toBe(200);
  await expect(dialog).toBeHidden();
}

test.use({ contextOptions: { reducedMotion: 'reduce' } });

// `afterEach`, not `afterAll`: the removal needs the signed-in `page`, a test-scoped fixture.
test.afterEach(async ({ page }) => {
  await openDividendi(page);
  await removeDecoyRows(page);
});

test('Chi paga di più: two held payers are a ring with «500 €» inside its hole', async ({ page }) => {
  test.setTimeout(180_000);
  await openDividendi(page);
  await removeDecoyRows(page);
  for (const dividend of DIVIDENDS) await createDividend(page, dividend);
  await expect.poll(decoyDividendIds).toHaveLength(2);

  const tile = page.getByRole('region', { name: 'Chi paga di più' });
  await expectRingFiguresInside(tile);
  await expect(tile.locator('[data-ring-center="hole"]')).toHaveText(/^500[\s ]*€$/);
});
