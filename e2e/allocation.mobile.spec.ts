/**
 * Allocazione a 390px — la riga di copertura dell'Esposizione (dal 2026-09-28) e, dal 2026-10-15,
 * la composizione della pagina (le regole in doc/guide/allocazione.md § Composizione mobile e in
 * DESIGN.md → Small-Screen Composition).
 *
 * PERCHÉ ESISTE: la riga di copertura (letto · non letto · non applicabile · fuori vista) è una
 * frase con quattro importi e i nomi degli strumenti, sopra un elenco a quattro colonne, e nessuna
 * misura la vedeva su un telefono. Dal 2026-10-15 la pagina è composta: il solo browser può provare
 * che le due celle sono un bersaglio da pollice e che il valore del KPI «Fuori posizione» è
 * nascosto mentre la didascalia «… da spostare» e la lettura restano; che le quattro righe chiuse
 * seguono l'ordine del DOM (Per classe PRIMA del Piano) con il pannello vuoto e `inert`; che la cella
 * apre il Piano e gli dà il fuoco; che a riga chiusa NESSUNA richiesta parte verso i profili
 * (`/api/portfolio/instrument-profiles`) e che una lettura fallita è una riga rossa con UN nodo
 * vivo; che la memoria sopravvive al reload; che nessun `order-*` resta nella griglia e nulla
 * sfora `main`. Parole e aritmetica sono di Vitest (`__tests__/allocazione{Summary,Narrative}.test.ts`).
 *
 * Account base (`test@example.com`); i profili di Yahoo vengono dal seed
 * (`scripts/instrumentProfileFixtures.ts`), quindi nessuna chiamata alla rete. Si asserisce la
 * STRUTTURA, mai una cifra: gli importi dipendono dai prezzi del seed e dal mese in cui gira la suite.
 * Ogni caso che legge dentro l'Esposizione la APRE prima: sotto `desktop:` una riga mai aperta ha
 * il pannello vuoto (doc/guide/e2e-emulatori.md).
 *
 * Visti rossi il 2026-10-15, una cosa alla volta: (1) il valore del KPI nascosto a prescindere dalla
 * striscia (sul fixture base la cella è «nulla» e il KPI resta intero); (2) `reveal` senza il `focus()`; (3) `enabled` sempre vero nel
 * hook (una richiesta ai profili a riga chiusa); (4) `failed` sempre falso sulla sezione
 * (l'eyebrow non rosso, nessun annuncio); (5) la scrittura nello store tolta dal gestore (nulla
 * in `localStorage`); (6) un `min-w-[420px]` su una cella (uno sforamento di `main`). Il
 * 2026-10-16: `failed` sempre falso sulla sezione dell'Esposizione — i due casi di lettura fallita
 * rossi insieme; l'«Aggiorna» fallito con i profili già letti è il caso aggiunto quel giorno. Il ramo
 * «valore nascosto» di (1) non corre sul fixture base (la cella è «nulla»): il nascondere lo tiene
 * `__tests__/bilanciamentoTileLifted.test.ts`.
 */

import { test, expect, type Page } from '@playwright/test';

const TOUCH_FLOOR = 44;
const STORAGE_KEY = 'mobile-sections:allocation';
/** Le righe del fixture base, nell'ordine del DOM: Per classe prima del Piano; il fondo del seed accende Previdenza. */
const ROW_IDS = ['alloc-per-classe', 'alloc-piano', 'alloc-esposizione', 'alloc-previdenza'] as const;
const PROFILES_ROUTE = '**/api/portfolio/instrument-profiles**';

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const panel = (page: Page, id: string) => page.locator(`#${id}-panel`);
const stripOf = (page: Page) => page.getByRole('list', { name: 'Le cifre del verdetto' });

async function openAllocazione(page: Page): Promise<void> {
  await page.goto('/dashboard/allocation', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: "Verdetto sull'allocazione" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('region', { name: "Bilanciamento dell'allocazione" })).toBeVisible({ timeout: 30_000 });
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

test('a 390px la riga di copertura nomina la base e main non scorre di lato', async ({ page }) => {
  await openAllocazione(page);

  // Sotto `desktop:` l'Esposizione è una riga chiusa: si apre prima di leggerci dentro.
  await trigger(page, 'alloc-esposizione').click();
  const tile = page.getByRole('region', { name: 'Esposizione del portafoglio' });
  await tile.scrollIntoViewIfNeeded();
  // The coverage line is the anchor: present in both states, it says where every euro went.
  const coverage = tile.locator('p', { hasText: /In questa vista/ }).first();
  await expect(coverage).toBeVisible({ timeout: 30_000 });
  await expect(coverage).toContainText(/azionario nozionale/);
  await expect(tile.getByRole('list', { name: 'Titoli più pesanti' })).toBeVisible();

  const measurement = await measureOverflow(page);
  expect(measurement.offenders).toEqual([]);
  expect(measurement.scrollWidth).toBe(measurement.clientWidth);
});

test.describe('Allocazione, composta per un telefono', () => {
  test('la prima schermata: due celle da pollice, il KPI sollevato senza valore, la lettura intera, quattro righe chiuse e vuote nell\'ordine del DOM', async ({ page }) => {
    await openAllocazione(page);

    // Le due celle: «Fuori posizione» e lo scarto maggiore («{classe} sopra|sotto»), ciascuna ≥ 44 px.
    const cells = stripOf(page).getByRole('button');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toContainText(/^Fuori posizione/);
    await expect(cells.nth(0)).toHaveAccessibleName(/, apre Piano$/);
    await expect(cells.nth(1)).toContainText(/(sopra|sotto)/);
    await expect(cells.nth(1)).toHaveAccessibleName(/, apre Per classe$/);
    for (let i = 0; i < 2; i++) {
      const box = (await cells.nth(i).boundingBox())!;
      expect(box.height, `cella ${i}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    }

    // LA tessera: con una cella che stampa la percentuale il valore del KPI «Fuori posizione» è
    // nascosto (la striscia lo stampa) e la didascalia «… da spostare» resta sotto l'etichetta; con
    // la cella «nulla» (sotto la soglia: il fixture base) niente è sollevato e il KPI resta intero.
    // La lettura resta intera in entrambi i casi (DESIGN.md → The Lifted-Figure Rule).
    const bilanciamento = page.getByRole('region', { name: "Bilanciamento dell'allocazione" });
    const kpiLabel = bilanciamento.getByText('Fuori posizione', { exact: true });
    await expect(kpiLabel).toBeVisible();
    const kpiValue = kpiLabel.locator('xpath=following-sibling::p[1]');
    const outOfPosition = !/nulla/.test((await cells.nth(0).innerText()) ?? '');
    if (outOfPosition) {
      await expect(kpiValue).toBeHidden();
      await expect(bilanciamento.getByText(/da spostare$/)).toBeVisible();
      await expect(bilanciamento.getByText(/è fuori posizione/)).toBeVisible();
    } else {
      await expect(kpiValue).toBeVisible();
      await expect(kpiValue).toHaveText('0,0%');
      // «nulla è fuori posizione» senza leva né classi senza target, «lo 0,0% è fuori posizione» altrimenti.
      await expect(bilanciamento.getByText(/è fuori posizione/)).toBeVisible();
    }

    // «Il resto della pagina», poi le quattro righe chiuse: Per classe PRIMA del Piano (l'ordine del DOM).
    await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeVisible();
    const triggers = page.locator('main [id$="-trigger"]');
    await expect(triggers).toHaveCount(ROW_IDS.length);
    expect(await triggers.evaluateAll((els) => els.map((el) => el.id))).toEqual(ROW_IDS.map((id) => `${id}-trigger`));
    for (const id of ROW_IDS) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page, id)).toHaveAttribute('aria-controls', `${id}-panel`);
    }
    expect(await panel(page, 'alloc-piano').evaluate((el) => ({ inert: el.hasAttribute('inert'), children: el.children.length }))).toEqual({ inert: true, children: 0 });

    // «Modifica target» resta dopo l'ultima riga e prima del Dettaglio, fuori da «Il resto».
    const order = await page.evaluate(() => {
      const main = document.querySelector('main')!;
      const last = document.getElementById('alloc-previdenza')!;
      const action = [...main.querySelectorAll('a')].find((a) => a.textContent?.trim() === 'Modifica target' && a.checkVisibility())!;
      const dettaglio = [...main.querySelectorAll('button')].find((b) => /^Dettaglio/.test(b.textContent ?? ''))!;
      return { afterRows: !!(last.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING), beforeDettaglio: !!(action.compareDocumentPosition(dettaglio) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    expect(order).toEqual({ afterRows: true, beforeDettaglio: true });
  });

  test('«Fuori posizione» apre il Piano e gli dà il fuoco', async ({ page }) => {
    await openAllocazione(page);
    await stripOf(page).getByRole('button', { name: /^Fuori posizione/ }).click();
    await expect(trigger(page, 'alloc-piano')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'alloc-piano')).toBeFocused();
    await expect(page.getByRole('region', { name: 'Piano' })).toContainText(/Ribilancia|Versa|Preleva|in linea/);
  });

  test('a riga chiusa nessuna richiesta parte verso i profili; aprirla la fa partire', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/portfolio/instrument-profiles')) requests.push(request.url());
    });
    await openAllocazione(page);
    // La pagina è assestata (Per classe è nel DOM, il verdetto letto): un'attesa positiva prima dell'assenza.
    await expect(trigger(page, 'alloc-esposizione')).toHaveAttribute('aria-expanded', 'false');
    await page.waitForTimeout(1500);
    expect(requests).toEqual([]);

    await trigger(page, 'alloc-esposizione').click();
    await expect.poll(() => requests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    await expect(page.getByRole('region', { name: 'Esposizione del portafoglio' }).locator('p', { hasText: /In questa vista/ }).first()).toBeVisible({ timeout: 30_000 });
  });

  test('una lettura fallita dei profili è una riga rossa, aperta, con UN nodo vivo che la nomina', async ({ page }) => {
    await page.route(PROFILES_ROUTE, (route) => route.abort());
    await openAllocazione(page);

    const esposizione = trigger(page, 'alloc-esposizione');
    await esposizione.click();
    // La lettura fallisce all'apertura: la sezione porta `failed`, l'eyebrow dice «lettura fallita».
    await expect(page.locator('#alloc-esposizione')).toHaveAttribute('aria-label', 'Esposizione · lettura fallita', { timeout: 20_000 });
    await expect(panel(page, 'alloc-esposizione')).toContainText('non sono state lette');
    await expect(panel(page, 'alloc-esposizione').getByRole('button', { name: 'Riprova' })).toBeVisible();

    await esposizione.click();
    await expect(esposizione).toHaveAttribute('aria-expanded', 'false');
    await expect(esposizione.locator('span.text-destructive')).toHaveCount(1);

    // UN nodo vivo: l'annuncio di `PageRest`; la riga è silenziosa sotto `desktop:`.
    const alerts = page.locator('main [role="alert"]');
    await expect(alerts).toHaveCount(1);
    await expect(alerts.first()).toHaveText('Una sezione non è stata letta: Esposizione.');
    await page.unroute(PROFILES_ROUTE);
  });

  test('un «Aggiorna» fallito con i profili già letti tiene la tessera, senza alert, e la riga resta rossa', async ({ page }) => {
    await openAllocazione(page);
    await trigger(page, 'alloc-esposizione').click();
    const tile = page.getByRole('region', { name: 'Esposizione del portafoglio' });
    const coverage = tile.locator('p', { hasText: /In questa vista/ }).first();
    await expect(coverage).toBeVisible({ timeout: 30_000 });

    // The second failure: the profiles are read, «Aggiorna» fails — the list stays, the tile adds its
    // own notice, silent as a row (no `role="alert"`), and the section is `failed` all the same.
    await page.route(PROFILES_ROUTE, (route) => route.abort());
    await page.getByRole('button', { name: "Aggiorna l'esposizione" }).click();
    await expect(tile.getByText('Errore nel caricamento delle composizioni.')).toBeVisible({ timeout: 20_000 });
    await expect(coverage).toBeVisible();
    await expect(tile.locator('[role="alert"]')).toHaveCount(0);
    // A Tile row says it in its eyebrow (red, «, lettura fallita» for the reader), open or closed —
    // the `aria-label` form is the ErrorNotice row's, the failed FIRST read above.
    await expect(trigger(page, 'alloc-esposizione').locator('span.text-destructive')).toHaveCount(1);
    await expect(trigger(page, 'alloc-esposizione')).toContainText('lettura fallita');

    await trigger(page, 'alloc-esposizione').click();
    await expect(trigger(page, 'alloc-esposizione')).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger(page, 'alloc-esposizione').locator('span.text-destructive')).toHaveCount(1);
    const alerts = page.locator('main [role="alert"]');
    await expect(alerts).toHaveCount(1);
    await expect(alerts.first()).toHaveText('Una sezione non è stata letta: Esposizione.');
    await page.unroute(PROFILES_ROUTE);
  });

  test('due righe aperte sono ricordate dopo un reload', async ({ page }) => {
    await openAllocazione(page);
    await trigger(page, 'alloc-previdenza').click();
    await trigger(page, 'alloc-per-classe').click();
    await expect(trigger(page, 'alloc-per-classe')).toHaveAttribute('aria-expanded', 'true');
    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('["alloc-per-classe","alloc-previdenza"]');

    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('region', { name: "Bilanciamento dell'allocazione" })).toBeVisible({ timeout: 60_000 });
    await expect(trigger(page, 'alloc-per-classe')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'alloc-previdenza')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'alloc-piano')).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger(page, 'alloc-esposizione')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#alloc-per-classe')).toContainText('Azioni');
  });

  test('l\'ordine del DOM è quello verticale a 390 e a 1440, nessun order-* resta e nulla sfora main', async ({ page }) => {
    await openAllocazione(page);
    const readOrder = () =>
      page.evaluate(() => {
        const main = document.querySelector('main')!;
        const sections = [...main.querySelectorAll<HTMLElement>('section.rounded-2xl')].filter((el) => el.checkVisibility());
        return sections.map((el) => ({ name: el.getAttribute('aria-label'), top: Math.round(el.getBoundingClientRect().top) }));
      });
    const isSorted = (tops: number[]) => tops.every((top, i) => i === 0 || top >= tops[i - 1] - 1);
    // Un'utility `order-*`, con o senza variante — `border-*` non lo è (letto dalla `classList`).
    const orderClasses = () =>
      page.evaluate(() =>
        [...document.querySelector('main')!.querySelectorAll('*')]
          .flatMap((el) => [...el.classList])
          .filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
      );

    const phone = await readOrder();
    expect(phone.map((s) => s.name).slice(0, 5)).toEqual(["Bilanciamento dell'allocazione", 'Allocazione per classe', 'Piano', 'Esposizione del portafoglio', 'Previdenza complementare']);
    expect(isSorted(phone.map((s) => s.top)), JSON.stringify(phone)).toBe(true);
    expect(await orderClasses()).toEqual([]);

    await page.getByRole('button', { name: 'Apri tutte' }).click();
    await page.waitForTimeout(600);
    const open = await measureOverflow(page);
    expect(open.offenders, `elementi oltre il bordo destro di main (${open.clientWidth}px)`).toEqual([]);
    expect(open.scrollWidth).toBe(open.clientWidth);

    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('main [id$="-trigger"]')).toHaveCount(0);
    const desktop = await readOrder();
    expect(desktop.map((s) => s.name).slice(0, 2)).toEqual(["Bilanciamento dell'allocazione", 'Allocazione per classe']);
  });
});

/**
 * Accumulo a 390px: il bersaglio di «Crea piano».
 *
 * REGRESSION GUARD: visto rosso rimettendo `h-8` al posto di `TILE_ACTION_CLASS`. Copre SOLO lo stato
 * «nessun piano» (la composizione con un piano attivo è di `accumulo.mobile.spec.ts`).
 */
test('«Crea piano» dell’Accumulo è un bersaglio di almeno 44px sul telefono', async ({ page }) => {
  await page.goto('/dashboard/allocation?tab=accumulo', { waitUntil: 'load' });
  await expect(page.getByRole('region', { name: 'Verdetto sul piano di accumulo' })).toBeVisible({ timeout: 60_000 });

  const accumulo = page.locator('section[aria-label="Accumulo"]');
  const create = accumulo.getByRole('button', { name: 'Crea piano' });
  await expect(create).toBeVisible({ timeout: 30_000 });

  const box = await create.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
});
