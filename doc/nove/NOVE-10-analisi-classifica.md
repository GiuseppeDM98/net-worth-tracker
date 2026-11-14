# NOVE-10 — Analisi recomposed as «Classifica»: the ranking first, the Flusso in «Dettaglio»

> Series `doc/nove/` (README.md § 5): **implemented after NOVE-05 (retired on 2026-11-14, PR #530)** (`readSavings`, the `describeFlow` change)
> **and NOVE-08** (the ring: `lib/utils/ringChart.ts`, `components/ui/ring-chart.tsx`,
> the ring rule in DESIGN.md). Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7 and moves
> with 05 and 08 — reread by function name. Executes the owner's point 5 and decisions 5 and 6 (README.md § 1, § 3).

## 1. The problem today (evidence on the code)

The owner: «di tutte le pagine è quella dove devo sempre andare a cercarmi l'info specifica […] voglio capire quali
spese impattano di più il timeframe di riferimento». The grid's dominant tile is the PERIOD, not the ranking
(`components/cashflow/AnalisiTab.tsx:9-18`, `:863-990`: Periodo 5 × 2 rows · Fuori scala 3 · Spese maggiori 4 /
Spese per categoria 4 · Entrate per categoria 3 / Scheda 12 / Flusso 12):

- **The heaviest rows are five**: `rankTopExpenses(periodExpenses, dayOf, 5, …)` (`AnalisiTab.tsx:498`), each named
  by its category (`lib/utils/analisiSummary.ts:134-156`), never by what it was.
- **What moved is computed and hidden**: the per-category comparison against year−1 feeds ONE mover of the verdict
  (`AnalisiTab.tsx:569-572`); the list lives behind the closed «Confronto annuale» (`ConfrontoDisclosure.tsx:69-72`).
- **The type split is only in the Flusso**: `summarizeFlow` (`analisiSummary.ts:283-323`) feeds the Sankey's reading
  and the phone's bar; the Flusso is a full-width grid tile (`AnalisiTab.tsx:973-990`).
- **Stale labels**: the types read «Spese Necessarie» / «Spese Non Necessarie» since 2026-10-20 (ids unchanged;
  doc/guide/cashflow.md § Expense Sign Convention), yet `SPENDING_TYPE_LABELS` = «Fisse / Variabili / Debiti»
  (`analisiSummary.ts:253-254`), printed by `describeFlow` (`analisiNarrative.ts:529`) and the closed answer
  (`:908-914`); the adjectives «fisse / variabili» (`:511`, comments `:510`, `:514-515`, `:881`); the aside «· fisse
  / variabili / debiti» (`components/cashflow/AndamentoStoricoSection.tsx:209`).
- **A figure can leave its plot**: on the canvas «31.900 €» overflowed the Entrate ring at three columns (decision 6).

## 2. Goal and acceptance criteria

The approved mock (`Analisi-A`, invented figures): at 1440 **Dove vanno i soldi 7 · Spese maggiori 5 / Cosa è
cambiato 5 · Entrate 3 · Periodo 4 / Scheda 12** (only with a focus), then «Confronto annuale» and «Dettaglio» (the
Flusso first in it). Below `desktop:` the same tiles in that DOM order; THE tile is «Dove vanno i soldi».

1. The 1440 grid is the one above; with no comparison and no anomalies «Cosa è cambiato» is absent and the row reads
   Entrate 5 · Periodo 7. **Proof**: `e2e/analisi.spec.ts` G1.
2. «Dove vanno i soldi»: the spending ring by type (centre = the period's spending, legend = the types' printed
   shares) beside the category ranking (8 rows, residual, «Mostra tutte (N)»); the aside toggles «Categorie |
   Sottocategorie»; a row opens the Scheda. **Proof**: K1-K3.
3. «Spese maggiori»: 10 rows, «Mostra altre N» up to 20; a row with a note is labelled by its first line (≤ 48
   characters, «…»), the caption starting with the category. **Proof**: T1-T3.
4. «Cosa è cambiato»: the six categories that moved most against the Periodo's own baseline, ordered by signed delta,
   as bars on a track centred on zero; the reading names the movers that explain the total; the footer names new and
   ceased categories; the month's anomalies are a sentence of it. **Proof**: C1-C4, N2-N6, P1, G2.
5. «Entrate»: a ring of the top three income categories plus «Altre N categorie»; legend rows open the Scheda; the
   printed shares add up to 100. **Proof**: R1, K4.
6. Periodo: three rows (Entrate · Spese · Risparmio) with their deltas, the baseline caption, the bars; its reading is
   `describePeriodoSavings(readSavings(totals.income, totals.expenses))`. **Proof**: N7, G0.
7. **Every ring's centre text lies inside its hole at 390, 768 and 1440** (decision 6), and at 1024 in landscape.
   **Proof**: NOVE-08's `expectRingFiguresInside` (`e2e/ringFit.ts`) in `analisi.mobile.spec.ts`,
   `classifica.tablet.spec.ts`, `analisi.spec.ts`.
8. The Flusso is the first tile inside «Dettaglio», drawn by its cell as today (Sankey from 608px). **Proof**: the
   Flusso tests of § 6, each opening «Dettaglio» first and otherwise unchanged.
9. No «Fisse», «Variabili», «fisse / variabili» on Analisi, comments included. **Proof**: L1, N10; `grep -rniE
   "\bfisse\b|\bvariabili\b" components/cashflow lib/utils/analisi*` finds nothing.
10. The first screen at 390: headline · axis · first sentence · strip «Entrate» «Risparmio» · scope · «Il perché» ·
    «Dove vanno i soldi» open · «Il resto della pagina» · Spese maggiori, Cosa è cambiato, Entrate, Periodo [,
    Scheda] closed; «Risparmio» opens Periodo. **Proof**: `e2e/mobile-composition.analisi.mobile.spec.ts` M1-M2.
11. FlussoTile leaves Analisi's initial JavaScript; `/dashboard/analisi` ≤ 654 KB gz, the ceiling not raised.
    **Proof**: `npm run perf:budget`; `e2e/bundle.lazy{,.mobile}.spec.ts` (§ 6: the chunk arrives at idle, no
    placeholder is ever seen when «Dettaglio» opens).
12. `perf/mobile-budget.json` `analisi` re-measured at 390 / 768 / 1024 (§ 8), every other surface unchanged.
    **Proof**: `mobile:census` + `mobile:budget`.

## 3. Decisions

- **Owner 6 (2026-11-12)**: composition A «Classifica»; «i numeri devono stare dentro il loro grafico» (criterion 7).
- **Owner 5 (2026-11-12)**: ring form A everywhere; a figure that does not fit is abbreviated or moves above — the
  primitive decides (`RingChart` of NOVE-08: `formatRingCenter(centerValue, ringCenterMaxChars(size))`).
- **Owner (2026-11-12, the adversarial reading)**: **36** the old words outside Analisi are renamed here where
  the owner reads them (§ 4 › The old words elsewhere); **47** a ring's centre is never a lifted figure (§ 5, § 9);
  **48** a ring of one part is not drawn — the total stands as the column's hero line; **49** the reading of «Dove
  vanno i soldi» is the categories' in both views; **50** a «senza sottocategoria» row opens its CATEGORY's Scheda,
  and two categories with one name are told apart in the caption; **51** the ranking's bars stay `--chart-1` and
  each row carries its type's swatch.
- **Adopted, reversible**:
  - (a) THE tile below `desktop:` is «Dove vanno i soldi» (the mock's first tile); Periodo becomes a closed row. The
    strip stays «Entrate · Risparmio»; «Risparmio» now opens Periodo.
  - (b) The verdict (`buildAnalisiVerdict`) is unchanged; the mock's headline was illustrative.
  - (c) The anomalies («Fuori scala») become a sentence of «Cosa è cambiato» WHENEVER the page computes them
    (`singleMonth`: a picked month, or today's on the running year), not only on a picked month as the mock's note
    says — the verdict's «Il perché» names them in both cases. They stop being an entry point to the Scheda.
  - (d) Spese maggiori's label is the row's note (the mock's «Caldaia nuova»), else the category.
  - (e) Entrate: three + «Altre»; «Mostra tutte (N)» unfolds the legend to every category (the ring stays), so
    Tracciamento's «Tutte le categorie» link still lands on a full income list.
  - (f) Periodo's coverage clause («per ogni euro speso…») leaves Analisi: the mock's reading is the savings line.
  - (g) FlussoTile becomes a `lazyComponent` of DettaglioDisclosure, preloaded at idle; the Sankey's own preload
    stays at FlussoTile's module evaluation, its query widened to `(min-width: 640px)`.
  - (h) Ring sizes: spending 150px at 1440, 120px below (`sections.compact`); income 120px. The hole holds 7
    characters at both sizes (`ringCenterMaxChars`), so «42.500 €» prints «42,5k €»; the tiles pass the amount and
    never format the centre themselves.
  - (i) The 768 / 1024 proof is a `*.tablet.spec.ts` on the base account with planted rows (the tablet projects
    ignore `/analisi\./`, `playwright.config.ts:238`, `:252`), not a new project.
- **Overturned (2026-11-12)**: the Periodo as THE tile (2026-10-14, guide § Composizione mobile); the tiles «Fuori
  scala», «Spese per categoria», «Entrate per categoria» (2026-08-25); the Flusso as a grid tile and a phone row.

## 4. Solution

### `lib/utils/analisiSummary.ts`

Replaced `SPENDING_TYPE_LABELS` (`:252-253`), the ids (`:444-465`), `selectAnalisiStrip` (`:479-498`); added the
rest (`CategorySlice`, `CompositionSlice` as type imports from `cashflowComposition`; `roundToCents` from `cents`;
`RING_REST_KEY` from `ringChart`).

```ts
export const SPENDING_TYPE_LABELS: Record<SpendingType, string> = {
  fixed: 'Necessarie', variable: 'Non necessarie', debt: 'Debiti',
};
export const TOP_EXPENSES_SHOWN = 10;
export const TOP_EXPENSES_MORE = 20;
const NOTE_LABEL_CHARS = 48;

/** The row's own words when it has them: the first line of its note, cut at 48 characters. */
export function noteLabel(expense: Expense): string | null {
  const line = expense.notes?.split('\n')[0].trim();
  if (!line) return null;
  return line.length > NOTE_LABEL_CHARS ? `${line.slice(0, NOTE_LABEL_CHARS - 1).trimEnd()}…` : line;
}

/** The first `count` rows with their own sum: what the reading speaks of. */
export function limitTopExpenses(top: TopExpenses, count: number): TopExpenses {
  const rows = top.rows.slice(0, count);
  return { ...top, rows, shownTotal: rows.reduce((sum, row) => sum + row.amount, 0) };
}

/** A spending subcategory; a row without one ranks under its category's name. */
export interface SubCategorySlice extends CategorySlice {
  subCategoryKey: string;
  caption: string; // «Casa» under «Condominio»; «senza sottocategoria» under a category's own rows
}

export function buildSubCategoryRanking(expenses: Expense[]): SubCategorySlice[] {
  const buckets = new Map<string, Omit<SubCategorySlice, 'percentage'>>();
  for (const expense of expenses) {
    if (!isSpending(expense)) continue;
    const categoryKey = getCategoryKey(expense);
    const subCategoryKey = getSubCategoryKey(expense);
    const key = `${expense.type}:${categoryKey}:${subCategoryKey}`;
    const none = subCategoryKey === NO_SUBCATEGORY_KEY;
    const bucket = buckets.get(key) ?? {
      key, expenseType: expense.type, categoryKey, subCategoryKey, value: 0,
      name: none ? getCategoryName(expense) : getSubCategoryLabel(expense),
      caption: none ? 'senza sottocategoria' : getCategoryName(expense),
    };
    bucket.value = roundToCents(bucket.value + Math.abs(expense.amount));
    buckets.set(key, bucket);
  }
  const rows = Array.from(buckets.values()).filter((row) => row.value > 0);
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  // Two categories may share a name across types («Casa» necessaria and non necessaria): name the type too.
  const typesByName = new Map<string, Set<SpendingType>>();
  for (const row of rows) {
    const name = row.subCategoryKey === NO_SUBCATEGORY_KEY ? row.name : row.caption;
    typesByName.set(name, (typesByName.get(name) ?? new Set()).add(row.expenseType as SpendingType));
  }
  const qualify = (row: (typeof rows)[number]) => {
    const none = row.subCategoryKey === NO_SUBCATEGORY_KEY;
    const shared = (typesByName.get(none ? row.name : row.caption)?.size ?? 0) > 1;
    if (!shared) return row.caption;
    const type = SPENDING_TYPE_LABELS[row.expenseType as SpendingType].toLowerCase();
    return none ? `senza sottocategoria · ${type}` : `${row.caption} · ${type}`;
  };
  return rows
    .map((row) => ({ ...row, caption: qualify(row), percentage: (row.value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

/** A ring part with its share printed so the legend adds up to 100 on screen; `key` is `RING_REST_KEY` on the rest. */
export interface RingShare { key: string; label: string; value: number; printedPercentage: number; rest: boolean }

/** The first `count` slices and ONE «Altre N categorie» (a single leftover keeps its name). */
export function buildRingShares(slices: readonly CompositionSlice[], count: number): RingShare[] {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (total <= 0) return [];
  const head = slices.length === count + 1 ? slices : slices.slice(0, count);
  const tail = slices.slice(head.length);
  const pct = (value: number) => Math.round((value / total) * 100);
  const shares: RingShare[] = head.map((s) => ({ key: s.key, label: s.name, value: s.value,
    printedPercentage: pct(s.value), rest: false }));
  const restValue = tail.reduce((sum, slice) => sum + slice.value, 0);
  if (restValue > 0) shares.push({ key: RING_REST_KEY, label: `Altre ${tail.length} categorie`, value: restValue,
    printedPercentage: pct(restValue), rest: true });
  // The rounding drift goes on the rest, the row that is a remainder by definition (AGENTS.md); without a rest,
  // on the largest, as `summarizeFlow` does.
  const last = shares[shares.length - 1];
  const drifted = last.rest ? last : shares[0];
  drifted.printedPercentage += 100 - shares.reduce((sum, share) => sum + share.printedPercentage, 0);
  return shares;
}

export const CHANGE_ROWS = 6;

/** `bar` in % of a track centred on zero: a rise right of 50, a fall left of it. */
export interface CategoryChange extends CategoryDeltaRow { bar: { left: number; width: number } }

export interface CategoryChanges {
  rows: CategoryChange[]; // the six largest |delta|, grown first
  totalDelta: number; // `pacing.expenses.delta`: the same window, so every row's delta sums to it
  explainedBy: CategoryDeltaRow[]; // the fewest movers in the total's direction reaching it, ≤ 3; [] at 0 €
  explainedShare: number | null; // their share of the total when three do not reach it
  newLabels: string[];
  goneLabels: string[];
}

export function summarizeCategoryChanges(deltaRows: readonly CategoryDeltaRow[], totalDelta: number): CategoryChanges {
  const byMagnitude = deltaRows.filter((r) => Math.round(r.delta) !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const largest = byMagnitude.slice(0, CHANGE_ROWS);
  const scale = Math.max(0, ...largest.map((r) => Math.abs(r.delta)));
  const rows = [...largest].sort((a, b) => b.delta - a.delta).map((row): CategoryChange => {
    const width = scale > 0 ? (Math.abs(row.delta) / scale) * 50 : 0;
    return { ...row, bar: { left: row.delta >= 0 ? 50 : 50 - width, width } };
  });
  const explainedBy: CategoryDeltaRow[] = [];
  let explainedShare: number | null = null;
  if (Math.round(totalDelta) !== 0) {
    let reached = 0;
    for (const row of byMagnitude.filter((r) => Math.sign(r.delta) === Math.sign(totalDelta)).slice(0, 3)) {
      explainedBy.push(row);
      reached += Math.abs(row.delta);
      if (reached >= Math.abs(totalDelta)) break;
    }
    if (reached < Math.abs(totalDelta)) explainedShare = (reached / Math.abs(totalDelta)) * 100;
  }
  const labels = (status: CategoryDeltaRow['status']) =>
    deltaRows.filter((r) => r.status === status).map((r) => r.label);
  return { rows, totalDelta, explainedBy, explainedShare, newLabels: labels('new'), goneLabels: labels('gone') };
}
```

`rankTopExpenses` (`:125-158`): `TopExpenseRow` gains `note: string | null` (= `noteLabel(expense)`); `captionParts`
becomes `[note ? getCategoryName(expense) : null, day, subCategoryLabel, scheduled ? 'in calendario' : null]` —
«Casa · 14 mar · Condominio». `label` stays the category (the reading and the closed answer read it).

Ids: `ANALISI_PERIODO_ID` deleted; `ANALISI_CLASSIFICA_ID = 'analisi-classifica'` (THE tile); `ANALISI_SECTION_IDS =
{ maggiori: 'analisi-maggiori', cambiato: 'analisi-cambiato', entrate: 'analisi-entrate', periodo: 'analisi-periodo',
scheda: 'analisi-scheda', flusso: 'analisi-flusso' }` (`flusso` is a lift key, never a row). `FlussoLiftedBlock` and
`isFlussoLiftedBlock` move here from `FlussoTile.tsx:81-87` (a value imported from a lazy module puts it back in the
initial graph). `selectAnalisiStrip`: «Entrate» `opens: entrate`, `lifts: { section: periodo, block:
ANALISI_TRIO_BLOCK }`; «Risparmio» `opens: periodo`, `lifts: { section: flusso, block: ANALISI_SAVINGS_BLOCK }`.

### The old words elsewhere (decision 36)

- `lib/utils/settingsNarrative.ts:692-694`: « fissa» / « fisse» → « necessaria» / « necessarie»; « variabile» /
  « variabili» → « non necessaria» / « non necessarie» (the count sentence of Impostazioni › Spese).
- `components/CreateDummySnapshotModal.tsx:261`: «Media delle spese mensili (distribuite tra necessarie, non
  necessarie e debiti)».
- `lib/utils/emailNarrative.ts:635` and `lib/server/monthlyEmailService.ts:151`: the two comments read
  «Necessarie/Non necessarie/Debiti»; the email's labels already come from `EXPENSE_TYPE_LABELS`
  (`monthlyEmailService.ts:1051`), so only the fixture of `__tests__/emailNarrative.test.ts:520-526` is relabelled.
- `components/expenses/ExpenseDialog.tsx:1140`, `:1374`: the two JSX comments, same words.

### `lib/utils/analisiNarrative.ts`

`SPENDING_TYPE_ADJECTIVES` (`:511`) = `{ fixed: 'necessarie', variable: 'non necessarie', debt: 'di debito' }`, the
comments at `:510`, `:514-515`, `:881` follow («Necessarie 58%, non necessarie 37%, debiti 5%.»). `describeFlow`
(its signature in README.md § 7) is called by AnalisiTab, which passes `reading: describeFlow(flow, readSavings(totals.income,
totals.expenses))` inside DettaglioDisclosure's `flusso` prop; DettaglioDisclosure computes no sentence.
`ANALISI_CLOSED_ASIDES` = `{ maggiori: 'per importo', entrate: 'per categoria', periodo: 'entrate e spese' }`.
Deleted: `describeAnomalies`, `describeAnomaliesAnswer`, `describeTypesFlowAnswer`, `describeRolesFlowAnswer`,
`largestPrinted`. Added (`describeCategoryShare` from `cashflowNarrative`, `SavingsReading` from `savingsRate`):

```ts
const SPENDING_TYPE_SUBJECTS: Record<SpendingType, string> = {
  fixed: 'le spese necessarie', variable: 'le spese non necessarie', debt: 'i debiti',
};

/** «Il 31% va in Casa; le prime tre fanno il 63%; le spese necessarie sono la metà.» */
export function describeSpendingRanking(ranking: CategoryRanking, flow: FlowSummary): Narrative | null {
  const share = describeCategoryShare(ranking, 'expenses');
  if (!share) return null;
  const last = share.length - 1; // the share's own «.» gives way to the type clause
  const narrative = share.map((s, i) => (i === last ? { ...s, text: s.text.replace(/\.$/, '') } : s))
    .filter((s) => s.text !== '');
  const [largest] = flow.typeShares;
  if (flow.typeShares.length === 1) narrative.push(prose(`; tutte spese ${SPENDING_TYPE_ADJECTIVES[largest.type]}`));
  else if (largest) narrative.push(prose(`; ${SPENDING_TYPE_SUBJECTS[largest.type]} sono `),
    // `shareInWords` says «quasi tutto» from 85%: here the subject is plural («quasi tutte», «quasi tutti»).
    ...(Math.round(largest.printedPercentage) >= 85
      ? [prose(largest.type === 'debt' ? 'quasi tutti' : 'quasi tutte')]
      : shareInWords(largest.printedPercentage)));
  narrative.push(prose('.'));
  return narrative;
}

/** «Viaggi e Casa spiegano tutto l'aumento.» · «… spiegano il 70% dell'aumento.» · «Spese in linea; …» */
export function describeCategoryChanges(changes: CategoryChanges): Narrative {
  if (changes.rows.length === 0) return [prose('Nessuna categoria si è mossa.')];
  if (changes.explainedBy.length === 0) {
    const top = [...changes.rows].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
    return [prose(`Spese in linea; a muoversi di più è ${top.label} (`),
      signed(signedEuro(top.delta), spendingSign(top.delta)), prose(').')];
  }
  const names = listInWords(changes.explainedBy.map((row) => row.label));
  const verb = changes.explainedBy.length === 1 ? 'spiega' : 'spiegano';
  const rising = changes.totalDelta > 0;
  if (changes.explainedShare === null) return [prose(`${names} ${verb} tutto ${rising ? "l'aumento" : 'il calo'}.`)];
  return [prose(`${names} ${verb} `), ...percentWithArticle(changes.explainedShare),
    prose(` ${rising ? "dell'aumento" : 'del calo'}.`)];
}

/** «Nuove nel 2026: Asilo. Cessate: Palestra. Tutte le voci nel Confronto annuale.» */
export function describeChangesFooter(changes: CategoryChanges, inPeriod: string): string {
  const parts: string[] = [];
  if (changes.newLabels.length > 0) parts.push(`Nuove ${inPeriod}: ${listInWords(changes.newLabels)}.`);
  if (changes.goneLabels.length > 0) parts.push(`Cessate: ${listInWords(changes.goneLabels)}.`);
  return [...parts, 'Tutte le voci nel Confronto annuale.'].join(' ');
}

/** «A novembre fuori scala sulla media dei 6 mesi precedenti: Ristoranti (+80%) e Auto (+40%).» */
export function describeChangesAnomalies(anomalies: SpendingAnomaly[], month: MonthRef | null,
  period: AnalisiPeriod): Narrative | null {
  if (anomalies.length === 0 || !month) return null;
  const isThePeriod = period.month === month.month && period.year === month.year;
  const lead = isThePeriod ? 'Fuori scala' : `${capitalise(monthWithPrepositionA(month.month))} fuori scala`;
  const narrative: Narrative = [prose(`${lead} sulla media dei 6 mesi precedenti: `)];
  anomalies.forEach((anomaly, index) => {
    if (index > 0) narrative.push(prose(index === anomalies.length - 1 ? ' e ' : ', '));
    narrative.push(prose(`${anomaly.categoryLabel} (`),
      signed(`+${formatPercentage(anomaly.deltaPercent, 0)}`, 'negative'), prose(')'));
  });
  narrative.push(prose('.'));
  return narrative;
}

/** The Periodo's reading: below the floor in euros, never a percentage. */
export function describePeriodoSavings(reading: SavingsReading): Narrative | null {
  if (reading.kind === 'none') return null;
  if (reading.kind === 'no-income') {
    return [prose('Nessuna entrata: '), figure(euro(reading.spending)), prose(' di spese coperti dal patrimonio.')];
  }
  if (reading.kind === 'deficit') {
    return [prose('Le spese superano le entrate di '), figure(euro(reading.deficit)), prose('.')];
  }
  const rounded = Math.round(reading.rate);
  if (rounded === 0) return [prose('Entrate e spese si pareggiano.')];
  if (rounded > 0) return [prose('Hai messo da parte '), ...percentWithArticle(reading.rate), prose(' delle entrate.')];
  return [prose(`Le spese superano le entrate ${ofThePercent(-reading.rate, 0)}`),
    figure(formatPercentage(-reading.rate, 0)), prose('.')];
}
```

`describeAnalisiClosedAnswers(input: { topExpenses; changes: CategoryChanges | null; anomalies; incomeRanking;
savings: SavingsReading })`: `maggiori` and `entrate` as today; `cambiato` = the largest-|delta| row «{label}» +
`signed(signedEuro(delta), spendingSign(delta))`, else the first anomaly «{categoryLabel} +80%» (negative), else
null; `periodo` = «messo da parte » + the rate's figure when the reading is a rate rounding above 0, else null.

### Components

- **`components/cashflow/analisi/tiles/ClassificaTile.tsx`** (new; replaces `tiles/CategorieTile.tsx`, deleted, taking
  its `VISIBLE_ROWS` = 8, residual and «Mostra tutte»). Props: `eyebrow` «Dove vanno i soldi · {periodLabel}»,
  `ariaLabel` «Dove vanno i soldi», `id` `ANALISI_CLASSIFICA_ID`, `categories`, `subCategories`, `typeShares`,
  `spending`, `ringSize: 150 | 120`, `reading` (ONE, the categories': `describeCategoryShare` — it does not
  change with the toggle, decision 49), `activeKey`, `onSelect(target: EntitySearchTarget)`. Aside:
  `AsideToggle` «Categorie» | «Sottocategorie» (`ariaLabel` «Raggruppa la classifica», local state). The body is a
  `@container`: from `@[520px]` the ring column (the ring, then the type legend: a `<ul aria-label="Spese per tipo">` of
  inert `<li>`, each an 8×8 swatch `EXPENSE_TYPE_COLOR_VAR[type]`, the label and the mono `printedPercentage` «51%»,
  no amount) with `RankedRows` (`var(--chart-1)`) beside; below, ring and legend side by side, the
  ranking under. Every ranking row carries `swatch: EXPENSE_TYPE_COLOR_VAR[row.expenseType]` (decision 51):
  NOVE-08's `RankedRow.swatch` (README.md § 7 › The ring), here with the bars kept (`bars` stays its default
  `true`): the 8×8 square before the label is the key to the type legend beside the ring. With ONE type in the period
  (`typeShares.length === 1`) the ring is not drawn (The Ring Rule: one part is a sentence; decision 48): the ring
  column holds the total as a hero line — `formatCurrency(spending)` in `font-mono text-[22px] tabular-nums`, «spese»
  under it in the eyebrow's class — above the single legend row; `EntrateTile` does the same with one income
  category («entrate»). `RingChart({ segments: typeShares.map((s) => ({ key: s.type, label: s.label, value: s.amount, color:
  EXPENSE_TYPE_COLOR_VAR[s.type] })), centerValue: spending, centerLabel: 'spese', ariaLabel: 'Spese per tipo',
  size: ringSize })` — the primitive abbreviates the centre and appends the parts to the name; «spese», a noun: on
  a running year the total holds the rows still in the calendar (The Scheduled-Is-Not-Spent Rule), which the
  verdict's scope declares. Residual
  «Altre N categorie» / «Un'altra categoria» («sottocategorie» in that view; sub rows carry `caption`). A sub row's `onSelect` target is its subcategory; a «senza sottocategoria» row's is its CATEGORY
  (`{ expenseType: row.expenseType, categoryKey: row.categoryKey }`, an `EntitySearchTarget` without `subCategoryKey` —
  decision 50: the Scheda of a subcategory that does not exist would be empty). Footer «Una
  riga apre la scheda della categoria.» («della sottocategoria o, dove manca, della categoria»), «Mostra tutte (N)» / «Mostra meno»
  (`aria-expanded`). Empty: «Nessuna spesa registrata nel periodo.»
- **`tiles/SpeseMaggioriTile.tsx`**: `label: row.note ?? row.label`; the first `TOP_EXPENSES_SHOWN` rows, then «Mostra
  altre {n}» / «Mostra meno» (`aria-expanded`); aside «{shown} di {count}»; reading
  `describeTopExpenses(limitTopExpenses(top, shown))` («Le dieci più grandi fanno …»).
- **`tiles/CambiatoTile.tsx`** (new; replaces `tiles/FuoriScalaTile.tsx`, deleted): eyebrow «Cosa è cambiato», aside
  AnalisiTab's `comparisonPhrase` («su 2025 (2 mesi ancora in calendario)» on a running year; the anomaly month's
  label without a comparison; the same words closed), reading
  `describeCategoryChanges` (or the anomaly sentence alone). Rows: a `<ul>` of `<button>`s (`useRovingFocus`), each
  label (118px floor, «nuova» / «cessata» as a muted caption by `status`) · an 8px track with a 1px `--border` centre
  line, the bar at `bar.left` / `bar.width` % in `var(--destructive)` (rise) or `var(--positive)` (fall) · the
  signed mono euro in the same sign class; the button's name is its text; a click lands on the category. Then
  `describeChangesAnomalies` (13px), then `TileMethodNote` (`subject` «Cosa è cambiato», `summary` =
  `describeChangesFooter(changes, inPeriod)`) with: «Le categorie di spesa del periodo contro la stessa finestra
  dell'anno prima: le sei che si sono mosse di più, a destra quelle cresciute, a sinistra quelle calate.» · «Fuori
  scala: una categoria sopra la sua media dei 6 mesi precedenti di oltre il 25% e di 50 €, misurata su un mese solo.»
- **`tiles/EntrateTile.tsx`** (new): eyebrow «Entrate», reading `describeCategoryShare(incomeRanking, 'income')`,
  `RingChart` of `buildRingShares(incomeSlices, 3)` mapped to `RingSegment`s (`RING_CATEGORY_COLORS` by rank, the
  rest `RING_REST_COLOR`), `centerValue: incomeTotal`, `centerLabel: 'entrate'`, `ariaLabel: 'Entrate per
  categoria'`, 120px; legend rows are buttons («{label}, {amount}, {share}%», the
  rest inert); «Mostra tutte (N)» lists `buildRingShares(incomeSlices, incomeSlices.length)`, forced open when the
  focused category is hidden. Empty: «Nessuna entrata registrata nel periodo.»
- **`tiles/PeriodoTile.tsx`**: `CashflowKpiTrio` → three rows (label 13px · mono amount 13px · delta «↑ 5,3%» mono
  11px in `deltaClass(delta, positiveGood)` — `false` on Spese, The Sign-Color Token Rule — and «invariate» muted at
  0,0%), Risparmio by `formatEuroMinus` and without a delta; the rows print neither the savings rate nor the
  coverage ratio as figures (the rate is the reading's, the coverage leaves Analisi, § 3 (f)); the `trio` block = the amounts, the spending delta and the baseline
  caption under `LIFTED_FIGURE_CLASS`; reading `describePeriodoSavings`; `collapse` / `asideWhenClosed`; bars
  `max-desktop:min-h-[120px] desktop:min-h-[72px]`. `CashflowKpiTrio` loses `expensesDeltaLifted` (no caller left).
- **`analisi/DettaglioDisclosure.tsx`**: gains `flusso: Omit<FlussoTileProps, 'isMobile' | 'className'> | null`; owns
  `FLUSSO_SANKEY_MIN_CELL` and the cell measure (from `AnalisiTab.tsx:199-200`, `:410-416`); `FlussoTile` =
  `lazyComponent(() => import('./tiles/FlussoTile').then((m) => m.FlussoTile))` at module level, in
  `DETTAGLIO_LAZY_CHARTS` (`:14`), fallback `<Skeleton className="min-h-[360px] sm:min-h-[600px] rounded-2xl" />`;
  rendered first, only with a flow. Trigger line: «Il flusso del periodo e il risparmio mese per mese» («Il flusso,
  il risparmio e i flussi nel tempo» in history); without a flow, today's lines.
- **`tiles/FlussoTile.tsx`**: `collapse` and its aside deleted; `SANKEY_DRAWN_QUERY` = `'(min-width: 640px)'`;
  `FlussoTileProps` exported (a type).
- **`components/cashflow/AnalisiTab.tsx`**: `ANALISI_SECTIONS` = Spese maggiori · Cosa è cambiato · Entrate · Periodo
  · Scheda (`cambiato` present iff `changes !== null || anomalies.length > 0`); a `comparisonRows` memo
  (`buildCategoryComparison`, as `:568-571`) feeds `movers` and `changes = pacing ?
  summarizeCategoryChanges(comparisonRows, pacing.expenses.delta) : null`; `rankTopExpenses(…, TOP_EXPENSES_MORE,
  …)`. Grid: Classifica in `LEAD_CELL_CLASS` `desktop:col-span-7`; in `INDEX_CLASS` `PageRest`, Maggiori 5, Cambiato
  5, Entrate 3 (5 without Cambiato), Periodo 4 (7), Scheda 12 (`desktop:col-span-*`). `SKELETON_CELLS` (span/lines)
  7/9 · 5/10 · 5/6 · 3/5 · 4/5. `resetFocus` without an opener focuses `ANALISI_REST_BUTTON_ID`. The header comment
  (`:1-42`) is rewritten; `handlePeriodModeChange` stays after `availableYears` (React Compiler).
- **Labels**: `AndamentoStoricoSection.tsx:209` → «· necessarie / non necessarie / debiti»; the comments
  `AndamentoStoricoCharts.tsx:155`, `lib/utils/cashflowTimeSeries.ts:312`,
  `components/cashflow/analisi/SpendingTypesMobileFlow.tsx:8-9` («necessarie 53%, non necessarie 37%, debiti 10%»);
  the test name `__tests__/cashflowTimeSeries.test.ts:194`.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **One source per number, every sentence in `analisiNarrative.ts`** (AGENTS.md § Analisi): tiles format money only
  through `cachedFormatCurrencyEUR` (a ring's centre is formatted by `RingChart`); a component holds no Italian beyond the strings of § 4.
- **A list that must add up adds up ON SCREEN** (AGENTS.md :672): both legends print `printedPercentage`.
- **The ring rule (decision 5)**: parts of ONE positive whole — spending by type, income by category; never «Cosa è
  cambiato» (signed) nor Periodo (README.md § 10).
- **A spending rise is a loss** (The Sign-Color Token Rule): «Cosa è cambiato» uses `--destructive` / `--positive`,
  never a chart slot; a chart slot is not a text colour (AGENTS.md :148).
- **The Lifted-Figure / Closed-Row Rules**: the ring's centre is THE tile's hero, never lifted — and no ring's centre
  ever is (decision 47; the rule's amendment in § 9): the centre is the total its arcs add up to, and a ring without
  it is a legend without a sum, so `liftedBlocks` never names a ring's centre, on this page or another; Periodo's `trio` stays
  lifted by «Entrate», the Flusso's `risparmio` by «Risparmio»; Cambiato's closed aside is words, its answer ONE figure.
- **Lazy the PLOT, never the section that owns the trigger** (AGENTS.md § Dynamic Imports): Dettaglio's trigger stays
  static, FlussoTile is content, only types come from it. `@[520px]:flex-row` has no `desktop:` twin (AGENTS.md :85).
- **Ids stay `fixed` / `variable`**: «necessarie» matches both types (doc/guide/cashflow.md :120): a test asserts a
  whole label (`/^Necessarie\s*49%$/`). The phone's memory filters unknown ids on read (`resolveOpenSections`).
- **Figures invented and round**; the canvas mock's figures never enter a fixture.

## 6. Tests per level (with the mutation that proves each)

| # | Test (`__tests__/`) | Mutation that turns it red |
| --- | --- | --- |
| L1 | `analisiSummary.test.ts:269` → `['Necessarie', 'Non necessarie', 'Debiti']` | the old labels |
| T1-T3 | 25 rows → 20; `limitTopExpenses(top, 10).shownTotal`; note «Caldaia nuova» → label, caption «Casa · 14 mar»; 60 chars → 48 with «…» | drop `note` / the cut |
| L2 | `settingsNarrative.test.ts:713` → «14 categorie: 4 di entrate, 4 necessarie, 5 non necessarie e 1 di debito; 8 con sottocategorie.»; one of each → «1 necessaria», «1 non necessaria»; `emailNarrative.test.ts:520-526` relabelled → «Spese Necessarie 1640 € (54,7%) · Spese Non Necessarie 1180 € (39,3%) · Debiti 180 € (6,0%).» | the old adjectives |
| S1b | `buildSubCategoryRanking`: «Casa» as a necessaria and as a non necessaria category, each with rows without subcategory → captions «senza sottocategoria · necessarie» and «senza sottocategoria · non necessarie»; one «Casa» only → «senza sottocategoria» | never qualify |
| K5 | `classificaTile.test.tsx`: in «Sottocategorie» a click on a «senza sottocategoria» row calls `onSelect` with a target that has no `subCategoryKey`; the reading's text is the same before and after the toggle; every ranking row holds one `aria-hidden` swatch whose colour is its type's; with one type no `role="img"` ring and the total «2.000 €» with «spese» | select the subcategory key; a reading per view; drop `swatch`; draw the ring |
| S1 | `buildSubCategoryRanking`: «Condominio» under two categories = two rows; no subcategory → «Casa», «senza sottocategoria» | key without the category |
| R1 | `buildRingShares` 700/700/700/100/100 (count 3) → three named at 30 and «Altre 2 categorie» at 10 (9 before the drift), printed sum 100; four slices → four named, no «Altre» | drop the drift; the drift on the largest |
| C1-C4 | Casa +40, Palestra −60 (gone), Alimentari −100, total −120 → order +40, −60, −100, `explainedBy` Alimentari + Palestra, share null (C1); +500/+400/+300 on +1300 → 92,3 (C2); total 0 → [] (C3); Alimentari −150, Palestra −30, Casa +60 on −120 → `explainedBy` Alimentari alone, share null (C4) | order by magnitude (C1); no `break` (C4) |
| S2 | `selectAnalisiStrip`: «Risparmio» opens `analisi-periodo`, lifts the Flusso's block | the old `opens` |
| N1 | «Il 40% va in Casa; le prime tre fanno il 70%; le spese necessarie sono la metà.»; one row → «Tutto in Casa; tutte spese necessarie.»; a largest type at 90% → «…; le spese necessarie sono quasi tutte.» | keep the share's «.»; `shareInWords` at 90% |
| N2-N4 | «Alimentari e Palestra spiegano tutto il calo.»; «Viaggi, Casa e Cibo spiegano il 92% dell'aumento.»; «Spese in linea; a muoversi di più è Casa (+40 €).»; one mover reaching a +40 € total → «Casa spiega tutto l'aumento.» | a fixed plural verb (the last case) |
| N5 | «Nuove nel 2026: Asilo. Cessate: Palestra. Tutte le voci nel Confronto annuale.» | drop the new list |
| N6 | «A novembre fuori scala sulla media dei 6 mesi precedenti: Ristoranti (+80%) e Auto (+40%).»; on the period «Fuori scala …» | always the month |
| N7 | 2000/1400 «Hai messo da parte il 30% delle entrate.»; 3/500 «… di 497 €.»; 1000/1300 «… del 30%.»; 1000/1000; 0/500 | a % for a deficit |
| N8 | closed answers: cambiato «Alimentari −100 €», periodo «messo da parte 61%»; no `analisi-flusso` / `analisi-fuori-scala` | the old keys |
| N10 | `analisiNarrative.test.ts:407-463` relabelled «Necessarie 58%, non necessarie 37%, debiti 5%.»; the `FLOW` fixture of `:834-835` relabelled for the closed-answers cases that stay | the old adjectives |
| K1-K3 | `classificaTile.test.tsx` (RTL): centre «42,5k €» for 42.500 € at 150px, three legend rows; toggle → «Condominio» captioned «Casa»; click → `onSelect` with `subCategoryKey` | swap the views |
| K4 | `entrateTile.test.tsx` (RTL): the legend's printed shares sum to 100; «Mostra tutte (N)» lists every category with the ring still drawn | list only the head |
| T4 | `speseMaggioriTile.test.tsx` (RTL): 14 rows → 10 shown, aside «10 di 14», reading «Le dieci più grandi…»; «Mostra altre 4» → 14 shown, `aria-expanded` true, aside «14 di 14»; 7 rows → no toggle | read `top.rows.length` for the aside |
| P1 | `cambiatoTile.test.tsx` (RTL): a rise's bar starts at 50%, a fall's ends at 50%; «Palestra cessata −60 €» named | mirror the bar |

The `describeAnomalies`, Flusso-answer and `fuoriScala` cases of `analisiNarrative.test.ts` leave with their code.

Playwright (`e2e/`; planted rows by the Firestore REST PATCH of `e2e/analisi.spec.ts:350-371`, removed after):
- **`ringFit.ts`** is NOVE-08's: `expectRingFiguresInside(scope: Locator)` on the tile's region (every
  `[data-ring]` inside it: the four corners of the centre within the hole, at most `data-ring-max-chars`
  characters). Seen red once with `ringCenterMaxChars` returning 12.
- **`analisi.spec.ts`** (fixture: Casa 380 + Alimentari 400 against 340 + 500 + Palestra 60): G0 the Periodo rows
  (`2000 €`, `780 €`, `1220 €`, «↓ 13,3%», «↑ 5,3%») and «Hai messo da parte il 61% delle entrate.»; G1 the grid;
  G2 «Alimentari e Palestra spiegano tutto il calo.», buttons Casa, Palestra, Alimentari, «Cessate: Palestra.», a
  click lands on Alimentari's Scheda; regions «Dove vanno i soldi», «Entrate»; Storico → no «Cosa è cambiato»; the
  Flusso tests (`:300-340`) open «Dettaglio» first. «Both rings fit» is the file's LAST `test.describe('the rings
  fit')`: the fixture has one income category (no Entrate ring), so its `beforeAll` plants ONE second income row by
  the REST PATCH (id `e2e-exp-ring-fenicottero`, `type: 'income'`, `categoryId: 'e2e-cat-rimborsi'`, `categoryName:
  'Rimborsi'`, `amount: 500`, January of the current year at noon UTC, note «fenicottero») and its `afterAll` deletes
  it and checks the 404; no other test of the file sees it.
- **`analisi.mobile.spec.ts`**: order `['Dove vanno i soldi', 'Spese maggiori', 'Cosa è cambiato', 'Entrate',
  'Periodo']`; the Flusso via «Dettaglio»; legends `/^Non necessarie\s*51%$/`, `/^Necessarie\s*49%$/`; «both rings
  fit» in the same last `describe` with the same planted row, `#analisi-entrate-trigger` opened before
  `expectRingFiguresInside` on the «Entrate» region.
- **`mobile-composition.analisi.mobile.spec.ts`**: M1 criterion 10's first screen, the strip cell «…, apre Periodo»;
  M2 Periodo opened from «Risparmio»: the amounts and «↓ 13,3%» hidden (the `trio` block «Entrate» lifts), «↑ 5,3%»
  and «Hai messo da parte il 61% delle entrate.» shown; Scheda tests start from THE tile.
- **`bundle.lazy.spec.ts`**: a new test on Rendimenti's pattern (`:36-61`) — `e2e/chunkProbe.ts` gains
  `FLUSSO_TILE_SIGNATURE = 'function FlussoTile'`; the chunk is not in Analisi's initial requests and arrives at idle
  before anything is opened; a `MutationObserver` proves no fallback is ever in the DOM when «Dettaglio» opens. The
  Sankey test (`:63-91`) stays, opening «Dettaglio» first and holding the Sankey chunk as today.
  `bundle.lazy.mobile.spec.ts` opens «Dettaglio» instead of `#analisi-flusso-trigger`; `settings.roles.spec.ts` opens
  «Dettaglio» after the first navigation and again after `goForward()` (Analisi remounts with it closed).
- **`classifica.tablet.spec.ts`** (new; `tablet` + `tablet-landscape`, account `test-user-1`): `beforeAll` plants by
  REST PATCH two rows dated today at noon UTC — `e2e-exp-classifica-ornitorinco-in` (`type: 'income'`, `categoryId:
  'e2e-cat-ring-extra'`, `categoryName: 'Extra'`, `amount: 42500`) and `e2e-exp-classifica-ornitorinco-out` (`type:
  'debt'`, `categoryId: 'e2e-cat-ring-debt'`, `categoryName: 'Rata'`, `amount: -300`), both noted «ornitorinco» —;
  `afterAll` deletes both and checks the 404. Both rings fit at 768 and at 1024 (Entrate opened from its row; the
  seed's one income category «Stipendio» and two spending types make the rings two categories and three types).
- **Rewritten with the composition** (found by test name; the lines are develop's): `analisi.spec.ts` `:80-104` (G1
  replaces the grid test), `:110` / `:123` and `:232-239` on the region «Dove vanno i soldi» (the last asserting that
  «Entrate» and «Dove vanno i soldi» keep their rows with the Scheda open), `:167` on «Cosa è cambiato»;
  `analisi.mobile.spec.ts` `:68-87` (the new order), `:116-124` from THE tile, every Flusso test (`:89-114`,
  `:144-190`, `:243-273`) opening «Dettaglio» instead of `#analisi-flusso-trigger`, its legends and reading relabelled
  («Non necessarie 51%, necessarie 49%», `/^Non necessarie\s*100%$/`);
  `mobile-composition.analisi.mobile.spec.ts:89-118` becomes M1-M2 (no «61,0%» figure).

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the analisi fixture at 1440 the ranking with its ring leads; «Cosa è cambiato»
reads «Alimentari e Palestra spiegano tutto il calo.»; Spese maggiori labels the Condominio row «rata condominio»;
the Flusso opens inside «Dettaglio» as a Sankey; at 390 ring and legend sit side by side and «Risparmio» opens
Periodo; no centre leaves its hole at any width.

- **A**: `npx tsc --noEmit`, lint, Vitest (`Europe/Rome`, machine zone, `TZ=UTC`), § 6's specs, criterion 9's grep.
- **B**: emulators + `emulators:seed` + the analisi seed; planted: an income of 42.500 € this month, a spending row
  noted «quokka», a second income category «fenicottero».
- **C (browser, the session)**: 390, 768, 1024×768, 1440 in every axis mode; the Scheda from each entry point;
  «Mostra altre», «Mostra tutte», «Sottocategorie»; «42.500 €» abbreviated inside its hole.
- **D (data)**: the ranking sums to the verdict's spending; Cambiato's deltas sum to Periodo's spending delta.
- **E**: the history (no «Cosa è cambiato»: Entrate 5 · Periodo 7), a month not started, transfers only.
- **F (owner, at his «pronto»)**: the mirror — the running year and a picked month, tile by tile.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `perf:build` → `perf:budget`; `mobile:census` + `mobile:budget`; fixtures, mirror and scripts removed.

## 8. Putting it into service

One PR to `develop`, no data change. `perf/mobile-budget.json` `analisi` at 390 / 768 / 1024: every key re-measured
on the census build and written as measured, `raisedBy` «2026-11-12: Analisi «Classifica» — LA tessera è la
classifica con l'anello per tipo (la classifica resta intera: The First-Screen Rule), Periodo diventa una riga, il
Flusso entra in «Dettaglio»; misura prima/dopo in doc/guide/prima-schermata-misure.md». Expected at 390: `screens`
and `figuresOutsideVerdict` up (today 1.86 and 5), `firstClosedRowAbovePill` and `overflowX` false as today.
`scripts/mobileCensus.mjs`'s «Raggruppa il flusso» probe (`:205-209`) is removed with its comment: the Flusso
no longer sits in the composition. `perf/budget.json` `/dashboard/analisi` keeps 654 (653,1 today, expected lower). Stop if another surface moves or
`perf:budget` reads above 654.

## 9. Documentation

- `doc/guide/impostazioni.md`: the categories' count sentence reads «necessarie / non necessarie» (decision 36).
  `components/ui/ranked-rows.tsx`, the doc comment of `swatch` (NOVE-08's «The arc's colour when the list is a
  ring's legend») becomes «The colour this row is keyed to in a legend the host draws (a ring's arc, a type)»
  (decision 51).
- **DESIGN.md** (decision 16), to the letter:
  - `:545` BEFORE «On Analisi: Periodo 5 (2 rows) · Fuori scala 3 · Spese maggiori 4 / Spese per categoria 4 ·
    Entrate per categoria 3 / Scheda 12 (only with a focus) / Flusso 12, with «Confronto annuale» and «Dettaglio» as
    two disclosures below the grid (one tile each; three in history mode); without a month to run on (a past year,
    the history) Fuori scala is absent and Spese maggiori takes 7.» AFTER «On Analisi: Dove vanno i soldi 7 · Spese
    maggiori 5 / Cosa è cambiato 5 · Entrate 3 · Periodo 4 / Scheda 12 (only with a focus), with «Confronto annuale»
    and «Dettaglio» as two disclosures below the grid (Dettaglio holds the Flusso, then one tile; three in history
    mode); without a comparison and without the month's anomalies Cosa è cambiato is absent, Entrate takes 5 and
    Periodo 7.»
  - `:545` BEFORE «A tile that may be absent (Costi, Obiettivi, Fuori scala, and the Assistente tile when the flag is
    off)» AFTER «A tile that may be absent (Costi, Obiettivi, Cosa è cambiato, and the Assistente tile when the flag
    is off)».
  - `:567` BEFORE «in the index it is a phone's width (the Flusso draws bar and rows there).» AFTER «in the index it
    is a phone's width (a tile there draws what it draws on a phone).»
  - `:739` BEFORE «that appears under the two category tiles the moment a row, an anomaly, a top expense, a Sankey
    node, the search or a Confronto row selects an entity» AFTER «that appears under the grid's second row the
    moment a ranking row, a top expense, a row of «Cosa è cambiato», an income row, a Sankey node, the search or a
    Confronto row selects an entity»; BEFORE «The category tiles keep their place and their rows while the Scheda is
    open» AFTER «The ranking («Dove vanno i soldi») and «Entrate» keep their place and their rows while the Scheda
    is open».
- **`doc/guide/cashflow-analisi.md`**: «Fuori scala» becomes the anomaly sentence of «Cosa è cambiato»; § Composizione
  mobile: THE tile, the strip, the lifted blocks, the rows and closed answers, the Flusso in Dettaglio, § 8's
  measures; § Files: the new tiles, `classifica.tablet.spec.ts`.
- **DESIGN.md → The Lifted-Figure Rule** (`:569`, decision 47): BEFORE «A reading, a ranking row and a ledger that
  adds up to the euro are never lifted, and THE tile's hero never is» AFTER «A reading, a ranking row, a ledger that
  adds up to the euro and a ring's centre (the total its arcs add up to — The Ring Rule) are never lifted, and THE
  tile's hero never is».
- **DESIGN.md → Ring Chart** (NOVE-08's section, its «Homes:» sentence as NOVE-09 leaves it): one sentence is
  appended after it — «Analisi draws two: «Dove vanno i soldi» (the spending by type) and «Entrate» (the first three
  categories and the rest).»
- **AGENTS.md** § Analisi `:391` «the Flusso inside «Dettaglio», lazy (2026-11-12)»; **CLAUDE.md** the Analisi line
  and «Latest»; **README.md** `:72-73`; `doc/guide/velocita.md` § Registro; `doc/guide/prima-schermata-misure.md`;
  `Draft Release Temp.md` (the Analisi entry); `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The verdict's wording** (the mock's headline): none, declared — the builder is unchanged.
- **The old type words in the AI prompts** (the periodic email's format contract, `lib/server/assistant/
  prompts.ts:844`, and the comment `:515`): heir NOVE-15 (decision 36).
- **The other rings** (Tracciamento, Panoramica, the minor tiles): NOVE-08, NOVE-09.
- **The themes' page-by-page dress of Analisi**: NOVE-11 → NOVE-20 (README.md § 5).

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-10-analisi-classifica.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-10-analisi-classifica.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/cashflow-analisi.md, cashflow.md, shell.md, prima-schermata.md,
  prima-schermata-misure.md, velocita.md, e2e-playwright.md e grafici.md (§ The ring) PRIMA di
  scrivere codice
- Leggi DESIGN.md (The First-Screen Rule, The Lifted-Figure Rule, The Closed-Row Rule,
  la regola dell'anello, Ranked Rows with Residual, Scheda inside the Grid) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: le funzioni pure di analisiSummary.ts e
analisiNarrative.ts con i loro test; le etichette dei tipi; le tessere (Classifica, Spese
maggiori, Cosa è cambiato, Entrate, Periodo); il Flusso pigro dentro «Dettaglio»; la griglia
e la composizione mobile di AnalisiTab; le spec Playwright (con e2e/ringFit.ts della spec
dell'anello); gli emendamenti di DESIGN.md alla lettera. I test PRIMA del codice, ciascuno visto rosso con la sua mutazione;
cifre inventate e tonde. Fermati e chiedimi se: un centro d'anello esce dal suo foro; perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina (analisi è la voce nominata: la riregistri con raisedBy); diventa rosso un test esistente che il § 6 della spec non nomina.
Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec on a composed page: a new first screen, a bundle move under
`perf:budget`, four DESIGN.md amendments and a dozen Playwright touch points. Estimated size: 1 long session, ~6 h (decision 35: one branch, one commit; resumed on the same branch, without committing, when the context runs out);
~200 lines pure, ~450 of components, ~600 of tests.
