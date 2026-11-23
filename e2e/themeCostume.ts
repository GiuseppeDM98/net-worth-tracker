/**
 * The shared probes of the costume's first pass over the shell, the portals and the controls (DESIGN.md → The
 * Costume Rule, doc/guide/temi.md § Il costume, 2026-11-22). A helper, not a spec: the FILENAME chooses the project —
 * `theme.costume.spec.ts` at 1440, `.mobile` at 390, `.tablet` at 768×1024 and 1024×768.
 */
import { expect, type Page } from '@playwright/test';

export const COSTUMES = ['egeo', 'orbita'] as const;
export type Costume = (typeof COSTUMES)[number];
export const MODES = ['light', 'dark'] as const;

/** The heading face of each costume, as the browser serialises the family. */
export const COSTUME_FACE: Record<Costume, RegExp> = { egeo: /^"?Marcellus/, orbita: /^"?Chakra Petch/ };

/** A pill's computed radius: `calc(infinity * 1px)` serialises as a huge length (3.35544e+07px). */
export function isRoundPill(radius: string | undefined): boolean {
  return parseFloat(radius ?? '0') > 1000;
}

/** The radius of the first match of `selector` (top-left corner), or `null` when nothing matches. */
export async function cornerOf(page: Page, selector: string): Promise<string | null> {
  return page.evaluate((selector) => {
    const element = document.querySelector(selector);
    return element ? getComputedStyle(element).borderTopLeftRadius : null;
  }, selector);
}

/** The `d` of every path inside the page header's desktop emblem (the 22px svg before the label). */
export async function desktopEmblem(page: Page): Promise<{ paths: string[]; circles: number }> {
  return page.evaluate(() => {
    const svg = [...document.querySelectorAll('#page-main svg[aria-hidden="true"][width="22"]')][0];
    return svg
      ? { paths: [...svg.querySelectorAll('path')].map((path) => path.getAttribute('d') ?? ''), circles: svg.querySelectorAll('circle').length }
      : { paths: [], circles: 0 };
  });
}

/** The computed colour of a token, read through a probe span laid inside `host` (a token's served form is not its authored one). */
export async function tokenColorIn(page: Page, host: string, token: string): Promise<string> {
  return page.evaluate(
    ({ host, token }) => {
      const parent = document.querySelector(host) ?? document.body;
      const probe = document.createElement('span');
      probe.style.color = `var(${token})`;
      parent.appendChild(probe);
      const color = getComputedStyle(probe).color;
      probe.remove();
      return color;
    },
    { host, token },
  );
}

/** A figure inside a heading: the mono, whatever face the costume gives the heading. */
export const MONO_FACE = /^"?Geist Mono/;

/** One computed property of the first match of `selector`, or `null` when nothing matches. */
export async function computedOf(page: Page, selector: string, property: string): Promise<string | null> {
  return page.evaluate(
    ({ selector, property }) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).getPropertyValue(property) : null;
    },
    { selector, property },
  );
}

/** No element of the page sticks out of the viewport sideways. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

export const TEMPLE = 'M2 8 L11 2 L20 8 M4 8 V18 M8 8 V18 M14 8 V18 M18 8 V18 M2 20 H20';
export const AMPHORA =
  'M8 2 H14 M9 2 V5 M13 2 V5 M9 5 C4 7 4 14 8 18 H14 C18 14 18 7 13 5 M9 20 H13 M10 18 V20 M12 18 V20 M9 3.5 C6 4 5.5 7 7 9 M13 3.5 C16 4 16.5 7 15 9';
export const SCROLL = 'M5 4 H15 C17 4 17 7 15 7 H5 M5 4 C3 4 3 7 5 7 M7 7 V18 M13 7 V18 M5 18 H15 C17 18 17 21 15 21 H5 C3 21 3 18 5 18';
export const FLAME = 'M11 3 C14 7 16 10 14 13 C16 12 17 14 16 16 C15 19 7 19 6 16 C5 13 8 9 11 3 M9 20 H13';
export const MEANDER = 'M3 19 V3 H19 V15 H7 V7 H15 V11 H11';
export const WREATH =
  'M7 19 C2 15 2 7 7 3 M15 19 C20 15 20 7 15 3 M5 15 L3 14 M4 11 L2 10 M5 7 L3 6 M17 15 L19 14 M18 11 L20 10 M17 7 L19 6';
export const WAVES =
  'M2 9 C4 6 6 6 7 9 C8 12 10 12 11 9 C12 6 14 6 15 9 C16 12 18 12 20 9 M2 15 C4 12 6 12 7 15 C8 18 10 18 11 15 C12 12 14 12 15 15 C16 18 18 18 20 15';
