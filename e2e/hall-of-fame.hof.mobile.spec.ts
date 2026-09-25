/**
 * Hall of Fame at 390 — what the phone layout must hold.
 *
 * The desktop spec owns the data path and the readings; here the questions are the ones only a
 * narrow, coarse-pointer viewport asks: does anything run off the side with the Dettaglio open,
 * can a thumb hit the markers and the pills, and does the table that is wider than the tile say
 * so. The note markers measured 28×28 on 2026-09-24, the pills 25px tall at 1440.
 *
 * Account and arithmetic: `scripts/seedHallOfFameE2E.mts`. The `hof` project runs first and
 * builds the document; if this project runs alone, the first navigation builds it itself.
 */

import { test, expect, type Page } from '@playwright/test';

/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
const TOUCH_FLOOR = 44;

async function openPage(page: Page): Promise<void> {
  await page.goto('/dashboard/hall-of-fame');
  await expect(page.getByRole('heading', { level: 2 })).toBeVisible({ timeout: 45_000 });
  const empty = page.getByRole('heading', { level: 2, name: 'I record cominciano dal secondo snapshot' });
  if (await empty.isVisible()) {
    await page.getByRole('button', { name: 'Aggiorna i record' }).filter({ visible: true }).first().click();
  }
  await expect(page.getByRole('heading', { level: 2, name: 'Il tuo mese migliore è marzo 2024' })).toBeVisible({ timeout: 30_000 });
}

test.describe('Hall of Fame (phone)', () => {
  test('nothing runs off the side, with the Dettaglio open', async ({ page }) => {
    await openPage(page);
    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    await expect(page.getByRole('region', { name: 'Classifica completa' })).toBeVisible();
    await page.waitForTimeout(1500);

    const measurement = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) throw new Error('no <main> in the dashboard shell');
      const limit = main.getBoundingClientRect().left + main.clientWidth;
      // A strip that scrolls on purpose (the pills, the table) holds its overflow inside itself:
      // its descendants are measured against the strip, never against main.
      const offenders = Array.from(main.querySelectorAll('*'))
        .filter((el) => !el.closest('.sr-only') && !el.closest('.overflow-x-auto'))
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return (rect.width > 0 || rect.height > 0) && rect.right > limit + 1;
        })
        .map((el) => `<${el.tagName.toLowerCase()} class="${el.getAttribute('class') ?? ''}">`)
        .slice(0, 5);
      return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
    });

    expect(measurement.offenders, `elements past main's right edge (${measurement.clientWidth}px)`).toEqual([]);
    expect(measurement.scrollWidth).toBe(measurement.clientWidth);
  });

  test('the pills and the note markers are thumb-sized', async ({ page }) => {
    await openPage(page);
    // The branch under test only exists under a coarse pointer: prove it is the live one.
    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    const tile = page.getByRole('region', { name: 'Classifica completa' });

    for (const name of ['Mensile', 'Annuale', 'Crescita', 'Risparmio']) {
      const box = await tile.getByRole('radio', { name }).boundingBox();
      expect(box, name).not.toBeNull();
      expect(box!.height, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    // The table's «Nota» column: the marker to add a note from a row, always drawn there.
    const marker = tile.getByRole('button', { name: /^(Aggiungi una nota a|Leggi la nota di) / }).first();
    await marker.scrollIntoViewIfNeeded();
    const box = await marker.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    expect(box!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);
  });

  /** The table is 520px wide in a 356px tile: it scrolls inside its strip, and the edge says so. */
  test('the full table says that it scrolls', async ({ page }) => {
    await openPage(page);
    await page.getByRole('button', { name: /^Dettaglio/ }).click();
    const scroller = page.getByRole('region', { name: 'Classifica completa' }).locator('div.overflow-x-auto').filter({ has: page.locator('table') });
    await expect(scroller).toBeVisible();

    const cue = await scroller.evaluate((el) => ({
      scrolls: el.scrollWidth > el.clientWidth + 1,
      mask: getComputedStyle(el).maskImage,
    }));
    expect(cue.scrolls).toBe(true);
    expect(cue.mask, 'a measured fade on the right edge').not.toBe('none');
  });

  test('never cuts the running year at 390 either', async ({ page }) => {
    await openPage(page);
    const anni = page.getByRole('region', { name: 'Gli anni con la crescita di patrimonio più alta' });
    const label = anni.getByRole('listitem').filter({ hasText: '2026' }).getByText('2026', { exact: true });
    await label.scrollIntoViewIfNeeded();
    const fits = await label.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().width > 20);
    expect(fits).toBe(true);
  });
});
