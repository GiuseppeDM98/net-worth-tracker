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
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    { name: 'setup-degraded', testMatch: /auth\.degraded\.setup\.ts/ },
    { name: 'setup-analisi', testMatch: /auth\.analisi\.setup\.ts/ },
    {
      name: 'desktop',
      // 1440px is the project's `desktop:` breakpoint — the width where the layout switches.
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, storageState: STORAGE_STATE },
      dependencies: ['setup'],
      // analisi.* runs in its own projects on the dedicated fixture account.
      testIgnore: [/\.(mobile|degraded)\.spec\.ts/, /analisi\./],
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
      testIgnore: /analisi\./,
    },
  ],

  webServer: {
    command: 'npm run dev:e2e',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
