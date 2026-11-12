/**
 * Allocazione › Accumulo a 390px — la composizione per il telefono (2026-10-18; le regole in
 * doc/guide/accumulo.md § Composizione mobile e in DESIGN.md → Small-Screen Composition).
 *
 * PERCHÉ ESISTE: la pagina era una pila di sei tessere aperte; ora ha il verdetto tagliato dopo la prima
 * frase («Il perché · il rientro nella banda»), una striscia di celle da pollice, LA tessera Questo mese
 * aperta e due righe chiuse al massimo nell'ordine del DOM. Il solo browser può provare che le celle sono un
 * bersaglio da pollice, che aprono ciò che dicono, che i pannelli chiusi sono vuoti e `inert`, che la
 * memoria sopravvive al reload e ha la chiave DELLA SCHEDA (non quella di Bilanciamento), che nessun
 * `order-*` resta e nulla sfora `main`. Parole e aritmetica sono di Vitest
 * (`__tests__/accumulo{Summary,Narrative}.test.ts`, `accumulationNarrative.test.ts`).
 *
 * Account base (`test@example.com`) con il fixture di `e2e/accumuloFixture.ts`: UN piano attivo, la terza
 * rata aperta. Si asserisce la STRUTTURA, mai una cifra: gli importi seguono i
 * prezzi del seed. La terza cella dipende dal fixture (una classe fuori banda o «tutte in soglia»): si
 * asserisce che dica l'una o l'altra cosa.
 */

import { test, expect, type Page } from '@playwright/test';
import { removeAccumuloFixture, seedAccumuloFixture } from './accumuloFixture';

const TOUCH_FLOOR = 44;
const STORAGE_KEY = 'mobile-sections:allocation:accumulo';
/** Le righe con un piano attivo e nessun piano concluso: soltanto Classi del piano. */
const ROW_IDS = ['acc-classi'] as const;

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const panel = (page: Page, id: string) => page.locator(`#${id}-panel`);
const stripOf = (page: Page) => page.getByRole('list', { name: 'Le cifre del verdetto' });

test.beforeAll(seedAccumuloFixture);
test.afterAll(removeAccumuloFixture);

async function openAccumulo(page: Page): Promise<void> {
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sul piano di accumulo' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: 'Questo mese' })).toBeVisible({ timeout: 30_000 });
}

/** Elementi oltre il bordo destro di `main`, nominati (AGENTS.md → Tailwind Breakpoints). */
async function measureOverflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.getBoundingClientRect().left + main.clientWidth + 1;
    const offenders = Array.from(main.querySelectorAll<HTMLElement>('*'))
      .filter((el) => el.offsetWidth > 0 && !el.closest('.sr-only') && !el.closest('.overflow-x-auto') && el.getBoundingClientRect().right > limit)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(el.getBoundingClientRect().right - limit)}px`);
    return { scrollWidth: main.scrollWidth, clientWidth: main.clientWidth, offenders };
  });
}

test.describe('Accumulo, composto per un telefono', () => {
  test('la prima schermata: tre celle da pollice, Questo mese aperta, una riga chiusa e vuota', async ({ page }) => {
    await openAccumulo(page);

    // Le tre celle: la rata, l'investito e la classe più lontana dalla banda (o «tutte in soglia»).
    const cells = stripOf(page).getByRole('button');
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toContainText(/^Rata di /);
    await expect(cells.nth(0)).toHaveAccessibleName(/, apre questo mese$/);
    await expect(cells.nth(1)).toContainText(/^Investito/);
    await expect(cells.nth(1)).toHaveAccessibleName(/, apre Classi del piano$/);
    await expect(cells.nth(2)).toContainText(/(sopra|sotto|tutte in soglia)/);
    await expect(cells.nth(2)).toHaveAccessibleName(/, apre il perché$/);
    for (let i = 0; i < 3; i++) {
      const box = (await cells.nth(i).boundingBox())!;
      expect(box.height, `cella ${i}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    // Il verdetto è tagliato: «Il perché · il rientro nella banda» chiuso, il testo del rientro nascosto.
    const why = page.getByRole('button', { name: /^Il perché · il rientro nella banda/ });
    await expect(why).toHaveAttribute('aria-expanded', 'false');

    // «Calendario», «Rivedi il piano» e «Interrompi» restano bersagli da pollice in LA tessera.
    const month = page.getByRole('region', { name: 'Questo mese' });
    for (const name of ['Calendario', 'Rivedi il piano', 'Interrompi']) {
      const box = (await month.getByRole('button', { name }).boundingBox())!;
      expect(box.height, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    // «Il resto della pagina», poi la riga chiusa di Classi del piano.
    await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeVisible();
    const triggers = page.locator('main [id$="-trigger"]');
    await expect(triggers).toHaveCount(ROW_IDS.length);
    expect(await triggers.evaluateAll((els) => els.map((el) => el.id))).toEqual(ROW_IDS.map((id) => `${id}-trigger`));
    for (const id of ROW_IDS) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page, id)).toHaveAttribute('aria-controls', `${id}-panel`);
      expect(await panel(page, id).evaluate((el) => ({ inert: el.hasAttribute('inert'), children: el.children.length })), id).toEqual({ inert: true, children: 0 });
    }
  });

  test('«Investito» apre Classi del piano e gli dà il fuoco; la terza cella apre «Il perché»', async ({ page }) => {
    await openAccumulo(page);
    await stripOf(page).getByRole('button', { name: /^Investito/ }).click();
    await expect(trigger(page, 'acc-classi')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'acc-classi')).toBeFocused();
    await expect(page.getByRole('region', { name: 'Classi del piano' })).toContainText('Oggi e a fine piano');

    await stripOf(page).getByRole('button').nth(2).click();
    await expect(page.getByRole('button', { name: /^Il perché · il rientro nella banda/ })).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByText(/tutto il piano è in banda|già in banda|fuori banda/).first()).toBeVisible();
  });

  test('«Rata di …» porta a Questo mese, che non si chiude mai', async ({ page }) => {
    await openAccumulo(page);
    await stripOf(page).getByRole('button', { name: /^Rata di / }).click();
    const month = page.getByRole('region', { name: 'Questo mese' });
    await expect(month).toBeInViewport();
    await expect(page.locator('#acc-mese button:focus')).toHaveCount(1);
    // LA tessera non è una riga: nessun trigger dentro.
    await expect(month.locator('[id$="-trigger"]')).toHaveCount(0);
  });

  test('Classi del piano è una riga: apre con il suo contenuto e la memoria è quella della scheda, dopo un reload', async ({ page }) => {
    await openAccumulo(page);
    await trigger(page, 'acc-classi').click();
    await expect(page.getByRole('region', { name: 'Classi del piano' })).toContainText('Oggi e a fine piano');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('["acc-classi"]');
    // La memoria di Bilanciamento non si muove.
    expect(await page.evaluate(() => localStorage.getItem('mobile-sections:allocation'))).toBeNull();

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('region', { name: 'Questo mese' })).toBeVisible({ timeout: 60_000 });
    await expect(trigger(page, 'acc-classi')).toHaveAttribute('aria-expanded', 'true');
  });

  test('nessun order-* resta, nulla sfora main, e a 1440 le righe spariscono', async ({ page }) => {
    await openAccumulo(page);
    // Un'utility `order-*`, con o senza variante — `border-*` non lo è (letto dalla `classList`).
    const orderClasses = () =>
      page.evaluate(() =>
        [...document.querySelector('main')!.querySelectorAll('*')]
          .flatMap((el) => [...el.classList])
          .filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
      );
    expect(await orderClasses()).toEqual([]);

    // L'ordine verticale è quello del DOM: Questo mese, poi Classi del piano.
    const names = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      return [...main.querySelectorAll<HTMLElement>('section.rounded-2xl')]
        .filter((el) => el.checkVisibility())
        .map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) }));
    });
    expect(names.map((s) => s.name)).toEqual(['Questo mese', 'Classi del piano']);
    expect(names.every((s, i) => i === 0 || s.top >= names[i - 1].top - 1), JSON.stringify(names)).toBe(true);

    await page.getByRole('button', { name: 'Apri tutte' }).click();
    await page.waitForTimeout(600);
    const open = await measureOverflow(page);
    expect(open.offenders, `elementi oltre il bordo destro di main (${open.clientWidth}px)`).toEqual([]);
    expect(open.scrollWidth).toBe(open.clientWidth);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
    await expect(page.getByRole('list', { name: 'Le cifre del verdetto' })).toBeHidden();
    // A 1440 le due colonne: Questo mese a sinistra, Classi del piano a destra, alla stessa quota.
    const desktop = await page.evaluate(() => {
      const left = (label: string) => document.querySelector(`section[aria-label="${label}"]`)!.getBoundingClientRect();
      return { mese: left('Questo mese'), classi: left('Classi del piano') };
    });
    expect(desktop.classi.left, 'Classi del piano nella colonna destra').toBeGreaterThan(desktop.mese.right - 1);
    expect(Math.abs(desktop.classi.top - desktop.mese.top), 'Classi del piano alla quota di Questo mese').toBeLessThanOrEqual(1);
  });
});
