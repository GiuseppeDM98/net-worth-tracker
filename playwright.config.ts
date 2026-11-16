/**
 * Playwright config — browser-level regression tests against the Firebase Emulator Suite.
 *
 * WHY PLAYWRIGHT AND NOT A COMPONENT RENDERER
 * The 86 Vitest files cover pure utils and services, which is where this codebase keeps its logic.
 * What they cannot see is everything that only exists once a browser lays the page out: the
 * `desktop:` grid switch at 1440px, a Framer Motion collapsible, the segmented pill, and whether a
 * loading state ever flashes the wrong content. jsdom has no layout engine, so a component renderer
 * would answer none of those questions.
 *
 * PREREQUISITE — the emulators must already be running:
 *   npm run emulators        (leave it running; it persists to .emulator-data)
 *   npm run emulators:seed   (once, for the base account)
 * `globalSetup` checks this and fails with that instruction rather than a connection stack trace,
 * then layers the Previdenza fixture on top.
 *
 * Port 3100, not 3000: a dev server on the real account is usually already running on 3000 while
 * working, and these tests must never point at production data.
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:3100';

/** Set by `npm run test:e2e` (the whole run): serve the production build instead of `next dev`. */
export const E2E_ON_BUILD = process.env.E2E_SERVER === 'build';

/** Where auth.setup.ts parks the signed-in storage state so specs don't each log in. */
export const STORAGE_STATE = 'e2e/.auth/user.json';

/**
 * Sessione del secondo account, quello degli scenari degradati.
 *
 * Un utente separato e non una risemina dell'account principale: gli scenari degradati riscrivono
 * snapshot e versamenti, e farlo sull'account condiviso renderebbe ogni altra spec dipendente
 * dall'ordine di esecuzione — il modo più rapido di ottenere una suite che fallisce solo in CI.
 */
export const DEGRADED_STORAGE_STATE = 'e2e/.auth/degraded.json';

/**
 * Sessione dell'account fixture di Analisi. Account separato per lo stesso motivo
 * dell'account degradato: il seed base scrive spese del MESE CORRENTE su test-user-1,
 * e le spec di Analisi affermano cifre esatte — ogni totale derivarebbe dalla data di
 * esecuzione. La fixture (scripts/seedAnalisiE2E.mts) data tutto a gennaio, così ogni
 * finestra year-to-date la contiene in qualunque mese giri la suite.
 */
export const ANALISI_STORAGE_STATE = 'e2e/.auth/analisi.json';
/**
 * Session of the Centri di Costo fixture account (scripts/seedCostCentersE2E.mts): the tab is
 * opt-in and a linked expense is an ordinary expense, so its data lives on an account of its own.
 */
export const CENTRI_STORAGE_STATE = 'e2e/.auth/centri.json';
/**
 * Session of the Divisione fixture account (scripts/seedSplitE2E.mts). Its own account for the
 * same reason as Centri di Costo: the tab is opt-in, and a row carrying `personalMemberId` is an
 * ordinary row that would move every figure the other Cashflow specs assert.
 */
export const SPLIT_STORAGE_STATE = 'e2e/.auth/split.json';
/**
 * Session of the Hall of Fame fixture account (scripts/seedHallOfFameE2E.mts): 47 monthly
 * snapshots since 2022, because a ranking needs a history behind it — and a history on the base
 * account would move every figure the other specs assert.
 */
export const HOF_STORAGE_STATE = 'e2e/.auth/hof.json';

/** The `desktop:` width, where the sidebar — and the profile the setups wait for — is a fixed column. */
const SETUP_VIEWPORT = { viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // The suite mutates one shared emulator account; parallel specs would race on it.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: BASE_URL,
    // Kept (2026-11-16): switched off, two whole runs gained nothing past the run-to-run noise
    // (doc/guide/e2e-playwright.md § The suite's speed), and a red that only a whole run produces
    // would leave no trace to read. `--trace=off` on the command line still turns it off for one run.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    // The six setups run at 1440: since 2026-09-28 the shell (`navigation`, `main`) is in the HTML
    // before anyone is signed in, so each setup anchors on the profile in the sidebar footer — the
    // one thing that needs the user — and the sidebar is a fixed column only from `desktop:`.
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: SETUP_VIEWPORT },
    { name: 'setup-degraded', testMatch: /auth\.degraded\.setup\.ts/, use: SETUP_VIEWPORT },
    { name: 'setup-analisi', testMatch: /auth\.analisi\.setup\.ts/, use: SETUP_VIEWPORT },
    { name: 'setup-centri', testMatch: /auth\.centri\.setup\.ts/, use: SETUP_VIEWPORT },
    { name: 'setup-split', testMatch: /auth\.split\.setup\.ts/, use: SETUP_VIEWPORT },
    { name: 'setup-hof', testMatch: /auth\.hof\.setup\.ts/, use: SETUP_VIEWPORT },
    {
      name: 'desktop',
      // 1440px is the project's `desktop:` breakpoint — the width where the layout switches.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: STORAGE_STATE },
      dependencies: ['setup'],
      // analisi.* runs in its own projects on the dedicated fixture account; *.tablet.* in the two
      // tablet projects only (since 2026-10-16), or it would run at 1440 as well.
      testIgnore: [/\.(mobile|degraded|tablet)\.spec\.ts/, /analisi\./, /centri\./, /split\./, /hof\./],
    },
    {
      // Hall of Fame on its own fixture account. Listed BEFORE its mobile twin: with `workers: 1`
      // the projects run in this order, and the desktop spec is the one that presses «Aggiorna i
      // record» to build the document the phone spec then reads.
      name: 'hof',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: HOF_STORAGE_STATE },
      dependencies: ['setup-hof'],
      testMatch: /hof\.spec\.ts/,
    },
    {
      name: 'hof-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        storageState: HOF_STORAGE_STATE,
      },
      dependencies: ['setup-hof'],
      testMatch: /hof\.mobile\.spec\.ts/,
    },
    {
      name: 'centri',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: CENTRI_STORAGE_STATE },
      dependencies: ['setup-centri'],
      testMatch: /centri\.spec\.ts/,
    },
    {
      name: 'split',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: SPLIT_STORAGE_STATE },
      dependencies: ['setup-split'],
      testMatch: /split\.spec\.ts/,
    },
    {
      name: 'split-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        storageState: SPLIT_STORAGE_STATE,
      },
      dependencies: ['setup-split'],
      testMatch: /split\.mobile\.spec\.ts/,
    },
    {
      name: 'centri-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        storageState: CENTRI_STORAGE_STATE,
      },
      dependencies: ['setup-centri'],
      testMatch: /centri\.mobile\.spec\.ts/,
    },
    {
      // Analisi on its own fixture account — same desktop width as the main project.
      name: 'analisi',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: ANALISI_STORAGE_STATE,
      },
      dependencies: ['setup-analisi'],
      testMatch: /analisi\.spec\.ts/,
    },
    {
      name: 'analisi-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        storageState: ANALISI_STORAGE_STATE,
      },
      dependencies: ['setup-analisi'],
      testMatch: /analisi\.mobile\.spec\.ts/,
    },
    {
      // Gli stati in cui il rendimento NON è una misura. Stessa larghezza del progetto desktop —
      // uno di questi test riguarda proprio il layout a 1440px — ma sull'account degradato.
      name: 'degraded',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        storageState: DEGRADED_STORAGE_STATE,
      },
      dependencies: ['setup-degraded'],
      testMatch: /\.degraded\.spec\.ts/,
    },
    {
      // Rendimenti composed for a phone, on the degraded account's `performance` fixture
      // (2026-10-14): the one page whose composition spec needs a fixture with a measured
      // return. `mobile` ignores `degraded.` below, or it would collect this file on the base account.
      name: 'degraded-mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        storageState: DEGRADED_STORAGE_STATE,
      },
      dependencies: ['setup-degraded'],
      testMatch: /\.degraded\.mobile\.spec\.ts/,
    },
    {
      name: 'mobile',
      // 390px is the width DESIGN.md designs against first. Chromium rather than the WebKit-backed
      // iPhone descriptor: one browser to install, and what is under test here is the layout at a
      // width, not an engine difference.
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /\.mobile\.spec\.ts/,
      testIgnore: [/analisi\./, /centri\./, /split\./, /hof\./, /degraded\./],
    },
    {
      // The small-screen composition on a tablet (since 2026-10-16): 768 in portrait, two
      // columns with the pill. A `*.tablet.spec.ts` runs here AND in `tablet-landscape`, and
      // branches on `page.viewportSize().width`. Same account and ignores as `mobile`.
      name: 'tablet',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        hasTouch: true,
        isMobile: true,
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /\.tablet\.spec\.ts/,
      testIgnore: [/analisi\./, /centri\./, /split\./, /hof\./, /degraded\./],
    },
    {
      // 1024 in landscape: the stage (the answer on the left, the index on the right), the icon rail, no pill and no bar.
      name: 'tablet-landscape',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
        isMobile: true,
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
      testMatch: /\.tablet\.spec\.ts/,
      testIgnore: [/analisi\./, /centri\./, /split\./, /hof\./, /degraded\./],
    },
  ],

  // Two servers on the one port (2026-11-16, doc/guide/e2e-playwright.md § The suite's speed):
  // `npm run test:e2e`, the WHOLE run, builds first (`e2e:build`, skipped when the code has not
  // changed) and serves that production build — about a third faster, and no route compiled on its
  // first visit; `npx playwright test e2e/<area>` keeps `next dev`, which a code change needs no build for.
  // The production server is never reused: one already on :3100 is either a `next dev` or a build of
  // other code, and `--fresh` refuses a build older than the tree — a stale build runs green in silence.
  webServer: E2E_ON_BUILD
    ? {
        command: `node scripts/perfServe.mjs --port=3100 --dist=.next-e2e-build --env-local --fresh`,
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 60_000,
        stdout: 'ignore',
        stderr: 'pipe',
      }
    : {
        command: 'npm run dev:e2e',
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
});
