/**
 * The assertions on the dashboard shell before the login (in the HTML since 2026-09-28),
 * shared by `shell.boot.spec.ts` (desktop, 1440) and
 * `shell.boot.mobile.spec.ts` (390): the dashboard shell is in the HTML before anyone is signed
 * in, hydrates at either width without a mismatch, and a stored colour theme is on <html> from the
 * first frame. A helper, not a spec: the FILENAME chooses the project (AGENTS.md § 5), and this
 * one is collected by none. A spec cannot import `lib/` (no `@/` alias), so the storage key and the
 * labels are repeated here — `__tests__/colorTheme.test.ts` pins the key on the other side.
 */
import { expect, type APIRequestContext, type Page } from '@playwright/test';

/** `COLOR_THEME_STORAGE_KEY` in lib/constants/colorTheme.ts. */
const THEME_STORAGE_KEY = 'color-theme';
/** A theme that is not the default, so its attribute is visible. */
const NON_DEFAULT_THEME = 'cyberpunk';

/** What React (or Next's dev overlay) prints when the server HTML and the client tree disagree. */
const HYDRATION_MESSAGE = /hydrat|did not match|server rendered HTML|server-rendered HTML/i;

/** The page's heading: `PageHeader` renders it twice (phone navbar, desktop row), one copy hidden. */
const pageHeading = (page: Page) => page.locator('main h1').filter({ visible: true });

interface ThemeProbe {
  /** `data-theme` at the first animation frame — the first thing the reader could have seen. */
  firstFrameTheme: string | null | 'unread';
  /** Whether `data-theme` was set while `document.body` did not exist yet: the <head> script did it. */
  setBeforeBody: boolean | 'unseen';
  /** `data-theme` at every frame until the page's own heading is in the DOM. */
  frames: (string | null)[];
}

/**
 * (a) The HTML alone — no JS, no session — carries the shell: the skip link, the sidebar's routes
 * as a navigation landmark, the bottom nav, `main`, and the auth wait in place of the page. The
 * spinner it replaced is not there.
 */
export async function expectShellInHtml(request: APIRequestContext): Promise<void> {
  const response = await request.get('/dashboard');
  expect(response.ok()).toBe(true);
  const html = await response.text();

  expect(html).toContain('Vai al contenuto principale');
  expect(html).toContain('role="navigation"');
  expect(html).toContain('<nav');
  expect(html).toContain('id="page-main"');
  for (const route of ['Panoramica', 'Patrimonio', 'Cashflow']) expect(html).toContain(route);
  // React escapes the apostrophe of the attribute value.
  expect(html).toMatch(/aria-label="Verifica dell(?:&#x27;|&#39;|')accesso"/);
  expect(html).not.toContain('animate-spin rounded-full border-4');
}

/**
 * (b) Hydration at this width is silent. The anchor is positive first: an error injected after
 * the load must reach the listener, or an empty list would prove nothing. Then the page's own
 * heading — it mounts after Auth resolves, so by then hydration is long done — and no message
 * about a mismatch in what the page printed. BOTH channels are read: React 19 reports «Hydration
 * failed because the server rendered HTML didn't match the client» as an uncaught error
 * (`pageerror`), not as a console line — a listener on `console` alone stayed green with a
 * `typeof window` branch in the layout (2026-09-28).
 */
export async function expectCleanHydration(page: Page): Promise<void> {
  const messages: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') messages.push(message.text());
  });
  page.on('pageerror', (error) => {
    messages.push(String(error));
  });

  await page.goto('/dashboard', { waitUntil: 'load' });
  await page.evaluate(() => console.error('shell.boot probe'));
  await expect.poll(() => messages.some((text) => text.includes('shell.boot probe'))).toBe(true);
  await expect(pageHeading(page)).toBeVisible();

  expect(messages.filter((text) => HYDRATION_MESSAGE.test(text))).toEqual([]);
}

/**
 * (c) A stored non-default theme is on <html> before the first paint. The init script stores the
 * theme (on THIS page only — every test gets its own context from the storage state, so nothing
 * leaks) and probes three things from inside the page: the attribute at the first animation
 * frame, whether it was set while `document.body` did not exist yet (only a <head> script can),
 * and the attribute at every frame until the page's heading is in the DOM — the moment a
 * Firestore-synced preference may legitimately replace it.
 *
 * Why not «the first MutationObserver callback»: the parser may yield between <head> and the
 * script, and that callback would then see the head's insertions with the attribute still unset.
 */
export async function expectThemeOnFirstFrame(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, theme }) => {
      try {
        localStorage.setItem(key, theme);
      } catch {
        // Then the probe below reads null and the assertion says so.
      }
      const probe: ThemeProbe = { firstFrameTheme: 'unread', setBeforeBody: 'unseen', frames: [] };
      (window as unknown as { __shellBoot: ThemeProbe }).__shellBoot = probe;
      // `addInitScript` runs before `document.documentElement` exists: observe `document` itself.
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.type === 'attributes' && record.attributeName === 'data-theme' && probe.setBeforeBody === 'unseen') {
            probe.setBeforeBody = document.body === null;
          }
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-theme'] });
      const sample = () => {
        const current = document.documentElement.getAttribute('data-theme');
        if (probe.firstFrameTheme === 'unread') probe.firstFrameTheme = current;
        probe.frames.push(current);
        if (!document.querySelector('main h1') && probe.frames.length < 600) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    },
    { key: THEME_STORAGE_KEY, theme: NON_DEFAULT_THEME },
  );

  await page.goto('/dashboard', { waitUntil: 'load' });
  await expect(pageHeading(page)).toBeVisible();
  const probe = await page.evaluate(() => (window as unknown as { __shellBoot: ThemeProbe }).__shellBoot);

  expect(probe.firstFrameTheme).toBe(NON_DEFAULT_THEME);
  expect(probe.setBeforeBody).toBe(true);
  expect(probe.frames.length).toBeGreaterThan(0);
  expect(probe.frames.filter((frame) => frame !== NON_DEFAULT_THEME)).toEqual([]);
}

/**
 * (d) The browser's own chrome follows the page (2026-10-17, lib/utils/themeColor.ts): every
 * `<meta name="theme-color">` carries the hex of the RESOLVED `--background` — the colour `<html>`
 * itself is painted with, so an overscroll shows the page's colour, not white — and `color-scheme`
 * on `<html>` says the mode next-themes put there. Read after the page's heading, when
 * `ThemeColorSync` has had its frame. The bars themselves are outside the page: the owner looks at
 * them on the phone; this holds what feeds them.
 */
export async function expectBrowserChromeFollowsTheme(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'load' });
  await expect(pageHeading(page)).toBeVisible();
  // The poll answers «ok» or the probe itself, so a red run prints what the page held.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const html = document.documentElement;
        const style = getComputedStyle(html);
        // Chromium serves a down-levelled token as `lab(…)` (lib/utils/colorParse.ts), and its
        // `fillStyle` getter keeps that form: the PIXEL painted with it is the `#rrggbb` the meta carries.
        const toHex = (color: string) => {
          const canvas = document.createElement('canvas');
          canvas.width = 1;
          canvas.height = 1;
          const context = canvas.getContext('2d');
          if (!context) return color;
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
        };
        const probe = {
          metas: Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((meta) => meta.getAttribute('content')),
          htmlBackground: toHex(style.backgroundColor),
          bodyBackground: toHex(getComputedStyle(document.body).backgroundColor),
          colorScheme: style.colorScheme,
          isDark: html.classList.contains('dark'),
        };
        const ok =
          probe.metas.length > 0 &&
          probe.metas.every((content) => content === probe.htmlBackground) &&
          probe.htmlBackground === probe.bodyBackground &&
          probe.colorScheme === (probe.isDark ? 'dark' : 'light');
        return ok ? 'ok' : JSON.stringify(probe);
      }),
    )
    .toBe('ok');
}

/**
 * (e) Geist Sans is the face the UI reads in (2026-11-21): next/font's variables sit on <html>,
 * where Tailwind's preflight resolves `--font-sans`. On <body> the variable was undefined there
 * and the sans fell back to `system-ui` — masked by Segoe UI and SF, so only the computed family
 * tells. Two halves: the body's computed family starts with Geist and not Geist Mono, and a face
 * whose family is exactly `Geist` is loaded — never next/font's metric-adjusted «Geist Fallback»,
 * which a family list naming Geist first would also resolve to while the file is missing.
 */
export async function expectGeistSansApplied(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'load' });
  await expect(pageHeading(page)).toBeVisible();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        await document.fonts.ready;
        const family = getComputedStyle(document.body).fontFamily.replace(/['"]/g, '');
        const loaded = [...document.fonts].some(
          (face) => face.family.replace(/['"]/g, '') === 'Geist' && face.status === 'loaded',
        );
        const ok = family.startsWith('Geist') && !family.startsWith('Geist Mono') && loaded;
        return ok ? 'ok' : JSON.stringify({ family, faces: [...document.fonts].map((f) => `${f.family}:${f.status}`) });
      }),
    )
    .toBe('ok');
}

/**
 * (f) The costume's boundary is the dashboard alone (DESIGN.md → The Costume Rule, 2026-11-21): one
 * `[data-costume-scope]` on /dashboard (the shell's), none on the landing or the login — the
 * primitives they share with the dashboard stay in the default costume.
 */
export async function expectCostumeScopeInDashboard(page: Page): Promise<void> {
  await page.goto('/dashboard', { waitUntil: 'load' });
  await expect(pageHeading(page)).toBeVisible();
  await expect(page.locator('[data-costume-scope]')).toHaveCount(1);
}

/** The landing and the login, read without a session (a session would send them on to the dashboard). */
export async function expectNoCostumeScopeOutsideDashboard(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'load' });
  await expect(page.locator('h1').filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('[data-costume-scope]')).toHaveCount(0);
  await page.goto('/login', { waitUntil: 'load' });
  await expect(page.locator('#email')).toBeVisible();
  await expect(page.locator('[data-costume-scope]')).toHaveCount(0);
}

/** Without a session the shell shows, the page never does, and /login follows. */
export async function expectRedirectWithoutSession(page: Page): Promise<void> {
  await page.goto('/dashboard');
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await expect(page.locator('#email')).toBeVisible();
}
