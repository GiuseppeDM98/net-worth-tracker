/**
 * Cashflow › Divisione at 1440 — the page's FIRST browser spec.
 *
 * Until 2026-09-21 this tab had none, and the feature had never been exercised end to end with
 * its flag on: the pure layer was proven, the rendering was not. An Impeccable critique put the
 * screen in front of a browser for the first time and these are the three things it found that
 * only a browser can see or that only the whole data path can prove.
 *
 * WHAT IS DELIBERATELY NOT HERE: the wording of every state. `missing-salary`, the empty period
 * and each reading are pinned sentence by sentence in `__tests__/expenseSplitNarrative.test.ts`,
 * where they cost milliseconds instead of a page load. A browser is spent here only on layout
 * geometry, on the accessibility wiring, and on the ONE reading whose value crosses the whole
 * stack — Firestore → `summarizeExpenseSplit` → the tile.
 *
 * The account and the arithmetic are `scripts/seedSplitE2E.mts`; the window is «Quest'anno»,
 * which is the picker's default here only because every row sits inside it — the spec selects it
 * explicitly rather than trusting the default.
 */

import { test, expect, type Page } from '@playwright/test';

/** The euro figures print with a NO-BREAK SPACE before €; four digits are ungrouped. */
const euro = (amount: string) => new RegExp(`${amount}[\\s ]*€`);

async function openDivisione(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow?tab=split');
  // Never `networkidle`: Firestore keeps its sockets open for the life of the page.
  await expect(page.getByRole('heading', { name: 'In comune' })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('combobox', { name: /Periodo selezionato/ }).click();
  await page.getByRole('button', { name: "Quest'anno", exact: true }).click();
  await expect(page.getByRole('heading', { name: 'In comune' })).toBeVisible();
}

test.describe('Cashflow › Divisione', () => {
  /**
   * THE LAYOUT DEFECT THE CRITIQUE MEASURED. «In comune» spans 5 of 12 over two rows and the two
   * person tiles used to be 6 each: 5 + 6 = 11, so the second person wrapped to a row of their
   * own and left a 578×181 px void beside them. The one comparison the page exists to make was a
   * diagonal across an empty corner. Only a browser can see this.
   */
  test('the two people stand side by side, on one row, at equal height', async ({ page }) => {
    await openDivisione(page);

    const ghiandaia = page.getByRole('region', { name: 'Quanto resta a Ghiandaia' });
    const tarsio = page.getByRole('region', { name: 'Quanto resta a Tarsio' });
    const left = await ghiandaia.boundingBox();
    const right = await tarsio.boundingBox();
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();

    // Same row: tops within a pixel of each other, and Tarsio starts to the RIGHT of Ghiandaia.
    expect(Math.abs(left!.y - right!.y)).toBeLessThan(2);
    expect(right!.x).toBeGreaterThan(left!.x + left!.width - 2);
    // Same height, so neither tile reads as the more important of the two.
    expect(Math.abs(left!.height - right!.height)).toBeLessThan(2);

    // And the row still closes: nothing overflows the page's horizontal scroll container.
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const rightEdge = main.getBoundingClientRect().left + main.clientWidth;
      return [...main.querySelectorAll('*')]
        .filter((el) => !el.closest('.sr-only'))
        .filter((el) => el.getBoundingClientRect().right > rightEdge + 0.5).length;
    });
    expect(overflow).toBe(0);
  });

  /**
   * THE HONESTY DEFECT. Tarsio's rows leave him +100 € today and −100 € once the 500 € still in
   * the calendar is paid. The page used to print the −100 € in the destructive token and headline
   * «lo stipendio di Tarsio non basta» — over money still in the account. The figure must be the
   * booked one, the colour must follow it, and the calendar must be its own clause.
   *
   * This asserts through the whole path (Firestore → summary → tile), which is what the unit
   * tests cannot do.
   */
  test('prints what has happened, and says separately where the calendar takes it', async ({ page }) => {
    await openDivisione(page);

    const tarsio = page.getByRole('region', { name: 'Quanto resta a Tarsio' });
    await expect(tarsio).toContainText(euro('100'));
    await expect(tarsio).toContainText(/Con le spese ancora in calendario mancano\s*100[\s ]*€/);

    // The hero figure is the booked one and wears the positive token, not the destructive one.
    const heroClass = await tarsio.locator('p.font-mono').first().getAttribute('class');
    expect(heroClass).toContain('text-positive');
    expect(heroClass).not.toContain('text-destructive');

    // And the verdict agrees: nobody is short TODAY.
    const verdict = page.getByRole('region', { name: 'Verdetto sulla divisione' });
    await expect(verdict).toContainText(/resta qualcosa a tutti/);
    await expect(verdict).toContainText(/Con quelle, a fine periodo/);
  });

  /**
   * Labor income nobody is named on cannot earn a share, and the page must SAY so: 1000 € of the
   * fixture's salaries are left «in comune», so 60/40 is computed on 4000 € of 5000 €. The
   * spending side always declared its orphans; the income side declared nothing.
   */
  test('declares the labor income the shares could not use, and the rows that lost their owner', async ({ page }) => {
    await openDivisione(page);

    await expect(page.getByRole('region', { name: 'Quota' })).toContainText(
      /Altri\s*1000[\s ]*€ di reddito da lavoro non sono intestati a nessuno/
    );
    await expect(page.getByRole('region', { name: 'In comune' })).toContainText(
      /sono di qualcuno che non è più in Famiglia/
    );
  });

  /**
   * The tab bar is a set of plain buttons, not Radix triggers, so Radix named every panel after a
   * trigger id that does not exist and the focused panel announced nothing. A dangling reference
   * is invisible to `tsc` and to every unit test.
   */
  test('the panel has an accessible name and its tab points at it', async ({ page }) => {
    await openDivisione(page);

    await expect(page.getByRole('tabpanel', { name: 'Divisione' })).toBeVisible();

    const wiring = await page.evaluate(() => {
      const tab = [...document.querySelectorAll('[role="tab"]')].find(
        (t) => t.getAttribute('aria-label') === 'Divisione' && t.getBoundingClientRect().width > 0
      )!;
      const controls = tab.getAttribute('aria-controls');
      const panel = controls ? document.getElementById(controls) : null;
      return {
        controls,
        resolves: !!panel,
        // Radix's own reference must be gone, not merely overridden by a label.
        dangling: panel?.getAttribute('aria-labelledby') ?? null,
      };
    });
    expect(wiring.controls).toBeTruthy();
    expect(wiring.resolves).toBe(true);
    expect(wiring.dangling).toBeNull();
  });

  /** The tab's ONE verb: the rows it counts are attributed on Tracciamento, and it now says so. */
  test('offers the way to attribute a row, filtered to the shared ones', async ({ page }) => {
    await openDivisione(page);

    const action = page.getByRole('button', { name: 'Attribuisci spese' });
    await expect(action).toBeVisible();
    await action.click();

    // Both halves matter: the address bar AND the panel. A `<Link>` moved the first and left the
    // second behind, because the route does not change and the page is not remounted.
    await expect(page).toHaveURL(/tab=tracking&owner=common/);
    await expect(page.getByRole('tabpanel', { name: 'Tracciamento' })).toBeVisible();
    // Tracciamento opens on that filter rather than leaving it to be found by hand. The control
    // is a shadcn `Select`, whose trigger is a combobox named by `aria-label`.
    await expect(page.getByRole('combobox', { name: 'Filtra per intestatario' })).toContainText('In comune');
  });
});
