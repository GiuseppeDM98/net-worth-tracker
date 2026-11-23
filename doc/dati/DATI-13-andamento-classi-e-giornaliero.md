# DATI-13 — Patrimonio › Andamento: the classes by weight, and the daily line

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-12 (contract C6: the tab, the matrix module,
> the line, the phone rows) and DATI-02 (contract C1: `useDailySnapshots`, `DailyPoint`, `dailyUnitPrice`).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's points 4 and 5; decisions 14, 15, 28.

## 1. The problem today (evidence on the code)

- The owner asked the month-over-month and year-to-date reading «per strumento e per classe». After DATI-12 the tab
  has the instruments; no page shows how each class's WEIGHT moved month by month. The data is in every snapshot
  (`MonthlySnapshot.byAssetClass`, EUR by class with the debts negative and the pension funds folded into their
  classes, `types/assets.ts:595-597`, `:606-622`); the only per-class movement in the app is today against the last
  snapshot (`computeTopMovers`).
- After DATI-12 the selected instrument's line has twelve points a year. After DATI-02 a daily archive exists
  (`dailySnapshots/{userId}/months/{YYYY-MM}`, one row per instrument per day) and nothing reads it yet.

## 2. Goal and acceptance criteria

1. The tab has a view switch «Strumenti» | «Classi» (default «Strumenti», remembered). Proof: D1.
2. «Classi» is a matrix classes × months: a first column with the weight at the previous December, each month the
   change of the weight in POINTS against the month before, and «YTD» as «{±points} → {weight now}%». No semantic
   colour anywhere. A switch turns the cells into the value's change in euro. Proof: U1–U3, D2.
3. A weight is the class's value over the snapshot's total; the classes are in the app's order
   (`ASSET_CLASS_SEQUENCE`), only those that held a value in the year. Proof: U1, U4.
4. On the current year the line of the selected instrument — and of the selected class — is DAILY when the archive
   holds at least 20 points for it, monthly otherwise, and says which; with daily points it also states the change
   since the month began. A past year is monthly. Proof: U5–U7, D3.
5. On a phone an opened row shows the last 90 days when the archive has them, the year's months otherwise; the
   classes are rows that open like the instruments. Proof: D4, E2.
6. The daily read happens only with the tab open and only on the current year. Proof: D5.
7. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1, E2 green;
   `perf:budget` `/dashboard/assets` within 1 KB gz of `develop`; `mobile:census` and `mobile:budget` green.

## 3. Decisions

- **Decision 14** (owner, 2026-11-23): classes by weight in points, with a switch to the value in euro; a base
  column at December, YTD as «+3,1 → 55,1%», neutral colours.
- **Decision 15** (owner, 2026-11-23): on a phone, rows that open; opened, the grid and the chart of the last 90
  days.
- **Decision 28** (owner, 2026-11-23): the daily archive starts the day it is deployed — no backfill; so the daily
  line begins there.
- Adopted, reversible:
  - (a) 20 daily points is the threshold for a daily line: below it a daily line is a stub beside twelve months.
  - (b) the weight's denominator is the sum of `byAssetClass` (the net worth: debts lower their class).
  - (c) a property's daily unit price is net of its debt (the archive stores quantity and value only); its monthly
    line stays gross.
  - (d) the verdict follows the view: in «Classi» it names the class whose weight moved most.

## 4. Solution

### 4.1 The classes' matrix — `lib/utils/andamentoMatrix.ts` (added to C6, written here)

```ts
import { ASSET_CLASS_LABELS, ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';

export interface ClassCell {
  month: number;
  /** The class's share of the snapshot's total, in percent. */
  weight: number | null;
  /** Points against the previous month end. */
  weightDelta: number | null;
  value: number | null;
  valueDelta: number | null;
  inProgress: boolean;
}

export interface ClassRow {
  cls: string;
  label: string;
  /** At the base: the previous December, or the year's first snapshot when there is none. */
  baseWeight: number | null;
  baseValue: number | null;
  cells: ClassCell[];
  /** Points from the base to the year's last snapshot. */
  ytdPoints: number | null;
  endWeight: number | null;
  ytdValueDelta: number | null;
}

export interface ClassMatrix {
  year: number;
  months: number[];
  /** 0 = the previous December; otherwise the year's first month with a snapshot; null with no snapshot. */
  baseMonth: number | null;
  rows: ClassRow[];
}

interface SnapshotClasses {
  /** The sum of the classes: the net worth the weights are a share of. */
  total: number;
  values: Map<string, number>;
}

function classesOf(snapshot: MonthlySnapshot): SnapshotClasses {
  const entries = Object.entries(snapshot.byAssetClass ?? {});
  return { total: entries.reduce((sum, [, value]) => sum + value, 0), values: new Map(entries) };
}

export function buildClassMatrix(input: {
  year: number;
  snapshots: readonly MonthlySnapshot[];
  today: { year: number; month: number };
}): ClassMatrix {
  const { year, today } = input;
  const slots: Array<SnapshotClasses | null> = Array.from({ length: 13 }, () => null);
  for (const snapshot of input.snapshots) {
    const slot = snapshot.year === year ? snapshot.month : snapshot.year === year - 1 && snapshot.month === 12 ? 0 : -1;
    if (slot >= 0) slots[slot] = classesOf(snapshot);
  }
  const months = slots.flatMap((slot, index) => (index > 0 && slot ? [index] : []));
  const baseMonth = slots[0] ? 0 : (months[0] ?? null);
  const lastMonth = months.length > 0 ? months[months.length - 1] : null;

  const present = new Set<string>();
  for (const slot of slots) if (slot) for (const [cls, value] of slot.values) if (value !== 0) present.add(cls);
  const known = ASSET_CLASS_SEQUENCE.filter((cls) => present.has(cls)) as string[];
  const ordered = [...known, ...[...present].filter((cls) => !known.includes(cls)).sort()];

  const round1 = (value: number) => Math.round(value * 10) / 10;
  const rows: ClassRow[] = ordered.map((cls) => {
    // A class absent from a snapshot is worth zero there; a total at or below zero has no weights.
    const at = (slot: number | null): { value: number; weight: number | null } | null => {
      const classes = slot === null ? null : slots[slot];
      if (!classes) return null;
      const value = classes.values.get(cls) ?? 0;
      return { value, weight: classes.total > 0 ? (value / classes.total) * 100 : null };
    };
    const cells: ClassCell[] = [];
    for (let month = 1; month <= 12; month++) {
      const now = at(month);
      const before = at(month - 1);
      cells.push({
        month,
        weight: now?.weight ?? null,
        weightDelta: now && before && now.weight !== null && before.weight !== null ? round1(now.weight - before.weight) : null,
        value: now ? now.value : null,
        valueDelta: now && before ? roundToCents(now.value - before.value) : null,
        inProgress: year === today.year && month === today.month,
      });
    }
    const base = at(baseMonth);
    const end = at(lastMonth);
    const measured = base && end && lastMonth !== baseMonth;
    return {
      cls,
      label: ASSET_CLASS_LABELS[cls] ?? cls,
      baseWeight: base?.weight ?? null,
      baseValue: base ? base.value : null,
      cells,
      ytdPoints: measured && base.weight !== null && end.weight !== null ? round1(end.weight - base.weight) : null,
      endWeight: end?.weight ?? null,
      ytdValueDelta: measured ? roundToCents(end.value - base.value) : null,
    };
  });
  return { year, months, baseMonth, rows };
}

/** The class whose weight moved most since the base, for the verdict; null with nothing measured. */
export function largestWeightMove(matrix: ClassMatrix): ClassRow | null {
  const measured = matrix.rows.filter((row) => row.ytdPoints !== null);
  if (measured.length === 0) return null;
  return measured.reduce((best, row) => (Math.abs(row.ytdPoints!) > Math.abs(best.ytdPoints!) ? row : best));
}
```

`lib/utils/andamentoNarrative.ts` gains `buildClassVerdict(matrix, isCurrentYear): PageVerdictModel` — «Da inizio
anno il peso che si è mosso di più è {label}: {±x,x} punti, ora al {y,y}%» (a past year: «Nel {year} …»), tone
`neutral` always; nothing measured → «Servono due mesi di storia per leggere i pesi». The strip: the three classes
with the largest move, each «{label} {±x,x} pt».

### 4.2 The daily line — `lib/utils/andamentoDaily.ts` (new, written here)

```ts
/**
 * The line of Patrimonio › Andamento from the daily archive (2026-11-23). The archive starts the
 * day it was deployed (no backfill): until it holds enough days the line is the year's months, and
 * the caption says which of the two it is.
 */
import { dailyUnitPrice, type DailyPoint } from '@/lib/utils/dailySnapshot';

export interface LinePoint {
  /** YYYY-MM-DD: a day, or a month's last day for a monthly point. */
  iso: string;
  value: number;
}

/** Below this many daily points the monthly line reads better. */
export const DAILY_LINE_MIN_POINTS = 20;

export function instrumentDailyLine(points: readonly DailyPoint[], assetId: string, measure: 'price' | 'value'): LinePoint[] {
  const line: LinePoint[] = [];
  for (const point of points) {
    const row = point.assets[assetId];
    const value = measure === 'price' ? dailyUnitPrice(row) : row && row.q > 0 ? row.v : null;
    if (value !== null) line.push({ iso: point.iso, value });
  }
  return line;
}

export function classDailyLine(points: readonly DailyPoint[], cls: string, measure: 'weight' | 'value'): LinePoint[] {
  const line: LinePoint[] = [];
  for (const point of points) {
    const value = point.byClass[cls] ?? 0;
    if (measure === 'value') {
      line.push({ iso: point.iso, value });
      continue;
    }
    const total = Object.values(point.byClass).reduce((sum, item) => sum + item, 0);
    if (total > 0) line.push({ iso: point.iso, value: (value / total) * 100 });
  }
  return line;
}

/** The year's monthly values as line points, each on its month's last day. */
export function monthlyLine(year: number, values: ReadonlyArray<{ month: number; value: number | null }>): LinePoint[] {
  return values.flatMap(({ month, value }) => {
    if (value === null) return [];
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return [{ iso: `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`, value }];
  });
}

export function chooseLine(daily: LinePoint[], monthly: LinePoint[]): { points: LinePoint[]; grain: 'daily' | 'monthly' } {
  return daily.length >= DAILY_LINE_MIN_POINTS ? { points: daily, grain: 'daily' } : { points: monthly, grain: 'monthly' };
}

/**
 * The change since the month of `todayIso` began: from the last point before the month (else the
 * month's first) to the latest. A ratio in percent, or a difference when `asDifference` (weights).
 */
export function monthToDate(daily: readonly LinePoint[], todayIso: string, asDifference = false): number | null {
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const inMonth = daily.filter((point) => point.iso >= monthStart);
  if (inMonth.length === 0) return null;
  const before = [...daily].reverse().find((point) => point.iso < monthStart);
  const base = before ?? inMonth[0];
  const last = inMonth[inMonth.length - 1];
  if (base === last) return null;
  if (asDifference) return Math.round((last.value - base.value) * 10) / 10;
  return base.value > 0 ? (last.value / base.value - 1) * 100 : null;
}
```

### 4.3 The tab — `components/assets/AndamentoTab.tsx`

- A view `SegmentedPill` «Strumenti» | «Classi» (`layoutId="andamento-vista"`, remembered under
  `patrimonio.andamento.vista`) at the head of the tab, beside the year. The verdict and the strip follow the view.
- «Classi» — `components/assets/AndamentoClassMatrix.tsx` (new): the same table shell as the instruments' (sticky
  first column, one Tab stop, selectable rows). Columns: «Classe», «Dic {year−1}» (the base weight, «45,0%»; with no
  December the first month's name), «Gen»…«Dic», «YTD». Measure pill «Peso (punti)» | «Valore €»
  (`layoutId="andamento-misura-classi"`):
  - «Peso (punti)»: a month cell is `weightDelta` as «+0,4» (one decimal, sign), neutral foreground, no fill; YTD is
    «{±ytdPoints} → {endWeight}%». A cell with a zero move prints «0,0» in `text-muted-foreground`.
  - «Valore €»: the base column is the value at the base, the cells `valueDelta`, YTD `ytdValueDelta`; neutral.
  - Method note: «Un peso che sale non è un giudizio: dice come si è spostato il patrimonio. I punti sono
    percentuali del patrimonio netto.»
- The line — `AndamentoLine` gains `points: LinePoint[]`, `grain`, `caption`:
  - `const daily = useDailySnapshots(year === today.year ? ownerId : undefined, days)` in the TAB (not the page) —
    the hook of C1 reads nothing without an owner, which is how a past year makes no read; `days` = the day of the year on desktop, 90 on a phone (`useCompactLayout`).
  - instruments: `chooseLine(instrumentDailyLine(daily, id, measure), monthlyLine(year, row.cells → unitPrice |
    value))`; classes: `chooseLine(classDailyLine(daily, cls, 'weight' | 'value'), monthlyLine(year, row.cells →
    weight | value))`.
  - caption under the title: `grain === 'daily'` → «Giornaliero dal {primo giorno, d MMM}» and, when
    `monthToDate` is not null, «Da inizio mese: {±x,x%}» (classes by weight: «{±x,x} punti»). `'monthly'` on a past
    year → «Mensile»; on the current year with an empty archive → «Mensile · l'archivio giornaliero non ha ancora
    giorni»; with fewer than 20 points → «Mensile · l'archivio giornaliero ha {n} giorni, ne servono 20».
  - a daily line has no dots, a monthly one has them; the X axis ticks are months in both.
- Phone: «Classi» is a list of rows that open (closed: the class, its weight now, the YTD points; open: the measure
  pill, the 4 × 3 grid of month cells, the line). In an opened row of either view the line's title is «Ultimi 90
  giorni» when daily, «{year}» when monthly.
- States (doc/guide/stati.md): the daily read failing does NOT fail the tab — the line falls back to monthly with
  the caption «Mensile · archivio giornaliero non letto» and an `ErrorNotice` in the tile (`collapse` on a phone).

## 5. Constraints and traps

- **C1 and C6 are used IDENTICAL**: `useDailySnapshots(ownerId, days)`, `DailyPoint`, `dailyUnitPrice`;
  `buildInstrumentMatrix`, `AndamentoRow`, the tab's shell. The classes' matrix is added to C6's module, nothing in
  it is changed.
- **The daily archive is not persisted to IndexedDB and is read by window** (DATI-02): the read sits behind the
  tab's lazy boundary and the current-year gate — D5 holds it.
- **Colour never carries a judgement here** (decision 14): no `getMetricValueColor` on weights or on euro changes.
- **The Absence-Has-Three-Names Rule**: no archive yet, not enough days, a failed read are three captions.
- **The ONE door to recharts**, **a list is ONE Tab stop**, **Small-Screen Composition** — as in DATI-12.
- **`byAssetClass` includes the mortgages as negatives and the pension funds apportioned** (the session's reading of
  the snapshot writer): the weights are of the NET worth; the method note says so.
- **Italian day**: `todayIso` from `getItalyDateIso()`.
- **No owner data**: fixtures «Azioni 60.000», «Obbligazioni 30.000», «Liquidità 10.000».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/andamentoMatrix.test.ts` | 60/30/10 thousand → weights 60, 30, 10; next month 66/30/10 → equity +2,3 points (62,3%), bonds −1,7 | points on the value |
| U2 | unit · same | the base is December; with no December the year's first month, and `baseMonth` says it; YTD points from the base to the last snapshot; one snapshot only → no YTD | base = January always |
| U3 | unit · same | a class absent in a month reads weight 0 and a negative move; a total ≤ 0 → null weights, values kept | skip the absent class |
| U4 | unit · same | the order is `ASSET_CLASS_SEQUENCE`; an unknown key comes after, labelled with its key; a class at zero all year is not listed | alphabetical |
| U5 | unit · `__tests__/andamentoDaily.test.ts` | an instrument's daily line skips the days it was not held; «price» is v/q, «value» is v; a class's weight line divides by the day's total | value for price |
| U6 | unit · same | 19 daily points → the monthly line, 20 → the daily; `monthlyLine` puts February on the 28th (29th in a leap year) | threshold off by one |
| U7 | unit · same | `monthToDate`: the base is the last point before the month; with none, the month's first; one point → null; a difference for weights | base = first point of the line |
| U8 | unit · `__tests__/andamentoNarrative.test.ts` | the classes' verdict names the largest move and is neutral whatever the sign | tone from the sign |
| D1 | dom · `__tests__/andamentoTab.test.tsx` (new) | the view pill switches the matrix and the verdict; the choice is remembered | — |
| D2 | dom · `__tests__/andamentoClassMatrix.dom.test.tsx` (new) | a cell reads «+2,3», the YTD «+2,3 → 62,3%», the base column «60,0%»; no cell has a fill or a metric colour class; «Valore €» shows euro | colour by sign |
| D3 | dom · `__tests__/andamentoTab.test.tsx` | 25 daily points → the caption «Giornaliero dal …» and «Da inizio mese: …»; 5 → «Mensile · l'archivio giornaliero ha 5 giorni, ne servono 20»; a failed read → the monthly line and the notice | fail the tab |
| D4 | dom · same | compact layout: the hook is called with 90; an opened row's line is titled «Ultimi 90 giorni» when daily | 365 on a phone |
| D5 | dom · same | a past year → the daily hook receives no owner and the service is not called | always pass the owner |
| E1 | e2e · `e2e/assets.andamento.spec.ts` | «Classi»: the seeded classes, a «→» in the YTD cell, no coloured cell; with 25 planted daily rows the line's caption reads «Giornaliero» | — |
| E2 | e2e · `e2e/assets.andamento.mobile.spec.ts` | 390: a class row opens to twelve cells and a line; no horizontal overflow | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: «Classi» shows each class with its December weight, small signed moves month by
month in one neutral colour and a YTD like «+2,3 → 62,3%»; with 25 days planted in the archive the selected
instrument's line is daily and says since when; with 5 it stays monthly and says why.

- A — the diff. B–E by a throwaway Playwright script on the emulators at 1440, 768 and 390, light and dark: B the
  two views; C the classes' two measures; D the line with 25, 5 and 0 planted days, and a past year; E the phone
  rows of both views, a failed daily read (the rule denied for a decoy account). Decoys: «ornitorinco» (a class at
  zero all year: not listed) and «fenicottero» (a day in the archive for an instrument at quantity 0: no point).
- F — at the owner's «pronto», on the mirror: his classes against Allocazione's weights for the same month.

## 8. Putting it into service

No rules, no index. The daily line appears by itself on the 20th day after DATI-02 reached production. Measures:
`perf:budget` (`/dashboard/assets`), `mobile:census` + `mobile:budget` (the surface of DATI-12, re-measured).

## 9. Documentation

- `doc/guide/patrimonio.md` § «Andamento» — the classes' view (what a weight is, why it is neutral, the base), the
  line's two grains and the threshold, the captions; § Composizione mobile; § blind spots: a property's daily price
  is net of its debt; a past year is always monthly; the weights are of the net worth, so a mortgage lowers its
  class.
- `doc/guide/prima-schermata-misure.md` — the surface re-measured, if it moved.
- `README.md` — Patrimonio's feature lines. `Draft Release Temp.md` — «Patrimonio › Andamento: i pesi delle classi
  mese per mese, e la linea giornaliera di ogni strumento».
- `CLAUDE.md` — Patrimonio line: «… and each class by weight; the line is daily once the archive holds 20 days», under
  20.000 characters.
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- Reading a past year's days → doc/guide/patrimonio.md § blind spots (the hook reads «the last N days»).
- The market effect per class net of trades → doc/guide/patrimonio.md § blind spots.
- Daily volatility and drawdown, the Panoramica sparkline → DATI-14.
- A daily net-worth line on this tab → DATI-14 puts it on Panoramica, where the net worth lives.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-13-andamento-classi-e-giornaliero.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C6 e C1, da usare IDENTICI —, regole della serie)
- Leggi doc/guide/patrimonio.md (§ Andamento, § Composizione mobile), doc/guide/stati.md,
  doc/guide/prima-schermata.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (Small-Screen Composition, The Absence-Has-Three-Names Rule) e
  PRODUCT.md prima di disegnare
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: la matrice delle classi con U1–U4 e U8 (ognuno
visto rosso con la sua mutazione), la linea giornaliera con U5–U7, l'interruttore della vista e la
matrice delle classi (D1, D2), la linea a due grane con le sue didascalie (D3–D5), la composizione sul
telefono, poi E1 ed E2 e i budget. Il codice dei §§ 4.1 e 4.2 è già scritto: copialo.

Fermati e chiedimi se: DATI-12 o DATI-02 non sono in develop con i contratti dell'indice (nomi o firme
diversi), oppure il budget della prima schermata non torna verde senza allargare una voce.

Collaudo: § 7, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area, no schema and no new contract, every criterion
closed by a test. Estimated size: M (one new module, one extended, two components, ~16 tests).
