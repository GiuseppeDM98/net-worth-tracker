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
- the explanation only behind «Come si calcola» (`DriverTile.tsx:379-381`).

The owner cannot tell whether a month's «altre» is a card settling, a fund, or something to fix.

## 2. Goal and acceptance criteria

The remainder is split into three named parts that still add up to the euro.

| Part (key) | Label in the ledger · in the hover | What it is |
| --- | --- | --- |
| `otherPension` | «Fondo pensione non tracciato» · `fondo non tracciato` | the funds' value change that is neither measured market nor a recorded contribution |
| `otherHoldings` | «Quantità fuori dal registro» · `fuori registro` | for every instrument that exists today and is not an account, a fund or a loan: its value change that neither its price nor its recorded trades explain |
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
6. The hover lists the three parts (zeros dropped) instead of `altre`; the months' table has three columns instead
   of «Altre variazioni». **Proof**: `__tests__/DriverTile.test.tsx` (RTL, new) D1-D2.
7. «Come si calcola» explains each part in one sentence (§ 4). **Proof**: D3.
8. `sumGrowthDrivers` sums the three parts; a year equals the sum of its months for each. **Proof**: G5.
9. «Lavoro e investimenti» (`storicoSummary.ts:403-482`, `otherChanges`) is unchanged. **Proof**: its existing tests.
10. `mobile:budget` unchanged for Storico (the Driver is a closed row on the phone; the ledger's rows are not counted
    figures of the first screen). **Proof**: the run.

## 3. Decisions

- **Owner 8 (2026-11-12)**: split «altre» by cause.
- **Adopted, reversible (d)**: three parts; the third is the remainder by construction, so the identity cannot break;
  the gap between estimated and withheld tax cannot be measured apart (the app records no withheld total per month)
  and is declared inside «Saldi dei conti»; a row of an asset deleted since has no type to read and lands there too.
- **Adopted, reversible**: `describeDriverRest` (`storicoNarrative.ts:429-446`) keeps speaking of «altre variazioni»
  as ONE figure in the reading — the sentence is a summary, the ledger under it carries the split.
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

- `restParts` (`:78-85`) is deleted; the hover calls `driverRestParts`.
- The table (`:269-290`): the header «Altre variazioni» becomes three — «Fondo pensione non tracciato», «Quantità
  fuori dal registro», «Saldi dei conti» — and the cell three (`signed(m.otherPension)`, `signed(m.otherHoldings)`,
  `signed(m.otherAccounts)`).
- The method note (`:379-381`), the last `<span>` becomes three:
  - «**Fondo pensione non tracciato**: la variazione dei fondi che non è né rendimento misurato né un versamento
    registrato — tutta la loro crescita, prima del mese da cui Previdenza tiene i versamenti.»
  - «**Quantità fuori dal registro**: quote comparse o sparite senza un'operazione nel registro (uno strumento
    aggiunto o corretto a mano).»
  - «**Saldi dei conti**: ciò che resta — saldi aggiornati in giorni diversi dalle spese (la carta di credito si
    addebita il mese dopo, quindi un mese sale e il successivo scende), lo scarto fra tassa stimata e trattenuta,
    gli strumenti eliminati nel frattempo.»

  The three sentences are constants of `storicoNarrative.ts` (`DRIVER_METHOD_OTHER`), rendered by the tile.

## 5. Constraints and traps (AGENTS.md / repo rules, «here it means that»)

- **«The Driver's ledger adds up to the euro»** (doc/guide/storico.md): here it means the LAST row is always the
  reconciled remainder — «Saldi dei conti» — and no part is rounded independently of it.
- **`other` stays**: `storicoSummary.ts`, `describeDriverRest`, the strip and every existing test read it; do not
  rename or redefine it.
- **A flow has no colour, a loss has one** (DESIGN → The Comma Rule): the three parts are `kind: 'flow'`.
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
| L2 | the printed rows add up to the printed total with parts 0,4 / 0,4 / 0,4 (rounding drift lands on «Saldi dei conti») | `Math.round(row.otherAccounts)` instead of the remainder |
| D1-D3 | `DriverTile.test.tsx` (RTL): the hover lists «fuori registro» and no «altre»; the table's three headers; the three method sentences | render `restParts` of old |

No new E2E: `e2e/storico*.spec.ts` assert the ledger's sum, which stays; they are run to prove it.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the emulators, a seed month where a card's rows precede its debit shows «Saldi
dei conti» positive that month and negative the next; an ETF edited by hand from 10 to 12 units shows «Quantità
fuori dal registro +200 €»; every year's rows still add up to «Crescita del patrimonio».

- **A**: `tsc`, lint, Vitest (three zones), `npx playwright test e2e/storico`.
- **B**: emulators + seed + two planted snapshots and the rows above (decoy names «ornitorinco», «fenicottero»).
- **C (browser, the session)**: Storico at 1440 and 390: the featured year's ledger, the bars' hover, the table
  behind the tile's data view, «Come si calcola».
- **D (data)**: add the ledger's rows by hand against the two snapshots' `totalNetWorth`.
- **E**: an account with snapshots without `byAsset` → no new row, «altre» parts absent, the market note as today.
- **F (owner, at his «pronto»)**: the mirror — his last three months read part by part; `npm run mirror:remove`.
- **G**: `mobile:budget`; remove fixtures, mirror and scripts.

## 8. Putting it into service

One PR to `develop`. No data change: the parts are computed on read.

## 9. Documentation

- `doc/guide/storico.md` § Driver: the identity with the three parts, the rule «the last is the remainder», the
  blind spot «a property and a deleted asset are never in `otherHoldings`»; the answer to «cos'è "altre"» as the
  section's opening sentence.
- `README.md` (Storico): one sentence for the user.
- `CLAUDE.md` › «Latest», `Draft Release Temp.md` (the Storico entry rewritten), `doc/nove/README.md` § 6.

## 10. Declared out of scope

- **The withheld tax per month** as its own part: the ledger stores `withheldTaxEur` per SELL but the estimate stays
  the Driver's «Tasse»; reconciling the two is a rule of its own — heir: none in this series, declared.
- **Per-account detail of «Saldi dei conti»** (which account moved): heir none, declared; the tile stays a ledger of
  seven rows at most.
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
- Leggi DESIGN.md (The Comma Rule, Ranked Rows with Residual, The Mono Mandate) e PRODUCT.md
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
e le parti dell'hover in storicoNarrative.ts, la tessera. I test PRIMA del codice, ciascuno
visto rosso con la sua mutazione; cifre inventate e tonde. Fermati e chiedimi se: la somma
delle tre parti non torna a `other` su una coppia di snapshot; un test esistente di
growthDrivers o storicoNarrative diventa rosso. Collaudo: § 7, la F sul mirror al mio
«pronto». Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Sonnet 5.5**, effort **medium** — an M spec in one area (Storico), no schema change, every criterion closed
by a test. Estimated size: 1 session, ~2,5 h; ~70 lines pure, ~40 of narrative and tile, ~250 of tests.
