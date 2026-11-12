# NOVE-08 — The ring: one primitive, one DESIGN rule, four homes

> Series `doc/nove/` (README.md § 5): **depends on nothing**; **NOVE-09 (the minor tiles) and NOVE-10 (Analisi) are
> implemented after it** and read the contract `RingChart` / `ringChart.ts` (README.md § 7); the theme specs dress
> it. Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7. Executes the owner's point 5 and
> decisions 5, 6, 10, 16 (README.md § 3).

## 1. The problem today (evidence on the code)

**The rule forbids what the owner now wants.** The pies left the app on 2026-07-13 and DESIGN.md still says so:
`DESIGN.md:1313-1325` (a pie only «with ≤5 slices AND some information a flat row wouldn't carry», «zero Recharts
`<Pie>` usages left»), `:1113` (the one ring kept is `BalanceRing`, «the next ring must be a score with a bounded
domain, or it must be a figure»), `:1107` («Use Recharts `PieChart` only for standalone chart sections»),
`:1473-1474` (the two «Don't» of the pie and of the animated donut).

**The four homes the owner named (decision 10), as they draw today:**

- **Previdenza «Versato nel {Y}»** — `components/pension/tiles/VersatoTile.tsx:55-73`: `RankedRows`, one bar colour
  `var(--chart-2)` (`:65`); mounted `components/pension/PensionOverview.tsx:403-411`, a `desktop:col-span-7` cell
  (`:391`). Parts: `summarizeVersato` (`lib/utils/pensionSummary.ts:566-599`) → `rows` (`VersatoRow`, `:544-551`,
  natures with `amount > 0`, largest first) and `total`.
- **Tracciamento «Entrate per categoria»** — `CategoryTile` (`components/dashboard/overview/CategoryTile.tsx:86-113`):
  `RankedRows` + the residual «Altre categorie» (`:101-111`); mounted `components/cashflow/ExpenseTrackingTab.tsx:
  1349-1361`, `desktop:col-span-3`. Parts: `rankCategories(expenses, 'income')` (`lib/utils/tracciamentoSummary.ts:
  570-604`, called at `ExpenseTrackingTab.tsx:911`): ≤ 5 positive rows, `total` = rows + the cut.
- **Panoramica «Composizione»** — `ComposizioneTile` (`components/dashboard/overview/ComposizioneTile.tsx:45-75`): a
  `CompositionBar` (`:46-52`) over flat rows with swatch, value and share (`:54-75`); mounted `app/dashboard/page.tsx:
  609-614`, `desktop:col-span-3`. Parts: `charts.assetClassData` (`prepareAssetClassDistributionData`,
  `lib/services/chartService.ts:42-71`: the NET value per class, sorted), colours remapped at `app/dashboard/page.tsx:
  280-287`.
- **Patrimonio «Classi»** — the same tile, `app/dashboard/assets/page.tsx:815-829` (data `:406-413`). The landing
  renders it too, on its sample profile (`app/page.tsx:297`): it changes with it.

**A class can be negative**: a personal loan larger than the accounts turns «Liquidità» below zero on the Composizione
tiles, declared and not clamped (`doc/guide/patrimonio.md:445`). A ring cannot draw it.

**The owner's remark on the canvas** (decision 6): in a three-column tile «31.900 €» crossed the Entrate ring. The hole
of a 120px ring with a 9-unit stroke on r 43 is 92px across at its centre; «31.900 €» in 22px mono is ~106px.

**The model** is `components/allocation/BalanceRing.tsx:26-29,53-77`: hand-written SVG rotated −90°, `butt` caps, the
figure in an `aria-hidden` overlay. It stays as it is (a score, not parts).

## 2. Goal and acceptance criteria

One primitive draws the parts of one positive whole as a thin ring with the total in its hole and the tile's rows as
its legend; the four homes use it; DESIGN.md says when.

1. `buildRingArcs`: arcs in the host's order from offset 0, each `share − min(1, share/2)` long, offsets the running
   sum of the shares; one part is one closed arc of 100; a part ≤ 0 draws nothing; seven parts become six, the last
   `ring-rest`. **Proof**: `__tests__/ringChart.test.ts` R1-R4.
2. `formatRingCenter`: `(31900, 8)` «31.900 €», `(31900, 7)` «31,9k €», `(32000, 7)` «32k €», `(125400, 7)` «125k €»,
   `(1234500, 9)` «1,2 Mln €», `(1234500, 7)` «1 Mln €», `(999960, 7)` «1 Mln €», `(4200, 7)` «4200 €», `(821, 4)` ''
   (U+00A0 before «€» and «Mln»); `ringCenterMaxChars`: 120 → 7, 96 → 7, 72 → 4. **Proof**: R5-R6.
3. `isRingWhole`: false with one positive part, false with a part of −1 €, true with a part of −0,40 € (it prints as
   zero) beside two positive ones. **Proof**: R7.
4. `RingChart` renders one `svg[role="img"]` named «{ariaLabel}: Stipendio 72%, Dividendi 14%, …; entrate 4000 €», one
   `circle` per part, and nothing with fewer than two parts. **Proof**: `__tests__/RingChart.test.tsx` C1-C2.
5. The figure in the hole is `formatRingCenter(centerValue, ringCenterMaxChars(size))` (`[data-ring-center="hole"]`);
   when that is '' the full figure stands ABOVE the ring (`[data-ring-center="above"]`) and the hole is empty.
   **Proof**: C3 (120px, 31.900 € → «31,9k €» in the hole), C4 (72px, 821 € → «821 €» above).
6. The first render carries the final dashes (no draw-in); under reduced motion `transition` is `none`, otherwise
   400 ms ease-out-quart on the two dash properties. **Proof**: C5.
7. `RankedRows` as a legend (`bars={false}`, a `swatch` per row and remainder): an 8×8 swatch before each label, no bar
   track, the share column hidden only under a 200px container; without the props, today's DOM. **Proof**:
   `__tests__/RankedRows.test.tsx` K1-K2.
8. Previdenza: three natures → a ring coloured by nature (TFR `--chart-2`, Volontario `--chart-7`, Datoriale
   `--chart-6`), centre `total` «versati»; one nature → no ring, today's bars. **Proof**: `pensionSummary.test.ts` P1,
   `__tests__/VersatoTile.test.tsx` P2.
9. Tracciamento Entrate: the rows plus «Altre categorie» as the last part, rows coloured by rank, the residual in
   `RING_REST_COLOR`, centre `total` «entrate»; one category → no ring. The Panoramica's category tiles and «Spese per
   categoria» are unchanged. **Proof**: `tracciamentoSummary.test.ts` T1, `__tests__/CategoryTile.test.tsx` T2.
10. Composizione / Classi / landing: positive classes → a ring in the classes' own colours; seven classes → five rows
    and «Altre 2 classi» captioned with the two names; a class below zero → no ring, today's bar and rows. **Proof**:
    `overviewSummary.test.ts` O1-O2, `__tests__/ComposizioneTile.test.tsx` O3.
11. **The figure stays INSIDE its hole** at 390, 768, 1024 landscape and 1440 on the four homes: every
    `[data-ring-center="hole"]` has its four corners within the hole's radius of the `svg`'s centre and at most
    `data-ring-max-chars` characters; the patched Composizione reads «1 Mln €». **Proof**: `e2e/ring-chart.spec.ts`
    (1440), `e2e/ring-chart.mobile.spec.ts` (390), `e2e/ring-chart.tablet.spec.ts` (768×1024 and 1024×768).
12. No list paints outside its tile at 1440 and 1024: `e2e/cashflow.tracciamento.spec.ts:112-120`, untouched, green.
13. `grep -rn "<Pie" components app` finds nothing; `ring-chart.tsx` and `ringChart.ts` import nothing from recharts.
    **Proof**: the command.
14. DESIGN.md carries the five amendments and the new section of § 4 to the letter. **Proof**: the diff, owner's read.
15. `mobile:census` + `mobile:budget` unchanged for `panoramica`, `patrimonio`, `cashflow-tracciamento`, `previdenza`
    (the four homes are closed rows on a first visit at 390, 768 and in the landscape index); `perf:budget` green.
    **Proof**: the runs.

## 3. Decisions

- **Owner 5 (2026-11-12)**: form A everywhere — a thin ring, the total in the centre, the rows as the legend; a
  figure that does not fit the hole is abbreviated or moves above the ring. **Owner 6**: the numbers stay INSIDE their
  chart (criterion 11). **Owner 10**: these four homes here, the minor tiles in NOVE-09. **Owner 16**: the DESIGN
  amendment as BEFORE/AFTER sentences, applied to the letter.
- **Adopted, reversible**:
  - colours: Versato fixed BY NATURE (the canvas's three slots), so TFR wears one hue every year; a host without
    colours of its own takes `RING_CATEGORY_COLORS` by rank (`--chart-2, 7, 6, 3, 8`: income's slot first, never
    `--chart-1` = spending on Cashflow nor `--chart-5`, the coral beside the loss token); the classes keep theirs; the
    fold and the residuals take `var(--muted-foreground)` (the canvas's `--muted` measures under 3:1 on the card);
  - in legend mode the rows lose their bar (the ring is the bar, as on the canvas) and keep amount and share;
  - ring and rows side by side from a 400px container, stacked and centred below it (a phone, every 3-column tile);
  - no draw-in on mount (the tile cascade already plays once per session, DESIGN → Tile Grid); the arcs glide on a
    change of period or year; size 120 on the four homes;
  - **a class below zero keeps today's `CompositionBar`**: the canvas's footnote drew the positive classes and left
    the negative one as a row, but a whole with a negative member is a signed quantity, which the rule forbids;
  - past six classes the rows fold with the ring («Altre 2 classi», the names as its caption);
  - centre labels «versati», «entrate», «patrimonio»; `CategoryTile` keeps the exact total in its aside;
  - the Panoramica's «Entrate per categoria» and every «Spese per categoria» keep their rows (the owner named
    Tracciamento's Entrate; spending categories are a ranking).
- **Overturned (2026-11-12)**: the 2026-07-13 «zero pies» rule in its letter (no Recharts `<Pie>` comes back), and the
  2026-09-06 sentence «the next ring must be a score with a bounded domain, or it must be a figure».

## 4. Solution

### `lib/utils/ringChart.ts` (new; imports `formatters` only) — the contract (README.md § 7)

```ts
/** The ring: the parts of ONE positive whole as arcs of a thin circle (DESIGN.md → The Ring Rule). Pure. */
import { cachedFormatCurrencyEUR, formatNumberIt } from '@/lib/utils/formatters';

export interface RingSegment {
  key: string;
  label: string;
  /** A magnitude in euros; a part below zero makes the whole no ring (`isRingWhole`). */
  value: number;
  /** A theme chart slot (`var(--chart-N)`) or the colour the page already resolved for its rows. */
  color: string;
}
/** One arc in units of `pathLength = 100`: dash `length`, starting `offset` units clockwise from 12 o'clock. */
export interface RingArc { key: string; color: string; length: number; offset: number }

/** A 100 viewBox, the arc's centre line on r 43, 9 units thick: the hole's radius is 38,5. */
export const RING_VIEWBOX = 100;
export const RING_RADIUS = 43;
export const RING_STROKE = 9;
export const RING_DEFAULT_SIZE = 120;
/** Two to six parts: one part is a sentence, a seventh is folded. */
export const RING_MIN_PARTS = 2;
export const RING_MAX_PARTS = 6;
/** The folded tail and a host's residual («Altre categorie»): the neutral ink, ≥ 3:1 on the card. */
export const RING_REST_KEY = 'ring-rest';
export const RING_REST_COLOR = 'var(--muted-foreground)';
/** A host without colours of its own, by rank: income's slot first, never spending's nor the coral. */
export const RING_CATEGORY_COLORS = ['var(--chart-2)', 'var(--chart-7)', 'var(--chart-6)', 'var(--chart-3)',
  'var(--chart-8)'] as const;

const RING_GAP = 1; // the white after each arc, in pathLength units
const round3 = (value: number) => Math.round(value * 1000) / 1000;

/** Parts of one positive whole: none prints below zero, at least two are above it. */
export function isRingWhole(segments: readonly RingSegment[]): boolean {
  let parts = 0;
  for (const segment of segments) {
    if (!Number.isFinite(segment.value) || Math.round(segment.value) < 0) return false;
    if (segment.value > 0) parts += 1;
  }
  return parts >= RING_MIN_PARTS;
}

/** The positive parts in the host's order (largest first); past six, the tail is one part. */
export function foldRingSegments(
  segments: readonly RingSegment[],
  restLabel: (count: number) => string,
): RingSegment[] {
  const positive = segments.filter((segment) => segment.value > 0);
  if (positive.length <= RING_MAX_PARTS) return positive;
  const tail = positive.slice(RING_MAX_PARTS - 1);
  const value = tail.reduce((sum, segment) => sum + segment.value, 0);
  return [...positive.slice(0, RING_MAX_PARTS - 1),
    { key: RING_REST_KEY, label: restLabel(tail.length), value, color: RING_REST_COLOR }];
}

/** The swatch of the host's row `index` beside the ring: its part's colour, the fold's from the sixth on past six. */
export function ringSwatchAt(segments: readonly RingSegment[], index: number): string {
  return segments.length > RING_MAX_PARTS && index >= RING_MAX_PARTS - 1 ? RING_REST_COLOR : segments[index].color;
}

/** The arcs clockwise from 12 o'clock; [] when nothing is positive, one closed arc for a single part. */
export function buildRingArcs(segments: readonly RingSegment[]): RingArc[] {
  const parts = foldRingSegments(segments, (count) => `Altre ${count}`);
  const total = parts.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return [];
  if (parts.length === 1) return [{ key: parts[0].key, color: parts[0].color, length: 100, offset: 0 }];
  let start = 0;
  return parts.map((segment) => {
    const share = (segment.value / total) * 100;
    // The gap comes off the arc's own end, never more than half of it: a 0,4% part stays visible.
    const length = round3(share - Math.min(RING_GAP, share / 2));
    const arc = { key: segment.key, color: segment.color, length, offset: round3(start) };
    start += share;
    return arc;
  });
}

/** «Stipendio 72%, Dividendi 14%, Altre categorie 5%» — the parts as drawn, for the text alternative. */
export function describeRingSegments(segments: readonly RingSegment[]): string {
  const parts = foldRingSegments(segments, (count) => `altre ${count}`);
  const total = parts.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) return '';
  return parts.map((segment) => `${segment.label} ${Math.round((segment.value / total) * 100)}%`).join(', ');
}

/** The centre figure's size: 15% of the ring, between 14 and 22px. */
export function ringCenterFontPx(size: number): number {
  return Math.min(22, Math.max(14, Math.round(size * 0.15)));
}

const MONO_ADVANCE_EM = 0.6; // Geist Mono advances every glyph 600/1000 em
const LABEL_BLOCK_PX = 17; // the 4px gap and the 13px line of the 11px label under the figure
const AIR_PX = 8; // 4px between the figure and the arc on each side

/** The characters the hole holds: its chord at the figure's far edge (figure + label centred), less the air. */
export function ringCenterMaxChars(size: number): number {
  const font = ringCenterFontPx(size);
  const hole = (size / RING_VIEWBOX) * (RING_RADIUS - RING_STROKE / 2);
  const reach = (font + LABEL_BLOCK_PX) / 2;
  if (reach >= hole) return 0;
  const chord = 2 * Math.sqrt(hole ** 2 - reach ** 2);
  return Math.max(0, Math.floor((chord - AIR_PX) / (font * MONO_ADVANCE_EM)));
}

/**
 * The total in the hole, in the first form of at most `maxChars` characters: «31.900 €», «31,9k €», «32k €»;
 * from a million «1,2 Mln €», «1 Mln €» (the axes' dialect, `formatCurrencyCompact`). '' when none fits: the ring
 * prints the full figure above itself. A ring never draws a signed quantity, so the magnitude is printed.
 */
export function formatRingCenter(amount: number, maxChars: number): string {
  const magnitude = Math.abs(amount);
  const forms = [cachedFormatCurrencyEUR(magnitude, true)];
  const thousands = Math.round(magnitude / 100) / 10;
  if (magnitude >= 1_000 && thousands < 1_000) {
    forms.push(`${formatNumberIt(thousands, Number.isInteger(thousands) ? 0 : 1)}k €`,
      `${Math.round(magnitude / 1_000)}k €`);
  } else if (magnitude >= 1_000) {
    const millions = Math.round(magnitude / 100_000) / 10;
    forms.push(`${formatNumberIt(millions, Number.isInteger(millions) ? 0 : 1)} Mln €`,
      `${Math.round(magnitude / 1_000_000)} Mln €`);
  }
  return forms.find((form) => form.length <= maxChars) ?? '';
}
```

### `components/ui/ring-chart.tsx` (new) — the contract

```tsx
'use client';

/**
 * RingChart — the parts of ONE positive whole as a thin ring with the total in its hole (DESIGN.md → The Ring
 * Rule, 2026-11-12); the tile's rows are its legend. Hand-written SVG on the model of `BalanceRing`, with plain
 * `<circle>`s: `motion.circle` reads `pathLength` as Framer's drawing value and rewrites the dashes. No draw-in on
 * mount; the arcs glide when the parts change, at once under reduced motion.
 */
import { useReducedMotion } from 'framer-motion';
import { cachedFormatCurrencyEUR } from '@/lib/utils/formatters';
import { RING_DEFAULT_SIZE, RING_RADIUS, RING_STROKE, RING_VIEWBOX, buildRingArcs, describeRingSegments,
  formatRingCenter, ringCenterFontPx, ringCenterMaxChars, type RingSegment } from '@/lib/utils/ringChart';

/** Ring and rows side by side from a 400px container (the parent carries `@container`), stacked below it. */
export const RING_LAYOUT_CLASS = 'flex flex-col items-center gap-4 @min-[400px]:flex-row @min-[400px]:gap-5';
/** The rows' column inside `RING_LAYOUT_CLASS`. */
export const RING_ROWS_CLASS = 'w-full min-w-0 @min-[400px]:flex-1';

const EASE = 'cubic-bezier(0.25, 1, 0.5, 1)'; // ease-out-quart (lib/utils/motionVariants.ts)
const ARC_TRANSITION = `stroke-dasharray 400ms ${EASE}, stroke-dashoffset 400ms ${EASE}`;

export interface RingChartProps {
  /** The parts, largest first — folded by the host when its rows fold (`foldRingSegments`). */
  segments: RingSegment[];
  /** The whole in euros (≥ 0), the sum of the parts. */
  centerValue: number;
  /** One word under the figure («entrate», «versati»), at most 10 characters. */
  centerLabel: string;
  /** The ring's name; the text alternative appends each part's share and the total. */
  ariaLabel: string;
  size?: number;
}

export function RingChart({ segments, centerValue, centerLabel, ariaLabel, size = RING_DEFAULT_SIZE }: RingChartProps) {
  const reducedMotion = useReducedMotion();
  const arcs = buildRingArcs(segments);
  if (arcs.length < 2) return null;

  const maxChars = ringCenterMaxChars(size);
  const inHole = formatRingCenter(centerValue, maxChars);
  const full = cachedFormatCurrencyEUR(centerValue, true);
  const name = `${ariaLabel}: ${describeRingSegments(segments)}; ${centerLabel} ${full}`;
  const transition = reducedMotion ? 'none' : ARC_TRANSITION;

  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5" data-ring="" data-ring-max-chars={maxChars}>
      {!inHole && (
        // No form fits the hole: the figure stands whole above the ring, never across the arc.
        <p className="whitespace-nowrap text-center" aria-hidden="true" data-ring-center="above">
          <span className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{full}</span>{' '}
          <span className="text-[11px] text-muted-foreground">{centerLabel}</span>
        </p>
      )}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${RING_VIEWBOX} ${RING_VIEWBOX}`} role="img" aria-label={name}
          className="-rotate-90">
          {arcs.map((arc) => (
            <circle key={arc.key} cx={RING_VIEWBOX / 2} cy={RING_VIEWBOX / 2} r={RING_RADIUS} fill="none"
              stroke={arc.color} strokeWidth={RING_STROKE} strokeLinecap="butt" pathLength={100}
              style={{ strokeDasharray: `${arc.length} ${100 - arc.length}`, strokeDashoffset: -arc.offset,
                transition }} />
          ))}
        </svg>
        {inHole && (
          // The text alternative names the total; the printed figure is for the eye.
          <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
            <span data-ring-center="hole" style={{ fontSize: ringCenterFontPx(size) }}
              className="whitespace-nowrap font-mono font-semibold leading-none tabular-nums text-foreground">
              {inHole}
            </span>
            <span className="mt-1 text-[11px] leading-[13px] text-muted-foreground">{centerLabel}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

### `components/ui/ranked-rows.tsx` — the legend mode (shared: NOVE-09 and NOVE-10 read it)

- `RankedRow` gains `/** The arc's colour when the list is a ring's legend: an 8×8 swatch before the label. */
  swatch?: string;`; each `remainders` entry gains the same optional `swatch`.
- `RankedRowsProps` gains `/** false when the list is a ring's legend: the ring is the bar (default true). */
  bars?: boolean;`.
- With `bars === false` the label span takes `cn('min-w-0 flex-1', labelClassName)` instead of `LABEL_COLUMN_CLASS`,
  the bar `div` (`:86-94`) and the remainder's spacer (`:137`) are not rendered, and the share column takes
  `SHARE_COLUMN_LEGEND_CLASS` = today's `SHARE_COLUMN_CLASS` with `@max-[200px]:hidden` for `@max-[250px]:hidden`
  (the floors without a bar: 72 + 64 + 34 + two 12px gaps = 194px).
- A `swatch` renders first inside the label span (and the remainder's): `<span className="h-2 w-2 shrink-0
  self-center rounded-[2px]" style={{ background: row.swatch }} aria-hidden="true" />` (DESIGN → Chart Legend
  Swatch). The row button's `aria-label` is unchanged.

### Previdenza — `lib/utils/pensionSummary.ts`, `VersatoTile.tsx`, `PensionOverview.tsx`

```ts
/** Each nature's colour in the Versato ring, fixed by nature (TFR wears one hue every year). */
export const NATURE_RING_COLORS: Record<PensionContributionNature, string> = {
  tfr: 'var(--chart-2)', voluntary: 'var(--chart-7)', employer: 'var(--chart-6)',
};

/** The year's natures as ring parts; null with fewer than two (one nature is the sentence). */
export function versatoRing(versato: VersatoSummary): RingSegment[] | null {
  const segments = versato.rows.map((row) => ({ key: row.nature, label: row.label, value: row.amount,
    color: NATURE_RING_COLORS[row.nature] }));
  return isRingWhole(segments) ? segments : null;
}
```

`VersatoTileProps` gains `ring: RingSegment[] | null` and `total: number`. With `ring` the body (`:55-74`) is
`@container mt-3.5` › `RING_LAYOUT_CLASS` › `<RingChart segments={ring} centerValue={total} centerLabel="versati"
ariaLabel={`Versato nel ${taxYear} per natura`} />` beside, in `RING_ROWS_CLASS`, today's `RankedRows` with
`bars={false}` and each row's `swatch` = its nature's segment colour; without it, today's body. `PensionOverview.tsx:
403-411` passes `ring={versatoRing(versato)}` (a `useMemo` on `versato`, beside `:194`) and `total={versato.total}`.
The header comment's «The bar takes `--chart-2`…» sentence becomes «With two natures or more the rows are the legend
of a ring (`versatoRing`), each nature in its own slot; with one, a bar in `--chart-2`, money coming in».

### Tracciamento — `lib/utils/tracciamentoSummary.ts`, `CategoryTile.tsx`, `ExpenseTrackingTab.tsx`

```ts
/** The ranking as ring parts: the rows by rank, then what the cut left as «Altre categorie»; null unless a whole. */
export function incomeRingSegments(ranking: CategoryRanking): RingSegment[] | null {
  const segments: RingSegment[] = ranking.rows.map((row, index) => ({ key: row.categoryKey ?? row.category,
    label: row.category, value: row.amount, color: RING_CATEGORY_COLORS[index % RING_CATEGORY_COLORS.length] }));
  const rest = ranking.total - ranking.rows.reduce((sum, row) => sum + row.amount, 0);
  if (rest >= 1) segments.push({ key: RING_REST_KEY, label: 'Altre categorie', value: rest, color: RING_REST_COLOR });
  return isRingWhole(segments) ? segments : null;
}
```

`CategoryTileProps` gains `ring?: RingSegment[] | null` and `ringCenterLabel?: string`. With a ring the list
(`:89-113`) sits in `@container mt-3.5` › `RING_LAYOUT_CLASS` beside `<RingChart segments={ring} centerValue={total}
centerLabel={ringCenterLabel ?? ''} ariaLabel={eyebrow} />`, the rows with `bars={false}`, each `swatch` read from
`new Map(ring.map((s) => [s.key, s.color]))` by `rowKey(c)`, the residual's `swatch: RING_REST_COLOR`. The aside, the
scheduled caption, the empty copy and the footer are unchanged. `ExpenseTrackingTab.tsx:1350-1361` passes
`ring={incomeRing}` (`const incomeRing = useMemo(() => incomeRingSegments(incomeRanking), [incomeRanking])` after
`:911`) and `ringCenterLabel="entrate"`; no other caller passes them.

### Composizione and Classi — `lib/utils/overviewSummary.ts`, `ComposizioneTile.tsx`

```ts
export interface CompositionRing {
  segments: RingSegment[];
  /** The sum of the positive classes — the net total, since none is below zero. */
  total: number;
  /** The classes folded into «Altre N classi», in order; empty when none. */
  folded: PieChartData[];
}

/** The classes as ring parts; null when one is below zero (a signed whole) or fewer than two are positive. */
export function compositionRing(data: readonly PieChartData[]): CompositionRing | null {
  const segments = data.map((d) => ({ key: d.assetClass ?? d.name, label: d.name, value: d.value, color: d.color }));
  if (!isRingWhole(segments)) return null;
  const positive = data.filter((d) => d.value > 0);
  return {
    segments: foldRingSegments(segments, (count) => `Altre ${count} classi`),
    total: positive.reduce((sum, d) => sum + d.value, 0),
    folded: positive.length > RING_MAX_PARTS ? positive.slice(RING_MAX_PARTS - 1) : [],
  };
}
```

`ComposizioneTile`: today's row (`:56-73`) moves into a local `ClassRow({ color, label, value, percentage, caption })`
(a caption is a second line `text-[11px] text-muted-foreground line-clamp-2` under the label). `const ring =
compositionRing(data)`. With `ring`: `@container mt-3.5` › `RING_LAYOUT_CLASS` › `<RingChart segments={ring.segments}
centerValue={ring.total} centerLabel="patrimonio" ariaLabel="Composizione per asset class" />` and, in
`RING_ROWS_CLASS`, one `ClassRow` per segment (`percentage = segment.value / ring.total * 100`; the rest row's caption
`ring.folded.map((d) => d.name).join(', ')`). Without it (a class below zero, one class): today's bar and rows. The
empty copy (`:42`) and the footer are unchanged.

### `BalanceRing.tsx` and DESIGN.md

`components/allocation/BalanceRing.tsx:8-9` — «the ONE ring DESIGN.md still keeps (§5 Savings / Metric Ring Chart: a
bounded 0-100 score is not a rate)» becomes «the one ring of a SCORE DESIGN.md keeps (§5 Savings / Metric Ring Chart);
rings of PARTS are `RingChart` (The Ring Rule)».

**DESIGN.md (decision 16), applied to the letter.** The quotes are the file's text; their line breaks are this spec's.

1. `DESIGN.md:1107`. BEFORE: «- Use this pattern when the donut is integral to the card layout and must flex-align
   with text. Use Recharts `PieChart` only for standalone chart sections.» AFTER: «- Use this pattern when the donut
   is integral to the card layout and must flex-align with text. Parts of one whole are the Ring Chart (**The Ring
   Rule**), never Recharts' `PieChart`.»
2. `DESIGN.md:1113`, its last sentence. BEFORE: «It animates through `initial`/`animate` on the element with
   `useReducedMotion`, not through `useAnimation`; it is the tree's only `motion.circle`, and the next ring must be a
   score with a bounded domain, or it must be a figure.» AFTER: «It animates through `initial`/`animate` on the element
   with `useReducedMotion`, not through `useAnimation`; it is the tree's only `motion.circle`. A ring of ONE figure
   must be a score with a bounded domain, or it must be a figure; a ring of PARTS is the Ring Chart (**The Ring
   Rule**, 2026-11-12), drawn with plain `<circle>`s.»
3. `DESIGN.md:1313-1325`. BEFORE:

   > **Rule — when a pie/donut is still correct:** only for a genuine part-of-whole question with ≤5 slices AND some
   > information a flat row wouldn't carry (e.g. an active-slice highlight synced to a list selection, or a
   > hand-rolled SVG donut integral to a hero card layout — see Animated SVG Donut below). Everywhere else — 6+ items,
   > no extra per-slice interaction — use `CompositionList` or `CompositionBar` (on a redesigned page the tile form of
   > the same idea is **Ranked Rows with Residual**: Analisi's composition lists moved into tiles as clickable
   > `RankedRows` on 2026-08-25, and `CompositionList` remains on Previdenza and in Allocazione's Previdenza tile,
   > where it prints its share through chartService's formatter since 2026-08-25). This extends the existing Liquidità
   > rule below: a donut was replaced by flat rows there for the same reason (chrome reduction, more information with
   > less visual noise); pie charts as drill-down or ranking UI carry that same anti-pattern at a larger scale
   > (Analisi's 5 pies, Overview's 2 compact pies, Dividendi's per-payer pie all showed this — see the 2026-07-13
   > pie-chart redesign). As of that redesign, **the app has zero Recharts `<Pie>` usages left** — the one remaining
   > candidate, Obiettivi's goal-allocation donut, turned out to be dead code (`GoalAllocationPieChart.tsx`, 0
   > importers — the donut had already been dropped from `GoalBasedInvestingTab` in an earlier session in favor of
   > the goal list, and the file was removed rather than polished once this was discovered).

   AFTER:

   > **Rule — when a ring is correct:** only under **The Ring Rule** (Ring Chart, below): the parts of one positive
   > whole, two to six, the total in the centre and the rows as its legend. Everywhere else — a ranking, a comparison
   > of magnitudes, a list the reader clicks through — use `CompositionList` or `CompositionBar` (on a redesigned page
   > the tile form of the same idea is **Ranked Rows with Residual**: Analisi's composition lists moved into tiles as
   > clickable `RankedRows` on 2026-08-25, and `CompositionList` remains on Previdenza and in Allocazione's Previdenza
   > tile, where it prints its share through chartService's formatter since 2026-08-25). The pies removed on
   > 2026-07-13 were rankings and drill-downs (Analisi's 5 pies, Overview's 2 compact pies, Dividendi's per-payer
   > pie), and **the app keeps zero Recharts `<Pie>` usages**: the rings that came back on 2026-11-12 are hand-written
   > SVG with their rows beside them (the dead `GoalAllocationPieChart.tsx` was removed in that redesign).

4. `DESIGN.md:1473`. BEFORE: «- **Don't** reach for a pie/donut chart to compare magnitudes across 6+ items. Pie
   angles are hard to compare; aligned bar lengths aren't. Use `CompositionList` (ranked rows) for "which items are
   biggest" or `CompositionBar` (stacked bar) for "what does the whole composition look like" — reserve pie/donut for
   genuine part-of-whole reads with ≤5 slices and information a flat row can't carry (see CompositionList and
   CompositionBar above).» AFTER: «- **Don't** reach for a ring to rank or to compare magnitudes: angles are hard to
   compare, aligned bar lengths aren't. Use `CompositionList` or `CompositionBar`; a ring is for the parts of one
   positive whole, two to six, under **The Ring Rule**.»
5. `DESIGN.md:1474`. BEFORE: «- **Don't** use an animated SVG donut or ring chart when flat `divide-y` rows carry the
   same information more clearly. Chrome reduction is the primary principle — the animated donut in the Liquid card was
   replaced by a flat 3-row breakdown precisely because the breakdown communicates more (three separate values,
   individual percentages) with less visual noise.» AFTER: «- **Don't** draw a ring without its rows: the ring is the
   picture of the rows (the total in the centre, each part a row with its swatch and figure), never their replacement
   — the animated donut in the Liquid card was replaced by a flat 3-row breakdown because a ring alone says less.»
6. **New section**, inserted before `### Chart Legend Swatch` (`DESIGN.md:1327`):

   > ### Ring Chart (Parts of One Whole)
   >
   > **The Ring Rule** (2026-11-12, owner): a ring shows the parts of ONE positive whole — two to six parts, each ≥ 0,
   > summing to the total printed in its centre. Never a signed quantity (a part below zero, a net that can turn
   > negative, a rate), never a time series, never two rings side by side to compare two wholes (two mixes are two
   > `CompositionBar`s over one legend, Bilanciamento's form), never a single part (one part is a sentence). It is
   > `components/ui/ring-chart.tsx` on `lib/utils/ringChart.ts`, hand-written SVG: stroke 9 on r 43 in a 100 viewBox,
   > `pathLength=100`, `butt` caps, rotated −90° so the first part starts at 12 o'clock and runs clockwise, one unit
   > of white after each arc. It must carry the total in its hole (Geist Mono, one word under it); the tile's rows as
   > its legend, each with the 8×8 swatch of its arc and its figure, the bar gone (the ring is the bar); the same
   > colour on arc and swatch, from the theme's chart slots, the fold and any residual in `--muted-foreground`; a text
   > alternative (`role="img"`, every part's share and the total in its `aria-label`; the rows are the data table).
   > Past six parts the five largest stay and the rest is one «Altre N …». **The figure stays inside its hole**: it
   > is abbreviated to what the hole holds at the ring's size («31.900 €», «31,9k €», «32k €»; «1,2 Mln €», «1 Mln
   > €»), and when no form fits it stands whole above the ring — never across the arc (the owner's remark of
   > 2026-11-12). The absences are the tile's sentence, never an empty ring (The Absence-Has-Three-Names Rule); the
   > ring does not draw itself on mount and glides when its parts change (The Period-Transforms Rule), at once under
   > reduced motion. Homes: Previdenza «Versato», Tracciamento «Entrate per categoria», Panoramica «Composizione»,
   > Patrimonio «Classi» (a class below zero keeps the `CompositionBar`).

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **Recharts only through `components/ui/charts/recharts.ts`**: here it means the ring imports none of it.
- **`motion.circle` + `pathLength` is a trap**: Framer interprets `pathLength` and writes its own dash array; the arcs
  are plain `<circle>`s with a CSS transition, and `BalanceRing` stays the tree's only `motion.circle`.
- **`useReducedMotion()` once per component, no CSS media query** (AGENTS.md § Motion): the transition is chosen in
  JS, not with `motion-safe:`.
- **Accessibility on the chart itself** (AGENTS.md § Recharts): `role="img"` + `aria-label` on the `svg`; the centre
  overlay is `aria-hidden`; the rows stay a real list.
- **The Mono Mandate**: the centre is Geist Mono, which is what `ringCenterMaxChars` measures (0,6 em); the sans UI
  is `system-ui` today (CLAUDE.md → Known Issues, Geist Sans) and touches only the label.
- **One word, one colour per page** (doc/guide/grafici.md): arc and swatch share one colour; the classes keep
  `ASSET_CLASS_CHART_INDEX`'s; a rank colour can move between periods — declared, not a defect.
- **The Absence-Has-Three-Names Rule**: loading, nothing recorded, a measured zero and a failed read never draw a ring;
  `RingChart` returns nothing under two parts, so no host can show a grey placeholder ring.
- **A container query, not a viewport one** (`ranked-rows.tsx:28-37`): the same tile is 235px wide in three columns
  at 1440 and 326px on a phone; the side-by-side switch reads the tile.
- **`e2e/pension.spec.ts:116-144` holds the 1440 grid** (Versato beside the hero's second row): the ring beside three
  rows adds at most 12px and the hero spans both rows — run it.
- **Server-cached colours are remapped at render time** (doc/guide/grafici.md): `compositionRing` reads the colours
  the page remapped (`app/dashboard/page.tsx:280-287`), never the payload's.
- **The React Compiler runs** (AGENTS.md § React Compiler): no hook after the early return;
  `__tests__/reactCompilerCoverage.test.ts` stays green with the new component compiled.
- **Fixtures are invented and round**; the owner's figures are never copied.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| R1 | `ringChart.test.ts`: 72/14/9/5 → lengths 71/13/8/4, offsets 0/72/86/95 | drop `Math.min(RING_GAP, share / 2)` |
| R2 | one part → `{ length: 100, offset: 0 }`; a 0,4% part → length 0,2 | `share − RING_GAP` unclamped |
| R3 | a zero and a negative part draw nothing | keep `value <= 0` parts |
| R4 | seven parts → six, the last `ring-rest` «Altre 2»; `ringSwatchAt(seven, 5)` grey | slice at `RING_MAX_PARTS` |
| R5 | the nine `formatRingCenter` cases of criterion 2 | return the full form always |
| R6 | `ringCenterMaxChars` 120 → 7, 96 → 7, 72 → 4 | drop `reach` (the centre's chord) |
| R7 | `isRingWhole`, criterion 3 | test `value < 0` instead of the rounded value |
| C1-C2 | `RingChart.test.tsx` (RTL): the name; one `circle` per part; nothing with one part | render with one part |
| C3-C4 | 120px 31.900 € in the hole; 72px 821 € above, the hole empty | always print in the hole |
| C5 | first render's dash = final; `useReducedMotion` mocked true → `transition: none` | ignore `reducedMotion` |
| K1-K2 | `RankedRows.test.tsx`: swatches, no bar track with `bars={false}`; today's DOM without | the bar always |
| P1-P2 | `versatoRing` three natures / one; `VersatoTile.test.tsx` ring vs bars | drop `isRingWhole` |
| T1-T2 | `incomeRingSegments` with a cut / one category; `CategoryTile.test.tsx` swatch by key | colour by list index |
| O1-O3 | `compositionRing`: seven classes folded, −2.000 € → null; `ComposizioneTile.test.tsx` both | skip the guard |

**Playwright** (`workers: 1`; base account, data-only planting). `e2e/ringFit.ts`:

```ts
export async function expectRingFiguresInside(scope: Locator): Promise<void> {
  const rings = scope.locator('[data-ring]');
  await expect(rings.first()).toBeVisible();
  const fits = await rings.evaluateAll((nodes) => nodes.map((node) => {
    const svg = node.querySelector('svg')!.getBoundingClientRect();
    const figure = node.querySelector('[data-ring-center="hole"]');
    if (!figure) return { inside: node.querySelector('[data-ring-center="above"]') !== null, text: 'above' };
    const box = figure.getBoundingClientRect();
    const [cx, cy, hole] = [svg.left + svg.width / 2, svg.top + svg.height / 2, (svg.width / 100) * 38.5];
    const corners = [[box.left, box.top], [box.right, box.top], [box.left, box.bottom], [box.right, box.bottom]];
    const text = figure.textContent ?? '';
    return { inside: corners.every(([x, y]) => Math.hypot(x - cx, y - cy) <= hole + 0.5)
      && text.length <= Number(node.getAttribute('data-ring-max-chars')), text };
  }));
  for (const fit of fits) expect(fit, JSON.stringify(fit)).toMatchObject({ inside: true });
}
```

The three specs share one body. Panoramica and Patrimonio: `patchOverview(page, { charts: { assetClassData: CLASSES },
metrics: { totalValue: 1_000_000 } })` with seven invented classes (equity 520.000, bonds 180.000, realestate 140.000,
crypto 60.000, cash 40.000, commodity 30.000, trendFollowing 30.000) → «1 Mln €» and «Altre 2 classi»;
`e2e/overviewFixture.ts:83-90` gains `charts: { ...(body.charts as Json), ...((overrides.charts as Json | undefined)
?? {}) }`, the merge `metrics` and `flags` already have. Tracciamento: two income rows planted by REST in `beforeAll`
(ids `e2e-exp-ornitorinco-ring-1`/`-2`, 24.000 € «Stipendio» and 7.900 € «Affitto», day 1 of the running month at
noon UTC, note «entrata ornitorinco»), removed in `afterAll` (the pattern of
`e2e/mobile-composition.cashflow.mobile.spec.ts:56-115`). Previdenza: the seed's 2026 (three natures, a ring) and 2025
(one nature: `[data-ring]` count 0 beside the visible «Versato per natura» list). At 390 and 768 each spec opens the
row first (`#panoramica-composizione-trigger`, `#patrimonio-classi-trigger`, `#trk-entrate-trigger`,
`#prev-versato-trigger`); in landscape the index row opens in place. Falsification seen red: `formatRingCenter`
returning the full form (the Composizione's «1.000.000 €» leaves the hole at every width).

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators, Previdenza 2026 shows a three-colour ring with «821 €» in the hole
and 2025 today's single bar; Tracciamento's month with the two planted rows shows «Entrate per categoria» with a ring,
its centre abbreviated and inside the hole at 1440 (three columns) and on a phone; the Panoramica and Patrimonio show
the classes' ring with the patched «1 Mln €»; a planted personal loan larger than the accounts brings back the bar.

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/ring-chart e2e/pension e2e/overview
  e2e/cashflow.tracciamento e2e/mobile-composition` (every project of those files).
- **B**: emulators + seed + the planted rows (decoys «ornitorinco», «fenicottero»).
- **C (browser, the session)**: the four homes at 390, 768, 1024 landscape and 1440, light and dark on two themes; the
  landing's Composizione; a period change on Tracciamento (the arcs glide); reduced motion on (they jump).
- **D (data)**: the ring's `aria-label` shares against the rows' printed shares, on each home.
- **E**: a loan planted larger than the accounts → «Liquidità» below zero → no ring, today's bar; a month without
  income → «Nessuna entrata registrata nel periodo.», no ring.
- **F (owner, at his «pronto»)**: the mirror — his four homes on his own figures; `npm run mirror:remove`.
- **G**: `mobile:census` + `mobile:budget`, `perf:budget`; remove fixtures, mirror and scripts.

## 8. Putting it into service

One PR to `develop`. No data change, no payload change: `DASHBOARD_OVERVIEW_SOURCE_VERSION` does not move (the ring
reads `charts.assetClassData` as it is).

## 9. Documentation

- `DESIGN.md`: the five amendments and the new section of § 4, to the letter.
- `doc/guide/grafici.md`: a section «## The ring (2026-11-12)» — the files, the contract's names, `RankedRows`'s
  legend mode, the `motion.circle` + `pathLength` trap, `ringCenterMaxChars`'s rule, the helper `e2e/ringFit.ts`; its
  «When to open this guide» line names `ring-chart.tsx` and `ringChart.ts`.
- `AGENTS.md` § Recharts, one bullet: «parts of one whole are `RingChart` (hand-written SVG, The Ring Rule), never a
  Recharts `<Pie>`; its figure stays inside the hole (`formatRingCenter`) — doc/guide/grafici.md § The ring».
- `doc/guide/previdenza.md` (Versato), `cashflow-tracciamento.md` (Entrate), `panoramica.md` and `patrimonio.md`
  (Composizione / Classi, and the blind spot «a class below zero keeps the bar»), `landing.md`: one bullet each.
- `CLAUDE.md` › Key Files › Shared primitives: `ring-chart` beside `composition-bar`, `ringChart.ts` among the utils;
  «Latest»; `README.md` (one sentence per home); `Draft Release Temp.md`; `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The ring in the minor tiles** (Divisione, Mutuo, Intestatari, Centri di Costo, Dividendi): heir NOVE-09.
- **The ring inside Analisi** (spending by type, income): heir NOVE-10, on this contract.
- **The ring dressed by a theme's costume**: heirs NOVE-19 and NOVE-20.
- **A ring in the PDF and the emails** (out of the DOM, The Out-Of-DOM Token Rule): heir none, declared.
- **`BalanceRing` rebuilt on `RingChart`**: heir none, declared — a score is not parts.
- **The Panoramica's «Entrate per categoria», every «Spese per categoria»**: heir none, declared (§ 3).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-08-anello-primitiva.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-08-anello-primitiva.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/grafici.md, temi.md, previdenza.md, cashflow-tracciamento.md, panoramica.md,
  patrimonio.md, landing.md, prima-schermata.md, e2e-playwright.md PRIMA di scrivere codice
- Leggi DESIGN.md (CompositionList and CompositionBar, Animated SVG Donut, Savings / Metric
  Ring Chart, Chart Legend Swatch, The Absence-Has-Three-Names Rule, The Period-Transforms
  Rule, The Mono Mandate) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Lancia npm audit e confrontalo con doc/guide/dipendenze.md (regola 8 di WORKFLOW.md).
Rispondimi in una riga: invariate dal <data>, oppure gli avvisi nuovi; quelli nuovi li
registriamo nella guida con una decisione, non si aggiorna nulla in questa sessione.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: ringChart.ts e ring-chart.tsx con i
loro test; la modalità legenda di RankedRows; Previdenza, Tracciamento Entrate, Composizione
e Classi; i tre spec Playwright con e2e/ringFit.ts; gli emendamenti di DESIGN.md alla
lettera. I test PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre inventate
e tonde. Fermati e chiedimi se: una cifra esce dal suo foro a una delle quattro larghezze;
mobile:budget o perf:budget si muovono su una superficie; e2e/pension.spec.ts o
e2e/cashflow.tracciamento.spec.ts diventano rossi. Collaudo: § 7, la F sul mirror al mio
«pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with a shared contract (`RingChart`, `ringChart.ts`, `RankedRows`'s
legend mode) read by NOVE-09, NOVE-10 and the theme specs, a DESIGN rule amended, four areas and three browser
projects. Estimated size: 1 session, ~5 h; ~150 lines pure, ~200 across the primitive and the four tiles, ~400 of
tests, three E2E files.
