/**
 * Two columns of tiles END ON ONE LINE (owner, 2026-11-23; DATI-03): the helpers of the three specs that hold
 * it at 1440 — Rendimenti, Coast FIRE › Ipotesi, Impostazioni › Spese. A helper, not a spec: no project
 * collects it (doc/guide/e2e-playwright.md).
 *
 * The columns are the `[data-tile-column]` elements inside a scope (`TILE_COLUMN_CLASS`'s wrappers, and the
 * single cell that stands beside one). A forced case makes ONE column the taller by stretching its first
 * tile with a style tag, so the test does not depend on what the fixture holds; before measuring it proves
 * that the forced column really is the taller of the two (a forced tile that did not would leave the
 * mutation green for the wrong reason).
 */

import { expect, type Locator, type Page } from '@playwright/test';

const COLUMN = '[data-tile-column]';
const FORCED_ATTRIBUTE = 'data-forced-tile';
const FORCED_HEIGHT = 900;

interface ColumnMeasure {
  /** The bottom edge of the column's last tile (a lone cell is its own tile). */
  bottom: number;
  /** Height of the column when no tile of it stretches: the tiles at their natural height plus the gaps. */
  naturalHeight: number;
  /** The last tile's bottom minus its footer's (`p.mt-auto`) bottom, null when it has no footer. */
  footerGap: number | null;
}

/** Runs in the page: one measure per `[data-tile-column]` of the scope, in DOM order. */
async function measureColumns(scope: Locator): Promise<ColumnMeasure[]> {
  return scope.evaluate((root, selector) => {
    const columns = Array.from(root.querySelectorAll<HTMLElement>(selector));
    const tileOf = (cell: Element): HTMLElement => {
      const tile = cell.tagName === 'SECTION' ? cell : cell.querySelector(':scope > section');
      if (!tile) throw new Error(`A [data-tile-column] child holds no <section> tile: ${cell.outerHTML.slice(0, 120)}`);
      return tile as HTMLElement;
    };
    return columns.map((column) => {
      const cells = Array.from(column.children) as HTMLElement[];
      const tiles = cells.map(tileOf);
      const last = tiles[tiles.length - 1];
      const lastCell = cells[cells.length - 1];
      const bottom = last.getBoundingClientRect().bottom;

      // The last tile's natural height: let its cell stop stretching, read it, put it back.
      const saved = { flex: lastCell.style.flex, alignSelf: lastCell.style.alignSelf };
      lastCell.style.flex = 'none';
      lastCell.style.alignSelf = 'start';
      const lastNatural = last.getBoundingClientRect().height;
      lastCell.style.flex = saved.flex;
      lastCell.style.alignSelf = saved.alignSelf;

      const gap = parseFloat(getComputedStyle(column).rowGap) || 0;
      const heights = tiles.map((tile) => tile.getBoundingClientRect().height);
      heights[heights.length - 1] = lastNatural;
      const naturalHeight = heights.reduce((sum, height) => sum + height, 0) + gap * (tiles.length - 1);

      const footer = last.querySelector('p.mt-auto');
      return { bottom, naturalHeight, footerGap: footer ? last.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom : null };
    });
  }, COLUMN);
}

/** The columns of the scope end on one line (≤ 1 px). */
export async function expectColumnsEndTogether(page: Page, scope: Locator, label = 'colonne'): Promise<ColumnMeasure[]> {
  void page;
  const measures = await measureColumns(scope);
  expect(measures.length, `${label}: servono almeno due [data-tile-column] nello scope`).toBeGreaterThanOrEqual(2);
  const bottoms = measures.map((measure) => measure.bottom);
  expect(Math.max(...bottoms) - Math.min(...bottoms), `${label}: i bordi inferiori ${bottoms.map(Math.round).join(' / ')}`).toBeLessThanOrEqual(1);
  return measures;
}

/**
 * Stretches the first tile of column `index` to 900 px, proves its column is now the taller of the two, and
 * returns a function that undoes it. Fails with a message that says so when it is not.
 */
export async function forceColumnTaller(page: Page, scope: Locator, index: number): Promise<() => Promise<void>> {
  await scope.evaluate((root, args) => {
    const column = root.querySelectorAll(args.selector)[args.index];
    if (!column) throw new Error(`[data-tile-column] n. ${args.index} non trovata`);
    const cell = column.firstElementChild!;
    const tile = cell.tagName === 'SECTION' ? cell : cell.querySelector(':scope > section')!;
    tile.setAttribute(args.attribute, '');
  }, { selector: COLUMN, index, attribute: FORCED_ATTRIBUTE });
  await page.addStyleTag({ content: `[${FORCED_ATTRIBUTE}] { min-height: ${FORCED_HEIGHT}px !important; }` });

  const measures = await measureColumns(scope);
  const forced = measures[index].naturalHeight;
  const others = measures.filter((_, i) => i !== index).map((measure) => measure.naturalHeight);
  expect(forced, `la colonna forzata (${index}) deve essere la più alta per somma dei suoi tile (${Math.round(forced)} contro ${others.map(Math.round).join(' / ')}): altrimenti la mutazione resterebbe verde per il motivo sbagliato`).toBeGreaterThan(Math.max(...others));

  return async () => {
    await scope.evaluate((root, attribute) => root.querySelectorAll(`[${attribute}]`).forEach((el) => el.removeAttribute(attribute)), FORCED_ATTRIBUTE);
  };
}

/** The footer of column `index`'s last tile sits on the tile's bottom edge (within 32 px, as `e2e/allocation.spec.ts`). */
export async function expectLastFooterOnEdge(scope: Locator, index: number, label = 'piè'): Promise<void> {
  const measures = await measureColumns(scope);
  const gap = measures[index].footerGap;
  expect(gap, `${label}: l'ultimo tile della colonna ${index} non ha un piè (p.mt-auto)`).not.toBeNull();
  expect(gap!, `${label}: il piè in fondo`).toBeLessThan(32);
}
