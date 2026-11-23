/**
 * The measures of the tablet composition (2026-10-16), shared by the `*.tablet.spec.ts` files: they
 * run in the `tablet` (768×1024) and `tablet-landscape` (1024×768) projects and branch on the width.
 * Geometry only — what a row SAYS is the phone specs' and Vitest's (`__tests__/tabletComposition.test.ts`
 * holds where each row goes at 768 and the stage's arithmetic).
 *
 * In landscape the page is a STAGE (lib/utils/tabletComposition.ts): the verdict and THE tile on the
 * left, still while the page scrolls, and on the right ONE card, the index, holding «Il resto della
 * pagina» and every row; the 56px icon rail on the left of the screen in place of the bar.
 *
 * A helper, not a spec: no project collects it (`testMatch`), it only exports.
 */

import { expect, type Locator, type Page } from '@playwright/test';

/** The house floor for a touch target (PRODUCT.md → Accessibility & Inclusion). */
export const TOUCH_FLOOR = 44;
/** The closed row's trigger (`TileRowShell`, `min-h-[52px]`); in the index its section has no border. */
export const TRIGGER_HEIGHT = 52;
/** The index's width (`STAGE_CLASS`: `grid-cols-[minmax(0,1fr)_360px]`) and the stage's gap. */
export const INDEX_WIDTH = 360;
export const STAGE_GAP = 16;
/** The icon rail of a tablet in landscape (`TabletRail`, `w-14`). */
export const ICON_RAIL_WIDTH = 56;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/** Whether this project is the landscape one: the stage, the icon rail, no pill. */
export const isLandscape = (page: Page): boolean => (page.viewportSize()?.width ?? 0) >= 992;

export async function rectOf(locator: Locator): Promise<Rect> {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
  });
}

/** The composed grid at 768 and 1440: the parent of THE tile's cell (in landscape it is `contents`). */
export const gridOf = (page: Page, leadId: string): Locator => page.locator(`#${leadId}`).locator('xpath=../..');

/** At 1440 the grid spans `main`'s content box: no landscape stage left squeezing it into a column. */
export async function expectGridAcrossMain(page: Page, grid: Locator): Promise<void> {
  const [gridRect, content] = await Promise.all([
    rectOf(grid),
    page.locator('#page-main').evaluate((el) => {
      const style = getComputedStyle(el);
      return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    }),
  ]);
  expect(gridRect.width, 'the grid spans main at 1440').toBeGreaterThanOrEqual(Math.min(content, 1920) - 2);
}

/** The column count and rows template the browser computed for the grid. */
export async function gridTracks(grid: Locator): Promise<{ columns: number; rows: string }> {
  return grid.evaluate((el) => {
    const style = getComputedStyle(el);
    return { columns: style.gridTemplateColumns.split(' ').filter(Boolean).length, rows: style.gridTemplateRows };
  });
}

/** Where the first screen ends: the pill's top edge at 768, `main`'s bottom edge in landscape (no pill). */
export async function foldOf(page: Page): Promise<number> {
  if (!isLandscape(page)) {
    return page.locator('nav[data-nav="pill"]').evaluate((el) => el.getBoundingClientRect().top);
  }
  return page.locator('#page-main').evaluate((el) => el.getBoundingClientRect().top + el.clientHeight);
}

/** The shell in landscape: the icon rail on the left, `main` from the top with the whole height. */
export async function expectLandscapeShell(page: Page): Promise<void> {
  const rail = page.locator('nav[data-nav="rail"]');
  await expect(rail).toBeVisible();
  const box = await rectOf(rail);
  expect(box.x, 'the rail on the left edge').toBe(0);
  expect(Math.abs(box.width - ICON_RAIL_WIDTH), `the rail measured ${box.width}px`).toBeLessThanOrEqual(1);
  for (const target of await rail.locator('a, button').all()) {
    const target_box = (await target.boundingBox())!;
    const name = (await target.getAttribute('aria-label')) ?? '';
    expect(target_box.width, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
    expect(target_box.height, name).toBeGreaterThanOrEqual(TOUCH_FLOOR);
  }
  await expect(rail.locator('a[aria-current="page"]'), 'the current page marked').toHaveCount(1);
  const main = await page.locator('#page-main').evaluate((el) => ({ top: el.getBoundingClientRect().top, height: el.clientHeight }));
  expect(main.top, 'no bar over main').toBe(0);
  expect(main.height).toBe(page.viewportSize()!.height);
  await expect(page.locator('[data-sidebar="trigger"]').filter({ visible: true })).toHaveCount(0);
}

/** Nothing in `main` runs past its right edge (the guard of `e2e/fire.mobile.spec.ts`; AGENTS.md § Tailwind). */
export async function expectNoOverflow(page: Page): Promise<void> {
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
}

/** The landscape stage of a page, inside `scope` (a Cashflow tab panel, or `main`). */
export function stageParts(scope: Locator) {
  const verdict = scope.locator('[data-stage="verdict"]').first();
  const lead = scope.locator('[data-stage="lead"]').first();
  const rest = scope.getByRole('heading', { level: 2, name: 'Il resto della pagina' }).locator('xpath=..');
  return { verdict, lead, rest, index: rest.locator('xpath=..'), stage: verdict.locator('xpath=..') };
}

/**
 * In landscape: the verdict and THE tile on the left, 16px apart; the index on the right, 360px wide,
 * its top on the verdict's and its bottom on THE tile's (the two cards end on one line); «Il resto»
 * and then EVERY row, in DOM order, one under the other with a hairline between, a closed one as
 * tall as its trigger. When the left stack fits the screen it is sticky and, once stuck, ends above the fold —
 * measured stuck, not at the top of the page: the rule (`leftStackSticks`) is the stack against the whole
 * `main`, so a stack that fits only without the page header above it sticks too (Accumulo's empty tile with
 * Geist, 2026-11-21: 856px at the top, 739px stuck, under a fold of 768).
 */
export async function expectLandscapeStage(page: Page, scope: Locator, ids: readonly string[]): Promise<void> {
  const { verdict, lead, rest, index, stage } = stageParts(scope);
  const [v, l, i, fold, sticks] = await Promise.all([rectOf(verdict), rectOf(lead), rectOf(index), foldOf(page), stage.getAttribute('data-stick')]);
  expect(Math.abs(l.y - v.bottom - STAGE_GAP), 'THE tile 16px under the verdict').toBeLessThanOrEqual(1);
  expect(Math.abs(l.x - v.x), 'THE tile under the verdict').toBeLessThanOrEqual(1);
  expect(Math.abs(i.width - INDEX_WIDTH), `the index measured ${i.width}px`).toBeLessThanOrEqual(1);
  expect(Math.abs(i.x - l.right - STAGE_GAP), 'the index 16px right of THE tile').toBeLessThanOrEqual(1);
  expect(Math.abs(i.y - v.y), 'the index starts on the verdict line').toBeLessThanOrEqual(1);
  // With every row closed the two cards end on one line; an opened row may carry the index past it.
  const anyOpen = (await Promise.all(ids.map((id) => page.locator(`#${id}-trigger`).getAttribute('aria-expanded')))).includes('true');
  if (anyOpen) expect(i.bottom, 'the index reaches at least THE tile line').toBeGreaterThanOrEqual(l.bottom - 1);
  else expect(Math.abs(i.bottom - l.bottom), 'the index ends on THE tile line').toBeLessThanOrEqual(1);
  if (sticks === 'true') {
    const main = page.locator('#page-main');
    // Scrolled until the verdict sits at its sticky top (16px), then back: the rest of the check reads the page at its top.
    await main.evaluate((el, verdictTop) => {
      el.scrollTop += verdictTop - el.getBoundingClientRect().top - 16;
    }, v.y);
    const stuck = await rectOf(lead);
    await main.evaluate((el) => {
      el.scrollTop = 0;
    });
    expect(stuck.bottom, 'THE tile, stuck, ends above the fold').toBeLessThanOrEqual(fold);
  } else expect(l.y, 'THE tile starts above the fold').toBeLessThan(fold);

  let previous = await rectOf(rest);
  expect(previous.y, '«Il resto» heads the index').toBeLessThanOrEqual(i.y + 1);
  expect(Math.abs(previous.height - TRIGGER_HEIGHT), '«Il resto» as tall as a row').toBeLessThanOrEqual(1);
  for (const id of ids) {
    const [section, trigger, expanded] = await Promise.all([
      rectOf(page.locator(`#${id}`)),
      rectOf(page.locator(`#${id}-trigger`)),
      page.locator(`#${id}-trigger`).getAttribute('aria-expanded'),
    ]);
    expect(section.x, `${id} inside the index`).toBeGreaterThanOrEqual(i.x);
    expect(section.right, `${id} inside the index`).toBeLessThanOrEqual(i.right + 0.5);
    expect(section.width, `${id}: the index's width`).toBeGreaterThanOrEqual(INDEX_WIDTH - 3);
    expect(Math.abs(section.y - previous.bottom), `${id}: right under the one before, a hairline between`).toBeLessThanOrEqual(1.5);
    if (expanded === 'false') expect(Math.abs(section.height - TRIGGER_HEIGHT), `${id}: as tall as its trigger`).toBeLessThanOrEqual(1);
    expect(Math.abs(trigger.height - TRIGGER_HEIGHT), `${id}: the trigger`).toBeLessThanOrEqual(1);
    previous = section;
  }
}

/** Every row open and the page scrolled to its end in steps: THE tile never slides over the verdict. */
export async function expectStickyStage(page: Page, scope: Locator): Promise<void> {
  const { verdict, lead, stage } = stageParts(scope);
  if ((await stage.getAttribute('data-stick')) !== 'true') return;
  const gaps = await page.locator('#page-main').evaluate(
    async (main, [verdictEl, leadEl]) => {
      const out: number[] = [];
      const max = main.scrollHeight - main.clientHeight;
      for (let top = 0; top <= max; top += Math.max(60, Math.round(max / 12))) {
        main.scrollTop = top;
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        out.push(Math.round(leadEl.getBoundingClientRect().top - verdictEl.getBoundingClientRect().bottom));
      }
      main.scrollTop = 0;
      return out;
    },
    [await verdict.elementHandle(), await lead.elementHandle()] as const,
  );
  for (const gap of gaps) expect(Math.abs(gap - STAGE_GAP), `THE tile ${gap}px under the verdict while scrolling`).toBeLessThanOrEqual(1);
}

export interface OpenedRow {
  /** The row's box before the tap, and `main`'s scroll then. */
  before: Rect;
  scrollTop: number;
}

/** Taps a row's trigger and waits for it to open; returns where it stood. */
export async function openRow(page: Page, id: string): Promise<OpenedRow> {
  const [before, scrollTop] = await Promise.all([
    rectOf(page.locator(`#${id}`)),
    page.locator('#page-main').evaluate((main) => main.scrollTop),
  ]);
  await page.locator(`#${id}-trigger`).click();
  await expect(page.locator(`#${id}-trigger`)).toHaveAttribute('aria-expanded', 'true');
  return { before, scrollTop };
}

/**
 * An opened row. In landscape it opens IN PLACE in the index: the same left edge, top and width,
 * nothing scrolled, the rows after it in the DOM under it. At 768 it spans the grid under the row
 * before it, the rows after it under it.
 */
export async function expectOpenedRow(
  page: Page,
  grid: Locator,
  opened: string,
  where: OpenedRow,
  before: string,
  after: readonly string[],
): Promise<void> {
  const [row, previous, scrollTop] = await Promise.all([
    rectOf(page.locator(`#${opened}`)),
    rectOf(page.locator(`#${before}`)),
    page.locator('#page-main').evaluate((main) => main.scrollTop),
  ]);
  if (isLandscape(page)) {
    expect(Math.abs(row.x - where.before.x), 'the open row did not leave the index').toBeLessThanOrEqual(1);
    expect(Math.abs(row.y - where.before.y), 'the open row did not move').toBeLessThanOrEqual(1);
    expect(Math.abs(row.width - where.before.width), 'the open row keeps the index width').toBeLessThanOrEqual(1);
    expect(scrollTop, 'nothing scrolled').toBe(where.scrollTop);
  } else {
    const gridRect = await rectOf(grid);
    expect(Math.abs(row.width - gridRect.width), 'the open row spans the grid').toBeLessThanOrEqual(1);
    expect(row.y, 'the open row starts under the row before it').toBeGreaterThanOrEqual(previous.bottom);
  }
  for (const id of after) {
    const next = await rectOf(page.locator(`#${id}`));
    expect(next.y, `${id}, after it in the DOM, under it`).toBeGreaterThanOrEqual(row.bottom);
    if (isLandscape(page)) expect(Math.abs(next.x - row.x), `${id}, still in the index`).toBeLessThanOrEqual(1);
  }
}

/**
 * At 768 no grid row is half empty: every row either shares its top with another (two side by side)
 * or spans the grid — a closed row left alone, before an open one or at the end, takes the row.
 */
export async function expectNoHalfCells(page: Page, grid: Locator, ids: readonly string[]): Promise<void> {
  const gridRect = await rectOf(grid);
  const rects = await Promise.all(ids.map((id) => rectOf(page.locator(`#${id}`))));
  rects.forEach((rect, index) => {
    const paired = rects.some((other, j) => j !== index && Math.abs(other.y - rect.y) <= 1);
    const whole = Math.abs(rect.width - gridRect.width) <= 1;
    expect(paired || whole, `${ids[index]}: alone on half a grid row`).toBe(true);
  });
}
