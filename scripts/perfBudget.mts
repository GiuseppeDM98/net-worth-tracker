/**
 * perf:budget — how much JavaScript each route ships before it can paint, against perf/budget.json
 * (the manual: perf/README.md).
 *
 * Reads a PRODUCTION build on disk (no server, no emulators, two seconds): for every prerendered
 * `server/app/<route>.html` it takes the `<script src="/_next/static/chunks/…">` tags, gzips each
 * chunk and sums them. The decision is `compareRoutesToBudget` (lib/utils/perfBudget.ts), which
 * also receives the budget committed in HEAD (`git show HEAD:perf/budget.json`), so a ceiling
 * raised without a `raisedBy` of its own is red too. It also counts, over EVERY chunk on disk, the
 * copies of each library `libraryCopies` guards (recharts once shipped four times, one per page).
 *
 * Usage (options ALWAYS after `--`, or npm keeps them as npm_config_* and this script never sees them):
 *   npm run build && npm run perf:budget
 *   npm run perf:build && npm run perf:budget -- --dist=.next-perf
 *   npm run perf:budget -- --write      lower the ceilings to today's measure (+2%); never raises one
 *   npm run perf:budget -- --top=15     how many of the largest chunks to list (default 10)
 * Exit 1 on any violation.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import {
  compareRoutesToBudget,
  countLibraryCopies,
  countTextChars,
  describeViolation,
  extractInitialChunks,
  tightenBudget,
  LIBRARY_SIGNATURES,
  SHARED_KEY,
  type MeasuredBuild,
  type PerfBudget,
} from '@/lib/utils/perfBudget';

const BUDGET_PATH = 'perf/budget.json';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, '').split('=');
    return [key, value ?? 'true'];
  }),
);
const DIST = args.dist ?? process.env.NEXT_DIST_DIR ?? '.next';
const TOP = Number(args.top ?? 10);

interface Chunk {
  path: string;
  rawBytes: number;
  gzBytes: number;
}

interface RouteMeasure {
  route: string;
  chunks: string[];
  textChars: number;
}

const kb = (bytes: number) => Math.round((bytes / 1024) * 10) / 10;

/** `server/app/dashboard/analisi.html` → `/dashboard/analisi`; `index.html` → `/`. */
function routeOf(htmlPath: string): string {
  const withoutExt = relative(join(DIST, 'server', 'app'), htmlPath).split(sep).join('/').replace(/\.html$/, '');
  return withoutExt === 'index' ? '/' : `/${withoutExt}`;
}

function listPrerenderedPages(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listPrerenderedPages(full));
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

/**
 * Every JS chunk on disk, initial AND lazy: a library's copies are counted over the whole build,
 * since a lazy page section is exactly where a second copy would hide from the per-route sums.
 */
function readAllChunkTexts(): string[] {
  const chunksDir = join(DIST, 'static', 'chunks');
  return readdirSync(chunksDir, { recursive: true, encoding: 'utf-8' })
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(chunksDir, name), 'utf-8'));
}

/** Next's own error pages are not routes anybody opens. */
const isAppRoute = (route: string) => !route.startsWith('/_');

function measurePages(): RouteMeasure[] {
  const appDir = join(DIST, 'server', 'app');
  return listPrerenderedPages(appDir)
    .map((htmlPath) => {
      const html = readFileSync(htmlPath, 'utf-8');
      return { route: routeOf(htmlPath), chunks: extractInitialChunks(html), textChars: countTextChars(html) };
    })
    .filter((page) => isAppRoute(page.route))
    .sort((a, b) => a.route.localeCompare(b.route));
}

function readChunk(cache: Map<string, Chunk>, chunkPath: string): Chunk {
  const hit = cache.get(chunkPath);
  if (hit) return hit;
  const bytes = readFileSync(join(DIST, chunkPath));
  const chunk = { path: chunkPath, rawBytes: bytes.length, gzBytes: gzipSync(bytes).length };
  cache.set(chunkPath, chunk);
  return chunk;
}

/** The budget committed in HEAD, or null when HEAD has none (the commit that creates it). */
function readCommittedBudget(): PerfBudget | null {
  try {
    const text = execFileSync('git', ['show', `HEAD:${BUDGET_PATH}`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(text) as PerfBudget;
  } catch {
    return null;
  }
}

function assertProductionBuild(): void {
  const buildId = join(DIST, 'BUILD_ID');
  if (!existsSync(buildId)) {
    console.error(`[perf:budget] ${DIST} has no BUILD_ID: not a production build (a dev dir prerenders nothing).`);
    console.error('[perf:budget] Run `npm run build` (reads .next) or `npm run perf:build` and `-- --dist=.next-perf`.');
    process.exit(1);
  }
  console.log(`[perf:budget] build ${DIST} (BUILD_ID of ${statSync(buildId).mtime.toLocaleString('it-IT')})`);
}

// Measure the build
assertProductionBuild();
const pages = measurePages();
const chunkCache = new Map<string, Chunk>();
const sumGz = (chunks: string[]) => chunks.reduce((total, c) => total + readChunk(chunkCache, c).gzBytes, 0);
const sumRaw = (chunks: string[]) => chunks.reduce((total, c) => total + readChunk(chunkCache, c).rawBytes, 0);

// The shared chunks are those EVERY dashboard page loads: the login and the landing load a
// different shell, so they would shrink the intersection to the framework alone.
const dashboardPages = pages.filter((page) => page.route.startsWith('/dashboard'));
const sharedChunks = dashboardPages.length
  ? dashboardPages[0].chunks.filter((chunk) => dashboardPages.every((page) => page.chunks.includes(chunk)))
  : [];

const measured: MeasuredBuild = {
  routes: Object.fromEntries(pages.map((page) => [page.route, kb(sumGz(page.chunks))])),
  sharedGzKB: kb(sumGz(sharedChunks)),
  libraryCopies: countLibraryCopies(readAllChunkTexts(), LIBRARY_SIGNATURES),
};

// Compare with the budget
let budget: PerfBudget | null = existsSync(BUDGET_PATH) ? JSON.parse(readFileSync(BUDGET_PATH, 'utf-8')) : null;
if (args.write === 'true') {
  budget = tightenBudget(measured, budget);
  writeFileSync(BUDGET_PATH, `${JSON.stringify(budget, null, 2)}\n`);
  console.log(`[perf:budget] ${BUDGET_PATH} written: ceilings = measure +2%, only ever lowered.`);
}
if (!budget) {
  console.error(`[perf:budget] ${BUDGET_PATH} is missing: create it with \`npm run perf:budget -- --write\`.`);
  process.exit(1);
}
const verdict = compareRoutesToBudget(measured, budget, readCommittedBudget());

// Print the table
const pageByRoute = new Map(pages.map((page) => [page.route, page]));
console.log('\nroute | chunk | raw KB | gz KB | testo | tetto | esito');
for (const row of verdict.rows) {
  const page = pageByRoute.get(row.key);
  const chunks = row.key === SHARED_KEY ? sharedChunks : page?.chunks ?? [];
  console.log(
    [
      row.key,
      chunks.length,
      kb(sumRaw(chunks)),
      row.measuredKB ?? '-',
      page ? page.textChars : '-',
      row.ceilingKB ?? '-',
      row.ok ? 'ok' : 'ROSSO',
    ].join(' | '),
  );
}

// The largest chunks and who loads them: how the four copies of recharts surfaced on 2026-09-26.
const usage = new Map<string, string[]>();
for (const page of pages) for (const chunk of page.chunks) usage.set(chunk, [...(usage.get(chunk) ?? []), page.route]);
const largest = [...usage.keys()].map((c) => readChunk(chunkCache, c)).sort((a, b) => b.gzBytes - a.gzBytes).slice(0, TOP);
console.log(`\nI ${largest.length} chunk iniziali più grandi (gz KB · raw KB · route):`);
for (const chunk of largest) {
  const routes = usage.get(chunk.path) ?? [];
  const who = routes.length === pages.length ? 'tutte' : routes.length > 4 ? `${routes.length} route` : routes.join(', ');
  console.log(`  ${chunk.path.replace('static/chunks/', '')} · ${kb(chunk.gzBytes)} · ${kb(chunk.rawBytes)} · ${who}`);
}

// The copies of each guarded library, over every chunk on disk.
console.log('\nCopie delle librerie (chunk che le contengono, iniziali e pigri · massimo):');
for (const [library, copies] of Object.entries(measured.libraryCopies ?? {})) {
  console.log(`  ${library} · ${copies} · ${budget.libraryCopies?.[library] ?? 'nessun limite'}`);
}

if (!verdict.ok) {
  console.error('\n[perf:budget] ROSSO:');
  for (const violation of verdict.violations) console.error(`  - ${describeViolation(violation)}`);
  console.error('  Una route che cresce per una funzione nuova ALZA il suo tetto in questo commit, con «raisedBy»');
  console.error('  («#NNN: perché») e la riga nel registro di perf/README.md § Il ratchet e il tetto alzato.');
  process.exit(1);
}
console.log(`\n[perf:budget] verde: ${verdict.rows.length} voci sotto il tetto.`);
