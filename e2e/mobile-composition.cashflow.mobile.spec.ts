/**
 * The small-screen composition of Cashflow's tabs (since 2026-10-12; the rules in the five tab
 * guides § Composizione mobile and DESIGN.md → Small-Screen Composition): Tracciamento, Budget and
 * Dividendi at 390 on the BASE account (`scripts/seedEmulator.ts`: one salary of 2500 € and two
 * expenses, 320 € and 800 €, dated the 5th of the running month — or today, when the month is
 * younger). Divisione is `mobile-composition.cashflow.split.mobile.spec.ts`, on its own account.
 *
 * What a browser alone can prove here: the strip is the trio of THE tile, lifted — three cells
 * with the values, the tile's own figures hidden; the calendar's scope line appears when a row
 * is still ahead; the «+» saves and opens Movimenti on the row it wrote, the focus on it; a
 * Budget cell opens its row; a row stays open across tabs and a reload, remembered per tab; the
 * rows of Dividendi follow the DOM with no `order-*` left; a failed Rendimento read is an open
 * row that closes red, with ONE live node; reduced motion means no transition; nothing runs off
 * `main`. The words and the arithmetic are Vitest's.
 *
 * The fixture is bent three times, each undone after: a decoy expense at the end of the month
 * (planted and removed through the emulator's REST API, like `analisi.mobile.spec.ts`), a budget
 * ceiling the base account does not have (`cashflow.budget.mobile.spec.ts`), a coupon for the
 * Dividendi rows (the base account has none). The stats read is failed by REWRITING the answer
 * of `/api/dividends/stats` with `stats: null` (`route.fetch()` + `route.fulfill`, as
 * `panoramica.snapshot.spec.ts`), never by aborting it: since 2026-10-05 that request carries
 * the registry too, and an abort is the failure of the whole TAB.
 *
 * Seen red on 2026-10-12, one behaviour at a time: (1) the trio without `LIFTED_FIGURE_CLASS`,
 * and the coverage «×» hidden alone (the rate and the coverage stay when the values are lifted);
 * (2) `handleSuccess` without `reveal` (Movimenti closed) and without `returnFocusTo` (the focus
 * on the FAB); (3) the Tetto's lift ignored (its two KPIs visible at 390) and `@container`
 * removed from a KPI cell (the cells lose their container type — the overlap itself cannot be
 * reproduced on this fixture from 768, see the test); (5) an `order-2` put back on Rendimento's
 * cell; (6) `failed` read from `dividendsError` instead of `statsError`. The scheduled decoy is
 * dated noon UTC of the month's last day (its late evening was the NEXT month in Rome under
 * summer time: the scope assertion would have gone red from March to September).
 */

import { test, expect, type Page } from '@playwright/test';

/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
const TOUCH_FLOOR = 44;
const USER_ID = 'test-user-1';
const FIRESTORE = 'http://127.0.0.1:8080/v1/projects/demo-net-worth/databases/(default)/documents';
const OWNER = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Every decoy row carries this word in its note: the sweep before and after each test finds them by it. */
const DECOY = 'ornitorinco';
const SCHEDULED_DECOY_ID = 'e2e-exp-ornitorinco-calendario';
const SAVED_DECOY_NOTE = 'spesa ornitorinco salvata';
const COUPON_ID = 'e2e-dvd-ornitorinco';

const TRACKING_ROWS = ['trk-spese', 'trk-entrate', 'trk-risparmio', 'trk-movimenti'] as const;
const DIVIDEND_ROWS = ['dvd-affidabilita', 'dvd-rendimento', 'dvd-pagatori', 'dvd-per-anno', 'dvd-pagamenti'] as const;

const trigger = (page: Page, id: string) => page.locator(`#${id}-trigger`);
const panel = (page: Page, id: string) => page.locator(`#${id}-panel`);
const strip = (page: Page, tab: string) => page.getByRole('tabpanel', { name: tab }).getByRole('list', { name: 'Le cifre del verdetto' });

// ─── The emulator's REST API ──────────────────────────────────────────────────────────────────

/**
 * Every page of the collection: the emulator holds the rows of every fixture account (hof alone
 * has 94), and a single `pageSize=300` read left the decoy on the second page — seen on
 * 2026-10-12, «Spese 1170 €» on the run after the one that planted it.
 */
async function decoyExpenseIds(): Promise<string[]> {
  type Doc = { name: string; fields?: { userId?: { stringValue?: string }; notes?: { stringValue?: string } } };
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const url = `${FIRESTORE}/expenses?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await fetch(url, { headers: OWNER });
    if (!res.ok) return ids;
    const body = (await res.json()) as { documents?: Doc[]; nextPageToken?: string };
    for (const d of body.documents ?? []) {
      if (d.fields?.userId?.stringValue === USER_ID && (d.fields?.notes?.stringValue ?? '').includes(DECOY)) ids.push(d.name.split('/').pop() as string);
    }
    pageToken = body.nextPageToken;
  } while (pageToken);
  return ids;
}

async function removeDecoyExpenses(): Promise<void> {
  for (const id of await decoyExpenseIds()) await fetch(`${FIRESTORE}/expenses/${id}`, { method: 'DELETE', headers: OWNER });
  await expect.poll(decoyExpenseIds).toEqual([]);
}

/**
 * A 50 € expense on the LAST day of the running month, at noon UTC: still ahead of «today»
 * whatever the day the suite runs — except on that last day itself, which the census fixture
 * refuses as well (`scripts/mobileCensus.mjs`). Noon, not the late evening (2026-10-12, the
 * spec's retirement): 22:30 UTC on a last day under summer time is 00:30 of the NEXT month in
 * Rome, and `periodToRange` reads the local month — from March to September the decoy would
 * have left the period and the scope assertion below would have gone red.
 */
async function plantScheduledExpense(): Promise<void> {
  const now = new Date();
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 12, 0)).toISOString();
  const res = await fetch(`${FIRESTORE}/expenses/${SCHEDULED_DECOY_ID}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        userId: { stringValue: USER_ID },
        type: { stringValue: 'variable' },
        categoryId: { stringValue: 'seed-cat-food' },
        categoryName: { stringValue: 'Alimentari' },
        amount: { doubleValue: -50 },
        currency: { stringValue: 'EUR' },
        notes: { stringValue: `spesa ${DECOY} in calendario` },
        date: { timestampValue: date },
        createdAt: { timestampValue: date },
        updatedAt: { timestampValue: date },
      },
    }),
  });
  expect(res.ok).toBe(true);
}

/** The base account has no budget document: a ceiling of 1000 € is written whole, and deleted after. */
async function plantCeiling(): Promise<void> {
  const now = new Date().toISOString();
  const res = await fetch(`${FIRESTORE}/budgets/${USER_ID}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        userId: { stringValue: USER_ID },
        items: { arrayValue: {} },
        overallMonthlyAmount: { doubleValue: 1000 },
        alertsEnabled: { booleanValue: true },
        updatedAt: { timestampValue: now },
      },
    }),
  });
  expect(res.ok).toBe(true);
}

async function removeCeiling(): Promise<void> {
  await fetch(`${FIRESTORE}/budgets/${USER_ID}`, { method: 'DELETE', headers: OWNER });
  expect((await fetch(`${FIRESTORE}/budgets/${USER_ID}`, { headers: OWNER })).status).toBe(404);
}

/** One coupon of «BTP Valore 2030», paid twenty days ago: the registry is no longer empty, so the rows exist. */
async function plantCoupon(): Promise<void> {
  const paid = new Date();
  paid.setDate(paid.getDate() - 20);
  const paidIso = paid.toISOString();
  const res = await fetch(`${FIRESTORE}/dividends/${COUPON_ID}`, {
    method: 'PATCH',
    headers: OWNER,
    body: JSON.stringify({
      fields: {
        userId: { stringValue: USER_ID },
        assetId: { stringValue: 'seed-btp' },
        assetTicker: { stringValue: 'BTP' },
        assetName: { stringValue: 'BTP Valore 2030' },
        exDate: { timestampValue: paidIso },
        paymentDate: { timestampValue: paidIso },
        dividendPerShare: { doubleValue: 6.5 },
        quantity: { doubleValue: 5 },
        grossAmount: { doubleValue: 32.5 },
        taxAmount: { doubleValue: 4.0625 },
        netAmount: { doubleValue: 28.4375 },
        currency: { stringValue: 'EUR' },
        dividendType: { stringValue: 'coupon' },
        notes: { stringValue: `cedola ${DECOY}` },
        isAutoGenerated: { booleanValue: false },
        createdAt: { timestampValue: paidIso },
        updatedAt: { timestampValue: paidIso },
      },
    }),
  });
  expect(res.ok).toBe(true);
}

async function removeCoupon(): Promise<void> {
  await fetch(`${FIRESTORE}/dividends/${COUPON_ID}`, { method: 'DELETE', headers: OWNER });
  expect((await fetch(`${FIRESTORE}/dividends/${COUPON_ID}`, { headers: OWNER })).status).toBe(404);
}

// ─── Openers ─────────────────────────────────────────────────────────────────────────────────

async function openTracciamento(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow');
  await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#trk-periodo')).toBeVisible();
}

async function openBudget(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow?tab=budget');
  await expect(page.getByRole('region', { name: 'Verdetto sul budget' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#bud-tetto')).toBeVisible();
}

async function openDividendi(page: Page): Promise<void> {
  await page.goto('/dashboard/cashflow?tab=dividends');
  await expect(page.getByRole('region', { name: 'Verdetto sui dividendi' })).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#dvd-incasso')).toBeVisible();
}

test.describe('Cashflow › Tracciamento, composed for a phone', () => {
  test.beforeEach(removeDecoyExpenses);
  test.afterEach(removeDecoyExpenses);

  test('the first screen: title, the three cells of the trio, THE tile without its figures; the rows closed and empty; the scope when a row is ahead', async ({ page }) => {
    await openTracciamento(page);
    const verdict = page.getByRole('region', { name: 'Verdetto del periodo' });

    // The axis under the title, the period picker a thumb's target.
    const picker = verdict.getByRole('combobox', { name: /^Periodo selezionato:/ });
    await expect(picker).toBeVisible();
    expect((await picker.boundingBox())!.height).toBeGreaterThanOrEqual(TOUCH_FLOOR);

    // The strip: the period's trio, each cell the figure THE tile prints, each a thumb's target.
    const cells = strip(page, 'Tracciamento').getByRole('button');
    await expect(cells).toHaveCount(3);
    await expect(cells.nth(0)).toContainText(/Entrate\s*2500\s?€/);
    await expect(cells.nth(1)).toContainText(/Spese\s*1120\s?€/);
    await expect(cells.nth(2)).toContainText(/Risparmio\s*1380\s?€/);
    await expect(cells.nth(0)).toHaveAccessibleName(/, apre Entrate per categoria$/);
    for (let i = 0; i < 3; i++) expect((await cells.nth(i).boundingBox())!.height, `cell ${i}`).toBeGreaterThanOrEqual(TOUCH_FLOOR);

    // THE tile is open; its trio is lifted into the strip: the three VALUES hidden, their labels
    // and the lines under them still there (doc/guide/cashflow-tracciamento.md § Composizione mobile).
    const theTile = page.locator('#trk-periodo');
    const lifted = theTile.locator('[class~="max-desktop:hidden"]');
    await expect(lifted).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(lifted.nth(i)).toBeHidden();
    for (const label of ['Entrate', 'Spese', 'Risparmio']) await expect(theTile.getByText(label, { exact: true }).first()).toBeVisible();
    // The savings rate under «Risparmio» («55,2%») and the coverage («2,23×») stay: only the
    // three values are lifted (The Lifted-Figure Rule: only the repeated figure hides).
    await expect(theTile.getByText(/^\d+,\d%/).first()).toBeVisible();
    await expect(theTile.getByText(/\d,\d\d×/).first()).toBeVisible();

    // Title, verdict and cells all above the pill: the first screen ends at it.
    const pillTop = await page.locator('nav[data-nav="pill"]').evaluate((el) => el.getBoundingClientRect().top);
    expect(pillTop).toBeGreaterThan(600);
    const bottomOf = async (locator: ReturnType<Page['locator']>) => (await locator.boundingBox())!.y + (await locator.boundingBox())!.height;
    expect(await bottomOf(page.locator('main h1').filter({ visible: true }).first()), 'title').toBeLessThanOrEqual(pillTop);
    for (let i = 0; i < 3; i++) expect(await bottomOf(cells.nth(i)), `cell ${i}`).toBeLessThanOrEqual(pillTop);

    // Then «Il resto della pagina» and the four rows, closed, Movimenti's panel empty and inert.
    await expect(page.getByRole('heading', { level: 2, name: 'Il resto della pagina' })).toBeVisible();
    await expect(page.getByRole('tabpanel', { name: 'Tracciamento' }).locator('[id$="-trigger"]')).toHaveCount(TRACKING_ROWS.length);
    for (const id of TRACKING_ROWS) {
      await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger(page, id)).toHaveAttribute('aria-controls', `${id}-panel`);
    }
    await expect(trigger(page, 'trk-movimenti')).toContainText(/\d+ voci/);
    expect(await panel(page, 'trk-movimenti').evaluate((el) => ({ inert: el.hasAttribute('inert'), children: el.children.length }))).toEqual({ inert: true, children: 0 });
    // No row in the calendar: no scope line.
    await expect(page.getByText(/Nel totale c/)).toHaveCount(0);

    // A row still ahead in the month: the scope says what is in the calendar, under the strip.
    await plantScheduledExpense();
    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('region', { name: 'Verdetto del periodo' })).toBeVisible({ timeout: 45_000 });
    const scope = page.getByText(/Nel totale c.*50\s?€ di spese già in calendario da qui a fine mese/).filter({ visible: true });
    await expect(scope).toBeVisible();
    const stripBox = (await strip(page, 'Tracciamento').boundingBox())!;
    expect((await scope.boundingBox())!.y).toBeGreaterThanOrEqual(stripBox.y + stripBox.height - 1);
  });

  test('the «+» saves a row of today and opens Movimenti on it, the focus on its button', async ({ page }) => {
    await openTracciamento(page);
    await expect(trigger(page, 'trk-movimenti')).toHaveAttribute('aria-expanded', 'false');

    // The FAB of the bottom nav is the only «add» in portrait.
    await page.getByRole('button', { name: 'Aggiungi nuova voce' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /^Spesa non necessaria/ }).click();
    await dialog.locator('#amount').fill('7');
    await dialog.locator('#categoryId').click();
    await page.getByRole('button', { name: 'Alimentari', exact: true }).click();
    await dialog.locator('#notes').fill(SAVED_DECOY_NOTE);
    await dialog.getByRole('button', { name: 'Crea voce' }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    const closedAt = Date.now();

    // Movimenti opens on the row it wrote; one second after the close the focus is on its button.
    await expect(trigger(page, 'trk-movimenti')).toHaveAttribute('aria-expanded', 'true');
    const row = panel(page, 'trk-movimenti').locator('[data-expense-id]').filter({ hasText: SAVED_DECOY_NOTE });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(Math.max(0, 1000 - (Date.now() - closedAt)));
    const focused = page.locator(':focus');
    await expect(focused).toHaveAttribute('data-expense-id', /.+/);
    await expect(focused).toHaveAccessibleName(new RegExp(`^${SAVED_DECOY_NOTE}, `));
    expect(await focused.evaluate((el) => el.getBoundingClientRect().top >= 0 && el.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
    await expect.poll(decoyExpenseIds).toHaveLength(1);
  });

  test('«Apri tutte» opens the four rows and nothing runs off the side of main', async ({ page }) => {
    await openTracciamento(page);
    await page.getByRole('tabpanel', { name: 'Tracciamento' }).getByRole('button', { name: 'Apri tutte' }).click();
    for (const id of TRACKING_ROWS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Movimenti' }).getByRole('combobox', { name: /^Periodo dei movimenti:/ })).toBeVisible();
    await page.waitForTimeout(600);

    const measurement = await page.evaluate(() => {
      const main = document.querySelector('main')!;
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

test.describe('Cashflow › Budget, composed for a phone, with a ceiling of 1000 €', () => {
  test.beforeAll(plantCeiling);
  test.afterAll(removeCeiling);
  test.beforeEach(removeDecoyExpenses);

  test('the two cells open the right row: «Fine mese» Categorie a rischio, «Oltre» Avvisi; the Tetto\'s KPIs never overlap', async ({ page }) => {
    await openBudget(page);
    const cells = strip(page, 'Budget').getByRole('button');
    await expect(cells).toHaveCount(2);
    await expect(cells.nth(0)).toContainText(/^Fine mese/);
    // 1120 € spent against 1000 €: crossed already, so the fact is «Oltre», never «Supererai».
    await expect(cells.nth(1)).toContainText(/^Oltre\s*120\s?€/);
    await expect(cells.nth(0)).toHaveAccessibleName(/, apre Categorie a rischio$/);
    await expect(cells.nth(1)).toHaveAccessibleName(/, apre Avvisi$/);
    for (const id of ['bud-rischio', 'bud-avvisi', 'bud-categorie']) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');

    await cells.nth(0).click();
    await expect(trigger(page, 'bud-rischio')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'bud-rischio')).toBeFocused();
    await cells.nth(1).click();
    await expect(trigger(page, 'bud-avvisi')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'bud-avvisi')).toBeFocused();

    // The two lifted KPIs are HIDDEN at 390: that is what removed the overlap the census saw on
    // 2026-10-10 («~11.274 €» under «Oltre» in a third of a 390px tile) — only «Al giorno» stays
    // in the row. Seen red on 2026-10-12 with the lift ignored (`lifted()` returning nothing).
    const liftedKpis = page.locator('#bud-tetto [class~="max-desktop:hidden"]');
    await expect(liftedKpis).toHaveCount(2);
    for (let i = 0; i < 2; i++) await expect(liftedKpis.nth(i)).toBeHidden();

    // At 1440 the KPIs are printed again, side by side, each a container whose figure shrinks to
    // its cell (`container-type: inline-size`): a guard, not a proof of the overlap — no figure of
    // the fixture can run under its neighbour in a 1440 Tetto. Below `desktop:` they stay lifted on
    // a tablet too since 2026-10-16 (the strip is drawn up to 1439; this step
    // read 768 until then). Seen red on 2026-10-12 with `@container` removed from the KPI cell.
    await page.setViewportSize({ width: 1440, height: 900 });
    const kpiCells = page.locator('#bud-tetto .grid-cols-3 > div');
    await expect(kpiCells).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(kpiCells.nth(i)).toBeVisible();
    expect(await kpiCells.evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).containerType))).toEqual(['inline-size', 'inline-size', 'inline-size']);
    const kpis = kpiCells.locator('p.font-mono');
    await expect(kpis).toHaveCount(3);
    const boxes = await Promise.all([0, 1, 2].map(async (i) => (await kpis.nth(i).boundingBox())!));
    for (const box of boxes) expect(box.width).toBeGreaterThan(0);
    const intersect = (a: (typeof boxes)[number], b: (typeof boxes)[number]) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(intersect(boxes[0], boxes[1]), JSON.stringify(boxes)).toBe(false);
    expect(intersect(boxes[1], boxes[2]), JSON.stringify(boxes)).toBe(false);
    expect(intersect(boxes[0], boxes[2]), JSON.stringify(boxes)).toBe(false);
  });

  test('a row opened stays open across a change of tab and a reload, remembered per tab', async ({ page }) => {
    // Two cold loads of the tab in one test (the second a reload): the 45 s the verdict may take
    // do not fit the 30 s default.
    test.setTimeout(120_000);
    await openBudget(page);
    await trigger(page, 'bud-categorie').click();
    await expect(trigger(page, 'bud-categorie')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Per categoria' })).toContainText(/budget/);

    await page.getByRole('tab', { name: 'Tracciamento' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Tracciamento' })).toBeVisible();
    await page.getByRole('tab', { name: 'Budget' }).click();
    await expect(page.getByRole('tabpanel', { name: 'Budget' })).toBeVisible();
    await expect(trigger(page, 'bud-categorie')).toHaveAttribute('aria-expanded', 'true');

    expect(await page.evaluate(() => localStorage.getItem('mobile-sections:cashflow:budget'))).toBe('["bud-categorie"]');
    expect(await page.evaluate(() => localStorage.getItem('mobile-sections:cashflow:tracking'))).toBeNull();

    // The tab click writes `?tab=budget` through `router.replace`, AFTER the panel shows: a reload
    // before the URL caught up landed on Tracciamento and read as a timeout on the Budget verdict
    // (2026-10-12, twice in the full suite on the Windows machine, green alone).
    await expect(page).toHaveURL(/tab=budget/);
    await page.reload({ waitUntil: 'load' });
    await expect(page.getByRole('region', { name: 'Verdetto sul budget' })).toBeVisible({ timeout: 45_000 });
    await expect(trigger(page, 'bud-categorie')).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger(page, 'bud-rischio')).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('Cashflow › Dividendi, composed for a phone, with one coupon', () => {
  test.beforeAll(plantCoupon);
  test.afterAll(removeCoupon);

  test('the rows follow the DOM — Affidabilità before Rendimento — and no order-* is left', async ({ page }) => {
    await openDividendi(page);
    // No strip: received and announced are never one figure (2026-10-10).
    await expect(strip(page, 'Dividendi')).toHaveCount(0);
    for (const id of DIVIDEND_ROWS) await expect(trigger(page, id)).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger(page, 'dvd-rendimento')).toContainText('ultimi 12 mesi');

    const tops = await Promise.all(DIVIDEND_ROWS.map(async (id) => (await page.locator(`#${id}`).boundingBox())!.y));
    expect(tops.every((top, i) => i === 0 || top > tops[i - 1]), JSON.stringify(tops)).toBe(true);
    expect(tops[0]).toBeGreaterThan((await page.locator('#dvd-incasso').boundingBox())!.y);

    const orderClasses = await page.getByRole('tabpanel', { name: 'Dividendi' }).evaluate((panelEl) =>
      [...panelEl.querySelectorAll('*')].flatMap((el) => [...el.classList]).filter((name) => /^(?:[a-z-]+:)*order-/.test(name)),
    );
    expect(orderClasses).toEqual([]);
  });

  test('a failed stats read is Rendimento\'s row: open at load, red once closed, one live node for the tab', async ({ page }) => {
    await page.route('**/api/dividends/stats*', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, stats: null } });
    });
    await openDividendi(page);

    const rendimento = trigger(page, 'dvd-rendimento');
    await expect(rendimento).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#dvd-rendimento')).toHaveAttribute('aria-label', 'Rendimento · lettura fallita');
    await expect(panel(page, 'dvd-rendimento')).toContainText('non sono stati letti');

    await rendimento.click();
    await expect(rendimento).toHaveAttribute('aria-expanded', 'false');
    await expect(rendimento.locator('span.text-destructive')).toHaveCount(1);

    // ONE live node: `PageRest`'s sentence; the row and the Dettaglio's notice are silent here.
    const alerts = page.getByRole('tabpanel', { name: 'Dividendi' }).locator('[role="alert"]');
    await expect(alerts).toHaveCount(1);
    await expect(alerts.first()).toContainText('Rendimento');
  });
});

test.describe('Cashflow › Tracciamento, composed for a phone, with reduced motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a row opens with no transition', async ({ page }) => {
    await openTracciamento(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);

    const durations = await panel(page, 'trk-spese').evaluate((el) => {
      const chevron = document.querySelector('#trk-spese-trigger svg')!;
      return [getComputedStyle(el).transitionDuration, getComputedStyle(chevron).transitionDuration];
    });
    expect(durations).toEqual(['0s', '0s']);

    await trigger(page, 'trk-spese').click();
    await expect(trigger(page, 'trk-spese')).toHaveAttribute('aria-expanded', 'true');
    expect(await panel(page, 'trk-spese').evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(60);
  });
});
