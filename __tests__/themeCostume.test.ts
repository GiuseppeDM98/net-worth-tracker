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
 *
 * The controls (2026-11-22): four more scope properties, read ONLY through a `var()` whose fallback is today's
 * value — `COSTUME_PILL_RADIUS_CLASS`, `COSTUME_FRAME_RADIUS_CLASS`, the chip sites' arbitrary radius on the chip property, the
 * popper sheet's top corners, the dark switch track. Seen red that day: the popper-sheet case with a bare
 * `var(--costume-control-frame-radius)`; the count with a 23rd string; the light-block case with
 * `--costume-control-chip-radius` deleted from Orbita's; the class case with the fallback `9999px`; the site scan
 * with `segmented-pill.tsx`'s indicator back to `rounded-full` and `choice-list.tsx` back to `rounded-xl`; the
 * hsl() scan with `sidebar.tsx`'s `hsl(var(--sidebar-border))` restored; the switch case with the fallback dropped.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR_THEMES, COLOR_THEME_META, COSTUME_THEMES } from '@/lib/constants/colorTheme';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import {
  COSTUME_FRAME_RADIUS_CLASS,
  COSTUME_PILL_RADIUS_CLASS,
  COSTUME_SCOPE_PROPERTIES,
  resolveEmblem,
  type EmblemArt,
  type ThemeEmblems,
} from '@/lib/constants/themeCostume';
import { TILE_EYEBROW_CLASS } from '@/components/ui/tile';
import { cn } from '@/lib/utils';
import { GLOBALS_CSS, themeBlockBody, themeBlockHeader } from './themeBlocks';

const ROOT = resolve(__dirname, '..');
const source = (file: string) => readFileSync(resolve(ROOT, file), 'utf8');
/** Every `.ts`/`.tsx` under a folder of the repo, as repo-relative paths. */
function listFiles(folder: string): string[] {
  return readdirSync(resolve(ROOT, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)).replace(/\\/g, '/'));
}

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

  it('reads a costume token outside the section only inside a scope block, to compose another costume token — and in the popper sheet’s radius', () => {
    const readers = walk(outside).declarations.filter(({ value }) => value.includes('var(--costume-'));
    const painters = readers.filter(({ selectors }) => !SCOPE_BLOCK.test(selectors[selectors.length - 1]));
    // The ONE rule outside the banners that paints with a scope property, always with today's value as fallback.
    expect(painters.map(({ selectors, property, value }) => `${selectors[selectors.length - 1]} { ${property}: ${value} }`)).toEqual([
      `[data-popper-sheet] { border-radius: ${POPPER_SHEET_RADIUS} }`,
    ]);
    for (const { selectors, property } of readers.filter((reader) => !painters.includes(reader))) {
      const block = selectors[selectors.length - 1];
      expect(property.startsWith('--costume-'), `${block} { ${property} }`).toBe(true);
    }
  });
});

/** The popper sheet's top corners: the costume's frame radius, else the 10px of every palette theme. */
const POPPER_SHEET_RADIUS = 'var(--costume-control-frame-radius, 10px) var(--costume-control-frame-radius, 10px) 0 0';

describe('the scope properties', () => {
  it('lists the twenty-two properties in the contract order', () => {
    expect(COSTUME_SCOPE_PROPERTIES).toHaveLength(22);
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
      '--costume-control-frame-radius',
      '--costume-control-pill-radius',
      '--costume-control-chip-radius',
      '--costume-control-switch-on',
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

describe('the control radii are layered', () => {
  it('reads each costume radius with today’s value as its fallback', () => {
    expect(COSTUME_PILL_RADIUS_CLASS).toBe('rounded-[var(--costume-control-pill-radius,calc(infinity*1px))]');
    expect(COSTUME_FRAME_RADIUS_CLASS).toBe('rounded-[var(--costume-control-frame-radius,calc(var(--radius)_+_4px))]');
  });

  it('survives a caller’s padding through cn()', () => {
    expect(cn(COSTUME_PILL_RADIUS_CLASS, 'px-3').split(' ')).toContain(COSTUME_PILL_RADIUS_CLASS);
    expect(cn(COSTUME_FRAME_RADIUS_CLASS, 'p-4').split(' ')).toContain(COSTUME_FRAME_RADIUS_CLASS);
  });
});

describe('the sites read the costume radii, not a literal', () => {
  // The pill and chip sites (temi.md § Il costume, «Three radii»); `PageTabBar.tsx` and `ExpenseTable.tsx` are
  // read apart, because each keeps a round dot.
  const PILL_AND_CHIP_FILES = [
    'components/layout/BottomNavigation.tsx',
    'components/ui/segmented-pill.tsx',
    'components/ui/switch.tsx',
    'components/ui/composition-list.tsx',
    'components/ui/composition-bar.tsx',
    'components/ui/ranked-rows.tsx',
    'components/dashboard/overview/ObiettivoTile.tsx',
    'components/cashflow/budget/BudgetTrack.tsx',
    'components/cashflow/cost-centers/tiles/CentriTile.tsx',
    'components/cashflow/cost-centers/tiles/SottocategorieTile.tsx',
    'components/assets/AssetRow.tsx',
    'components/assets/StrumentiTile.tsx',
    'components/cashflow/budget/BudgetImpostazioni.tsx',
    'components/dashboard/overview/PatrimonioTile.tsx',
    'components/dividends/tiles/IncassoNettoTile.tsx',
    'components/assets/tiles/MovimentiTile.tsx',
    'components/dividends/CalendarDayCell.tsx',
    'components/dividends/tiles/AffidabilitaTile.tsx',
    'components/layout/ThemePicker.tsx',
  ];
  const FRAME_FILES = [
    'components/ui/popover.tsx',
    'components/ui/choice-list.tsx',
    'components/dividends/DividendiDettaglio.tsx',
    'components/dividends/ProvisionalCouponBanner.tsx',
  ];
  // A literal pill end, or a literal radius other than a legend swatch's 2px.
  const LITERAL_RADIUS = /\brounded-(?:[lr]-)?full\b|\brounded-\[(?!2px\])\d+px\]/;
  const CHIP_ROUNDED = 'rounded-[var(--costume-control-chip-radius,0.25rem)]';

  it.each(PILL_AND_CHIP_FILES)('%s has no literal pill end nor literal chip radius', (file) => {
    const hits = source(file).split('\n').filter((line) => LITERAL_RADIUS.test(line));
    expect(hits, file).toEqual([]);
  });

  it.each(FRAME_FILES)('%s takes the frame class and no rounded-xl', (file) => {
    const text = source(file);
    expect(text).toContain('COSTUME_FRAME_RADIUS_CLASS');
    expect(text).not.toMatch(/\brounded-xl\b/);
  });

  it.each(['components/layout/ThemePicker.tsx', 'components/expenses/ExpenseTable.tsx'])('%s squares its 0.25rem chip through the chip radius', (file) => {
    expect(source(file)).toContain(CHIP_ROUNDED);
  });

  it('gives the popper sheet the frame radius on its top corners', () => {
    const rule = /\n\[data-popper-sheet\] \{([^}]*)\}/.exec(GLOBALS_CSS);
    expect(rule, 'the [data-popper-sheet] rule').not.toBeNull();
    expect(rule![1]).toContain(`border-radius: ${POPPER_SHEET_RADIUS};`);
  });

  it('has no hsl() around an oklch token under components/', () => {
    const offenders = listFiles('components').filter((file) => source(file).includes('hsl(var(--'));
    expect(offenders).toEqual([]);
  });

  it('paints the dark switch track through the costume, today’s blue as the fallback', () => {
    const text = source('components/ui/switch.tsx');
    expect(text).toContain('dark:data-[state=checked]:bg-[var(--costume-control-switch-on,oklch(54.6%_0.245_262.881))]');
    expect(text).not.toContain('blue-600');
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
