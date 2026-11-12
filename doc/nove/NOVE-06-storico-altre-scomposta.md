# NOVE-06 — Storico › Driver: «altre» split by cause

> Series `doc/nove/` (README.md § 5): **depends on nothing**; **NOVE-07 (the fee as a spending row) is implemented
> after it** and edits the same `measure()`. Written on 2026-11-12; every `file:line` is cited on `develop` @
> b841cbd7. Executes the owner's point 9, decision 8 and the adopted choice (d) (README.md § 3-4).

## 1. The problem today (evidence on the code)

**The question the owner asked, answered.** In the Driver's hover a month reads «risparmio … · mercato … · altre …».
«altre» is the REMAINDER of the identity the tile is built on (`lib/utils/growthDrivers.ts:6`, `:228`):

```
netWorthGrowth = netSavings + market − taxes + debtRepaid + pensionContributions + other
other = netWorthGrowth − netSavings − market + taxes − debtRepaid − pensionContributions
```

It is not an error: it holds what no named part explains (`growthDrivers.ts:41-44`) — a pension fund's growth before
the contributions are complete (`startMonth`), quantities the ledger does not explain, cash balances typed by hand on
a different day than the rows that explain them (a credit card is debited the month after its rows, so «altre»
swings and gives it back), the gap between the estimated and the withheld tax.

**The defect.** The app prints the remainder as one figure with one short word:

- the hover: `components/history/tiles/DriverTile.tsx:78-85` `restParts`, label `altre`;
- the ledger: `lib/utils/storicoNarrative.ts:501`, row «Altre variazioni»;
- the months' table: `DriverTile.tsx:275`, `:287`;
- the month tooltip of «Risparmio e mercato per mese»: `components/history/StoricoDettaglio.tsx:156`
  (`DriverMonthTooltip`), label «Altre variazioni»;
- the explanation only behind «Come si calcola» (`DriverTile.tsx:379-381`).

The owner cannot tell whether a month's «altre» is a card settling, a fund, or something to fix.

## 2. Goal and acceptance criteria

The remainder is split into three named parts that still add up to the euro.

| Part (key) | Label in the ledger · in the hover | What it is |
| --- | --- | --- |
| `otherPension` | «Fondo pensione non tracciato» · `fondo non tracciato` | the funds' value change that is neither measured market nor a recorded contribution |
| `otherHoldings` | «Quantità fuori dal registro» · `fuori registro` | for every instrument that exists today and is not an account, a fund, a loan or a property: its value change that neither its price nor its recorded buys and sells explain (units added or corrected by hand, an ADJUSTMENT, the ledger's baseline, a hand-valued stake revalued) |
| `otherAccounts` | «Saldi dei conti» · `saldi dei conti` | the rest: account balances against the rows and the trades, the tax gap, assets deleted since |

1. `other === otherPension + otherHoldings + otherAccounts` exactly (floating point: `toBeCloseTo(…, 6)`) for every
   pair of snapshots; unmeasured pairs (`isMarketMeasured: false`) have the three at 0. **Proof**: `growthDrivers.test.ts` G1.
2. A fund that grows 500 € in a month before `startMonth` → `otherPension: 500`, `market` 0 for it. **Proof**: G2.
3. An ETF whose quantity goes 10 → 12 with no trade, unit value 100 → `otherHoldings: 200`, `otherAccounts` unmoved
   by it. **Proof**: G3.
4. A month whose rows say −400 € (a card's purchases) while the account's balance has not moved yet →
   `otherAccounts: +400`; the next month, the debit with no rows → `otherAccounts: −400`. **Proof**: G4.
5. The ledger prints one row per non-zero part, in the order of the table above, after «Versamenti al fondo
   pensione»; the printed rows add up to the printed total to the euro, the drift going to «Saldi dei conti».
   **Proof**: `storicoNarrative.test.ts` L1-L2.
6. The hover and each month's SVG `<title>` list the three parts (zeros dropped) instead of `altre`; the months'
   table has three columns instead of «Altre variazioni»; the month tooltip of «Risparmio e mercato per mese»
   (Dettaglio) prints the three parts with the ledger's labels. **Proof**: `__tests__/driverTile.test.tsx` (RTL,
   new) D1-D2, D4.
7. «Come si calcola» explains each part in one sentence (§ 4). **Proof**: D3.
8. `sumGrowthDrivers` sums the three parts; a year equals the sum of its months for each. **Proof**: G5.
9. «Lavoro e investimenti» (`storicoSummary.ts:403-482`, `otherChanges`) is unchanged. **Proof**: its existing tests.
10. `mobile:budget` unchanged for Storico (the Driver is a closed row on the phone; the ledger's rows are not counted
    figures of the first screen). **Proof**: the run.
11. `npm run perf:budget`: `/dashboard/history` against its ceiling (780 KB gz, measured 780 today: no margin).
    **Proof**: the run.

## 3. Decisions

- **Owner 8 (2026-11-12)**: split «altre» by cause.
- **Adopted, reversible (d)**: three parts; the third is the remainder by construction, so the identity cannot break;
  the gap between estimated and withheld tax cannot be measured apart (the app records no withheld total per month)
  and is declared inside «Saldi dei conti»; a row of an asset deleted since has no type to read and lands there too.
- **Owner 42 (2026-11-12)**: `describeDriverRest` (`storicoNarrative.ts:429-446`) keeps `other` as ONE figure in the
  reading, but names it as the ledger under it does: when exactly ONE of the three parts is printed non-zero the
  label is that part's — «di fondo pensione non tracciato», «di quantità fuori dal registro», «di saldi dei conti»
  («Il resto: +400 € di saldi dei conti.») — and «di altre variazioni» only when two or three are. In the function
  the fourth part's `label` becomes `otherLabel(row)`: the three parts through `signedFlow`, those not
  `isPrintedZero` counted; one → its label, else `'di altre variazioni'`. `isOther`, the materiality check and the
  netted sentences are unchanged.
- **Adopted, reversible**: the Dettaglio's month tooltip is split too (the same month must not read three parts in
  one tile and one figure in the next); a hand-valued instrument's revaluation (a `Private Equity` stake lives in
  `quantity` at price 1, doc/guide/patrimonio.md) stays in `otherHoldings` and the method sentence names it.
- No earlier decision is overturned: `other` keeps its name, value and meaning; the three parts are added beside it.

## 4. Solution

### `lib/utils/growthDrivers.ts`

`GrowthDrivers` gains, after `other`:

```ts
  /** The part of `other` in the pension funds: their value change that is neither measured market nor a recorded contribution. */
  otherPension: number;
  /** The part of `other` in the instruments held today (not accounts, funds or loans): value change that neither price nor recorded trades explain. */
  otherHoldings: number;
  /** The rest of `other`: account balances against rows and trades, the tax gap, assets deleted since. `other − otherPension − otherHoldings`. */
  otherAccounts: number;
```

`measuredMarket` returns the per-asset market as well, so the split reads the SAME figures the market summed
(signature change, private to the module):

```ts
function measuredMarket(previous: MonthlySnapshot, current: MonthlySnapshot, trades: AssetTransaction[]): { market: number; byAsset: Map<string, number> }
```

(inside the loop, `byAsset.set(assetId, effect)` for each asset whose effect is added to `market`; a loan and an
untracked fund set nothing).

Two new functions INSIDE `createGrowthDriverMeter`'s closure (they read `grossRows`, `pensionFundIds` and
`instrumentIds`, which live there — `:148-155`), called by `measure` when `isMarketMeasured`; the import at `:55`
gains `isCashAccount`:

```ts
/** Net money the recorded trades put into an instrument in the window (buys in, sells out, fees as the market effect counts them). */
function tradeMoneyIn(trades: AssetTransaction[]): number {
  let moneyIn = 0;
  for (const trade of trades) {
    if (trade.type === 'buy' && !trade.isBaseline) moneyIn += trade.quantity * trade.priceEur + (trade.fees ?? 0);
    else if (trade.type === 'sell') moneyIn -= trade.quantity * trade.priceEur - (trade.fees ?? 0);
  }
  return moneyIn;
}

function splitOther(
  previous: MonthlySnapshot,
  current: MonthlySnapshot,
  trades: AssetTransaction[],
  marketByAsset: Map<string, number>,
  pensionContributions: number,
): { otherPension: number; otherHoldings: number } {
  const previousById = new Map(grossRows(previous.byAsset).map((row) => [row.assetId, row]));
  const currentById = new Map(grossRows(current.byAsset).map((row) => [row.assetId, row]));
  let pensionChange = 0;
  let pensionMarket = 0;
  let otherHoldings = 0;
  for (const assetId of new Set([...previousById.keys(), ...currentById.keys()])) {
    const change = (currentById.get(assetId)?.totalValue ?? 0) - (previousById.get(assetId)?.totalValue ?? 0);
    if (pensionFundIds.has(assetId)) {
      pensionChange += change;
      pensionMarket += marketByAsset.get(assetId) ?? 0;
      continue;
    }
    // Only an instrument that exists today has a type to read: accounts, loans and deleted assets stay in the rest.
    if (!instrumentIds.has(assetId)) continue;
    otherHoldings += change - (marketByAsset.get(assetId) ?? 0) - tradeMoneyIn(trades.filter((t) => t.assetId === assetId));
  }
  return { otherPension: pensionChange - pensionMarket - pensionContributions, otherHoldings };
}
```

with, beside `realEstateIds` and `pensionFundIds` in `createGrowthDriverMeter`:

```ts
  // Instruments: what is held today and is neither an account, a fund, a loan nor a property.
  const instrumentIds = new Set(
    context.assets.filter((a) => !isCashAccount(a) && !isLoanAsset(a) && a.type !== 'pensionFund' && a.type !== 'realestate').map((a) => a.id)
  );
```

(`isCashAccount` from `@/types/assets`, `:47`.) A property is excluded from `otherHoldings`: its value moves by
transfers (the Compravendita) and by its debt, both already named or in the accounts' rest.

`measure` ends:

```ts
    const measured = isMarketMeasured ? measuredMarket(previous, current, trades) : null;
    const market = measured ? measured.market : netWorthGrowth - netSavings + taxes - pensionContributions;
    const debtRepaid = isMarketMeasured ? debtRepaidBetween(previous, current) : 0;
    const other = netWorthGrowth - netSavings - market + taxes - debtRepaid - pensionContributions;
    const split = measured ? splitOther(previous, current, trades, measured.byAsset, pensionContributions) : { otherPension: 0, otherHoldings: 0 };
    const otherAccounts = other - split.otherPension - split.otherHoldings;
    return { netWorthGrowth, netSavings, market, taxes, debtRepaid, pensionContributions, other, ...split, otherAccounts, isMarketMeasured };
```

`sumGrowthDrivers` adds the three fields. The module's header comment gains, under the `other` bullet: «`other` is
printed in three parts (2026-11-12): `otherPension`, `otherHoldings`, and `otherAccounts`, which is what is left —
so the three add up to `other` by construction».

### `lib/utils/storicoNarrative.ts`

`DriverLedgerRow['key']` (`:470`) replaces `'other'` with `'otherPension' | 'otherHoldings' | 'otherAccounts'`.
`buildDriverLedger` (`:488-504`):

```ts
  const measured: DriverLedgerRow[] = [
    …the five rows of today…,
    { key: 'otherPension', label: 'Fondo pensione non tracciato', value: Math.round(row.otherPension), kind: 'flow' },
    { key: 'otherHoldings', label: 'Quantità fuori dal registro', value: Math.round(row.otherHoldings), kind: 'flow' },
  ];
  const remainder = reconcileRemainder(total, measured.map((part) => part.value));
  …
    ...(remainder !== 0 ? [{ key: 'otherAccounts', label: 'Saldi dei conti', value: remainder, kind: 'flow' } satisfies DriverLedgerRow] : []),
```

The comment above it replaces «"altre variazioni" IS the remainder» with «"Saldi dei conti" IS the remainder». A new
export, the hover's parts (moved from the component so the labels have one home):

```ts
/** The parts after the two engines, for the bars' hover; a part printed as zero is dropped. */
export function driverRestParts(row: Omit<GrowthDrivers, 'isMarketMeasured'>): Array<{ label: string; value: number; isLoss: boolean }> {
  return [
    { label: 'tasse', value: -row.taxes, isLoss: true },
    { label: 'mutuo', value: row.debtRepaid, isLoss: false },
    { label: 'fondo pensione', value: row.pensionContributions, isLoss: false },
    { label: 'fondo non tracciato', value: row.otherPension, isLoss: false },
    { label: 'fuori registro', value: row.otherHoldings, isLoss: false },
    { label: 'saldi dei conti', value: row.otherAccounts, isLoss: false },
  ].filter((part) => Math.abs(Math.round(part.value)) >= 1);
}
```

### `components/history/tiles/DriverTile.tsx`

- `restParts` (`:78-85`) is deleted; both of its callers — the month's `<title>` (`describe`, `:208-209`) and the
  hover (`:250`) — call `driverRestParts`.
- The table (`:269-290`): the header «Altre variazioni» becomes three — «Fondo pensione non tracciato», «Quantità
  fuori dal registro», «Saldi dei conti» — and the cell three (`signed(m.otherPension)`, `signed(m.otherHoldings)`,
  `signed(m.otherAccounts)`).
- The method note (`:379-381`), the last `<span>` becomes three:
  - «**Fondo pensione non tracciato**: la variazione dei fondi che non è né rendimento misurato né un versamento
    registrato — tutta la loro crescita, prima del mese da cui Previdenza tiene i versamenti.»
  - «**Quantità fuori dal registro**: la variazione di uno strumento che né il prezzo né gli acquisti e le vendite
    del registro spiegano: quote comparse o sparite senza un acquisto o una vendita (uno strumento aggiunto o
    corretto a mano, una rettifica, l'apertura del registro), o il valore aggiornato a mano di uno strumento senza
    quotazione (private equity).»
  - «**Saldi dei conti**: ciò che resta — saldi aggiornati in giorni diversi dalle spese (la carta di credito si
    addebita il mese dopo, quindi un mese sale e il successivo scende), lo scarto fra tassa stimata e trattenuta,
    gli strumenti eliminati nel frattempo.»

  In `storicoNarrative.ts`: `export const DRIVER_METHOD_OTHER: ReadonlyArray<{ term: string; text: string }>`, three
  entries in the order above (`text` starts after the colon). The tile maps each to `<span><strong
  className="font-medium text-foreground">{term}</strong>: {text}</span>`, replacing the last `<span>`.

### `components/history/StoricoDettaglio.tsx`

In `DriverMonthTooltip` (`:150-157`), `{ label: 'Altre variazioni', value: row.other }` becomes `{ label: 'Fondo
pensione non tracciato', value: row.otherPension }`, `{ label: 'Quantità fuori dal registro', value:
row.otherHoldings }`, `{ label: 'Saldi dei conti', value: row.otherAccounts }`, behind the same printed-zero filter.

### Comments that become false

Rewritten in the same commit: in `storicoNarrative.ts`, `reconcileRemainder`'s docstring («the remainder row
carries the drift») and `buildDriverLedger`'s (the identity with the three parts; «the labels of the first five
rows are «Lavoro e investimenti»'s, the three parts of «altre» are the Driver's own»; «eight figures»); in
`DriverTile.tsx`, the header (`:6-8`, «the eight parts») and `DriverBars`' docstring (`:187-188`).

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **«The Driver's ledger adds up to the euro»** (doc/guide/storico.md): here it means that «Saldi dei conti» is
  always the reconciled remainder (`reconcileRemainder`), printed last before the total when it is not zero; every
  other part is rounded on its own.
- **`other` stays**: `describeDriverRest` (`storicoNarrative.ts:434-442`), `sumGrowthDrivers` and the existing
  tests read it; do not rename or redefine it. «Lavoro e investimenti» computes its own `otherChanges`
  (`storicoSummary.ts:462`) and does not read it.
- **A flow has no colour, a loss has one** (DESIGN → Ranked Rows with Residual, the ledger form): the three parts
  are `kind: 'flow'`.
- **Sentences and labels live in `storicoNarrative.ts`**; the tile renders.
- **SDK-free and deterministic**: `growthDrivers.ts` imports only types and pure modules; `isCashAccount` comes from
  `types/assets.ts`, which is SDK-free.
- **Mono Mandate / tabular figures**: the new table cells take the classes of their neighbours.
- **NOVE-07 changes `tradeAwarePriceEffect`'s fee handling** (`lib/utils/marketEffect.ts:43-52`): `tradeMoneyIn`
  here must count fees EXACTLY as that function does at the time of writing; NOVE-07 changes both together.
- **Fixtures are invented and round**; the owner's months (the screenshots of this session) are never copied.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| G1 | `growthDrivers.test.ts`: on every pair of an invented six-month history, the three parts sum to `other`; an unmeasured pair has three zeros | `otherAccounts = 0` |
| G2 | fund 10.000 → 10.500 before `startMonth` → `otherPension` 500 | subtract nothing for an untracked fund's change (leave it out of `pensionChange`) |
| G3 | ETF 10 → 12 units at 100, no trade → `otherHoldings` 200; with a BUY of 2 at 100 recorded → 0 | drop `tradeMoneyIn` |
| G4 | the card: month 1 rows −400, account flat → `otherAccounts` +400; month 2 account −400, no rows → −400 | assign the rest to `otherHoldings` |
| G5 | `sumGrowthDrivers` of two months sums each part; `buildYearlyGrowthDrivers` year = Σ months per part | omit a field in the reducer |
| L1 | `storicoNarrative.test.ts`: the ledger's rows and order; zero parts have no row | keep the single `other` row |
| L1b | `storicoNarrative.test.ts` › `describeDriverRest` with `other` 400 = `otherAccounts` 400 alone → «Il resto: +400 € di saldi dei conti.»; with `otherPension` 200 + `otherAccounts` 200 → «… di altre variazioni.» | always `'di altre variazioni'` |
| L2 | the printed rows add up to the printed total with parts 0,4 / 0,4 / 0,4 (rounding drift lands on «Saldi dei conti») | `Math.round(row.otherAccounts)` instead of the remainder |
| G6 | a `Private Equity` `etf` at quantity 1000 → 1100, price 1, no trade → `otherHoldings` 100, `market` 0 | exclude hand-valued instruments from `instrumentIds` |
| D1 | `driverTile.test.tsx` (RTL): with `window.matchMedia` answering true to `(pointer: fine)` before the render (as `assistantCompanionScene.test.tsx` does), a `pointerMove` over the plot shows «fuori registro +200 €» and no «altre»; the month's SVG `<title>` lists the same parts | render the old `restParts` |
| D2 | the sr-only table's column headers are «Mese», «Risparmio», «Mercato», «Tasse sulle vendite», «Mutuo rimborsato», «Versamenti al fondo pensione», «Fondo pensione non tracciato», «Quantità fuori dal registro», «Saldi dei conti» | keep the «Altre variazioni» header |
| D3 | clicking «Come si calcola: Driver della crescita» shows the three `DRIVER_METHOD_OTHER` terms and no «Altre variazioni» | keep the old last `<span>` |
| D4 | `driverMonthTooltip.test.tsx` (RTL): `DriverMonthTooltip` (exported for the test) with `otherHoldings` 200 and the other two parts 0 prints «Quantità fuori dal registro» and neither «Altre variazioni» nor the two zero parts | keep the `row.other` entry |

Every account in G1-G6 is `{ type: 'cash', assetClass: 'cash' }` (`isCashAccount`); the existing `ASSETS`
fixture's `cash` row (`growthDrivers.test.ts:47`) gains `assetClass: 'cash'`, so the existing tests keep their
account outside `otherHoldings`.

Existing tests that change by design (not a stop): `__tests__/growthDrivers.test.ts` — the yearly row's `toEqual`
(`:182-184`) gains `otherPension: 0, otherHoldings: 0, otherAccounts: 0` and the key list (`:212`) the three fields;
`__tests__/storicoNarrative.test.ts` — `:408` (`'otherAccounts'` replaces `'other'` in the expected keys), `:423`
(`r.key === 'otherAccounts'`), and every literal handed to `buildDriverLedger` or `describeDriverRest` gains
`otherPension: 0, otherHoldings: 0, otherAccounts: <its other>`; `__tests__/storicoSummary.test.ts` — the
`DriverYear` literals (`:294-298`, `:450`) gain the same three fields, so `tsc` stays green.

No new E2E: `e2e/history.spec.ts` and `e2e/mobile-composition.history.mobile.spec.ts` assert that the ledger's
visible rows add up to its total, which stays true; they are run to prove it.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators, a seed month where a card's rows precede its debit shows «Saldi
dei conti» positive that month and negative the next; an ETF edited by hand from 10 to 12 units shows «Quantità
fuori dal registro +200 €»; every year's rows still add up to «Crescita del patrimonio».

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/history e2e/mobile-composition.history`
  (emulators up), `npm run perf:build` + `npm run perf:budget -- --dist=.next-perf` (criterion 11).
- **B**: emulators + seed + two planted snapshots and the rows above (decoy names «ornitorinco», «fenicottero»).
- **C (browser, the session)**: at 1440, the featured year's ledger, the bars' hover on a month with all three
  parts non-zero (the tip inside the tile, not cut), the Dettaglio's month tooltip, «Come si calcola»; at 390, the
  ledger inside the opened Driver row (a phone mounts no hover); at both widths, the sr-only table through the
  accessibility tree (nine columns).
- **D (data)**: add the ledger's rows by hand against the two snapshots' `totalNetWorth`.
- **E**: an account with snapshots without `byAsset` → no new row, «altre» parts absent, the market note as today.
- **F (owner, at his «pronto»)**: the mirror — his last three months read part by part; `npm run mirror:remove`.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `mobile:budget`; remove fixtures, mirror and scripts.

## 8. Putting it into service

One PR to `develop`. No data change: the parts are computed on read.

## 9. Documentation

- `doc/guide/storico.md`: «the Driver's reading names the rest by its ledger label when one part alone is not
  zero, «altre variazioni» when two or three are» (decision 42).
- `doc/guide/storico.md`, § Storico — a verdict over tiles, the bullets «The Driver is SIX parts» and «The six
  parts are a LEDGER»: the identity with the three parts of «altre», the rule «the remainder row is «Saldi dei
  conti»», and the answer to «cos'è "altre"» as the first bullet's opening sentence; § Per-page blind spots: the
  entry on «altre variazioni» as the remainder becomes «Saldi dei conti» carries the euros of rounding and can
  differ by a few € from `GrowthDrivers.otherAccounts`»; new: «a property and a deleted asset are never in
  `otherHoldings`; a hand-valued stake's revaluation is».
- `DESIGN.md` → Ranked Rows with Residual, the ledger form. Before: «every row is rounded to the printed unit and
  the remainder row («Altre variazioni») carries the drift». After: «every row is rounded to the printed unit and
  the remainder row carries the drift («Saldi dei conti» in the Driver since 2026-11-12, «Altre variazioni» in
  «Lavoro e investimenti»)».
- `README.md` (Storico): one sentence for the user.
- `CLAUDE.md` › «Latest»; `Draft Release Temp.md`: a new entry «**Storico › Driver**» (what the user sees: three
  named parts in the ledger, the hover, the month tooltip and «Come si calcola»); `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The withheld tax per month** as its own part: the ledger stores `withheldTaxEur` per SELL but the estimate stays
  the Driver's «Tasse»; reconciling the two is a rule of its own — heir: none in this series, declared.
- **Per-account detail of «Saldi dei conti»** (which account moved): heir none, declared; the tile stays a ledger of
  nine rows at most (the two engines, three named flows, the three parts of «altre», the total).
- **The Panoramica's month split** (`describeMonthSplit`) keeps its two parts: no heir.
- **The fee double count in `other`** once fees are spending rows: heir NOVE-07.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-06-storico-altre-scomposta.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-06-storico-altre-scomposta.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/storico.md, doc/guide/registro-operazioni.md e doc/guide/previdenza.md
  PRIMA di scrivere codice in quel dominio
- Leggi DESIGN.md (The Comma Rule, Ranked Rows with Residual — the ledger form, The Mono
  Mandate) e PRODUCT.md
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

Implementa la spec così com'è scritta: le tre parti in growthDrivers.ts (splitOther,
tradeMoneyIn, measuredMarket che restituisce anche il mercato per strumento), il libro mastro
e le parti dell'hover in storicoNarrative.ts, la tessera, il tooltip del Dettaglio. I test
PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre inventate e tonde. Fermati
e chiedimi se: la somma delle tre parti non torna a `other` su una coppia di snapshot; un
test esistente di growthDrivers, storicoNarrative o storicoSummary diventa rosso per una
ragione diversa dai campi nuovi elencati in § 6; perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); nel confronto con develop dello stesso giorno, stessa build, si muove una voce di mobile:budget che la spec non nomina. Collaudo: § 7, la F sul mirror al mio
«pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area (Storico), no schema change, every criterion closed
by a test. Estimated size: 1 session, ~2,5 h; ~70 lines pure, ~40 of narrative and tile, ~250 of tests.
