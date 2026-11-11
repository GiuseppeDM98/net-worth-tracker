/**
 * Analisi composed for a phone (since 2026-10-14; doc/guide/cashflow-analisi.md
 * § Composizione mobile), on the analisi account at 390 (`analisi-mobile` project; every row in
 * January, `scripts/seedAnalisiE2E.mts`).
 *
 * What a browser alone can prove here: the Scheda is a row that OPENS BY ITSELF — from a deep link
 * (focus on its trigger), and again after its chevron closed it and the page reloaded (the URL
 * keeps the focus); from a category row it opens and «Chiudi» hands the focus back to that row;
 * Escape on its trigger does nothing, inside its panel closes it; the calendar is the verdict's
 * `scope`, under the strip; the Periodo trio is lifted; the DOM order is the vertical order with no
 * `order-*`.
 *
 * Seen red on 2026-10-14: (1) the `reveal` removed from the URL restore (`landOnScheda` scrolling
 * only) — the Scheda stayed closed after the reload; (2) the panel test dropped from the Scheda's
 * Escape handler — Escape on the trigger closed the focus; (3) `expensesDeltaLifted` dropped from
 * the Periodo — «↓ 13,3%» visible under the sentence that prints it.
 *
 * A race of this test, not of the page (traced on 2026-11-11, red once on 2026-10-15, twice on
 * 2026-11-11): on the SECOND opening the Scheda row is remembered open, so `aria-expanded` is true at
 * the first render, before `landOnScheda`'s 50 ms timer lands the focus on its trigger (one landing,
 * counted with a `focusin` log); a focus moved into the panel before that landing was taken back, and
 * Escape on the trigger does nothing by design (2 runs in 20). The test waits for the landing first.
 * Seen red, 3 runs of 3, with the timer at 300 ms and a 400 ms pause before Escape; green with the wait.
 */

import { test, expect, type Page } from '@playwright/test';

test.setTimeout(90_000);

const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const CURRENT_YEAR = new Date().getFullYear();
/** A row still in the calendar this year: the 28th of December, at noon UTC (the same Italian day). */
const CALENDAR_ROW = { id: 'e2e-exp-mob06-ornitorinco', date: new Date(Date.UTC(CURRENT_YEAR, 11, 28, 12)).toISOString() };

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const verdictOf = (page: Page) => page.getByRole('region', { name: 'Verdetto del periodo' });

async function openAnalisi(page: Page, query = '') {
  await page.goto(`/dashboard/analisi${query}`);
  await verdictOf(page).waitFor({ timeout: 60_000 });
}

test.describe('Analisi, composed for a phone', () => {
  test('a deep link to a category opens the Scheda row and lands on its trigger', async ({ page }) => {
    await openAnalisi(page, '?focusType=variable&focusCat=e2e-cat-alimentari');
    await expect(trigger(page, 'analisi-scheda')).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    await expect(trigger(page, 'analisi-scheda')).toBeFocused();
    await expect(trigger(page, 'analisi-scheda')).toContainText('Alimentari');
    await expect(page.locator('#analisi-scheda-panel')).toContainText('Alimentari');
  });

  test('the chevron closes the row, not the focus: a reload opens it again', async ({ page }) => {
    await openAnalisi(page, '?focusType=variable&focusCat=e2e-cat-alimentari');
    await expect(trigger(page, 'analisi-scheda')).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    await trigger(page, 'analisi-scheda').click();
    await expect(trigger(page, 'analisi-scheda')).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/focusCat=e2e-cat-alimentari/);
    // Escape on the trigger does nothing: the row and the focus stay.
    await trigger(page, 'analisi-scheda').focus();
    await page.keyboard.press('Escape');
    await expect(trigger(page, 'analisi-scheda')).toBeVisible();
    await expect(page).toHaveURL(/focusCat=e2e-cat-alimentari/);

    await page.reload();
    await verdictOf(page).waitFor({ timeout: 60_000 });
    await expect(trigger(page, 'analisi-scheda')).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
  });

  test('a category row opens the Scheda; «Chiudi» hands the focus back to that row; Escape inside closes it', async ({ page }) => {
    await openAnalisi(page);
    await trigger(page, 'analisi-spese').click();
    const row = page.locator('#analisi-spese-panel').getByRole('button', { name: /^Casa, / });
    await row.click();
    await expect(trigger(page, 'analisi-scheda')).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    await page.locator('#analisi-scheda-panel').getByRole('button', { name: 'Chiudi la scheda' }).click();
    await expect(trigger(page, 'analisi-scheda')).toHaveCount(0);
    await expect(row).toBeFocused();

    await row.click();
    await expect(trigger(page, 'analisi-scheda')).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    // The landing first: the row is remembered open, so the attribute above can come before the focus.
    await expect(trigger(page, 'analisi-scheda')).toBeFocused();
    await page.locator('#analisi-scheda-panel').getByRole('button', { name: /Indietro/ }).focus();
    await page.keyboard.press('Escape');
    await expect(trigger(page, 'analisi-scheda')).toHaveCount(0);
  });

  test('the first screen: the first sentence, Entrate and Risparmio, the Periodo trio lifted, the rows closed in DOM order', async ({ page }) => {
    await openAnalisi(page);
    const verdict = verdictOf(page);
    await expect(verdict.getByText(/hai speso/)).toBeVisible();
    await expect(verdict.getByText(/pesa/)).toBeHidden();
    const cells = page.getByRole('list', { name: 'Le cifre del verdetto' }).getByRole('button');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toContainText(/^Entrate2000\s?€/);
    await expect(cells.nth(1)).toContainText(/^Risparmio1220\s?€/);
    // The trio's values are the strip's and the sentence's: lifted; the rate and the coverage stay.
    const periodo = page.getByRole('region', { name: 'Periodo', exact: true });
    await expect(periodo.getByText(/^2000\s?€$/)).toBeHidden();
    await expect(periodo.getByText(/^61,0%$/)).toBeVisible();
    // The spending delta is the first sentence's pacing (−13,3% su 2025): lifted (since 2026-10-14); the
    // income delta, which nothing above prints, stays.
    await expect(verdict.getByText(/−13,3%/)).toBeVisible();
    await expect(periodo.getByText('↓ 13,3%')).toBeHidden();
    await expect(periodo.getByText('↑ 5,3%')).toBeVisible();

    const order = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('main section.rounded-2xl')]
        .filter((el) => el.checkVisibility())
        .map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) })),
    );
    expect(order.map((s) => s.name)).toEqual(['Periodo', 'Fuori scala', 'Spese maggiori', 'Spese per categoria', 'Entrate per categoria', 'Flusso']);
    expect(order.every((s, i) => i === 0 || s.top >= order[i - 1].top - 1), JSON.stringify(order)).toBe(true);
    expect(
      await page.evaluate(() => [...document.querySelector('main')!.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name))),
    ).toEqual([]);
  });

  test.describe('with a row still in the calendar', () => {
    test.beforeAll(async () => {
      const res = await fetch(`${FIRESTORE}/expenses/${CALENDAR_ROW.id}`, {
        method: 'PATCH',
        headers: OWNER,
        body: JSON.stringify({
          fields: {
            userId: { stringValue: 'test-user-analisi' },
            type: { stringValue: 'variable' },
            categoryId: { stringValue: 'e2e-cat-alimentari' },
            categoryName: { stringValue: 'Alimentari' },
            amount: { doubleValue: -50 },
            currency: { stringValue: 'EUR' },
            notes: { stringValue: 'ornitorinco' },
            date: { timestampValue: CALENDAR_ROW.date },
            createdAt: { timestampValue: CALENDAR_ROW.date },
            updatedAt: { timestampValue: CALENDAR_ROW.date },
          },
        }),
      });
      expect(res.ok).toBe(true);
    });
    test.afterAll(async () => {
      await fetch(`${FIRESTORE}/expenses/${CALENDAR_ROW.id}`, { method: 'DELETE', headers: OWNER });
      expect((await fetch(`${FIRESTORE}/expenses/${CALENDAR_ROW.id}`, { headers: OWNER })).status).toBe(404);
    });

    test('the calendar is the verdict\'s scope, under the strip, never a clause of the sentence', async ({ page }) => {
      test.skip(new Date().getMonth() === 11 && new Date().getDate() >= 28, 'the decoy is no longer ahead');
      await openAnalisi(page);
      const verdict = verdictOf(page);
      const scope = verdict.getByText(/Nel totale ci sono ancora 50\s?€ di spese già in calendario da qui a fine anno\./).filter({ visible: true });
      await expect(scope).toBeVisible();
      const [stripBottom, scopeTop] = await Promise.all([
        page.getByRole('list', { name: 'Le cifre del verdetto' }).evaluate((el) => el.getBoundingClientRect().bottom),
        scope.evaluate((el) => el.getBoundingClientRect().top),
      ]);
      expect(scopeTop).toBeGreaterThanOrEqual(stripBottom - 1);
    });
  });
});
