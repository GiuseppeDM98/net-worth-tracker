# NOVE-09 — The ring in the minor tiles

> Series `doc/nove/` (README.md § 5): **implemented after NOVE-08**, whose contract it consumes unchanged
> (`RingChart`, `RING_LAYOUT_CLASS`, `RING_ROWS_CLASS`, `ringChart.ts`, `RankedRows`'s legend mode — README.md § 7).
> Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7 (the NOVE-08 files do not exist there yet:
> their names are NOVE-08 § 4's). Executes the owner's decisions 5, 6 and 10 (README.md § 3).

## 1. The problem today (evidence on the code)

The owner named five more homes for the ring (decision 10). What each draws today, and what its parts are:

- **Cashflow › Divisione «Quota»** — `components/cashflow/ExpenseSplitTab.tsx:310-331`: with a computed basis, one
  block per person, name and income at 22px mono (`:318-328`), no proportion drawn; the shares are words only, in the
  reading (`describeSplitBasis`, `lib/utils/expenseSplitNarrative.ts:124`) and the aside (`describeSplitAside`, `:529`).
  Parts: `resolveSplitBasis` (`lib/utils/expenseSplitSummary.ts:251-282`) — `members[].income` (> 0 for every person,
  or the basis is `unavailable`, `:271-276`), their sum `totalIncome` (`:278`). A `desktop:col-span-7` cell (`:310`).
- **Patrimonio «Mutuo» / «Prestito»** — `components/assets/tiles/MutuoTile.tsx:67-78`: four KPIs, «Debito residuo»,
  «Interessi {Y}», «Capitale {Y}», «Fine prevista», no proportion drawn; one full-width tile per loan
  (`app/dashboard/assets/page.tsx:880-894`). Parts: `MortgageSummary.yearInterest` and `yearPrincipal`
  (`lib/utils/mortgageSummary.ts:70-72`, summed at `:180-181` over the year's SETTLED rows). No field holds their sum.
- **«Intestatari», the «Valore» view** — `components/dashboard/overview/IntestatariTile.tsx:69-114`: `RankedRows` in
  `var(--chart-1)` (`:109`), the «Valore | Carico» switch (`:70-76`, `:90-97`); mounted on the Panoramica
  (`app/dashboard/page.tsx:714-716`) and on Patrimonio (`app/dashboard/assets/page.tsx:854-856`), both
  `desktop:col-span-12`. Parts: `OwnershipSummary.rows[].value` (`lib/utils/assetOwnership.ts:174-191`; members by
  value, then «In comune», then «Senza intestatario», `:207-208`), read through `ownershipRowOn`
  (`lib/utils/ownershipBasis.ts`); the net `total` (`:210`). **A row can be negative** (debts outweighing a person's
  assets, `doc/guide/patrimonio.md:444`).
- **Centri di Costo «Costo», fixed vs one-off** — `components/cashflow/cost-centers/tiles/CostoTile.tsx:98-100`: the
  footer sentence «Fisso X (il N%, ricorrenti e rate) · una tantum Y.» (`describeCostoFooter`,
  `lib/utils/costCenterNarrative.ts:570-574`). Parts: `CenterSummary.recurring` = `splitRecurringVsOneOff(booked)`
  (`lib/utils/costCenterUtils.ts:151-161`, both magnitudes, `lib/utils/costCenterSummary.ts:287`), summing to
  `summary.total`, the hero (`CostoTile.tsx:64`). THE tile of a centre's detail, open at every width.
- **Dividendi «Chi paga di più»** — `components/dividends/tiles/PagatoriTile.tsx:31-58`: `RankedRows` in
  `var(--chart-2)` with one residual (`:46`); mounted `components/dividends/DividendTrackingTab.tsx:800-807`,
  `desktop:col-span-4`. Parts: `rankPayerShares` (`lib/utils/dividendAnalytics.ts:478-523`): ≤ 5 held payers
  (`RANKED_PAYERS`, `DividendTrackingTab.tsx:198`) and a `remainder` «Altri N strumenti» / «N strumenti venduti»
  (`:504-522`); rows + remainder = `total`. `net` is not clamped (`:288`).

## 2. Goal and acceptance criteria

Each of the five tiles draws its parts as NOVE-08's ring when they are one positive whole of two parts or more, and
keeps today's form otherwise.

1. **Divisione**: `splitRingSegments(basis)` → one part per person in settings order, colours `RING_CATEGORY_COLORS`
   by that order (six slots, decision 45: six people wear six colours; the sixth, `--chart-4`, is also «Spese Non
   Necessarie» on Cashflow — declared in cashflow-divisione.md § Per-page blind spots); `null` when the basis is
   `unavailable`. The tile draws the ring (centre `totalIncome` «entrate», decision 46: the income the shares are
   measured on — the reading under it names the income left in comune)
   beside the person blocks, each name led by its swatch. **Proof**: `expenseSplitSummary.test.ts` D1,
   `__tests__/splitQuotaBody.test.tsx` D2.
2. **Mutuo**: `mortgageRingSegments(summary)` → «Interessi {Y}» `var(--chart-8)` and «Capitale {Y}» `var(--chart-7)`;
   `null` with no settled instalment in the year or with one of the two at zero. The ring (size 96, centre
   `mortgageYearPaid(summary)` «pagati») stands before the KPI grid; the two KPIs' labels are led by their swatch. **Proof**:
   `mortgageSummary.test.ts` M1, `__tests__/mutuoTile.test.tsx` M2.
3. **Intestatari**: on «Valore» `ownershipRingSegments(summary)` → the rows in order, coloured by rank, «Senza
   intestatario» in `RING_REST_COLOR`; `null` when a row prints below zero. On «Carico» no ring, today's bars. Centre
   `total` «patrimonio»; from `desktop:` the legend rows are capped at 560px. **Proof**: `ownershipRing.test.ts`
   (new) I1, `__tests__/intestatariTile.test.tsx` I2.
4. **Centri di Costo**: `costCenterRingSegments(summary)` → «Fisso» `var(--chart-7)` (caption «ricorrenti e rate»)
   and «Una tantum» `var(--chart-3)`; `null` when either is zero. With it the footer is the ring (size 96, centre
   `summary.total` «in tutto») and two legend rows; without it, today's sentence («Tutto una tantum: …»).
   **Proof**: `costCenterSummary.test.ts` K1, `__tests__/costoTile.test.tsx` K2; `costCenterNarrative.test.ts:441`
   stays green (the sentence is unchanged).
5. **Dividendi**: `payerRingSegments(ranking)` → the rows by rank, then the remainder in `RING_REST_COLOR`; `null` when
   fewer than two parts are above zero (one held payer and no remainder, or only sold instruments) or a part — a
   row or the remainder — prints below zero; one held payer beside a sold one's remainder is a ring of two. Centre
   `total` «netti». **Proof**: `dividendAnalytics.test.ts` V1,
   `__tests__/pagatoriTile.test.tsx` V2.
6. In ring mode every host's rows are the legend (`bars={false}`, a `swatch` per row and remainder); the colour of a
   swatch is its arc's. Past six parts (seven people, seven owners) the ring folds and the rows from the sixth on wear
   `RING_REST_COLOR`. **Proof**: D2, I2 (seven members).
7. **The figure stays INSIDE its hole** at 390 and 1440 on Divisione, Centri and Intestatari, and at 1440 on Mutuo
   and Dividendi. **Proof**: `e2e/ring-chart.dividendi.spec.ts`, `e2e/ring-chart.split.spec.ts`, `e2e/ring-chart.split.mobile.spec.ts`, `e2e/ring-chart.centri.spec.ts`,
   `e2e/ring-chart.centri.mobile.spec.ts`, `e2e/ring-chart.owners.spec.ts`, `e2e/ring-chart.owners.mobile.spec.ts`
   (all through NOVE-08's `expectRingFiguresInside`), one assertion added to `e2e/cashflow.mortgage.spec.ts:211-226`.
8. Every existing spec of the five tiles stays green: `e2e/cashflow.split{,.mobile}.spec.ts` (the Quota's text;
   «nothing runs off the side»), `e2e/cashflow.mortgage.spec.ts`, `e2e/mobile-composition.patrimonio{,.mobile}.spec.ts`
   (the switch, the overflow guard), `e2e/overview.mobile.spec.ts`, `e2e/overview.tablet.spec.ts`,
   `e2e/mobile-composition.cashflow.mobile.spec.ts`, `e2e/cashflow.centri*.spec.ts`,
   `e2e/cashflow.dividendi*.spec.ts`. **Proof**: the run.
9. `mobile:census` + `mobile:budget` unchanged for `cashflow-divisione`, `patrimonio`, `panoramica`,
   `cashflow-dividendi` (the four tiles are closed rows on a first visit) and `cashflow-centri` (the census measures the
   tab's overview, `/dashboard/cashflow?tab=cost-centers`, never a centre's detail). **Proof**: the runs.
10. DESIGN.md's Ring Chart section names the five homes (§ 4). **Proof**: the diff.
11. `npm run perf:budget`: only `/dashboard`, `/dashboard/assets` and `/dashboard/cashflow` may grow; a growth on
    any other route is the trap of § 5 (a builder dragged into a shared narrative). **Proof**: the run.

## 3. Decisions

- **Owner 5, 6, 10 (2026-11-12)**: form A everywhere, the figure inside its hole, and these five homes («Divisione
  quote, Mutuo interessi/capitale, Intestatari vista Valore, Centro di costo fisso/una tantum, Dividendi primo
  pagatore»).
- **Adopted, reversible**:
  - **Divisione's parts are the incomes**, the shares' own base (`share = income / totalIncome`): the ring of the
    incomes IS the ring of the shares, and the centre can print a total;
  - Divisione keeps settings order (the order the reading and the strip use), so a person keeps a colour whatever
    the period; Intestatari and Dividendi colour by rank, as NOVE-08's Entrate;
  - **Mutuo's whole is interest + principal of the year's settled rows**, printed «pagati»: a linked instalment is
    principal and interest only (`mortgageSummary.ts:93-96`); fees on their own row are not in it;
  - Mutuo and Centri take size 96 (a KPI row, a footer); the others 120;
  - colours with a meaning of their own on their page: Mutuo `--chart-8`/`--chart-7` and Centri `--chart-7`/`--chart-3`
    — on Patrimonio every slot is also a class's (`ASSET_CLASS_CHART_INDEX`), and 7/8 are the two rarest classes
    (Trend following, Carry); on Centri a centre wearing slot 3 or 7 shares a hue with the split, declared;
  - **Intestatari's ring only on «Valore»** (the owner's words): «Carico» keeps today's bars, so the switch also
    switches the form;
  - Centri: in ring mode the two rows replace the footer sentence (they say the same, with figures and shares);
  - the centre repeats a figure the tile prints elsewhere on Centri (the hero) and on Dividendi (the aside's
    `ranking.total`, `PagatoriTile.tsx:34`) — decision 5's «total in the centre» wins, declared;
  - on Panoramica and Patrimonio every chart slot is also a class's: Intestatari colours by rank, as NOVE-08's
    Entrate, and shares hues with the classes' ring on the same page — declared;
  - from `desktop:` Intestatari's legend rows are capped at 560px (the tile is twelve columns wide; without the
    bars a label and its figure would stand a thousand pixels apart — the cap `MutuoTile`'s «Per anno» already has);
  - a row worth exactly 0 € beside six positive ones leaves `ringSwatchAt` one row ahead of the arcs (it counts
    every segment, the fold only the positive ones): accepted, a blind spot of doc/guide/patrimonio.md;
  - Dividendi has its own browser proof (§ 6); the tablet widths of the five tiles are phase C's look, not a spec:
    the split and centri accounts have no tablet project.
- **Not overturned**: every reading, aside and closed-row answer of the five tiles stays as it is.

## 4. Solution

Each builder imports from `@/lib/utils/ringChart` what it uses (`RingSegment`, `isRingWhole`; the three that
colour by rank `RING_CATEGORY_COLORS`; Intestatari and Dividendi also `RING_REST_COLOR`, Dividendi `RING_REST_KEY`);
every tile imports `RingChart` from `@/components/ui/ring-chart`, the four whose rows stand beside the ring also
`RING_LAYOUT_CLASS` and `RING_ROWS_CLASS` (Mutuo lays its ring beside the KPI grid with its own classes);
`SplitQuotaBody` and `IntestatariTile` import `ringSwatchAt`. A swatch is NOVE-08's: `<span className="h-2 w-2 shrink-0
self-center rounded-[2px]" style={{ background }} aria-hidden="true" />`.

### Divisione — `lib/utils/expenseSplitSummary.ts`, `components/cashflow/tiles/SplitQuotaBody.tsx` (new)

```ts
/** The people's incomes as ring parts, in settings order — the base of their shares; null without a basis. */
export function splitRingSegments(basis: SplitBasis): RingSegment[] | null {
  if (basis.kind !== 'computed') return null;
  const segments = basis.members.map((entry, index) => ({ key: entry.member.id, label: entry.member.name,
    value: entry.income, color: RING_CATEGORY_COLORS[index % RING_CATEGORY_COLORS.length] }));
  return isRingWhole(segments) ? segments : null;
}
```

`SplitQuotaBody({ basis })` takes over `ExpenseSplitTab.tsx:318-328`: `null` unless `basis.kind === 'computed'`;
with `const ring = splitRingSegments(basis)` it renders `<div className="@container mt-4"><div
className={RING_LAYOUT_CLASS}><RingChart segments={ring} centerValue={basis.totalIncome} centerLabel="entrate"
ariaLabel="Entrate per persona" />` and, in `RING_ROWS_CLASS`, today's `flex flex-wrap gap-x-8 gap-y-3` blocks,
each `TILE_SUB_EYEBROW_CLASS` name becoming `flex items-center gap-1.5` with `ringSwatchAt(ring, index)` before the
name; without a ring, today's blocks. `ExpenseSplitTab.tsx:318-328` becomes `<SplitQuotaBody basis={summary.basis}
/>`.

### Mutuo — `lib/utils/mortgageSummary.ts`, `MutuoTile.tsx`

```ts
export const MORTGAGE_RING_COLORS = { interest: 'var(--chart-8)', principal: 'var(--chart-7)' } as const;

/** What the year's settled instalments paid, as interest and principal; null unless both are above zero. */
export function mortgageRingSegments(summary: MortgageSummary): RingSegment[] | null {
  const segments: RingSegment[] = [
    { key: 'interest', label: `Interessi ${summary.year}`, value: summary.yearInterest,
      color: MORTGAGE_RING_COLORS.interest },
    { key: 'principal', label: `Capitale ${summary.year}`, value: summary.yearPrincipal,
      color: MORTGAGE_RING_COLORS.principal },
  ];
  return isRingWhole(segments) ? segments : null;
}
```

`MutuoTile`: `Kpi` gains `swatch?: string` (before the label, the label `<p>` gaining `flex items-center gap-1.5`
when present). `const ring = mortgageRingSegments(summary)`. Inside the existing `@container mt-3.5` (`:69`) the grid
is wrapped: `<div className="flex flex-col items-center gap-4 @[560px]:flex-row @[560px]:items-start">{ring &&
<RingChart segments={ring} centerValue={mortgageYearPaid(summary)} centerLabel="pagati"
ariaLabel={`Rate pagate nel ${summary.year}`} size={96} />}<div className="@container w-full min-w-0
@[560px]:flex-1">` + today's grid + `</div></div>` — the inner wrapper is a container of its own, so the four KPIs go
across from 560px of the GRID's width beside the ring, not of the tile's; the interest and principal `Kpi`s receive
`swatch={ring ? MORTGAGE_RING_COLORS.interest : undefined}` and `…principal…`. `mortgageSummary.ts` gains, beside the
builder (`toCents` stays its private `const`):

```ts
/** What the year's settled instalments paid, interest and principal together — the ring's centre. */
export function mortgageYearPaid(summary: MortgageSummary): number {
  return toCents(summary.yearInterest + summary.yearPrincipal);
}
```

The «Per anno» table is unchanged.

### Intestatari — `lib/utils/ownershipRing.ts` (new), `IntestatariTile.tsx`

The builder lives in a module of its own (imports `@/lib/utils/ringChart` and `import type { OwnershipSummary }
from '@/lib/utils/assetOwnership'`), imported only by `IntestatariTile`: `ownershipBasis.ts` is value-imported by
`patrimonioNarrative`, which every page's narrative imports, and a value import there would carry `ringChart.ts`
into every route's first load (the trap of 2026-11-03, doc/guide/velocita.md § Registro dei tetti alzati).

```ts
/** The owners on their VALUE as ring parts: rows in order, by rank, the orphaned group in the neutral ink. */
export function ownershipRingSegments(summary: OwnershipSummary): RingSegment[] | null {
  let rank = 0;
  const segments = summary.rows.map((row) => ({ key: row.key, label: row.label, value: row.value,
    color: row.kind === 'unassigned' ? RING_REST_COLOR : RING_CATEGORY_COLORS[rank++ % RING_CATEGORY_COLORS.length] }));
  return isRingWhole(segments) ? segments : null;
}
```

`IntestatariTile`: `const ring = basis === 'value' ? ownershipRingSegments(summary) : null`. With it, the list
(`:108-110`) sits in `@container mt-2` › `RING_LAYOUT_CLASS` beside `<RingChart segments={ring}
centerValue={summary.total} centerLabel="patrimonio" ariaLabel="Patrimonio per intestatario" />`, the rows — in
`cn(RING_ROWS_CLASS, 'desktop:max-w-[560px]')`, ring and rows left-aligned — with `bars={false}` and `swatch:
ringSwatchAt(ring, index)`; on «Carico», or a row below zero, today's list. The footer,
the switch and its memory are unchanged.

### Centri di Costo — `lib/utils/costCenterSummary.ts`, `CostoTile.tsx`, `CostCenterDetail.tsx`

```ts
export const COST_SPLIT_RING_COLORS = { recurring: 'var(--chart-7)', oneOff: 'var(--chart-3)' } as const;

/** Fixed (recurring, instalments) and one-off as ring parts of the booked total; null unless both are spent. */
export function costCenterRingSegments(summary: CenterSummary): RingSegment[] | null {
  const segments: RingSegment[] = [
    { key: 'recurring', label: 'Fisso', value: summary.recurring.recurring, color: COST_SPLIT_RING_COLORS.recurring },
    { key: 'one-off', label: 'Una tantum', value: summary.recurring.oneOff, color: COST_SPLIT_RING_COLORS.oneOff },
  ];
  return isRingWhole(segments) ? segments : null;
}
```

`CostoTileProps` gains `ring: RingSegment[] | null`. The footer (`:98-100`) keeps its `mt-auto border-t border-border
pt-3.5` box; inside it, with a ring: `<div className="@container"><div className={RING_LAYOUT_CLASS}><RingChart
segments={ring} centerValue={summary.total} centerLabel="in tutto" ariaLabel={`Costo di ${summary.center.name}, fisso
e una tantum`} size={96} />` and, in `RING_ROWS_CLASS`, `<RankedRows bars={false} color={ring[0].color}
ariaLabel="Fisso e una tantum" rows={ring.map((part) => ({ key: part.key, label: part.label, caption: part.key ===
'recurring' ? 'ricorrenti e rate' : undefined, amount: part.value, percentage: (part.value / summary.total) * 100,
swatch: part.color }))} />`; without it, today's `NarrativeText`. `CostCenterDetail.tsx:400-411` passes
`ring={costCenterRingSegments(summary)}`. (`color` is required by `RankedRows` and unread with `bars={false}`.) The tile's header sentence «Every figure is
the `CenterSummary`'s; the tile computes nothing.» becomes «Every figure is the `CenterSummary`'s; the tile only
turns the ring's two parts into shares for their rows.»

### Dividendi — `lib/utils/dividendAnalytics.ts`, `PagatoriTile.tsx`, `DividendTrackingTab.tsx`

```ts
/** The payers as ring parts: the rows by rank, then the remainder in the neutral ink; null unless a whole. */
export function payerRingSegments(ranking: PayerRanking): RingSegment[] | null {
  const segments: RingSegment[] = ranking.rows.map((row, index) => ({ key: row.key, label: row.label,
    value: row.amount, color: RING_CATEGORY_COLORS[index % RING_CATEGORY_COLORS.length] }));
  if (ranking.remainder && ranking.remainder.amount !== 0) {
    segments.push({ key: RING_REST_KEY, label: ranking.remainder.label, value: ranking.remainder.amount,
      color: RING_REST_COLOR });
  }
  return isRingWhole(segments) ? segments : null;
}
```

(`!== 0`: a remainder below zero enters the segments so that `isRingWhole` refuses the whole — the centre prints
`ranking.total`, which counts it — and the tile keeps its bars; a remainder at zero is left out, as `RankedRows`
leaves it out, `ranked-rows.tsx:131`.)
`PagatoriTileProps` gains `ring: RingSegment[] | null`. With it, the list (`:44-47`) sits in `@container mt-3.5` ›
`RING_LAYOUT_CLASS` beside `<RingChart segments={ring} centerValue={ranking.total} centerLabel="netti"
ariaLabel="Chi paga di più" />`, the rows with `bars={false}` and the swatch of their key, the remainder's
`swatch: RING_REST_COLOR`. `DividendTrackingTab.tsx:800-807` passes `ring={payerRing}` (a `useMemo` on `ranking`
beside `:266`).

### DESIGN.md

The Ring Chart section NOVE-08 adds, its last sentence. BEFORE (NOVE-08 § 4, item 10): «Homes: Previdenza «Versato»,
Tracciamento «Entrate per categoria», Panoramica «Composizione», Patrimonio «Classi» (a class below zero keeps the
`CompositionBar`).» AFTER: «Homes: Previdenza «Versato», Tracciamento «Entrate per categoria», Panoramica
«Composizione», Patrimonio «Classi» (a class below zero keeps the `CompositionBar`); and in the minor tiles (also
2026-11-12) Divisione «Quota» (the incomes the shares are measured on), «Mutuo»/«Prestito» (the year's interest and
principal), «Intestatari» on its «Valore» view, a cost centre's «Costo» (fixed and one-off) and Dividendi «Chi paga
di più» — each keeping today's form when its parts are not one positive whole of two or more.»

## 5. Constraints and traps (AGENTS.md / DESIGN.md rules, «here it means that»)

- **NOVE-08's contract is fixed**: no prop of `RingChart`, no export of `ringChart.ts` is renamed or added; the rows
  past the fold take `ringSwatchAt` (NOVE-08 § 4), the one rule for a row beside a folded ring.
- **«Never a signed quantity»** (The Ring Rule): Intestatari and Dividendi can hold a part below zero — `isRingWhole`
  decides, and the tile keeps its bars then; Mutuo and Centri sum magnitudes, so they are wholes by construction.
- **The tile computes no figure** (the tiles' headers, e.g. `VersatoTile.tsx:15-16`): every segment and every
  centre comes from a pure builder in the area's module; the tiles map keys to swatches, and `CostoTile` divides a
  part by `summary.total` for its legend's share — the one division `RankedRows` needs.
- **A builder never lands in a module a shared narrative imports** (`ownershipBasis.ts`'s own header; criterion 11).
- **THE tile of Centri never closes** (`CostoTile.tsx:17`; doc/guide/centri-di-costo.md:148): the ring sits in its
  footer, at the bottom, so the first screen of a detail at 390 changes only below the KPIs and the bars.
- **`e2e/cashflow.split.spec.ts:42-77` holds the people side by side at equal height** (the per-person tiles, not
  Quota): unaffected; `:121-137` reads the Quota's reading — unchanged.
- **The Intestatari switch and its memory** (`e2e/mobile-composition.patrimonio.spec.ts:47-63`): the switch's
  `aria-pressed` and the list's two accessible names stay as they are.
- **Sentences live in narrative modules**: the five centre labels and the ring names are one-word labels of the
  tiles, as `ROWS_ARIA_LABEL` is; no sentence is added.
- **Fixtures are invented and round**: the E2E reads the fixture accounts as they are (`seedSplitE2E.mts`,
  `seedCostCentersE2E.mts`, the base account) and plants nothing new but Mutuo's loan, which its spec already plants,
  and the two dividends of `ring-chart.dividendi.spec.ts`.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| D1 | `expenseSplitSummary.test.ts`: members in settings order with 600 € then 900 € → two parts, 600 first, colours `--chart-2` then `--chart-7`; `unavailable` (one member, or `missing-income`) → null | sort by income |
| D2 | `splitQuotaBody.test.tsx` (RTL): ring's name, a swatch per block; 7 people → 6th, 7th grey | no `ringSwatchAt` |
| M1 | `mortgageSummary.test.ts`: 1.200 interest + 3.000 principal → two parts, `mortgageYearPaid` 4200; 0 interest → null | skip `isRingWhole` |
| M2 | `mutuoTile.test.tsx` (RTL): ring «4200 €» «pagati», two KPI swatches; without settled rows neither ring nor swatch | pass the swatches whatever `ring` |
| I1 | `ownershipRing.test.ts` (new): members, «In comune», «Senza intestatario» grey; −5.000 € → null | return the segments without `isRingWhole` |
| I2 | `intestatariTile.test.tsx` (RTL): ring on «Valore», none after «Carico» is pressed; seven owner rows → the 6th and 7th swatches in `RING_REST_COLOR` | ignore `basis` (first case); `ring[index].color` instead of `ringSwatchAt` (second) |
| K1 | `costCenterSummary.test.ts`: 30 fixed + 240 one-off → two parts; all one-off → null | `>= 0` for a part |
| K2 | `costoTile.test.tsx` (RTL): the ring and «ricorrenti e rate»; the sentence without a ring | render both |
| V1 | `dividendAnalytics.test.ts`: five payers + «Altri 2 strumenti» → six parts; one → null; a sold remainder of −50 € → null | drop the remainder |
| V2 | `pagatoriTile.test.tsx` (RTL): the remainder's grey swatch | colour the remainder by rank |

**Playwright** (each file's project picked by its name, doc/guide/e2e-playwright.md):

- `ring-chart.split{,.mobile}.spec.ts` (split account, «Quest'anno» as `e2e/cashflow.split.spec.ts:31` picks it; at
  390 `#spl-quota-trigger` first): `expectRingFiguresInside(page.getByRole('region', { name: 'Quota' }))`.
- `ring-chart.centri{,.mobile}.spec.ts` (centri account): the «Ornitorinco» detail opened as `e2e/cashflow.centri.spec
  .ts:58-78` opens a centre → a ring in «Costo di Ornitorinco» (30 € fixed, 240 € one-off: «270 €»), containment; the
  «Fenicottero» detail → `[data-ring]` count 0 beside the visible «Tutto una tantum: nessuna spesa ricorrente o a
  rate.» (its instalment is dated 31 December, not booked). The «Fenicottero» test is skipped on December 31st
  (`test.skip(isLastDayOfYear, 'On December 31st the instalment is booked: fixed and one-off, a ring.')`, the guard
  of `e2e/cashflow.centri.spec.ts:30,81`).
- `ring-chart.owners{,.mobile}.spec.ts` (base account; the fund's member and «In comune», doc/guide/patrimonio.md:444;
  at 390 `#patrimonio-intestatari-trigger` first, the «Valore | Carico» switch then inside the open panel):
  the Patrimonio «Intestatari» on «Valore» → containment; «Carico» pressed → count 0; «Valore» pressed back (the
  memory restored for the next spec).
- `e2e/cashflow.mortgage.spec.ts:211-226`: after the existing reads, `expectRingFiguresInside(tile)`.

- `ring-chart.dividendi.spec.ts` (base account, `desktop` project; the base account has no dividends): two
  dividends created through the app's own form, as `e2e/cashflow.dividendi.spec.ts` creates its coupon, on two held
  instruments of the base seed, invented round nets of 300 € and 200 €, note «dividendo ornitorinco»; containment
  in the region «Chi paga di più» (a `desktop:col-span-4` cell: the ring stacked above its rows); both removed in
  `afterAll` through the app's two-click delete, the emulator polled until no document carries the note.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators the split account's «Quota» shows a two-colour ring with the two
incomes' sum in the hole and a swatch before each name; the «Ornitorinco» centre's footer a ring «270 €» with «Fisso
· ricorrenti e rate 30 €» and «Una tantum 240 €», «Fenicottero» today's sentence; the base account's «Intestatari» a
ring on «Valore», bars on «Carico»; a loan with settled instalments a 96px ring «pagati» before its KPIs.

- **A**: `tsc`, lint, Vitest (three zones), the Playwright files of § 6 and the existing specs of criterion 8.
- **B**: emulators + seed (split, centri, base); Mutuo's loan planted by its spec; for phase C two dividends created
  in the app on two held assets of the base account (decoy note «fenicottero»), deleted at G.
- **C (browser, the session)**: the five tiles at 390, 768, 1024 landscape and 1440, light and dark; Divisione's
  period changed (the arcs glide); Intestatari's switch both ways.
- **D (data)**: each ring's `aria-label` shares against the tile's own shares (the Quota's aside «60% · 40%», the
  Centri sentence's «il N%» before the change, the rows' figures).
- **E**: a split period where one person has no income → the remedy reading, no ring; a centre with only recurring
  spending → the sentence form; Dividendi with one payer and nothing sold → today's bars.
- **F (owner, at his «pronto»)**: the mirror — his Divisione, Mutuo, Intestatari, a centre and Dividendi;
  `npm run mirror:remove`.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `mobile:census` + `mobile:budget`, `perf:budget`; remove the planted rows, mirror and scripts.

## 8. Putting it into service

One PR to `develop`, after NOVE-08 is merged. No data change, no payload change (every part is read from summaries
the pages already hold).

## 9. Documentation

- `doc/guide/cashflow-divisione.md` § Per-page blind spots: «the ring's sixth colour is `--chart-4`, the slot of
  «Spese Non Necessarie» on Cashflow: on a household of six the sixth person shares a hue with a spending type»
  (decision 45).
- `DESIGN.md`: the Ring Chart section's last sentence (§ 4), to the letter.
- `doc/guide/cashflow-divisione.md` (Quota), `patrimonio.md` (Mutuo; Intestatari: «the ring only on Valore»),
  `panoramica.md` (Intestatari), `centri-di-costo.md` (THE tile's footer), `cashflow-dividendi.md` («Chi paga di
  più»): one bullet each, with the date; `patrimonio.md` § Per-page blind spots: «a row worth exactly 0 € beside six
  positive ones greys the sixth row's swatch while its arc keeps its colour».
- `doc/guide/grafici.md` § The ring: the five homes, `ringSwatchAt`, and «a ring builder never lives in a module a
  shared narrative imports (`ownershipRing.ts`)».
- `doc/guide/e2e-playwright.md`: the seven new files.
- `CLAUDE.md` › «Latest»; `README.md` (one sentence per tile); `Draft Release Temp.md`; `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **A ring for the «Carico» view of Intestatari**: heir none, declared (the owner named «Valore»).
- **A browser proof at the tablet widths** for the five tiles: heir none, declared (phase C looks at 768 and 1024).
- **The ring inside Analisi**: heir NOVE-10. **The themes' costume of the ring**: heirs NOVE-19, NOVE-20.
- **A largest-part sentence for Mutuo and Centri** (their readings name no largest part): heir none, declared — the
  ring shows it, the sentences stay.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-09-anello-tessere-minori.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-09-anello-tessere-minori.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/grafici.md (§ The ring), cashflow-divisione.md, patrimonio.md, panoramica.md,
  centri-di-costo.md, cashflow-dividendi.md, e2e-playwright.md PRIMA di scrivere codice
- Leggi DESIGN.md (Ring Chart e The Ring Rule, Chart Legend Swatch, The Absence-Has-Three-Names
  Rule) e PRODUCT.md
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

Implementa la spec così com'è scritta, sopra la primitiva della NOVE-08 senza cambiarne il
contratto: i cinque costruttori puri con i loro test, poi
Divisione, Mutuo, Intestatari, Centri di Costo, Dividendi; gli spec Playwright del § 6; la
frase di DESIGN.md alla lettera. I test PRIMA del codice, ciascuno visto rosso con la sua
mutazione; cifre inventate e tonde. Fermati e chiedimi se: una cifra esce dal suo foro;
un test esistente delle cinque tessere diventa rosso; nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina;
perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro), o perf:budget cresce su una route diversa da /dashboard, /dashboard/assets e /dashboard/cashflow. Collaudo: § 7, la F sul mirror al mio «pronto». Un branch, un commit, solo dopo
il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec, but across five areas (Divisione, Patrimonio, Panoramica, Centri
di Costo, Dividendi) on a shared contract: five pure builders and five tile changes, no schema, no payload change. Estimated size: 1 session, ~3,5 h; ~70
lines pure, ~150 across the tiles, ~300 of tests, seven small E2E files.
