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
 * `chip.tsx` joined the site scan the same day, at the retirement, seen red on its `rounded-full`.
 *
 * The dialogs and the pages beyond the first three (2026-11-23): a 23rd scope property, the generated fill, read
 * through `COSTUME_GENERATED_FILL_CLASS`; a print block that hands every scope property back to «off»; the boxes
 * inside a tile or a modal as frames, the Recharts tooltips too; the bars, pills and chips of the nine pages on
 * the control radii; an emblem id on every page header. Seen red that day: the print case with `--costume-ground`
 * deleted from the block; the emblem class without `print:hidden`; the frame scan with `question-card.tsx` and
 * `ExpenseProposalCard.tsx` back to `rounded-xl`, a tooltip back to `borderRadius: 8`, a proposal card back to
 * `bg-muted/40`, the model dialog's options back to `max-desktop:rounded-xl`; the pill scan with `RecordRows.tsx`
 * and `CambiatoTile.tsx` back to `rounded-full` and `RendimentoTile.tsx`'s chip back to a literal 9px; the
 * header case with the plan path's `emblem` dropped.
 *
 * The selector sheets (2026-11-23, found by the closing read of the dialogs' pass): the title of the period
 * picker's, the searchable combobox's and the multi-select's drawer takes `.costume-title` and prints through
 * `HeadingText`, as `ResponsiveModal`'s. Seen red that day on the three files as they were (a bare `DrawerTitle`).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLOR_THEMES, COLOR_THEME_META, COSTUME_THEMES } from '@/lib/constants/colorTheme';
import { AI_CONTROL_ACCENT_CLASS } from '@/lib/constants/aiAccent';
import {
  COSTUME_FRAME_RADIUS_CLASS,
  COSTUME_GENERATED_FILL_CLASS,
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
  it('lists the twenty-three properties in the contract order', () => {
    expect(COSTUME_SCOPE_PROPERTIES).toHaveLength(23);
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
      '--costume-page-generated-fill',
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

  it('reads the generated fill with today’s 40 % of --muted as its fallback', () => {
    expect(COSTUME_GENERATED_FILL_CLASS).toBe('bg-[color:var(--costume-page-generated-fill,color-mix(in_oklab,var(--muted)_40%,transparent))]');
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
    // The period picker's preset chips on Cashflow (2026-11-22: the list of that day had read the primitive as
    // having no caller, and they stayed round under Orbita).
    'components/ui/chip.tsx',
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

describe('paper is the palette’s', () => {
  it('resets each of the twenty-three scope properties in the section’s print block, each !important', () => {
    const { section } = splitSection();
    const print = walk(section).declarations.filter(
      ({ selectors }) => selectors.length === 2 && selectors[0] === '@media print' && selectors[1] === GATE,
    );
    const declared = new Map(print.map(({ property, value }) => [property, value]));
    for (const property of COSTUME_SCOPE_PROPERTIES) {
      expect(declared.has(property), `${property} in the print block`).toBe(true);
      expect(declared.get(property), property).toMatch(/ !important$/);
    }
    expect(declared.size).toBe(COSTUME_SCOPE_PROPERTIES.length);
    // The palette block's own radius, handed back from <html>.
    expect(declared.get('--radius')).toBe('inherit !important');
  });

  it('hides the emblem on paper: it is React, the reset cannot reach it', () => {
    const svgClass = /className="([^"]*)"/.exec(source('components/ui/theme-costume.tsx').split('export function EmblemSvg')[1] ?? '');
    expect(svgClass?.[1].split(' ')).toContain('print:hidden');
  });
});

describe('the boxes inside a tile or a modal are frames', () => {
  const FRAME_BOX_FILES = [
    'components/ui/card.tsx',
    'components/ui/link-banner.tsx',
    'components/ui/question-card.tsx',
    'components/allocation/consulente/ConsulenteInterviewScene.tsx',
    'components/allocation/consulente/ConsulenteRun.tsx',
    'components/allocation/consulente/ConsulenteWizard.tsx',
    'components/assets/compravendita/CompravenditaScreens.tsx',
    'components/assets/compravendita/CompravenditaWizard.tsx',
    'components/assistant/AssistantComposer.tsx',
    'components/assistant/AssistantConversazioneTile.tsx',
    'components/assistant/AssistantQuestionBlock.tsx',
    'components/assistant/AssistantStreamingResponse.tsx',
    'components/assistant/ExpenseProposalCard.tsx',
    'components/assistant/GoalProposalCard.tsx',
    'components/assistant/AssistantPreferencesFields.tsx',
    'components/assistant/AssistantRouteChooser.tsx',
    'components/fire-simulations/FireParametri.tsx',
    'components/monte-carlo/tiles/ParametriTile.tsx',
    'components/performance/AIAnalysisDialog.tsx',
    'components/DeleteDummyDataDialog.tsx',
    'components/assets/AssetMovementsDialog.tsx',
    'components/assets/TaxCalculatorModal.tsx',
    'components/assets/TransactionDialog.tsx',
    'components/expenses/ExpenseDialog.tsx',
    'components/expenses/CategoryManagementDialog.tsx',
  ];
  // `rounded-xl` on every corner or on one side: the run's active stage rounded its ends by itself.
  const ROUNDED_XL = /\brounded-(?:[tblr]-)?xl\b/;

  it.each(FRAME_BOX_FILES)('%s takes the frame class and no rounded-xl', (file) => {
    const text = source(file);
    expect(text).toContain('COSTUME_FRAME_RADIUS_CLASS');
    expect(text.split('\n').filter((line) => ROUNDED_XL.test(line)), file).toEqual([]);
  });

  // A variant cannot be composed with a constant: the class is written whole, under its `max-desktop:` prefix.
  it('squares the model dialog’s mode options below desktop through the frame radius', () => {
    const text = source('components/allocation/IdealCompositionDialog.tsx');
    expect(text).toContain(`max-desktop:${COSTUME_FRAME_RADIUS_CLASS}`);
    expect(text).not.toMatch(ROUNDED_XL);
  });

  const TOOLTIP_FILES = [
    'components/history/tiles/ComposizioneTile.tsx',
    'components/history/tiles/EvoluzioneTile.tsx',
    'components/history/tiles/ValoreStrumentoTile.tsx',
    'components/history/StoricoDettaglio.tsx',
    'components/dashboard/LaborMetricsChart.tsx',
    'components/fire-simulations/FireDettaglio.tsx',
    'components/performance/RollingLineChart.tsx',
    'components/cashflow/AndamentoStoricoCharts.tsx',
    'components/cashflow/ConfrontoAnnualeCharts.tsx',
    'components/cashflow/EntityTrendChart.tsx',
    'components/cashflow/SavingsRateLineChart.tsx',
    'components/goals/GoalProjectionChart.tsx',
  ];

  it.each(TOOLTIP_FILES)('%s gives its Recharts tooltip the frame radius, today’s value as the fallback', (file) => {
    const text = source(file);
    expect(text).not.toMatch(/borderRadius: (?:'8px'|8\b|10\b)/);
    const fallback = file.endsWith('GoalProjectionChart.tsx') ? '10px' : '8px';
    expect(text).toContain(`borderRadius: 'var(--costume-control-frame-radius, ${fallback})'`);
  });

  it.each([
    { file: 'components/assistant/AssistantQuestionBlock.tsx', tiles: 2 },
    { file: 'components/assistant/ExpenseProposalCard.tsx', tiles: 1 },
    { file: 'components/assistant/GoalProposalCard.tsx', tiles: 1 },
  ])('$file paints its $tiles generated sub-tile(s) through the generated fill', ({ file, tiles }) => {
    const lines = source(file).split('\n');
    expect(lines.filter((line) => line.includes('bg-muted/40')), file).toEqual([]);
    expect(lines.filter((line) => line.includes('className') && line.includes('COSTUME_GENERATED_FILL_CLASS'))).toHaveLength(tiles);
  });
});

describe('the bars, pills and chips of the pages read the costume radii', () => {
  // A literal pill end, or a literal radius other than a legend swatch's 2px.
  const LITERAL_RADIUS = /\brounded-(?:[lr]-)?full\b|\brounded-\[(?!2px\])\d+px\]/;
  const literals = (file: string) => source(file).split('\n').filter((line) => LITERAL_RADIUS.test(line));

  const NO_LITERAL_FILES = [
    'components/performance/tiles/AttribuzioneTile.tsx',
    'components/performance/tiles/PlusvalenzeTile.tsx',
    'components/performance/MonthlyReturnsHeatmap.tsx',
    'app/dashboard/performance/page.tsx',
    'components/history/tiles/DriverTile.tsx',
    'components/history/tiles/RaddoppiTile.tsx',
    'components/cashflow/ConfrontoAnnualeSection.tsx',
    'components/cashflow/analisi/tiles/CambiatoTile.tsx',
    'components/allocation/ActionChip.tsx',
    'components/allocation/tiles/EsposizioneTile.tsx',
    'components/allocation/OptimizerReport.tsx',
    'components/allocation/tiles/PortafoglioModelloTile.tsx',
    'components/allocation/tiles/QuestoMeseTile.tsx',
    'components/allocation/tiles/accumuloShared.tsx',
    'components/allocation/ObiettiviDialog.tsx',
    'components/allocation/tiles/ObiettiviTile.tsx',
    'components/allocation/tiles/PianoTile.tsx',
    'components/pension/tiles/AnnoFiscaleTile.tsx',
    'components/pension/tiles/FondoOggiTile.tsx',
    'components/fire-simulations/tiles/TraguardoTile.tsx',
    'components/fire-simulations/coast/tiles/CoastTraguardoTile.tsx',
    'components/monte-carlo/tiles/ScenariConfrontoTile.tsx',
    'components/monte-carlo/tiles/ProbabilitaTile.tsx',
    'components/goals/tiles/TraiettoriaTile.tsx',
    'components/hall-of-fame/RecordRows.tsx',
    'components/assistant/GoalProposalCard.tsx',
    'components/assistant/tiles/PatrimonioContestoTile.tsx',
    'components/settings/tabs/AllocazioneTab.tsx',
    'components/assets/AssetMovementsDialog.tsx',
    'components/expenses/ExpenseDialog.tsx',
  ];
  // The one round thing each of these keeps in every theme: a dot, a knob, a spinner, a round icon button.
  const ONE_ROUND_THING = [
    { file: 'components/goals/tiles/ObiettiviTile.tsx', stays: 'h-2.5 w-2.5 shrink-0 rounded-full' },
    { file: 'app/dashboard/settings/page.tsx', stays: 'h-1.5 w-1.5 shrink-0 rounded-full' },
    { file: 'components/history/tiles/EvoluzioneTile.tsx', stays: 'inline-block h-2 w-2 rounded-full' },
    { file: 'components/settings/tabs/AspettoTab.tsx', stays: 'absolute right-2 top-2 h-2 w-2 rounded-full' },
    { file: 'components/allocation/TargetTick.tsx', stays: 'size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full' },
    { file: 'components/settings/tabs/GeneraleTab.tsx', stays: 'h-3 w-3 animate-spin rounded-full' },
    { file: 'components/performance/tiles/RendimentoTile.tsx', stays: 'h-3 w-3 animate-spin rounded-full' },
    { file: 'components/performance/PerformancePeriodPicker.tsx', stays: 'h-11 w-11 shrink-0 items-center justify-center rounded-full' },
  ];

  it.each(NO_LITERAL_FILES)('%s has no literal pill end nor literal chip radius', (file) => {
    expect(literals(file), file).toEqual([]);
  });

  it.each(ONE_ROUND_THING)('$file keeps one round thing and no other literal', ({ file, stays }) => {
    const hits = literals(file);
    expect(hits, file).toHaveLength(1);
    expect(hits[0]).toContain(stays);
  });
});

describe('every visible modal title wears the costume face', () => {
  // A selector's sheet is a modal too: its title takes `.costume-title` and prints its string through
  // `HeadingText`, as `ResponsiveModal`'s does. `AlertDialogTitle` adds the class itself; `command.tsx`'s title
  // sits in an `sr-only` header, where no face is read.
  const PRIMITIVES = ['components/ui/dialog.tsx', 'components/ui/drawer.tsx', 'components/ui/alert-dialog.tsx'];
  const UNSEEN = ['components/ui/command.tsx'];
  const titles = [...listFiles('components'), ...listFiles('app')]
    .filter((file) => !PRIMITIVES.includes(file) && !UNSEEN.includes(file) && !file.endsWith('.stories.tsx'))
    .flatMap((file) =>
      [...source(file).matchAll(/<(DrawerTitle|DialogTitle)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map((match) => ({
        file,
        tag: match[2].trim(),
        body: match[3].trim(),
      })),
    );

  it('reads the two shells of `ResponsiveModal` and the three selector sheets', () => {
    expect(titles.map(({ file }) => file).sort()).toEqual([
      'components/ui/multi-select.tsx',
      'components/ui/period-picker.tsx',
      'components/ui/responsive-modal.tsx',
      'components/ui/responsive-modal.tsx',
      'components/ui/searchable-combobox.tsx',
    ]);
  });

  it.each(titles)('$file: the title carries the class and its string goes through HeadingText', ({ tag, body }) => {
    expect(tag).toContain('costume-title');
    expect(body).toContain('<HeadingText text=');
  });

  it('the alert dialog’s title carries the class in the primitive', () => {
    expect(source('components/ui/alert-dialog.tsx')).toContain('"costume-title ');
  });
});

describe('every page header names its emblem', () => {
  // A page's guided paths wear the page's mark: Compravendita Patrimonio's, the Consulente and the plan Allocazione's.
  it.each([
    { file: 'app/dashboard/page.tsx', id: 'panoramica' },
    { file: 'app/dashboard/assets/page.tsx', id: 'patrimonio' },
    { file: 'components/assets/compravendita/CompravenditaClient.tsx', id: 'patrimonio' },
    { file: 'components/cashflow/CashflowPageClient.tsx', id: 'cashflow' },
    { file: 'components/cashflow/AnalisiTab.tsx', id: 'analisi' },
    { file: 'app/dashboard/performance/page.tsx', id: 'rendimenti' },
    { file: 'app/dashboard/history/page.tsx', id: 'storico' },
    { file: 'app/dashboard/allocation/page.tsx', id: 'allocazione' },
    { file: 'components/allocation/consulente/ConsulenteClient.tsx', id: 'allocazione' },
    { file: 'components/allocation/piano/PianoClient.tsx', id: 'allocazione' },
    { file: 'app/dashboard/pension/page.tsx', id: 'previdenza' },
    { file: 'app/dashboard/fire-simulations/page.tsx', id: 'fire' },
    { file: 'app/dashboard/hall-of-fame/page.tsx', id: 'hall-of-fame' },
    { file: 'components/assistant/AssistantHeader.tsx', id: 'assistente' },
    { file: 'app/dashboard/settings/page.tsx', id: 'impostazioni' },
  ])('$file passes $id', ({ file, id }) => {
    const text = source(file);
    const headers = text.split('<PageHeader').length - 1;
    expect(headers, `${file}: its page headers`).toBeGreaterThan(0);
    // Impostazioni spreads one props object into its headers; every other host writes the prop on each.
    const named = text.split(`emblem="${id}"`).length - 1;
    if (named === 0) expect(text).toContain(`emblem: '${id}'`);
    else expect(named).toBe(headers);
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
