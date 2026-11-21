/**
 * The costume contract, read statically (DESIGN.md → The Costume Rule, doc/guide/temi.md § Il costume,
 * 2026-11-21). A palette theme declares no costume; every rule that paints with a costume token sits
 * in the «Theme costume» section of `app/globals.css` and is gated by `[data-costume] [data-costume-scope]`,
 * so outside a costume theme — and outside the dashboard and its dialogs — nothing changes.
 *
 * Seen red on 2026-11-21: the palette-theme case with `--costume-ground` declared in `:root`; the gate
 * case with the gate stripped off one selector, with `:not(.ai-control)` dropped, and with a
 * `box-shadow: var(--costume-tile-shadow)` outside the banners; the scope-property case with a 19th
 * string in the list; the eyebrow case with the colour losing its fallback; the emblem case with
 * `resolveEmblem` ignoring `inScope`.
 */
import { describe, expect, it } from 'vitest';
import { COLOR_THEMES, COLOR_THEME_META, COSTUME_THEMES } from '@/lib/constants/colorTheme';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import { COSTUME_SCOPE_PROPERTIES, resolveEmblem, type EmblemArt, type ThemeEmblems } from '@/lib/constants/themeCostume';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import { GLOBALS_CSS, themeBlockBody, themeBlockHeader } from './themeBlocks';

const OPEN_BANNER = '/* ─── Theme costume (DESIGN.md → The Costume Rule) ── */';
const CLOSE_BANNER = '/* ─── End of theme costume ── */';
const GATE = '[data-costume] [data-costume-scope]';
const SCOPE_BLOCK = /^(?:\.dark)?\[data-theme="[^"]+"\] \[data-costume-scope\]$/;

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** The section between the two banners, and the stylesheet without it. */
function splitSection(): { section: string; outside: string } {
  const start = GLOBALS_CSS.indexOf(OPEN_BANNER);
  const end = GLOBALS_CSS.indexOf(CLOSE_BANNER);
  expect(start, 'the opening banner').toBeGreaterThan(-1);
  expect(end, 'the closing banner, after the opening one').toBeGreaterThan(start);
  return {
    section: stripComments(GLOBALS_CSS.slice(start + OPEN_BANNER.length, end)),
    outside: stripComments(GLOBALS_CSS.slice(0, start) + GLOBALS_CSS.slice(end + CLOSE_BANNER.length)),
  };
}

interface Declaration { selectors: string[]; property: string; value: string }
interface Rule { selector: string; atRule: string | null }

/** A small walk over the CSS: every style rule (with its enclosing at-rule) and every declaration with its block stack. */
function walk(css: string): { rules: Rule[]; declarations: Declaration[] } {
  const rules: Rule[] = [];
  const declarations: Declaration[] = [];
  const stack: string[] = [];
  let buffer = '';
  for (const char of css) {
    if (char === '{') {
      const header = buffer.trim();
      const enclosing = stack[stack.length - 1] ?? null;
      if (!header.startsWith('@')) rules.push({ selector: header, atRule: enclosing?.startsWith('@') ? enclosing : null });
      stack.push(header);
      buffer = '';
    } else if (char === '}' || char === ';') {
      const text = buffer.trim();
      const colon = text.indexOf(':');
      if (text && colon > 0 && stack.length > 0 && !text.startsWith('@')) {
        declarations.push({ selectors: [...stack], property: text.slice(0, colon).trim(), value: text.slice(colon + 1).trim() });
      }
      if (char === '}') stack.pop();
      buffer = '';
    } else {
      buffer += char;
    }
  }
  return { rules, declarations };
}

const PALETTE_THEMES = COLOR_THEMES.filter((theme) => COLOR_THEME_META[theme].costume === null);

describe('a palette theme wears no costume', () => {
  it.each(PALETTE_THEMES.flatMap((theme) => (['light', 'dark'] as const).map((mode) => ({ theme, mode }))))(
    '$theme · $mode: no scope block, no costume property',
    ({ theme, mode }) => {
      const header = themeBlockHeader(theme, mode);
      // The default's light header is a list: its scope block would be written for each half.
      for (const single of header.split(', ')) expect(GLOBALS_CSS).not.toContain(`\n${single} [data-costume-scope] {`);
      expect(themeBlockBody(header)).not.toContain('--costume-');
    },
  );
});

describe('every costume rule is gated, and nothing outside the section paints with one', () => {
  const { section, outside } = splitSection();
  const { rules } = walk(section);

  it('has rules between the banners', () => {
    expect(rules.length).toBeGreaterThan(0);
  });

  it('starts every selector of the section with the gate, inside @media too', () => {
    for (const { selector } of rules) {
      for (const item of selector.split(',')) expect(item.trim(), selector).toMatch(new RegExp(`^${GATE.replace(/[[\]]/g, '\\$&')}`));
    }
  });

  it('keeps the primary glow off a focused control and off a control that asks a model', () => {
    const glow = rules.filter(({ selector }) => selector.includes('[data-variant="default"]'));
    expect(glow).toHaveLength(1);
    expect(glow[0].selector.trim().endsWith(':not(.ai-control):not(:focus-visible)')).toBe(true);
    expect(AI_CONTROL_ACCENT_CLASS.split(' ')[0]).toBe('ai-control');
  });

  it('reads a costume token outside the section only inside a scope block, to compose another costume token', () => {
    const readers = walk(outside).declarations.filter(({ value }) => value.includes('var(--costume-'));
    for (const { selectors, property } of readers) {
      const block = selectors[selectors.length - 1];
      expect(property.startsWith('--costume-'), `${block} { ${property} }`).toBe(true);
      expect(block, `${property} read in «${block}»`).toMatch(SCOPE_BLOCK);
    }
  });
});

describe('the scope properties', () => {
  it('lists the eighteen properties in the contract order', () => {
    expect(COSTUME_SCOPE_PROPERTIES).toHaveLength(18);
    expect(COSTUME_SCOPE_PROPERTIES).toEqual([
      '--radius',
      '--radius-2xl',
      '--costume-ground',
      '--costume-ornament',
      '--costume-tile-image',
      '--costume-tile-image-position',
      '--costume-tile-image-size',
      '--costume-tile-shadow',
      '--costume-heading-font',
      '--costume-heading-weight',
      '--costume-heading-tracking',
      '--costume-heading-case',
      '--costume-heading-size',
      '--costume-eyebrow-color',
      '--costume-eyebrow-weight',
      '--costume-header-band',
      '--costume-header-band-height',
      '--costume-primary-glow',
    ]);
  });

  it('has every costume theme declare all of them in its light scope block', () => {
    for (const theme of COSTUME_THEMES) {
      const body = themeBlockBody(`[data-theme="${theme}"] [data-costume-scope]`);
      expect(body, `${theme}'s light scope block`).not.toBeNull();
      for (const property of COSTUME_SCOPE_PROPERTIES) expect(body, `${theme}: ${property}`).toContain(`${property}:`);
    }
  });
});

describe('the eyebrow colour is layered', () => {
  it('reads the costume colour with today’s ink as its fallback', () => {
    expect(TILE_EYEBROW_CLASS).toContain('var(--costume-eyebrow-color,var(--muted-foreground))');
  });

  it('lets a caller’s colour win through cn()', () => {
    const merged = cn(TILE_EYEBROW_CLASS, 'text-destructive').split(' ');
    expect(merged).toContain('text-destructive');
    expect(merged.filter((token) => token.startsWith('text-[color:'))).toEqual([]);
  });
});

describe('resolveEmblem', () => {
  const art = (d: string): EmblemArt => ({ viewBox: '0 0 24 24', shapes: [{ kind: 'path', d, tone: 'ornament', strokeWidth: 1.5 }] });
  const emblems: Partial<Record<(typeof COLOR_THEMES)[number], ThemeEmblems>> = {
    cyberpunk: { fallback: art('M0 0'), pages: { storico: art('M1 1') } },
  };

  it('answers null out of scope', () => {
    expect(resolveEmblem('cyberpunk', 'storico', false, emblems)).toBeNull();
  });

  it('prefers the page art, then the fallback', () => {
    expect(resolveEmblem('cyberpunk', 'storico', true, emblems)).toEqual(art('M1 1'));
    expect(resolveEmblem('cyberpunk', 'analisi', true, emblems)).toEqual(art('M0 0'));
    expect(resolveEmblem('cyberpunk', undefined, true, emblems)).toEqual(art('M0 0'));
  });

  it('answers null for a theme without emblems', () => {
    expect(resolveEmblem('default', 'storico', true, emblems)).toBeNull();
  });
});
