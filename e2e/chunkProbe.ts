/**
 * Which JavaScript chunks a page has downloaded, identified by their CONTENT (2026-09-30):
 * a chunk's name changes with every build, a library's module path inside it does not. Shared by
 * `bundle.lazy.spec.ts` (1440) and `bundle.lazy.mobile.spec.ts` (390). A helper, not a spec: the
 * FILENAME chooses the project (AGENTS.md § 5), and this one is collected by none.
 *
 * The suite runs on `next dev`, which splits chunks differently from the production build: what
 * these probes prove is that an IMPORT is lazy (the library is not fetched until the moment it is
 * needed), never how big a chunk is — that is `npm run perf:budget`'s, on the build.
 */
import type { Page } from '@playwright/test';

/**
 * A module path only the library's own chunk carries — never a word a comment of ours could hold,
 * since a dev chunk keeps the source's comments.
 */
export const PDF_ENGINE_SIGNATURE = 'node_modules/@react-pdf/';
export const SANKEY_SIGNATURE = 'node_modules/d3-sankey/';
/**
 * A function only `UnderwaterDrawdownChart.tsx` defines (a dev chunk keeps the names). Not the
 * module's PATH: the importer's chunk names it too, in the loader of its `import()`.
 */
export const UNDERWATER_CHART_SIGNATURE = 'function describeUnderwaterChart';

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
export async function holdChunks(page: Page, signature: string): Promise<{ release: () => void }> {
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(CHUNK_URL, async (route) => {
    const response = await route.fetch();
    const body = await response.text();
    if (body.includes(signature)) await released;
    await route.fulfill({ response, body });
  });
  return { release };
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
