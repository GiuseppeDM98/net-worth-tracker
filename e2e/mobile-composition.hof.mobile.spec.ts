/**
 * The small-screen composition, on its sample page (doc/mobile/MOB-02 § 7): Hall of Fame at 390,
 * on the `hof` fixture (`scripts/seedHallOfFameE2E.mts`: 47 snapshots, best month marzo 2024,
 * income record dicembre 2025 at 6900 €, savings record the same month at +3700 €, running month
 * settembre 2026 fourth).
 *
 * What a browser alone can prove here: the first screen holds the title, the first sentence,
 * the strip and THE tile; a never-opened row has an EMPTY panel; a row opens and closes with the
 * grid transition; the memory survives a reload; a strip cell opens its row and hands it the
 * focus; «Apri tutte» spares «Il perché»; reduced motion means no transition; the DOM order is
 * the vertical order at 390 AND at 1440, with no `order-*` left in the grid; nothing runs off
 * `main`. The words and the arithmetic are Vitest's (`__tests__/{narrative,mobileSections,
 * verdictStrip,hallOfFameNarrative,hallOfFameSummary}.test.ts`).
 *
 * The browser's clock is fixed at 15 settembre 2026 before every load: `summarizeHallOfFame`
 * reads «today» on the client, so settembre 2026 and the 2026 stay the running month and year
 * whatever the day the suite runs (the Firebase session is unaffected: the parked token expires
 * after the frozen instant, and the emulator does not check it).
 *
 * `.hof.mobile.spec.ts`: collected by `hof-mobile` alone (`playwright.config.ts`), never by `mobile`.
 * `openPage` is a copy of `e2e/hall-of-fame.hof.mobile.spec.ts`'s — importing a spec registers
 * its tests — with `.first()` on the level-2 heading: below `desktop:` «Il resto della pagina»
 * is a second `h2`.
 *
 * Seen red on 2026-10-10, one behaviour at a time: (1) the panel's content mounted while closed;
 * (2) the padding moved onto the panel's child (height 20px when closed); (3) the store write
 * removed from the handler (nothing in `localStorage` after the taps); (4) `reveal` without the
 * `focus()`; (5) `nextSectionsForAll` including the rest; (6) the panel's `transition` without
 * `motion-safe:`; (7) an `order-1` put back on the Entrate cell; (8) a `min-w-[420px]` on a cell.
 */

import { test, expect, type Page } from '@playwright/test';

/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
const TOUCH_FLOOR = 44;
const STORAGE_KEY = 'mobile-sections:hall-of-fame';
const ROW_IDS = ['hof-entrate', 'hof-risparmio', 'hof-anni', 'hof-note'] as const;
/** The fixture's story is written for September 2026: freeze the page there. */
const FIXTURE_NOW = new Date('2026-09-15T12:00:00+02:00');

async function openPage(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXTURE_NOW);
  await page.goto('/dashboard/hall-of-fame');
  await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible({ timeout: 45_000 });
  const empty = page.getByRole('heading', { level: 2, name: 'I record cominciano dal secondo snapshot' });
  if (await empty.isVisible()) {
    await page.getByRole('button', { name: 'Aggiorna i record' }).filter({ visible: true }).first().click();
  }
  await expect(page.getByRole('heading', { level: 2, name: 'Il tuo mese migliore è marzo 2024' })).toBeVisible({ timeout: 30_000 });
}

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const panel = (page: Page, id: string) => page.locator(`#${id}-panel`);
const panelHeight = (page: Page, id: string) => panel(page, id).evaluate((el) => el.getBoundingClientRect().height);
const perche = (page: Page) => page.getByRole('button', { name: /^Il perché/ });

test.describe('Hall of Fame, composed for a phone', () => {
  test('the first screen: title, first sentence, three cells, THE tile; the rows closed and empty below', async ({ page }) => {
    await openPage(page);

    // The verdict's first sentence stands alone; the rest is behind «Il perché».
    const verdict = page.getByRole('region', { name: 'Verdetto sui record' });
    await expect(verdict).toContainText('in un mese.');
    await expect(verdict.getByText(/Il 2026 è finora/)).toBeHidden();
    await expect(perche(page)).toBeVisible();
    await expect(perche(page)).toHaveAttribute('aria-expanded', 'false');
    expect(await perche(page).getAttribute('id')).toBeNull();

    // The strip: three cells, each a thumb's target, each the figure its tile prints.
    const strip = page.getByRole('list', { name: 'Le cifre del verdetto' });
    await expect(strip).toBeVisible();
    const cells = strip.getByRole('button');
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toContainText("Quest'anno");
    await expect(cells.nth(1)).toContainText(/Entrate record\s*6900\s?€/);
    await expect(cells.nth(2)).toContainText(/Risparmio record\s*\+3700\s?€/);
    for (let i = 0; i < 3; i++) {
      const box = await cells.nth(i).boundingBox();
      expect(box, `cell ${i}`).not.toBeNull();
      expect(box!.height, `cell ${i}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    // THE tile is open, with its reading.
    await expect(page.getByRole('region', { name: 'Record del patrimonio' })).toContainText('I tre mesi migliori valgono insieme');

    // Then «Il resto della pagina» and the four rows, closed, their panels empty.
    await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeVisible();
    const triggers = page.locator('main [id$="-trigger"]');
    await expect(triggers).toHaveCount(ROW_IDS.length);
    for (const id of ROW_IDS) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page, id)).toHaveAttribute('aria-controls', `${id}-panel`);
    }
    const anniPanel = panel(page, 'hof-anni');
    expect(await anniPanel.evaluate((el) => ({ inert: el.hasAttribute('inert'), children: el.children.length }))).toEqual({ inert: true, children: 0 });

    // The two actions close the page, after the Dettaglio (decision 25).
    const order = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const dettaglio = [...main.querySelectorAll('button')].find((b) => /^Dettaglio/.test(b.textContent ?? ''))!;
      const add = [...main.querySelectorAll('button')].filter((b) => b.textContent?.trim() === 'Aggiungi una nota' && b.checkVisibility()).at(-1)!;
      return dettaglio.compareDocumentPosition(add) & Node.DOCUMENT_POSITION_FOLLOWING;
    });
    expect(order).toBeTruthy();
  });

  test('«Anni» opens and closes again, down to 0px after the transition', async ({ page }) => {
    await openPage(page);
    const anni = trigger(page, 'hof-anni');

    await anni.click();
    await expect(anni).toHaveAttribute('aria-expanded', 'true');
    // The text aside keeps its place in the trigger when open (2026-10-10: moved into the panel it
    // was clipped under the trigger and jumped on every tap).
    await expect(anni).toContainText('crescita del patrimonio');
    await expect(panel(page, 'hof-anni')).not.toContainText('crescita del patrimonio');
    await expect(panel(page, 'hof-anni')).not.toHaveAttribute('inert');
    await expect(page.getByRole('region', { name: 'Gli anni con la crescita di patrimonio più alta' })).toContainText('Il tuo anno migliore è il');
    await expect.poll(() => panelHeight(page, 'hof-anni')).toBeGreaterThan(100);

    await anni.click();
    await expect(anni).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(400);
    expect(await panelHeight(page, 'hof-anni')).toBe(0);
    // Closed, the content stays mounted (opened once in this visit) but out of reach.
    await expect(panel(page, 'hof-anni')).toHaveAttribute('inert', '');
    expect(await panel(page, 'hof-anni').evaluate((el) => el.children.length)).toBeGreaterThan(0);
  });

  test('two rows opened are remembered across a reload', async ({ page }) => {
    await openPage(page);
    await trigger(page, 'hof-anni').click();
    await trigger(page, 'hof-entrate').click();
    await expect(trigger(page, 'hof-entrate')).toHaveAttribute('aria-expanded', 'true');

    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('["hof-anni","hof-entrate"]');

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('heading', { level: 2, name: 'Il tuo mese migliore è marzo 2024' })).toBeVisible({ timeout: 30_000 });
    await expect(trigger(page, 'hof-anni')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'hof-entrate')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'hof-risparmio')).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger(page, 'hof-note')).toHaveAttribute('aria-expanded', 'false');
  });

  test('«Quest\'anno» opens the Anni row, scrolls it into view and hands it the focus', async ({ page }) => {
    await openPage(page);
    const cell = page.getByRole('list', { name: 'Le cifre del verdetto' }).getByRole('button', { name: /^Quest'anno/ });
    await expect(cell).toHaveAccessibleName(/, apre Anni$/);
    await cell.click();

    await expect(trigger(page, 'hof-anni')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'hof-anni')).toBeFocused();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const rect = document.getElementById('hof-anni')!.getBoundingClientRect();
          return rect.top >= 0 && rect.top < window.innerHeight;
        }),
      )
      .toBe(true);
  });

  test('«Apri tutte» opens every row and leaves «Il perché» as it was', async ({ page }) => {
    await openPage(page);
    const toggle = page.getByRole('button', { name: 'Apri tutte' });
    await expect(toggle).toBeVisible();
    await toggle.click();

    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    await expect(perche(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('button', { name: 'Chiudi tutte' })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('["hof-anni","hof-entrate","hof-note","hof-risparmio"]');

    await page.getByRole('button', { name: 'Chiudi tutte' }).click();
    for (const id of ROW_IDS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('[]');
  });

  test('the DOM order is the vertical order at 390 and at 1440, and no order-* is left in the grid', async ({ page }) => {
    await openPage(page);
    const readOrder = () =>
      page.evaluate(() => {
        const main = document.querySelector('main')!;
        const sections = [...main.querySelectorAll<HTMLElement>('section.rounded-2xl')].filter((el) => el.checkVisibility());
        return sections.map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) }));
      });
    const isSorted = (tops: number[]) => tops.every((top, i) => i === 0 || top >= tops[i - 1] - 1);

    // An `order-*` utility, with or without a variant (`desktop:order-none`) — `border-*` is not one.
    const orderClasses = () =>
      page.evaluate(() =>
        [...document.querySelector('main')!.querySelectorAll('*')]
          .flatMap((el) => [...el.classList])
          .filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
      );

    const phone = await readOrder();
    expect(phone.length).toBeGreaterThanOrEqual(5);
    expect(isSorted(phone.map((s) => s.top)), JSON.stringify(phone)).toBe(true);
    expect(await orderClasses()).toEqual([]);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
    const desktop = await readOrder();
    expect(isSorted(desktop.map((s) => s.top)), JSON.stringify(desktop)).toBe(true);
    expect(desktop.map((s) => s.name).slice(0, 5)).toEqual([
      'Record del patrimonio',
      'I mesi con le entrate più alte',
      'I mesi in cui hai messo da parte di più',
      'Gli anni con la crescita di patrimonio più alta',
      'Note sui record',
    ]);
  });

  test('nothing runs off the side of main, rows closed and open', async ({ page }) => {
    await openPage(page);
    await page.getByRole('button', { name: 'Apri tutte' }).click();
    await page.waitForTimeout(600);

    const measurement = await page.evaluate(() => {
      const main = document.querySelector('main');
      if (!main) throw new Error('no <main> in the dashboard shell');
      const limit = main.getBoundingClientRect().left + main.clientWidth;
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
});

test.describe('Hall of Fame, composed for a phone, with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a row opens with no transition', async ({ page }) => {
    await openPage(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    const durations = await panel(page, 'hof-anni').evaluate((el) => {
      const chevron = document.querySelector('#hof-anni-trigger svg')!;
      return [getComputedStyle(el).transitionDuration, getComputedStyle(chevron).transitionDuration];
    });
    expect(durations).toEqual(['0s', '0s']);

    await trigger(page, 'hof-anni').click();
    await expect(trigger(page, 'hof-anni')).toHaveAttribute('aria-expanded', 'true');
    expect(await panelHeight(page, 'hof-anni')).toBeGreaterThan(100);
  });
});
