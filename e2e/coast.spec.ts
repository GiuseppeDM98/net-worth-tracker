/**
 * Coast FIRE — desktop regressions that only a real browser can catch.
 *
 * Runs on the BASE account with the Coast fixture (`scripts/seedCoastFireE2E.mts`): age 35,
 * target 60, custom expenses, two state pensions after the target and the pension fund unlocking
 * at 57 — inside the chart's horizon, so the unlock step is on screen.
 *
 * The fixture fixes the expenses but NOT the clock: each pension's deflation is computed from an
 * absolute start date, so the figures move between runs. These tests therefore assert STRUCTURE
 * and FORMAT (AGENTS → *Browser-Driven E2E*); the arithmetic lives in `__tests__/fireService.test.ts`
 * and the words in `__tests__/coastFireView.test.ts`.
 *
 * Since 2026-08-25 the tab is a verdict over tiles: the tiles are located by `role=region` +
 * `aria-label`, the verdict by «Verdetto sul Coast FIRE», the two disclosures by their VISIBLE
 * text (`/^Ipotesi/`, `/^Dettaglio/`).
 */

import { test, expect, type Page } from '@playwright/test';

/** A compact euro amount as the tiles print it: dot-grouped or plain up to four digits, no cents. */
const EURO_COMPACT = /^(\d{1,3}(\.\d{3})+|\d{1,4})[\s ]*€$/;

async function gotoCoast(page: Page): Promise<void> {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await page.getByRole('tab', { name: 'Coast FIRE' }).click();
  // The verdict is the first thing the tab paints once the three queries settle.
  await expect(page.getByRole('region', { name: 'Verdetto sul Coast FIRE' })).toBeVisible({ timeout: 30_000 });
}

test('the verdict answers the question and the Traguardo carries a formatted shortfall', async ({ page }) => {
  await gotoCoast(page);

  const verdict = page.getByRole('region', { name: 'Verdetto sul Coast FIRE' });
  // One explicit verdict, in words, in either of its two live phrasings.
  await expect(verdict.getByRole('heading', { level: 2 })).toHaveText(/^(Non ancora: continua a versare\.|Sì, puoi smettere di versare\.)$/);
  // The sentence names the Coast number of today and the walk to the target age.
  await expect(verdict).toContainText('al numero Coast FIRE di oggi');
  await expect(verdict).toContainText('arriveresti a 60 anni');
  // The bridge model is on in the fixture: the lock sentence closes the verdict.
  await expect(verdict).toContainText('restano bloccati fino al');

  const traguardo = page.getByRole('region', { name: 'Traguardo Coast FIRE' });
  await expect(traguardo).toBeVisible();
  // The hero is the amount right under its sub-eyebrow — the shortfall, or the surplus.
  const hero = traguardo.locator('p:has-text("numero Coast FIRE") + span').first();
  await expect(hero).toHaveText(EURO_COMPACT);
  await expect(traguardo.getByRole('progressbar', { name: 'Progresso verso il numero Coast FIRE' })).toBeVisible();
  await expect(traguardo.locator('[role="img"][aria-label*="proiezione Coast FIRE"]')).toBeVisible({ timeout: 15_000 });
});

test('the Afflussi tile lists both state pensions and the fund unlock, in calendar order', async ({ page }) => {
  await gotoCoast(page);

  const tile = page.getByRole('region', { name: 'Afflussi già considerati' });
  await expect(tile).toBeVisible();
  const items = tile.getByRole('listitem');
  await expect(items).toHaveCount(3);

  // Every event the backward walk discounts is named — the fund unlock included.
  await expect(tile.getByText('Sblocco fondo pensione', { exact: true })).toBeVisible();
  await expect(tile.getByText('Pensione estera', { exact: true })).toBeVisible();
  await expect(tile.getByText('Pensione INPS', { exact: true })).toBeVisible();

  // Years read left to right in ascending order, and each row carries its own amount.
  const years = await items.evaluateAll((nodes) => nodes.map((node) => Number(node.querySelector('span.font-mono')?.textContent?.trim())));
  expect(years).toHaveLength(3);
  expect(years.every((year) => Number.isFinite(year) && year > 2020)).toBe(true);
  expect([...years].sort((a, b) => a - b)).toEqual(years);
  // The fixture's fund unlock (2048) precedes both pensions (2052, 2058).
  expect(years[0]).toBeLessThan(years[1]);

  const amounts = await items.evaluateAll((nodes) => nodes.map((node) => node.querySelector('p.font-mono')?.textContent?.trim() ?? ''));
  amounts.forEach((amount) => {
    // The amount is followed by its caption inside the same <p>, so match a prefix.
    expect(amount).toMatch(/^(\d{1,3}(\.\d{3})+|\d{1,4})[\s ]*€/);
  });
});

test('the Scenari tile ranks the three Coast numbers, base in the middle', async ({ page }) => {
  await gotoCoast(page);

  const tile = page.getByRole('region', { name: 'Scenari Coast FIRE' });
  const rows = tile.getByRole('list', { name: 'Numero Coast FIRE per scenario' }).getByRole('listitem');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Scenario Orso');
  await expect(rows.nth(1)).toContainText('Scenario Base');
  await expect(rows.nth(2)).toContainText('Scenario Toro');
  // A higher real return needs less initial capital: Orso > Base > Toro.
  const numbers = await rows.evaluateAll((nodes) =>
    nodes.map((node) => Number((node.querySelector('span.text-right > span')?.textContent ?? '').replace(/[^\d]/g, ''))),
  );
  expect(numbers[0]).toBeGreaterThan(numbers[1]);
  expect(numbers[1]).toBeGreaterThan(numbers[2]);
});

test('the Ipotesi disclosure opens on the form and closes, measured by height', async ({ page }) => {
  await gotoCoast(page);

  // Radix stamps data-state + aria-controls on the trigger. A collapsed CSS region can still be
  // "visible" to Playwright, so the collapse is asserted by measuring the content height.
  const trigger = page.getByRole('button', { name: /^Ipotesi/ }).first();
  await expect(trigger).toBeVisible();
  // The assumptions are declared on the closed trigger.
  await expect(trigger).toContainText('35 anni → target 60');
  await expect(trigger).toContainText('2 pensioni statali');
  const contentId = await trigger.getAttribute('aria-controls');
  expect(contentId).toBeTruthy();
  const content = page.locator(`[id="${contentId}"]`);

  const measuredHeight = async (): Promise<number> => {
    if ((await content.count()) === 0) return 0;
    return content.evaluate((el) => el.getBoundingClientRect().height);
  };

  // Normalize to open: the seeded fixture has an age saved, so it starts collapsed.
  if ((await trigger.getAttribute('data-state')) === 'closed') {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute('data-state', 'open');
  await expect.poll(measuredHeight).toBeGreaterThan(100);
  await expect(page.getByLabel('Età target Coast FIRE')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Pensioni statali' }).getByLabel('Decorrenza')).toHaveCount(2);

  await trigger.click();
  await expect(trigger).toHaveAttribute('data-state', 'closed');
  await expect.poll(measuredHeight).toBeLessThan(1);
});

test('the projection tooltip names the pension-fund step at the unlock year', async ({ page }) => {
  await gotoCoast(page);

  const chart = page.locator('[role="img"][aria-label*="proiezione Coast FIRE"]');
  await expect(chart).toBeVisible({ timeout: 15_000 });

  // boundingBox is viewport-relative: without the scroll every mouse.move lands outside the
  // window, which reads exactly like "the tooltip never opened".
  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();

  const unlockYear = Number(
    await page.getByRole('region', { name: 'Afflussi già considerati' }).getByRole('listitem').first().locator('span.font-mono').textContent(),
  );

  // Sweep the plot area until the hovered year is the unlock year, then read the note.
  const tooltip = page.locator('.recharts-tooltip-wrapper').first();
  let noteFound = false;
  for (let step = 0; step <= 40 && !noteFound; step += 1) {
    await page.mouse.move(box!.x + (box!.width * step) / 40, box!.y + box!.height / 2);
    const text = (await tooltip.textContent()) ?? '';
    if (text.includes(`Anno ${unlockYear}`)) {
      expect(text).toContain('Sblocco del fondo pensione');
      noteFound = true;
    }
  }
  expect(noteFound).toBe(true);
});
