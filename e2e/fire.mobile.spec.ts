/**
 * FIRE e Simulazioni a 390px — il Calcolatore senza scorrimento orizzontale e, dal 2026-10-15, la
 * composizione delle cinque tab (le regole in doc/guide/fire.md § Composizione mobile e in DESIGN.md →
 * Small-Screen Composition).
 *
 * PERCHÉ ESISTE: l'hero `[2fr_1fr]` del vecchio tab è uscito dal viewport per due volte. La prima
 * fu misurata il 2026-08-18 mentre si ridisegnava il tab Coast e archiviata come debito noto; la
 * seconda la segnalò l'owner, come scorrimento orizzontale della pagina su mobile. Nessun test
 * poteva vederla: Vitest non ha un motore di layout, e `fire.spec.ts` gira a 1440px, dove la
 * griglia usa il suo template esplicito e il difetto non esiste. Dal 2026-08-25 il tab è una
 * griglia di tessere: la spec apre le righe («Apri tutte»), le due disclosure (Parametri,
 * Dettaglio) e il Ventaglio, così misura anche i grafici Recharts dentro le tessere.
 *
 * PERCHÉ SI MISURA `main` E NON IL DOCUMENTO: la shell della dashboard monta la pagina dentro
 * `<main class="flex-1 overflow-y-auto">`, e un `overflow-y` diverso da `visible` fa computare
 * `overflow-x: visible` a `auto`. Il contenitore di scroll orizzontale è quindi `main`, non il
 * documento — `document.scrollWidth - clientWidth` resta 0 anche mentre la pagina scorre di lato,
 * che è esattamente il motivo per cui il difetto è sopravvissuto alla prima misurazione.
 *
 * L'asserzione nomina gli elementi colpevoli invece di limitarsi al totale: un overflow è sempre
 * causato da un elemento preciso, e un fallimento che dice solo "81px" costringe a rifare da capo
 * la misura (AGENTS → *Tailwind Breakpoints*: misura gli elementi, non il documento).
 *
 * La composizione, su account base (il vincolo del fondo acceso da `scripts/seedCoastFireE2E.mts`:
 * RITA a 57 anni, sblocco nel 2048): il vincolo è la riga d'ambito sotto la striscia («Modello
 * ponte: fondo pensione escluso fino al 2048», The Binding-Clause Rule) e la sua frase sta dietro «Il perché»;
 * la memoria delle righe è per tab (`mobile-sections:fire-simulations:fire` e `:coast`), e a tab
 * smontata resta solo `localStorage`; Obiettivi, spento sul fixture base, è una tessera sola senza
 * «Il resto della pagina»; su What If l'Evento è la prima tessera del DOM (DESIGN.md → The Input Tile Rule).
 *
 * Visti rossi il 2026-10-15, una cosa alla volta: la chiave del controller senza `tab` (Coast
 * ricordava le righe del Calcolatore); `PageRest` reso anche nel ramo «disattivato» di Obiettivi (un
 * «Apri tutte» che non apre nulla). La terza falsificazione scritta quel giorno — «la riga d'ambito
 * passata anche a 1440» — non può andare rossa qui, dove `compact` è già vero: la vede `fire.spec.ts`,
 * che la registra dal 2026-10-16. Visti rossi il 2026-10-16: `order-4` rimesso sulla cella della Base
 * (il Calcolatore letto Traguardo → Scenari → Reddito → Base a schermo con lo stesso DOM); `order-1`
 * rimesso sull'Evento (ultimo a schermo, primo nel DOM).
 */

import { test, expect, type Page } from '@playwright/test';
import { atRest } from './atRest';

/** Le disclosure del tab: contenuto che l'owner aprirà, quindi contenuto da misurare. */
const DISCLOSURES = [/^Parametri/, /^Dettaglio/] as const;

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);

/**
 * Le tessere di una tab dall'alto in basso e ogni utility `order-*` dentro `main` (letta dalla
 * `classList`: `[class*="order-"]` prenderebbe ogni `border-*`). Dal 2026-10-15 il DOM è l'ordine
 * verticale su ogni tab e nessun `order-*` resta: fino ad allora il Calcolatore leggeva Traguardo →
 * Scenari → Reddito → Base con `order-1/4/3/2`, e What If metteva l'Evento in testa con `order-1`.
 */
async function readOrderAndClasses(page: Page, tab: string) {
  return page.getByRole('tabpanel', { name: tab }).evaluate((root) => {
    const main = root.closest('main')!;
    const sections = [...root.querySelectorAll<HTMLElement>('section.rounded-2xl')].filter((el) => el.checkVisibility());
    return {
      order: sections.map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) })),
      orderClasses: [...main.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
    };
  });
}
const isSorted = (tops: number[]) => tops.every((top, i) => i === 0 || top >= tops[i - 1] - 1);

async function gotoFire(page: Page): Promise<void> {
  await page.goto('/dashboard/fire-simulations', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sul FIRE' }).getByRole('heading', { level: 2 })).toBeVisible({ timeout: 30_000 });
  await expect(trigger(page, 'fire-reddito')).toBeVisible();
}

test('il tab Calcolatore FIRE non scorre in orizzontale a 390px, righe e disclosure aperte', async ({ page }) => {
  await gotoFire(page);

  // Sotto `desktop:` le tre tessere oltre il Traguardo sono righe chiuse e vuote: si aprono prima di misurare.
  await page.getByRole('button', { name: 'Apri tutte' }).click();
  await expect(page.getByRole('region', { name: 'Reddito passivo sostenibile' })).toContainText(/renderebbe|Registra|Aggiungi/);

  for (const label of DISCLOSURES) {
    const trigger = page.getByRole('button', { name: label });
    if ((await trigger.count()) > 0 && (await trigger.first().getAttribute('data-state')) === 'closed') {
      await trigger.first().click();
      await atRest(page);
    }
  }

  // Anche il Ventaglio, quando l'allocazione lo consente: 1000 percorsi Recharts nella tessera.
  const ventaglio = page.getByRole('button', { name: 'Ventaglio' });
  if ((await ventaglio.count()) > 0) {
    await ventaglio.click();
    await expect(page.locator('[role="img"][aria-label*="Ventaglio Monte Carlo"]')).toBeVisible({ timeout: 15_000 });
  }

  // E la Distribuzione (2026-09-24): tre KPI, l'istogramma SVG e due frasi lunghe in una tessera
  // a colonna singola — è la vista con più testo, quindi quella da misurare.
  const distribuzione = page.getByRole('button', { name: 'Distribuzione' });
  if ((await distribuzione.count()) > 0) {
    await distribuzione.click();
    await expect(page.locator('[role="img"][aria-label*="Distribuzione dell\'anno FIRE"]')).toBeVisible({ timeout: 15_000 });
  }

  // I grafici e i count-up si assestano tardi: una misura presa prima leggerebbe larghezze
  // intermedie.
  await atRest(page);

  const measurement = await page.evaluate(() => {
    const main = document.querySelector('main');
    if (!main) throw new Error('nessun <main> nella shell della dashboard');
    const limit = main.getBoundingClientRect().left + main.clientWidth;

    // Un solo px di tolleranza: i bordi sub-pixel di Chromium arrotondano verso l'alto.
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

  expect(measurement.offenders, `Elementi oltre il bordo destro di main (${measurement.clientWidth}px)`).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});

test.describe('FIRE, composto per un telefono', () => {
  test('il vincolo del fondo è la riga d\'ambito sotto la striscia, e la sua frase sta dietro «Il perché»', async ({ page }) => {
    await gotoFire(page);
    const verdict = page.getByRole('region', { name: 'Verdetto sul FIRE' });
    const lock = page.getByRole('switch', { name: 'Considera il fondo pensione come capitale bloccato fino allo sblocco' });
    // Il fixture base tiene il vincolo acceso (`seedCoastFireE2E.mts`); `fire.spec.ts` lo rimette com'era.
    await page.getByRole('button', { name: 'Apri tutte' }).click();
    await expect(lock).toHaveAttribute('aria-checked', 'true');

    const scope = verdict.getByText(/^Modello ponte: fondo pensione escluso fino al \d{4}$/).locator('visible=true');
    await expect(scope).toHaveCount(1);
    // La frase intera del vincolo è nel seguito: nascosta finché «Il perché» non si apre.
    const sentence = verdict.getByText(/resta bloccato fino al/);
    await expect(sentence).toBeHidden();
    const perche = verdict.getByRole('button', { name: /^Il perché/ });
    await expect(perche).toHaveText(/il fondo pensione$/);
    await perche.click();
    await expect(sentence).toBeVisible();

    // La striscia: due celle, «Ti mancano» (o «già FIRE») e «Rendita oggi».
    const cells = page.getByRole('list', { name: 'Le cifre del verdetto' }).getByRole('button');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toContainText(/^Ti mancano/);
    await expect(cells.nth(1)).toContainText(/^Rendita oggi/);
  });

  test('il Calcolatore legge Traguardo, Base, Reddito, Scenari dall\'alto in basso, e nessun order-* resta', async ({ page }) => {
    await gotoFire(page);
    const { order, orderClasses } = await readOrderAndClasses(page, 'Calcolatore FIRE');
    expect(order.map((section) => section.name).slice(0, 4)).toEqual(['Traguardo FIRE', 'Base di calcolo del FIRE', 'Reddito passivo sostenibile', 'Scenari di mercato']);
    expect(isSorted(order.map((section) => section.top)), JSON.stringify(order)).toBe(true);
    expect(orderClasses).toEqual([]);
  });

  test('ogni tab ricorda le sue righe: aprire sul Calcolatore, passare a Coast, aprire lì, tornare', async ({ page }) => {
    await gotoFire(page);
    await trigger(page, 'fire-base').click();
    await expect(trigger(page, 'fire-base')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => localStorage.getItem('mobile-sections:fire-simulations:fire'))).toBe('["fire-base"]');

    await page.getByRole('tab', { name: 'Coast FIRE' }).click();
    await expect(page.getByRole('region', { name: 'Verdetto sul Coast FIRE' })).toBeVisible({ timeout: 30_000 });
    // Una memoria per tab: Coast parte chiusa, la chiave è la sua.
    await expect(trigger(page, 'coast-scenari')).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger(page, 'coast-afflussi')).toHaveAttribute('aria-expanded', 'false');
    await trigger(page, 'coast-scenari').click();
    await expect(trigger(page, 'coast-scenari')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate(() => localStorage.getItem('mobile-sections:fire-simulations:coast'))).toBe('["coast-scenari"]');
    expect(await page.evaluate(() => localStorage.getItem('mobile-sections:fire-simulations:fire'))).toBe('["fire-base"]');

    // Tornando, la tab smontata rilegge solo `localStorage`: la Base è aperta, le altre no.
    await page.getByRole('tab', { name: 'Calcolatore FIRE' }).click();
    await expect(trigger(page, 'fire-base')).toHaveAttribute('aria-expanded', 'true', { timeout: 30_000 });
    await expect(trigger(page, 'fire-reddito')).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger(page, 'fire-scenari')).toHaveAttribute('aria-expanded', 'false');
  });

  test('Obiettivi spento: una tessera sola, nessun «Il resto della pagina»', async ({ page }) => {
    await gotoFire(page);
    await page.getByRole('tab', { name: 'Obiettivi' }).click();
    const verdict = page.getByRole('region', { name: 'Verdetto sugli obiettivi' });
    await expect(verdict.getByRole('heading', { level: 2, name: 'Gli obiettivi non sono attivi' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('region', { name: 'Obiettivi', exact: true })).toBeVisible();
    const panel = page.getByRole('tabpanel', { name: 'Obiettivi' });
    await expect(panel.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toHaveCount(0);
    await expect(panel.locator('[id$="-trigger"]')).toHaveCount(0);
    await expect(panel.getByRole('button', { name: 'Apri tutte' })).toHaveCount(0);
  });

  test('What If: l\'Evento è la prima tessera del DOM, le altre tre righe chiuse', async ({ page }) => {
    await gotoFire(page);
    await page.getByRole('tab', { name: 'What If' }).click();
    await expect(page.getByRole('region', { name: 'Verdetto sul What If' })).toBeVisible({ timeout: 30_000 });
    const panel = page.getByRole('tabpanel', { name: 'What If' });
    const names = await panel.locator('section.rounded-2xl').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    expect(names.slice(0, 4)).toEqual(['Evento simulato', "Prima e dopo l'evento", "Delta dell'evento", 'Sensibilità degli anni al FIRE']);
    // Il DOM è anche l'ordine verticale (un `order-1` rimesso sull'Evento lo porterebbe in fondo a schermo con lo stesso DOM).
    const { order, orderClasses } = await readOrderAndClasses(page, 'What If');
    expect(isSorted(order.map((section) => section.top)), JSON.stringify(order)).toBe(true);
    expect(orderClasses).toEqual([]);
    for (const id of ['whatif-prima-dopo', 'whatif-delta', 'whatif-sensibilita']) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
    }
    await expect(panel.locator('#whatif-prima-dopo-trigger')).toBeVisible();
    await expect(page.getByRole('group', { name: 'Tipo di evento' })).toBeVisible();
  });
});
