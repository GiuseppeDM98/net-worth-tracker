/**
 * Which JavaScript chunks a page has downloaded, identified by their CONTENT (2026-09-30):
 * a chunk's name changes with every build, a string the module carries does not. Shared by
 * `bundle.lazy{,.mobile}.spec.ts`, `assets.rows{,.mobile}.spec.ts` and `lazyTabLanding.ts`. A helper,
 * not a spec: the FILENAME chooses the project (AGENTS.md § 5), and this one is collected by none.
 *
 * What these probes prove is that an IMPORT is lazy (the module is not fetched until the moment it
 * is needed), never how big a chunk is — that is `npm run perf:budget`'s, on the build.
 */
import type { Page, Route } from '@playwright/test';

/**
 * Each signature is a STRING LITERAL of its module (2026-11-16), because the whole run is served from
 * a production build (`npm run test:e2e`) and an area run from `next dev`: a minifier renames
 * functions and drops comments and module paths, never a string. Until that day they were a
 * function's name or a `node_modules/…` path, which only a dev chunk keeps — on the build the
 * presence checks went red and the absence checks green asserting nothing.
 *
 * A literal that sits in ONE source file of `app/`, `components/`, `lib/`, and never in a comment
 * (a dev chunk keeps the comments): `__tests__/chunkSignatures.test.ts` holds both, for every entry.
 * Not the module's PATH either: the importer's chunk names it in the loader of its `import()`.
 */
export const CHUNK_SIGNATURES = {
  /** pdfkit's file header, inside `@react-pdf/renderer`'s engine: no module of ours writes it. */
  pdfEngine: { text: '%PDF-', module: 'node_modules/@react-pdf/pdfkit/lib/pdfkit.browser.js' },
  /**
   * d3-sankey's own throw. Not the bare words: `lib/utils/cashflowSankey.ts` quotes them in a comment,
   * and its dev chunk reaches the phone, which must never fetch the Sankey.
   */
  sankey: { text: 'Error("circular link")', module: 'node_modules/d3-sankey/src/sankey.js' },
  underwaterChart: { text: 'Distanza dal massimo: nessun mese misurato.', module: 'components/performance/UnderwaterDrawdownChart.tsx' },
  /** The Flusso tile, loaded by «Dettaglio» on Analisi since 2026-11-12 (`DettaglioDisclosure.tsx`). */
  flussoTile: { text: 'Raggruppa il flusso', module: 'components/cashflow/analisi/tiles/FlussoTile.tsx' },
  dividendsTab: { text: 'Scarica dividendi storici per gli strumenti con ISIN', module: 'components/dividends/DividendTrackingTab.tsx' },
  splitTab: { text: 'Entrate in comune e quota da dividere', module: 'components/cashflow/ExpenseSplitTab.tsx' },
  /** The shortest of them: the one string only the sparkline writes (its name's «in salita»). */
  assetSparkline: { text: 'in salita', module: 'components/assets/AssetSparkline.tsx' },
} as const;

export const PDF_ENGINE_SIGNATURE = CHUNK_SIGNATURES.pdfEngine.text;
export const SANKEY_SIGNATURE = CHUNK_SIGNATURES.sankey.text;
export const UNDERWATER_CHART_SIGNATURE = CHUNK_SIGNATURES.underwaterChart.text;
export const FLUSSO_TILE_SIGNATURE = CHUNK_SIGNATURES.flussoTile.text;
export const DIVIDENDS_TAB_SIGNATURE = CHUNK_SIGNATURES.dividendsTab.text;
export const SPLIT_TAB_SIGNATURE = CHUNK_SIGNATURES.splitTab.text;
export const SPARKLINE_SIGNATURE = CHUNK_SIGNATURES.assetSparkline.text;

const CHUNK_URL = /\/_next\/static\/chunks\/.+\.js(\?|$)/;

export interface ChunkProbe {
  /** The chunk URLs received so far whose body carries the signature, once every body has been read. */
  matching(): Promise<string[]>;
}

/** Start listening BEFORE the navigation: a chunk that arrived earlier is invisible to the probe. */
export function probeChunks(page: Page, signature: string): ChunkProbe {
  const bodies: Promise<string | null>[] = [];
  page.on('response', (response) => {
    const url = response.url();
    if (!CHUNK_URL.test(url)) return;
    bodies.push(response.text().then((body) => (body.includes(signature) ? url : null), () => null));
  });
  return {
    async matching() {
      const urls = await Promise.all(bodies);
      return urls.filter((url): url is string => url !== null);
    },
  };
}

/**
 * Hold back every chunk whose body carries the signature until `release()` is called — so the
 * placeholder that stands in for it stays on screen until the test has measured it. A fixed delay
 * is not enough: a chunk requested early (the Sankey's, from FlussoTile's module evaluation) can
 * outlast any delay before the page's reads return and the placeholder is drawn (seen 2026-09-30).
 */
export async function holdChunks(page: Page, signature: string): Promise<{ release: () => void; held: () => number }> {
  let release!: () => void;
  let held = 0;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(CHUNK_URL, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(signature)) {
      held++;
      await released;
    }
    await route.fulfill({ response, body });
  });
  // `held()` is how many chunks the signature has stopped so far. A test whose check holds even when
  // nothing is stopped (Dividendi's: the tab's loading state IS the page's placeholder) asserts it, or
  // a signature that matches no chunk leaves it green asserting nothing — on the production build
  // until 2026-11-16, when the signatures were function names a minifier renames.
  return { release, held: () => held };
}

/**
 * Hold back every request matching the glob until `release()` is called (then let it through
 * untouched) — to keep a surface in its loading state while it is measured: Dividendi's
 * `/api/dividends/stats`, or Firestore's `Listen` channel for a read started after the call.
 */
export async function holdRequests(page: Page, glob: string): Promise<{ release: () => Promise<void> }> {
  let open!: () => void;
  const released = new Promise<void>((resolve) => {
    open = resolve;
  });
  const handler = async (route: Route) => {
    await released;
    await route.continue();
  };
  await page.route(glob, handler);
  return {
    async release() {
      open();
      await page.unroute(glob, handler);
    },
  };
}

/**
 * Record every `layout-shift` entry from the first frame, with the time it happened and whether a
 * user input had just preceded it (the browser's own `hadRecentInput`), on `window.__layoutShifts`.
 */
export async function recordLayoutShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const shifts: { value: number; startTime: number; hadRecentInput: boolean }[] = [];
    (window as unknown as { __layoutShifts: typeof shifts }).__layoutShifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; startTime: number; hadRecentInput: boolean }[]) {
        shifts.push({ value: entry.value, startTime: entry.startTime, hadRecentInput: entry.hadRecentInput });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
}

/** The sum of the layout shifts recorded after `since` (a `performance.now()` of the page). */
export async function layoutShiftSince(page: Page, since: number): Promise<number> {
  return page.evaluate(
    (from) =>
      (window as unknown as { __layoutShifts: { value: number; startTime: number }[] }).__layoutShifts
        .filter((shift) => shift.startTime >= from)
        .reduce((sum, shift) => sum + shift.value, 0),
    since,
  );
}
