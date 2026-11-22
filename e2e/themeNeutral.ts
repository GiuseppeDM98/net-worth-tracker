/**
 * The palette themes render exactly as before the costume contract (DESIGN.md → The Costume Rule,
 * 2026-11-21): a computed-style signature of eight probes on three pages — and the «Nuova Spesa»
 * dialog at 1440 —, every palette theme in both modes, compared with `e2e/themeNeutral.baseline.json`.
 * Since 2026-11-22 six more, the surfaces the costume reaches outside the tiles: the sidebar's group
 * label and the account menu (1440), an inactive bottom-pill label and the Cashflow phone tab (390),
 * the axis pill with its indicator and the first PatrimonioTile chip (both widths).
 * A helper, not a spec (the FILENAME chooses the project): `theme.neutral.spec.ts` runs it at 1440,
 * `theme.neutral.mobile.spec.ts` at 390.
 *
 * Why a recorded baseline and not pixels: the costume adds DOM that must be inert (a `display:
 * contents` scope, two attributes, hook classes, a span around a heading's figures) and computed
 * styles say «inert» exactly, where a screenshot would also move with the data and the clock. The
 * strings are the browser's own, compared exactly — but a COLOUR is compared as a colour: the
 * production build's minifier serialises the same token differently from `next dev` (`lab(90.952 0 0)`
 * where dev reads `rgb(229, 229, 229)`, a fourth decimal apart elsewhere), so the colour properties
 * match within ΔOKLab 0.002 and 0.01 of alpha (`sameColor`). `THEME_NEUTRAL_RECORD=1` re-records ONE
 * viewport key — only on code the costume has not touched yet (the baseline is a contract, not a
 * snapshot to refresh when it goes red). Seen red on 2026-11-21 with the gate stripped from the
 * tile-shadow rule: every tile lost its `shadow-sm`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { COLOR_THEME_META, COLOR_THEMES, COLOR_THEME_STORAGE_KEY, DEFAULT_COLOR_THEME } from '../lib/constants/colorTheme';
import { cssColorToOklch } from '../lib/utils/colorParse';

export const BASELINE_PATH = resolve(__dirname, 'themeNeutral.baseline.json');
export type ViewportKey = '1440' | '390';

/** The palette themes: every theme without a costume — the six of today, and still six after a costume theme lands. */
export const PALETTE_THEMES = COLOR_THEMES.filter((theme) => COLOR_THEME_META[theme].costume === null);
const MODES = ['light', 'dark'] as const;

const PAGES = ['/dashboard', '/dashboard/history', '/dashboard/cashflow?tab=tracking'] as const;

const PROPERTIES = [
  'font-family',
  'font-weight',
  'font-size',
  'letter-spacing',
  'text-transform',
  'color',
  'background-color',
  'background-image',
  'border-top-color',
  'border-top-left-radius',
  'box-shadow',
] as const;

/**
 * The eight probes, each the FIRST match in the page. The header label is the desktop row's first
 * paragraph (rendered, if hidden, below `desktop:`); the tile is the census's `section.rounded-2xl`.
 */
const PROBES: Record<string, string> = {
  html: 'html',
  body: 'body',
  pageMain: '#page-main',
  headerLabel: 'main div[style*="page-header"] > div:nth-child(2) > div > p',
  verdictHeadline: 'main section[style*="page-verdict"] h2',
  tile: 'main section.rounded-2xl',
  tileHeading: 'main section.rounded-2xl h3',
  primaryButton: 'main [data-slot="button"][data-variant="default"]',
};

/** The Panoramica's axis pill (`PeriodSelector`), its first PatrimonioTile chip: probed at both widths. */
const AXIS_PILL = 'main [role="radiogroup"][aria-label="Periodo del grafico"]';
const BOTH_WIDTHS_PROBES: Record<string, string> = {
  axisPill: AXIS_PILL,
  axisIndicator: `${AXIS_PILL} [role="radio"][aria-checked="true"] > span:first-child`,
  patrimonioChip: 'main section[aria-label="Patrimonio"] span.inline-flex.whitespace-nowrap',
};

/**
 * The shell's probes, each where it is drawn (2026-11-22, before the costume reached the shell): the sidebar's
 * «Analisi» group label at 1440; an inactive label of the bottom pill and the Cashflow phone tab at 390.
 */
const VIEWPORT_PROBES: Record<ViewportKey, Record<string, string>> = {
  '1440': { ...BOTH_WIDTHS_PROBES, sidebarLabel: '[data-sidebar="group-label"]' },
  '390': {
    ...BOTH_WIDTHS_PROBES,
    bottomPillLabel: 'nav[data-nav="pill"] a:not([aria-current])',
    phoneTab: 'main [role="tablist"][class*="desktop:hidden"] > [role="tab"]',
  },
};

type Signature = Record<string, Record<string, string> | null>;
type Baseline = Partial<Record<ViewportKey, Record<string, Record<string, Signature>>>>;

const THEME_MODE_KEY = (theme: string, mode: string) => `${theme}·${mode}`;

/** The properties whose value is ONE colour, compared as a colour (the header). */
const COLOR_PROPERTIES = new Set(['color', 'background-color', 'border-top-color']);

function alphaOf(css: string): number {
  const slash = css.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (slash) return parseFloat(slash[1]) / (slash[2] ? 100 : 1);
  const rgba = css.match(/^rgba\([^)]*,\s*([\d.]+)\s*\)$/i);
  return rgba ? parseFloat(rgba[1]) : 1;
}

/** The same colour in two serialisations: ΔOKLab under 0.002 (far below a visible step) and the same alpha. */
function sameColor(a: string, b: string): boolean {
  const x = cssColorToOklch(a);
  const y = cssColorToOklch(b);
  if (!x || !y) return false;
  const toLab = ([l, c, h]: [number, number, number]) => [l, c * Math.cos((h * Math.PI) / 180), c * Math.sin((h * Math.PI) / 180)];
  const [p, q] = [toLab(x), toLab(y)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 0.002 && Math.abs(alphaOf(a) - alphaOf(b)) < 0.01;
}

/** Every probe's property that differs from the baseline, exactly — a colour as a colour. Empty = identical. */
function differences(actual: Signature, expected: Signature | undefined): string[] {
  if (!expected) return ['no baseline for this page'];
  const found: string[] = [];
  for (const probe of new Set([...Object.keys(actual), ...Object.keys(expected)])) {
    const a = actual[probe];
    const e = expected[probe];
    if (a === null || e === null || a === undefined || e === undefined) {
      if (a !== e) found.push(`${probe}: ${JSON.stringify(e)} → ${JSON.stringify(a)}`);
      continue;
    }
    for (const property of new Set([...Object.keys(a), ...Object.keys(e)])) {
      const [now, then] = [a[property], e[property]];
      if (now === then) continue;
      if (COLOR_PROPERTIES.has(property) && now !== undefined && then !== undefined && sameColor(now, then)) continue;
      found.push(`${probe} ${property}: ${then} → ${now}`);
    }
  }
  return found;
}

async function readSignature(page: Page, probes: Record<string, string>): Promise<Signature> {
  return page.evaluate(
    ({ probes, properties }) =>
      Object.fromEntries(
        Object.entries(probes).map(([name, selector]) => {
          const element = document.querySelector(selector);
          if (!element) return [name, null];
          const style = getComputedStyle(element);
          return [name, Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]))];
        }),
      ),
    { probes, properties: [...PROPERTIES] },
  );
}

/** The page's own heading is in, its skeletons are gone, the entrance is over. */
async function settle(page: Page): Promise<void> {
  await expect(page.locator('main h1').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main [data-slot="skeleton"]')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(600);
}

function readBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as Baseline;
  } catch {
    return {};
  }
}

/** Declares the twelve tests of one viewport (six palette themes × two modes) in the calling spec. */
export function describeThemeNeutrality(viewport: ViewportKey): void {
  const recording = process.env.THEME_NEUTRAL_RECORD === '1';
  const recorded: Record<string, Record<string, Signature>> = {};

  test.describe.configure({ timeout: 180_000 });

  for (const theme of PALETTE_THEMES) {
    for (const mode of MODES) {
      const key = THEME_MODE_KEY(theme, mode);
      test(`${key}: the computed styles equal the baseline`, async ({ page }) => {
        await page.addInitScript(
          ({ themeKey, theme, mode }) => {
            localStorage.setItem(themeKey, theme);
            // next-themes' own key: the mode before the first paint.
            localStorage.setItem('theme', mode);
          },
          { themeKey: COLOR_THEME_STORAGE_KEY, theme, mode },
        );
        const signatures: Record<string, Signature> = {};
        for (const path of PAGES) {
          await page.goto(path);
          await settle(page);
          // The precondition: the theme and the mode the probe is about (a synced preference would replace them).
          const root = await page.evaluate(() => ({
            theme: document.documentElement.getAttribute('data-theme'),
            dark: document.documentElement.classList.contains('dark'),
          }));
          expect(root).toEqual({ theme: theme === DEFAULT_COLOR_THEME ? null : theme, dark: mode === 'dark' });
          const signature = await readSignature(page, { ...PROBES, ...VIEWPORT_PROBES[viewport] });
          // The account menu is a portalled DropdownMenu: opened from the sidebar's footer at 1440, closed by Escape.
          if (viewport === '1440' && path === '/dashboard') {
            await page.locator('[data-sidebar="footer"] [aria-haspopup="menu"]').click();
            const menu = page.locator('[data-slot="dropdown-menu-content"]');
            await expect(menu).toBeVisible();
            await page.waitForTimeout(400);
            Object.assign(signature, await readSignature(page, { accountMenu: '[data-slot="dropdown-menu-content"]' }));
            await page.keyboard.press('Escape');
            await expect(menu).toBeHidden();
          }
          // «Nuova Spesa» is a desktop control (hidden below `desktop:`): the dialog is probed at 1440, closed unsent.
          if (viewport === '1440' && path.includes('cashflow')) {
            await page.getByRole('button', { name: 'Nuova Spesa', exact: true }).click();
            const dialog = page.getByRole('dialog');
            await expect(dialog).toBeVisible();
            await page.waitForTimeout(600);
            Object.assign(signature, await readSignature(page, { dialog: '[role="dialog"]' }));
            await dialog.getByRole('button', { name: 'Annulla' }).first().click();
            await expect(dialog).toBeHidden();
          }
          signatures[path] = signature;
        }
        if (recording) {
          recorded[key] = signatures;
          return;
        }
        const expected = readBaseline()[viewport];
        expect(expected, `no «${viewport}» key in e2e/themeNeutral.baseline.json — record it first`).toBeDefined();
        for (const path of PAGES) expect(differences(signatures[path], expected![path]?.[key]), `${path} · ${key}`).toEqual([]);
      });
    }
  }

  test.afterAll(() => {
    if (!recording) return;
    // path → theme·mode, the baseline's order: one viewport key replaced, the other kept.
    const byPath: Record<string, Record<string, Signature>> = {};
    for (const path of PAGES) {
      byPath[path] = {};
      for (const [key, signatures] of Object.entries(recorded)) byPath[path][key] = signatures[path];
    }
    const baseline = readBaseline();
    baseline[viewport] = byPath;
    writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  });
}
