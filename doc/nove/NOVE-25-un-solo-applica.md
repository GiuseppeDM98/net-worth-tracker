# NOVE-25 — One «Applica»: the Consulente's operating plan becomes the plan of accumulation

> Series `doc/nove/` (README.md § 5): **depends on NOVE-23** (retired on 2026-11-19, PR #557; `disposalMonthIndex`, `reviewMonthIndex`,
> `resolveInvestmentAccountId`, `investmentCashAssetId`, a revision that keeps a new sale's month) **and NOVE-24**
> (`OperatingPlan`, `operatingPlanOf`, `reconcileOperatingPlan`, `OperatingPlanFacts`, the page «Il piano
> operativo», the absence row on «Applica»). Third of the five specs of «dal Consulente al piano di accumulo, in un
> clic»: the click. It removes NOVE-21's window «Dal Consulente» and the optimizer from this path.
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c (those into the files NOVE-23 changed re-pointed to `develop` @ 875f4882 at its retirement, 2026-11-19). Executes decisions 67, 71, 72, 73, 74,
> 76, 77, 79, 80, 81, 82, 94, 96, 97, 98 (README.md § 3); overturns decision 27, NOVE-21's (retired on 2026-11-19, PR #553) optimizer seed (`buildHandoffSeed`) and its rule of no seeded sale, and
> the index's choice p (the one-line warning «a plan is active» on «Applica»: the click now revises that plan).

## 1. The problem today (evidence on the code)

**From «Applica» to a running plan there are at least six clicks and three windows.** `apply()`
(`components/allocation/consulente/ConsulenteReport.tsx:101-131`) writes targets, roles and goals; then the page
offers a LINK (`CONSULENTE_HANDOFF_HREF`, `lib/utils/allocationAdviceDocument.ts:78`) to Accumulo, where «Dal
Consulente» opens (`components/allocation/ConsulenteHandoff.tsx`), then `AssetDialog` once per missing instrument,
then the three-step editor, then «Attiva piano». The owner (2026-11-18): «solo il click per creare il pac e basta».

**The plan that comes out is not the Consulente's.** `buildHandoffSeed`
(`lib/utils/allocationAdviceHandoff.ts:130-211`) runs the optimizer in mode `'ideal'`; no sale is seeded; a new
instrument in a class without sub-targets starts at 0 % (decision 58; doc/guide/accumulo.md § Dal Consulente).

**No code can create a plan without the editor.** `createDraftPlan` then `activatePlan`
(`lib/services/accumulationPlanService.ts:141`, `:212`) are called only from the dialog
(`components/allocation/AccumulationPlanDialog.tsx:671-717`), which also owns the gate
(`validateDraftAgainstAssets` is called by `revisePlan` alone, `:401-432`), the model's write (`finishWithModel`,
`:659-670`) and the empty draft (`emptyDraft`, `:226-245`).

**An instrument is created only by a form.** `createAsset` (`lib/services/assetService.ts:130-209`) accepts any
`AssetFormData`, but the price is fetched by a private function of the dialog (`fetchMarketPrice`,
`components/assets/AssetDialog.tsx:148-186`) and the ticker is mandatory only in the dialog's schema. The quote
route returns no time (`app/api/prices/quote/route.ts`: `{ ticker, price, currency, currentPriceEur? }`;
`getQuote`, `lib/services/yahooFinanceService.ts:34-61`, reads `regularMarketPrice` alone): a symbol that stopped
updating cannot be told from a live one. Measured on 2026-11-19 with `yahoo-finance2` 3.13.2: `quote()` carries
`regularMarketTime`; `search(<ISIN>)` returns ONE listing and throws in validation — no ISIN search on the app's
side.

**An asset without a ticker would be quoted every day.** `lib/helpers/priceUpdater.ts:161-166` builds `tickers =
[...new Set(otherAssets.map((asset) => asset.ticker))]` for every asset with `autoUpdatePrice !== false` (`:77`):
an empty ticker would reach `getMultipleQuotes`.

**An open plan stops everything.** With a draft the page shows `HANDOFF_DRAFT_NOTE`, with an active plan
`APPLY_ACTIVE_PLAN_NOTE` (`lib/utils/allocationAdviceNarrative.ts:308-316`): the Consulente can neither replace the
first nor revise the second.

## 2. Goal and acceptance criteria

1. With a usable operating plan, the «Applica» page shows a fourth tick «Il piano di accumulo», on by default, with
   a one-line summary computed by the engine on today's portfolio. **Proof**: R1, E1.
2. ONE press of «Applica alle impostazioni» writes targets, roles, goals, creates the missing instruments and the
   plan, ACTIVE, with the first instalment next month; then the page reads «Piano creato» with «Apri Accumulo».
   **Proof**: U8, E1.
3. The plan's positions, quotas, sales with their months, months, monthly inflow, review month are the operating
   plan's after `reconcileOperatingPlan` on TODAY's facts; every correction — the stored ones and today's — is a
   sentence on the page BEFORE the click and on the plan after. **Proof**: U1–U3, R1, E1.
4. Every missing instrument is created at 0 quotes: with the first of its symbols that has a price at most five
   days old (ticker, price and date shown before the click); without one, created with no price and said; a
   government bond is created with its ISIN and the daily price update on, its terms to complete, and said
   (decision 97). No asset is stored with an empty ticker; one without a symbol and without an ISIN-priced bond
   never enters the daily price update. **Proof**: U4, U5, U6, E1, E2.
5. The plan draws from «Conto per gli investimenti»; when it is not set the tick shows «Da quale conto?», and the
   choice is saved as the setting by the same click; without a choice the tick stays off. **Proof**: R2, E3.
6. A draft in Accumulo is replaced and activated (the tick says so); an active plan is revised from its first
   intact instalment (the tick says so); an active plan with every instalment closed turns the tick off with
   decision 98's sentence. **Proof**: U7, U9, R3, E4, E5.
7. The tick is offered only together with «I target»; plans not read, no source account, a plan that can buy
   nothing → the tick is off and disabled with its sentence. **Proof**: U3, R3.
8. On a document already applied, with the targets written and no plan created from it, the page offers «Crea il
   piano di accumulo»: the same click without the three writes. **Proof**: R4, E6.
9. A step that fails says what was written and what was not; pressing again does not create a second instrument
   nor a second plan; while a write runs the button is disabled. **Proof**: U10, R4, E7.
10. The model portfolio is written with the plan's weights (held rows at 0 % included), as the editor does; a
    model that cannot be written leaves the plan active and the page says so. **Proof**: U8, U10.
11. «Dal Consulente», its link, its window, `buildHandoffSeed` and the kept-sale note are gone; `?da=consulente`
    only cleans the URL. **Proof**: U11, E8.
12. The Consulente route loads the plan's code only when the tick is drawn; `perf:budget` closes by README § 8.
    **Proof**: U12, § 7 G.

## 3. Decisions

- **Owner 71 (2026-11-19)**: ONE «Applica» does everything: a fourth tick «Il piano di accumulo» (on) with a
  one-line summary; then «Piano creato» + «Apri Accumulo»; the window «Dal Consulente» disappears.
- **Owner 94 (2026-11-19, the adversarial reading)**: the link to Accumulo reads «Apri Accumulo» everywhere, as
  the Piano tile's does today: ONE constant `ACCUMULO_OPEN_LINK`, born here (§ 4.5).
- **Owner 96 (same day)**: the tick shows only the TOTAL of the sales' estimated taxes; the per-sale detail is the
  page «Il piano operativo»'s (clarifies decision 81).
- **Owner 97 (same day)**: a government bond the click creates has its ISIN and `autoUpdatePrice: true` — the
  price arrives at the first daily update, through Borsa Italiana (`lib/helpers/priceUpdater.ts:91-131`); nominal,
  coupon and maturity remain to complete in Patrimonio and the tick's line says so.
- **Owner 98 (same day)**: ONE sentence for an active plan whose instalments are all closed —
  `ACCUMULO_PLAN_NOTHING_TO_REVISE`, with the link «Apri Accumulo» — here on the tick, off and disabled.
- **Owner 72**: the click creates the plan ACTIVE at once.
- **Owner 73**: the app creates in the same click EVERY missing instrument (0 quotes); one without a ticker is
  created all the same, without a price, and the summary says so («accertati che un asset senza ticker venga
  creato e non dia errore»).
- **Owner 74**: the right ticker — the app reads price and date of each of the (up to three) symbols in order and
  uses the first with a price of the last 5 days; «Applica» shows «ticker · prezzo · data» before the click.
- **Owner 76**: without «Conto per gli investimenti» the tick asks «Da quale conto?» and saves the choice.
- **Owner 77**: an app rule against the Consulente's plan — the app corrects and says so, one sentence per
  correction before the click, which stays on the plan; the tick goes off only if the plan can buy nothing.
- **Owner 79**: an open draft is REPLACED. **Owner 80**: an active plan is REVISED.
- **Owner 81, 82**: read from NOVE-24 (taxes shown; a forgotten instrument at 0 %, a new one at its quota).
- **Kept from NOVE-21 (retired on 2026-11-19, PR #553) (owner)**: the model is written with the plan («Salva bozza writes the model too»); held rows
  at 0 % enter the model; every held buyable instrument is a row.
- **Overturned**: decision 27 (2026-11-12: «calcolato dal codice (ottimizzatore + `seedDraft`), il proprietario
  conferma nell'editor») and NOVE-21's optimizer seed (`buildHandoffSeed`) and no seeded sale (doc/guide/accumulo.md § Dal Consulente) — by decisions 67, 71, 72
  (2026-11-19). Decision 58 no longer has a reader (decision 82). Choice p of the index (the one-line warning
  with an active plan, `APPLY_ACTIVE_PLAN_NOTE`) — by decision 80.
- **Adopted, reversible (this spec)**:
  - K1. The plan's name is «Piano di accumulo»; its first month is the month after the click.
  - K2. The corrections live on the plan as `advisorNotes: string[]` and are shown in «Questo mese».
  - K3. The stored ticker of a new instrument: the chosen symbol; else the ISIN; else a slug of the name
    (`ETF-ORO-FISICO`). `autoUpdatePrice` is `true` only with a chosen symbol or on a government bond with its
    ISIN (K4).
  - K4. A government bond (the prefill's type `bond` WITH an ISIN) is created with its ISIN as ticker, no price
    and `autoUpdatePrice: true` (decision 97); a `bond` prefill without an ISIN follows the symbols as any other
    instrument.
  - K5. Five CALENDAR days of freshness (a long weekend passes).
  - K6. The click is not atomic: the steps run in order, each idempotent on a second press (an instrument is
    matched by ISIN or name before it is created — `findAdviceInstrument`, the SAME matcher the page uses; an
    open plan is updated, never duplicated). Two tabs pressing at the same instant can still create the same
    instrument twice (`createAsset` has no uniqueness by ISIN): left as it is, declared (§ 10).
  - K7. The reserve of the plan is the cash quota of the targets the plan goes toward, left on the chosen account
    (`resolvePlanReserve` with the source ids, NOVE-24).
  - K8. A sale the active plan already executed is not sold again by a revision: BEFORE the reconcile the row
    loses its sale and becomes `hold` (its quota 0), with a sentence — the instrument stays a row.
  - K9. The advice document records the plan it created (`applied.planId`, `applied.planAction`); a second POST
    keeps the first `applied.at`.
  - K10. The page keeps the plan's code out of the first load: one lazily loaded component.
  - K11. While a write runs, the button that started it is disabled («Applica alle impostazioni», «Crea il piano
    di accumulo»): a double click sends one run. The plans' lock is the last guard.
  - K12. An instrument the click creates takes the asset form's create defaults (`isLiquid: true`,
    `allocationRole: 'tradable'`, `stampDutyExempt: false`, `components/assets/AssetDialog.tsx:1328-1344`); no
    `taxRate` — the form asks none at creation either.
  - K13. The tick is off, with a sentence, when the plan can buy nothing TODAY: no money (the preview's usable
    liquidity is 0) or no `buy` row on a priced instrument (decision 77's «only if the plan can buy nothing»).
  - K14. On a document applied earlier, «Crea il piano di accumulo» goes toward the targets SAVED today
    (`resolveEffectiveTargets` on the live settings and goals), not the report's: the owner may have changed them
    since.

## 4. Solution

### 4.1 The plan document (`types/accumulationPlan.ts`, schema, mapper, services)

`AccumulationPlan` and `AccumulationPlanDraft` gain `advisorNotes?: string[]` (schema:
`z.array(z.string().max(400)).max(40).optional()`); `docToAccumulationPlan` maps it; `createDraftPlan` writes it
when defined; `PlanRevisionInput` (`lib/utils/accumulationPlanUtils.ts:530`) gains `advisorNotes?: string[]` and
`revisePlan` writes it when the input names it (an input without the key leaves the stored notes: today's editor
keeps them through a revision; NOVE-26 clears them, choice ad).

**`updateDraftPlan` replaces the draft WHOLE** (`lib/services/accumulationPlanService.ts:164-194`): the three
optional fields of a draft — `reviewMonthIndex` (NOVE-23), `advisorNotes`, `optimizerSnapshot` — are written when
the new draft defines them and CLEARED with `deleteField()` when it does not (today `removeUndefinedDeep` drops an
absent `optimizerSnapshot` from the patch, so the old one survives). A replaced draft keeps nothing of the plan it
replaces. So that the editor's «Salva bozza» on an existing draft loses nothing, `draftFromPlan`
(`components/allocation/AccumulationPlanDialog.tsx:247-268`) carries the three fields from the plan into the draft
it edits.

### 4.2 The quote with its time (`lib/services/yahooFinanceService.ts`, `app/api/prices/quote/route.ts`)

`QuoteResult` gains `quotedAt?: string` (ISO): `getQuote` sets it from `quote.regularMarketTime` when it is a
`Date`; the route passes it through. No other caller reads it.

### 4.3 The pure builder (`lib/utils/advicePlan.ts`, new)

```ts
export const FRESH_QUOTE_DAYS = 5;

export interface AdviceQuote { symbol: string; price: number; currency: string; priceEur: number; quotedAt: string }
export interface RawQuote { symbol: string; price: number | null; currency?: string; currentPriceEur?: number; quotedAt?: string }

/** The first quote, in the given order, with a price whose last trade is at most five days old. */
export function pickFreshQuote(quotes: readonly RawQuote[], nowMs: number): AdviceQuote | null {
  for (const quote of quotes) {
    if (!quote.price || quote.price <= 0 || !quote.quotedAt) continue;
    const ageMs = nowMs - new Date(quote.quotedAt).getTime();
    if (!(ageMs <= FRESH_QUOTE_DAYS * 86_400_000)) continue;
    const currency = (quote.currency ?? 'EUR').toUpperCase();
    const priceEur = currency === 'EUR' ? quote.price : quote.currentPriceEur;
    if (!priceEur || priceEur <= 0) continue;
    return { symbol: quote.symbol, price: quote.price, currency, priceEur, quotedAt: quote.quotedAt };
  }
  return null;
}

/** A ticker for an instrument with no symbol — its ISIN, else its name as a slug the ticker rule accepts. */
export function fallbackTicker(prefill: Pick<AssetPrefill, 'name' | 'isin'>): string {
  const isin = prefill.isin?.trim().toUpperCase();
  if (isin) return isin;
  const slug = prefill.name.normalize('NFD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 20);
  return slug || 'STRUMENTO';
}

export type NewInstrumentPricing =
  | { kind: 'priced'; quote: AdviceQuote }
  | { kind: 'unpriced'; reason: 'no-symbol' | 'no-fresh-quote' }
  | { kind: 'bond' };

/** The form data of an instrument the plan creates: 0 quotes, `createdEmpty`, priced or not. */
export function newInstrumentFormData(instrument: OperatingPlanInstrument, pricing: NewInstrumentPricing): AssetFormData {
  const prefill = instrument.prefill!;
  const priced = pricing.kind === 'priced' ? pricing.quote : null;
  return {
    name: prefill.name,
    ticker: priced ? priced.symbol : fallbackTicker(prefill),
    isin: prefill.isin,
    type: prefill.type,
    assetClass: prefill.assetClass,
    subCategory: prefill.subCategory || undefined,
    currency: priced ? priced.currency : 'EUR',
    quantity: 0,
    createdEmpty: true,
    currentPrice: priced ? priced.price : 0,
    currentPriceEur: priced && priced.currency !== 'EUR' ? priced.priceEur : undefined,
    // A symbol with a fresh price, or a government bond with its ISIN (decision 97): Borsa Italiana prices it.
    autoUpdatePrice: priced !== null || pricing.kind === 'bond',
    // The asset form's create defaults (K12).
    isLiquid: true,
    allocationRole: 'tradable',
    stampDutyExempt: false,
  };
}

/** The pricing of a `new` instrument: a bond with an ISIN is K4's, else the first fresh quote of its symbols. */
export function resolveNewInstrumentPricing(instrument: OperatingPlanInstrument, quotes: readonly RawQuote[], nowMs: number): NewInstrumentPricing {
  const prefill = instrument.prefill!;
  if (prefill.type === 'bond' && prefill.isin?.trim()) return { kind: 'bond' };
  if (!instrument.symbols?.length) return { kind: 'unpriced', reason: 'no-symbol' };
  const quote = pickFreshQuote(quotes, nowMs);
  return quote ? { kind: 'priced', quote } : { kind: 'unpriced', reason: 'no-fresh-quote' };
}
```

An unpriced instrument is created in `EUR` whatever its listing: its currency is completed with its ticker, from
its form (declared, § 10).

`describeNewInstrument(name: string, pricing: NewInstrumentPricing): string` lives in
`lib/utils/allocationAdviceNarrative.ts` (zod-free; `NewInstrumentPricing` imported as a type) and formats the
price with `formatCurrency(price, currency)` and the date with `formatDate` (`lib/utils/formatters.ts`). The line
the page shows: «{nome} · {quote.symbol} · {prezzo} · {data}» (priced); «{nome} · senza prezzo: nessun listino ha
un prezzo degli ultimi 5 giorni. Il piano lo compra quando gli dai un ticker in Patrimonio.» (`no-fresh-quote`);
«{nome} · senza ticker né prezzo: completalo in Patrimonio perché il piano lo compri.» (`no-symbol`); «{nome} ·
titolo di Stato: il prezzo arriva al primo aggiornamento. Completa nominale, cedola e scadenza in Patrimonio.»
(`bond`).

```ts
export interface AdvicePlanInput {
  plan: OperatingPlan;                          // operatingPlanOf(document)
  /**
   * The portfolio as the click leaves it: the live assets with the role changes «I ruoli» would write already
   * applied (`{ ...asset, allocationRole: change.to }` for each of `planRoleChanges(proposal, assets).changes`)
   * when that tick is on.
   */
  assets: Asset[];
  keepNames: readonly string[];
  limits: IdealAllocationSettings['instrumentLimits'];
  /** The targets the plan goes toward (§ 4.5 says which). */
  targets: AssetAllocationTarget;
  sourceAssetId: string;
  openPlan: AccumulationPlan | null;            // selectOpenPlan(plans) ?? null
  pricing: Record<string, NewInstrumentPricing>; // by the `ref` of each `new` instrument
  band: RebalanceBand;                          // DEFAULT_REBALANCE_BAND: the Consulente's route has no band control
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
  generateId?: () => string;
  /** Tests only: replaces `reconcileOperatingPlan`. */
  reconcile?: typeof reconcileOperatingPlan;
}

export interface AdvicePlanBuild {
  action: 'create' | 'replace' | 'revise';
  /** The plan after today's reconcile. */
  reconciled: OperatingPlan;
  /** The stored corrections and today's, in order, without repeats, capped (step 2). */
  notes: string[];
  toCreate: Array<{ ref: string; formData: AssetFormData; pricing: NewInstrumentPricing }>;
  /** The draft with `new:<ref>` in place of the ids not yet created. */
  draft: AccumulationPlanDraft;
  /** The first revised instalment of an active plan (`action: 'revise'`), else 1. */
  firstIndex: number;
  /** The engine's preview on the draft, the missing instruments as assets at 0 quotes with their price. */
  preview: ReturnType<typeof buildDraftPreview>;
  issues: DraftIssue[];
  /** Why the plan cannot be created today, as one sentence; null = the tick can be on. */
  blocked: string | null;
}

export function buildAdvicePlan(input: AdvicePlanInput): AdvicePlanBuild
```

`buildAdvicePlan`, step by step (`action` is `'revise'` for an active `openPlan`, `'replace'` for a draft,
`'create'` otherwise; with `'revise'`, `k = findFirstIntactInstallment(openPlan)?.index`):

1. **Today's facts** — `refreshOperatingPlanFacts(input: { instruments: OperatingPlanInstrument[]; assets:
   Asset[]; keepNames: readonly string[]; limits: IdealAllocationSettings['instrumentLimits']; valueOf: (asset:
   Asset) => number; priceOf: (asset: Asset) => number }): OperatingPlanFacts`, added to
   `lib/utils/operatingPlanFacts.ts`:
   - a stored `held` / `cashFund` instrument keeps its `ref` when its `assetId` is still among the assets and
     still buyable (`isPlanBuyable`) or a money-market fund (`isPlanCashFund`); else it is absent from the facts
     (rule 3 of the reconcile drops its row with its sentence — the instrument was sold or deleted since);
   - a stored `new` instrument that now exists — `findAdviceInstrument(assets, prefill)` — KEEPS its `ref` (`N1`)
     and becomes `kind: 'held'` with that `assetId`: the stored rows cite the ref, and every rule reads `kind`
     (NOVE-24 § 4.2);
   - a held buyable asset with value that no instrument names gets a new `held` instrument, its `ref` the next
     free `S` number (rule 9 gives it a row at 0 %);
   - quantities, prices, taxes, limits and `keep` (by `keepNames`, as NOVE-24 § 4.2) are today's.

   `findAdviceInstrument(assets: readonly Asset[], prefill: Pick<AssetPrefill, 'name' | 'isin'>): Asset | null`
   (exported from `lib/utils/operatingPlanFacts.ts`) matches by `prefill.isin` against `asset.isin`, case- and
   space-insensitive, else by `findAssetByName(assets, prefill.name)` (which reads name, ticker and display
   ticker, never the ISIN: `lib/utils/allocationAdviceApply.ts:35-60`). The executor's K6 calls the SAME function
   (§ 4.4 step 2).
2. **Reconcile** — with `action: 'revise'`, FIRST (K8): every `sell` row on an asset with a sale of `openPlan`
   that is not open (`!isOpenSavedDisposal`) loses `sellQuantity` and `sellMonth` and becomes `hold` with
   `targetPercentage: 0`, with «{nome}: il piano attivo ha già registrato una vendita; quella nuova non entra.»
   Then `reconciled = (input.reconcile ?? reconcileOperatingPlan)(plan, facts)` — a stored `OperatingPlan` is a
   `RawOperatingPlan`. `notes = unique([...plan.corrections, ...the K8 sentences, ...reconciled.corrections])`,
   then capped so that the draft always parses (§ 4.1): each sentence cut to 400 characters (399 + «…»), at most
   40 sentences, the first forty.
3. **Instruments** — every instrument of `kind: 'new'` with a `buy` row → `toCreate` with
   `newInstrumentFormData(instrument, pricing[ref] ?? { kind: 'unpriced', reason: 'no-symbol' })`; its id in the
   draft is `new:<ref>`.
4. **Positions** — one per row whose instrument is not a money-market fund (`kind !== 'cashFund'`) and that is
   not a sale of every share: `{ id: generateId(), label: name, targetPercentage, memberAssetIds: [id],
   buyAssetId: id }`. A money-market fund is never a position: its sale, partial or whole, is a `PlanDisposal`
   only.
5. **Sales** — one `PlanDisposal` per `sell` row: `{ assetId, quantity: sellQuantity, monthIndex: sellMonth ?? 1,
   estimatedProceedsEur, status: 'planned' }`, `estimatedProceedsEur = proceedsOfDisposal({ assetId, quantity:
   sellQuantity, estimatedProceedsEur: 0, status: 'planned' }, assetsById.get(assetId), deps)`
   (`lib/utils/accumulationPlanUtils.ts:78`).
6. **Liquidity** — `sourceCashAssetIds: [sourceAssetId]`, `monthlyInflowEur: reconciled.monthlyInflowEur`,
   `reserveEur: resolvePlanReserve(assets, targets, compare, deps, planCashFundSaleEur(disposals, assetsById,
   assets), [sourceAssetId]).reserveEur` — the `sourceIds` parameter NOVE-24 added (K7).
7. **The draft** — `{ name: 'Piano di accumulo', startMonth, months, liquidity, positions, disposals,
   reviewMonthIndex, advisorNotes: notes }`, in ONE month frame, the plan's own (README § 7, NOVE-23):
   - `create` / `replace`: `firstIndex = 1`, `startMonth = addMonths(toMonthKey(today), 1)`, `months =
     reconciled.months`, every `monthIndex` the row's `sellMonth ?? 1`, `reviewMonthIndex = reconciled.reviewMonth`.
   - `revise`: `firstIndex = k`; the draft is in the ACTIVE plan's numbering — `name` is `openPlan.name`,
     `startMonth` is the month of instalment `k`, `months = min(reconciled.months, 60 − (k − 1))` (the months that
     REMAIN; the engine's `months_range`), with the note «Il piano attivo ha già {k − 1} rate chiuse: la durata
     scende a {m} mesi.» when the cap bites; every `monthIndex` is `(sellMonth ?? 1) + k − 1` and
     `reviewMonthIndex = reconciled.reviewMonth + k − 1` (absent stays absent), each clamped to `k − 1 + months`.
     When instalment `k`'s month is already past (a plan nobody recorded), the revision still starts there: the
     engine treats it as it treats any late instalment.
   - `revise` with NO intact instalment (`k` undefined): `blocked = ACCUMULO_PLAN_NOTHING_TO_REVISE` (decision
     98), `draft`, `preview` and `issues` those of an empty draft; steps 1–6 and 8 are skipped.
8. **Issues and preview** — `issues = validateDraftAgainstAssets(draft, assetsById, firstIndex)` and `preview =
   buildDraftPreview({ draft, allAssets, targets, band, compare, deps, firstIndex })` (NOVE-23's parameters),
   both on `assets` plus one synthetic asset per `toCreate` (`id: 'new:<ref>'`, quantity 0, the form data's
   price). The issues are empty by construction (the reconcile gives every held buyable instrument a row; a
   money-market fund is never a position); a non-empty list is a guard (U3). `blocked`, the first that applies:
   - `!reconciled.usable` → the reconcile's last correction sentence;
   - an issue → its message (`describeDraftIssue`);
   - `preview.liquidity.L <= 0` → «Oggi il piano non ha niente da investire: sopra la riserva non c'è liquidità,
     e non ci sono versamenti né vendite.»;
   - every position with a quota above 0 is in `preview.unpricedPositionIds` → «Nessuno degli strumenti da
     comprare ha un prezzo: dai loro un ticker in Patrimonio, poi crea il piano da qui.»;
   - else `null`.

`describeAdvicePlanSummary(build)` (in `lib/utils/allocationAdviceNarrative.ts`, zod-free) gives the tick's line:
«{months} mesi da {mese}, {€} al mese: prima rata {€}{, n strumenti da creare}{, n vendite con tasse stimate
{€}}.» — `{mese}` is `monthLabelLong(draft.startMonth)`; the first instalment is the first instalment of
`preview.schedule.installments` whose lines sum above 0; the taxes are the TOTAL of the reconciled `sell` rows'
`estimatedTaxEur` (decision 96: no per-sale figure here). The sales' clause, by case: every sale estimable → «,
{n} vendite con tasse stimate {€}»; some `null` → «, {n} vendite con tasse stimate {€}, non stimabili su {k}»;
every one `null` → «, {n} vendite con tasse non stimabili»; no sale → no clause.

### 4.4 The executor (`lib/services/advicePlanService.ts`, new, client)

```ts
export interface AdvicePlanRun {
  ownerId: string;
  build: AdvicePlanBuild;
  assets: Asset[];
  openPlan: AccumulationPlan | null;            // selectOpenPlan(plans) ?? null
  targets: AssetAllocationTarget;               // the targets the build was made on (§ 4.5)
  /**
   * `buildModelBasis({ ...settings, targets }, goalsAfter)`: `goalsAfter` is the goal document the click wrote
   * (`goalPlan.document`) when «Gli obiettivi» is ticked, else the route's — never the cache's, which still
   * holds the goals of before (a basis with the old goals would make the model «superato» at once).
   */
  basis: ModelBasis;
  saveSourceAsSetting: boolean;                 // the account was chosen on the page
  sourceAssetId: string;
  compare: AllocationCompare;
  deps: PlanDeps;
  today: Date;
}
export type AdvicePlanStep = 'setting' | 'instruments' | 'plan' | 'activate';
export class AdvicePlanError extends Error { step: AdvicePlanStep; done: AdvicePlanStep[] }

export async function executeAdvicePlan(run: AdvicePlanRun): Promise<{
  planId: string;
  action: AdvicePlanBuild['action'];
  /** Why the model was not written (the plan stands), or null. */
  modelError: string | null;
}>
```

Before any write: a `build` with `blocked !== null` or with issues is refused (a thrown `Error`: the page never
sends one); the assets are RE-READ (`getAllAssets(ownerId)`) and `sourceAssetId` must be among them and pass
`isPlanSourceAccount`, else `AdvicePlanError` with `step: 'plan'`, `done: []` and «Il conto per gli investimenti
non c'è più: sceglilo di nuovo e premi «Crea il piano di accumulo».» — nothing of the plan is written, the
setting included. Then, in order, each step awaited:

1. `setting` — when `saveSourceAsSetting`: `setSettings(ownerId, { investmentCashAssetId: sourceAssetId })`.
2. `instruments` — for each `toCreate` whose instrument is not already among the re-read assets
   (`findAdviceInstrument(assets, formData)`: K6, the page's matcher) `createAsset(ownerId, formData)`; the map
   `new:<ref>` → id is built from the created and the found ones; the draft's ids are replaced; the assets are
   re-read once more.
3. `plan` and `activate` —
   - `create` / `replace`: `createAndActivatePlan({ ownerId, draft, existingDraftId: action === 'replace' ?
     openPlan.id : undefined, activate: { allAssets, targets, compare, deps, today }, model: { input: { weights,
     origin: 'manual' }, basis } })` (below), `weights = planPositionsToModelWeights(draft.positions, assetsById,
     (asset) => asset.quantity).portfolioWeights`; with no weight, `model` is omitted and `modelError =
     MODEL_NO_TRADABLE_INSTRUMENTS` (`lib/utils/modelPortfolio.ts:108`).
   - `revise`: `revisePlan(openPlan.id, revision, { allAssets, deps, today })` with `revision = {
     monthlyInflowEur, reserveEur, remainingMonths: draft.months, positions, sourceCashAssetIds,
     reviewMonthIndex: draft.reviewMonthIndex ?? null, advisorNotes: draft.advisorNotes, disposals:
     diff.newDisposals, removedDisposalAssetIds: diff.removedDisposalAssetIds, movedDisposalMonthIndexes:
     diff.movedDisposalMonthIndexes }`, `diff = diffRevisionDisposals(openPlan, draft.disposals)` — the draft is
     already in the active plan's numbering and `draft.months` is already capped (§ 4.3 step 7), so nothing is
     shifted here. Then the model: `saveModelPortfolio(ownerId, { weights, origin: 'manual' }, allAssets, basis)`
     inside a `try/catch` — a failure, or no weight, becomes `modelError`, never a throw.

`create` and `replace` go through ONE function of `lib/services/accumulationPlanService.ts`, which NOVE-22's path
calls too (README § 7):

```ts
export interface CreateAndActivateInput {
  ownerId: string;
  draft: AccumulationPlanDraft;
  /** An open draft to overwrite, in place of a new one. */
  existingDraftId?: string;
  activate: ActivatePlanInput;                  // { allAssets, targets, compare, deps, today }
  /** The model to write after the activation; absent = the model is not written. */
  model?: { input: ModelPortfolioInput; basis: ModelBasis };
}
export type PlanWriteStep = 'plan' | 'activate';
export class PlanWriteError extends Error { step: PlanWriteStep; planId?: string }
/**
 * Refuses a draft `validateDraftAgainstAssets` has an issue with, before any write (`step: 'plan'`); writes the
 * draft (`createDraftPlan`, or `updateDraftPlan` on `existingDraftId`), activates it (`step: 'activate'`, with
 * the draft's `planId`), then writes the model. Once the plan is active it NEVER throws: a model that cannot be
 * written comes back as `modelError` (`describeWriteError`'s sentence), the plan stands.
 */
export async function createAndActivatePlan(input: CreateAndActivateInput): Promise<{ planId: string; modelError: string | null }>
```

**The gate learns a missing account.** `validateDraftAgainstAssets` today skips a source account that is not
among the assets (`lib/utils/accumulationPlanSchema.ts:203-211`: `source_not_cash` fires only on an asset that
EXISTS and is not cash), so a plan could be written on an account deleted a minute before. It gains the issue
`source_missing` — a `liquidity.sourceCashAssetIds` id absent from `assetsById` — with `describeDraftIssue({ code:
'source_missing' })` = «Un conto del piano non c'è più: scegli di nuovo da quale conto comprare.»
(`DraftIssueCode` and `DraftIssueContext` in `lib/utils/accumulationNarrative.ts` gain the code).
`createAndActivatePlan` therefore refuses it on the assets its caller re-read (`step: 'plan'`, nothing written):
NOVE-22's and NOVE-26's paths rely on this; this spec's executor checks the account itself, earlier, to say it in
the Consulente's words.

`executeAdvicePlan` wraps a `PlanWriteError` into the `AdvicePlanError` of the same step; any other throw of a
step becomes the `AdvicePlanError` of that step.

**After a failure.** `describeAdvicePlanFailure(error, wroteSettings: boolean)` (narrative): «{Ho scritto target,
ruoli e obiettivi. }{Ho creato gli strumenti. }Non sono riuscito a {salvare il conto per gli investimenti | creare
gli strumenti | scrivere il piano | attivare il piano}: {reason}. Premi «Crea il piano di accumulo»: riparte da
lì.» — the first clause only when the same press wrote the settings, the second when `done` holds `instruments`.
The page has moved to its applied body (§ 4.5), where that button is. A second press rebuilds `build` on the
re-read data: the instruments are found (K6), a draft left by a failed activation is `replace`d and activated.

**When the model is not written** the plan is active and nothing is retried: the result carries `modelError`,
`markApplied` records the plan, and the applied page shows, under «Piano creato.», `describeModelNotUpdated(reason)`
= «Il portafoglio modello non è stato aggiornato: {reason}. Aggiornalo da Accumulo.» — for this session only (the
sentence is not stored: on a reload Accumulo's own «superato» verdict tells it).

### 4.5 The «Applica» page (`ConsulenteReport.tsx`, `ConsulenteBookPages.tsx`, `ConsulentePlanTick.tsx` new)

- `components/allocation/consulente/ConsulentePlanTick.tsx` (new, loaded through the repo's `lazyComponent()`,
  `components/ui/lazy-component.tsx`, only when `operatingPlanOf(document)` is not null and the «Applica» page is
  the open one). Props: `{ ownerId; document; assets: Asset[] /* with the ticked role changes applied, § 4.3 */;
  targets: AssetAllocationTarget; goalsAfter: GoalBasedInvestingData | null; mode: 'tick' | 'button'; checked:
  boolean; onCheckedChange(value: boolean): void; targetsTicked: boolean; onBuild(ready: AdvicePlanReady | null):
  void }`, with

  ```ts
  export interface AdvicePlanReady {
    build: AdvicePlanBuild;                       // blocked === null
    sourceAssetId: string;
    saveSourceAsSetting: boolean;
    openPlan: AccumulationPlan | null;
    basis: ModelBasis;                            // buildModelBasis({ ...settings, targets }, goalsAfter)
  }
  ```

  It reads `useSettings(ownerId)`, `useAccumulationPlans(ownerId)` and the quotes through a hook
  `useAdviceQuotes(symbols: string[], options: { enabled: boolean })` in `lib/hooks/useAdviceQuotes.ts` — key
  `queryKeys.adviceQuotes(symbolsKey)` added to `lib/query/queryKeys.ts` (`symbolsKey` = the sorted symbols joined
  by `,`; not under `PERSISTED_QUERY_PREFIXES`), one `GET /api/prices/quote?ticker=` per symbol of every `new`
  instrument that is not K4's bond, `staleTime` 5 minutes; a symbol whose request fails counts as a quote without
  a price. `pricing[ref] = resolveNewInstrumentPricing(instrument, quotesOf(instrument.symbols), Date.now())`. It
  calls `buildAdvicePlan` in render (pure) with `compare: compareAllocations`, `deps: { valueOf:
  calculateAssetValue, priceOf: unitPriceEur }`, `band: DEFAULT_REBALANCE_BAND`, `keepNames:
  document.answers.keepAssets`, `limits: settings?.idealAllocation?.instrumentLimits ?? []`, and reports up
  through `onBuild` — `null` whenever the plan cannot be created now (loading, no account chosen, `blocked`). It
  renders:
  1. `mode: 'tick'` — the checkbox `id="apply-plan"` with the label by `build.action`: «Il piano di accumulo:
     {summary}» / «Il piano di accumulo, al posto della bozza che hai in Accumulo: {summary}» / «Rivede il piano
     di accumulo attivo: {summary}». `mode: 'button'` — the same sentence as a plain line, no checkbox;
  2. «Da quale conto?» — a `Select` of the source accounts (`isPlanSourceAccount`), only when
     `resolveInvestmentAccountId(settings, assets)` is null; under it «Lo ricordo come Conto per gli
     investimenti.»; `saveSourceAsSetting` is true exactly when the account comes from this select;
  3. one line per instrument to create (`describeNewInstrument`);
  4. «Corretto dall'app» with `build.notes`, when any;
  5. its states — in each the checkbox is off and disabled (in `mode: 'button'` the button is disabled) and the
     sentence takes the summary's place: settings, plans or quotes loading → «Preparo il piano…»; plans not read →
     «Non ho letto i piani di accumulo: ricarica la pagina per creare il piano da qui.»; no source account among
     the assets → «Per creare il piano serve un conto da cui comprare: aggiungine uno in Patrimonio.»; `mode:
     'tick'` with «I target» unticked → «Il piano va verso i nuovi target: applicali insieme.»; `build.blocked` →
     that sentence, and when it is `ACCUMULO_PLAN_NOTHING_TO_REVISE` the link «Apri Accumulo» beside it (decision
     98). No account chosen yet in the select → the checkbox disabled, no sentence (the select is the prompt).
- **The targets the plan goes toward** (`targets`, computed by `ConsulenteReport`): a new pure function
  `resolveEffectiveTargets(settings: AssetAllocationSettings | null | undefined, goalData: GoalBasedInvestingData
  | null | undefined, assets: Asset[]): { targets: AssetAllocationTarget; fromGoals: boolean }` in
  `lib/utils/allocationUtils.ts` — the block of `app/dashboard/allocation/page.tsx:262-279` moved as it is (the
  page calls it) — so the plan measures what Allocazione measures, goal-driven targets included. On a `ready`
  document: `resolveEffectiveTargets({ ...settings, targets: buildTargetsFromProposal(proposal) }, goalsAfter,
  assets).targets`, `goalsAfter` = `goalPlan.document` when «Gli obiettivi» is ticked, else the route's
  `goalData`. On an `applied` document (K14): `resolveEffectiveTargets(settings, goalData, assets).targets`, the
  LIVE settings and goals.
- `ConsulenteReport.tsx`: state `applyPlan` (default true) and `planReady: AdvicePlanReady | null`; `canApply`
  also allows `applyPlan && planReady`; «Applica alle impostazioni» is disabled while `applyState` is `writing`
  (K11). `apply()`, after the goals' write and BEFORE `markApplied`, when `applyPlan && planReady`: awaits
  `executeAdvicePlan({ ownerId, ...planReady, assets, targets, compare: compareAllocations, deps, today: new
  Date() })` (imported with `await import('@/lib/services/advicePlanService')`) inside its own `try/catch`; then
  `markApplied(ownerId, { …written, planId, planAction })` — without the two fields when the plan failed (the
  settings ARE applied) — and the invalidations gain `queryKeys.accumulationPlans.all(ownerId)`,
  `queryKeys.modelPortfolio.byOwner(ownerId)` and the assets' key. The plan's outcome of THIS press lives in a
  state `planOutcome: { failure: string | null; modelError: string | null } | null` the applied body shows. A
  `markApplied` that fails after the plan was created is today's failure of `apply()` («Applica» stays, the status
  line says it): pressing again rewrites the settings as today and REVISES the plan just created — one more
  `revisions` row with the same figures; left as it is, declared (§ 10).
- `ApplyPiecesInput` (`ConsulenteBookPages.tsx:253-272`) loses `handoff` and `activePlanNote` and gains `planTick:
  ReactNode | null` (the lazy component in its mode, rendered after the three ticks in the `ready` body and in
  the applied body's last branch below), `planDone: { sentence: string; modelNote: string | null } | null`,
  `planFailure: string | null`, `onCreatePlan: (() => void) | null` and `creatingPlan: boolean`. `ApplyState`
  gains nothing (the status line reads «Scrivo…», then «Applicato.» or the failure).
- The applied body, the first branch that applies:
  1. `document.applied.planId` → `planDone`: «Piano creato.» / «Bozza sostituita e piano attivato.» / «Piano
     rivisto.» (by `planAction`), `describeModelNotUpdated(planOutcome.modelError)` under it when this press left
     one, and the link `ACCUMULO_OPEN_LINK` («Apri Accumulo», `/dashboard/allocation?tab=accumulo`, a `Button
     asChild variant="outline"`);
  2. `applied.targetsWritten` and `operatingPlanOf(document)` not null → `planFailure` when this press left one
     (`describeAdvicePlanFailure`), `planTick` in `mode: 'button'`, and the button «Crea il piano di accumulo»
     (primary; disabled without `planReady` and while `creatingPlan`, K11), which runs `executeAdvicePlan` and
     then `markApplied(ownerId, { ...the stored applied counts, planId, planAction })`;
  3. else NOVE-24's absence row alone, when there is one.
- `lib/utils/accumuloCopy.ts` (new, import-free: the sentences the Consulente's route AND Accumulo show, so that
  neither route loads the other's narrative): `ACCUMULO_OPEN_LINK = 'Apri Accumulo'` (decision 94; `PianoTile.tsx:226`
  reads it in place of its literal), `ACCUMULO_PLAN_NOTHING_TO_REVISE = 'Il piano attivo ha già tutte le rate
  chiuse: chiudilo in Accumulo per crearne uno nuovo.'` (decision 98) and `describeModelNotUpdated(reason: string):
  string`. NOVE-22 and NOVE-26 read the three from here.
- `/api/allocation-advice/applied`: `appliedSchema` gains `planId: z.string().min(1).optional()` and `planAction:
  z.enum(['create', 'replace', 'revise']).optional()`; `AllocationAdviceApplied` and `mapAllocationAdviceData` too.
  The route accepts a second POST on an `applied` document (it does today: it only requires a report) and then
  KEEPS the stored `applied.at` (today `route.ts:37` stamps `new Date()` on every POST): «applicato il …» in the
  book and in the next run's prompt stays the day the settings were applied (K9).
- Copy (`allocationAdviceNarrative.ts`): `describeApplySummary` gains `plan: 'create' | 'replace' | 'revise' |
  null` and ends «…e crea il piano di accumulo.» / «…e sostituisce la bozza del piano.» / «…e rivede il piano di
  accumulo.»; `HANDOFF_ACTION_LABEL`, `HANDOFF_READING`, `HANDOFF_DRAFT_NOTE`, `APPLY_ACTIVE_PLAN_NOTE` are deleted.

### 4.6 Accumulo: the notes, and what is removed

- `QuestoMeseTile` (active view, under the reading): when `plan.advisorNotes?.length`, the sub-eyebrow «Dal
  Consulente» and the notes as a `divide-y` list of `text-[12px] text-muted-foreground` lines; more than three →
  the first three and a `<details>` «Altre {n}» with the rest.
- **Removed** (the whole list: a caller outside it is a reason to stop, § 11):
  - `components/allocation/ConsulenteHandoff.tsx`, `components/allocation/KeptSalesNote.tsx` and the editor's
    `advisorKeepAssetIds` prop;
  - from `lib/utils/allocationAdviceHandoff.ts`: `buildHandoffSeed`, `findKeptSales`, `handoffCriteria` (`:111`,
    read by the seed alone) and the optimizer imports; the module keeps `planConsulenteHandoff` and its matchers
    (NOVE-24's facts read them) and its header comment is rewritten to say so;
  - from `lib/utils/accumulationNarrative.ts` every export of the «Dal Consulente» block (`:1451-1511`):
    `HANDOFF_EYEBROW`, `HANDOFF_TITLE`, `HANDOFF_NO_TICKER`, `HANDOFF_CREATED_PENDING`, `describeHandoffZero`,
    `describeHandoffExtra`, `describeHandoffUnnamed`, `describeHandoffNotBuyable`, `describeHandoffReading`,
    `describeKeptSales`, with the type import of `ConsulenteHandoffPlan` / `HandoffSeedOutcome` (`:27`);
  - from `lib/utils/allocationAdviceDocument.ts`: `CONSULENTE_HANDOFF_HREF`, `applyHandoffOf`,
    `handoffProposalOf`, `ApplyHandoff`;
  - `ConsulenteBook.tsx`'s hand-off link (its two imports, `:36-37`, and the `handoff === 'offer'` button,
    `:280-285`);
  - `AccumuloTab`'s `advice` prop, its `?da=consulente` branch and the `advice={…}` passed at
    `app/dashboard/allocation/page.tsx:814` (`useAllocationAdvice` stays on the page for the header's review
    line) — the tab only rewrites a `da=consulente` URL to `?tab=accumulo` (an old bookmark);
  - tests: `e2e/accumulo.consulente.spec.ts`, `__tests__/consulenteHandoff.test.tsx`,
    `__tests__/keptSalesNote.test.tsx`; the hand-off cases of `__tests__/allocationAdviceHandoff.test.ts` and
    `__tests__/allocationAdviceDocument.test.ts`; the hand-off and active-plan-note cases of
    `__tests__/consulenteBook.test.tsx` (`:22-23`, `:369-420`).
- `AssetDialog`'s `prefill` prop is deleted with its cases in `__tests__/assetDialogCreateEmpty.test.tsx:93`
  (its one caller was `ConsulenteHandoff.tsx:87`); the TYPE `AssetPrefill` stays — the operating plan's legend
  carries it.
- The editor (`AccumulationPlanDialog.tsx`), alive until NOVE-26: `draftFromPlan` carries `reviewMonthIndex`,
  `advisorNotes` and `optimizerSnapshot` (§ 4.1), so a draft the click made and the editor saves again keeps its
  notes.

### 4.7 The daily price update (`lib/helpers/priceUpdater.ts`)

No change of behaviour is needed by K3 (an instrument without a symbol has `autoUpdatePrice: false`) nor by K4 (a
government bond with an ISIN takes the Borsa Italiana branch that exists, `:91-131`); one guard is added where the
tickers are collected (`:161-166`): `.filter((ticker) => ticker.trim() !== '')` — an empty ticker from any source
never reaches Yahoo.

### 4.8 DESIGN.md (The AI-Accent Rule, `DESIGN.md:579`)

One amendment, as before / after, on the text NOVE-24 left (its «Scrivi il piano operativo» is already in the
list of controls that ask a model). **Never accented** — before: «… «Applica alle impostazioni», «Crea un piano di
accumulo verso questa allocazione», «Salta il colloquio», …»; after: «… «Applica alle impostazioni», «Crea il
piano di accumulo», «Apri Accumulo», «Salta il colloquio», …».

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **The click writes money decisions without an editor** (decision 72): here it means the page shows BEFORE the
  click everything the plan will hold that the report did not say — the corrections, the instruments with ticker,
  price and date, the account, what happens to an open plan — and U3 proves a draft with an issue never reaches
  `createDraftPlan`.
- **`validateDraftAgainstAssets` is the editor's gate, not the service's** (`createDraftPlan` and `activatePlan` do
  not call it): `buildAdvicePlan` calls it; `executeAdvicePlan` refuses a `build` whose `issues` are not empty,
  and `createAndActivatePlan` runs it again on the re-read assets before its first write.
- **The roles the click changes are in the build**: «Applica» writes `updateAssetAllocationRole` BEFORE the plan
  (`ConsulenteReport.tsx:110-114`); a build made on the roles of before would be refused at the click (an
  instrument turned `frozen` is a `position_not_tradable`, one turned `tradable` an `unassigned_tradable`).
  `ConsulenteReport` passes the tick the assets with the ticked changes applied (§ 4.3); R1 asserts a role turned
  `frozen` leaves no position.
- **Two transactions, not one** (`createDraftPlan` takes the lock, `activatePlan` computes): a failure between them
  leaves a DRAFT — which the next press replaces and activates (K6). The lock `accumulationPlanLocks/{ownerUid}` is
  never written by this spec's code.
- **`setSettings` with `targets` uses the no-merge branch** (impostazioni.md): the investment account is saved by a
  SECOND `setSettings` call without `targets` (the merge branch), after the first — never folded into the targets'
  write, which would rebuild the document.
- **The applied targets are not in the React Query cache when the plan is built**, nor the applied goals: on a
  `ready` document the builder and the basis receive them explicitly (`buildTargetsFromProposal(proposal)` and
  `goalPlan.document`, through `resolveEffectiveTargets`, § 4.5); nothing reads the cached `settings.targets` for
  the reserve or the basis there. U8 asserts the basis' goals are the written ones.
- **Choice l (README § 4)**: the model and the plans' weights are read only on the Accumulo tab — here it means
  the Consulente route WRITES the model from the plan's weights without reading it (the editor's checkbox default
  «on when it differs» becomes «always»: a plan made from the Consulente is the new intent).
- **The Consulente route's weight**: `ConsulentePlanTick.tsx` is the only file under
  `components/allocation/consulente/` that may import `advicePlan`, `accumulationPlanUtils`, `operatingPlanFacts`
  or `accumulationNarrative`. The guard test (`__tests__/allocationAdviceDocument.test.ts:167-176`, the pattern at
  `:174`) matches MODULE PATHS, not bare names («advicePlan» is inside «advicePlanService»):
  `/@\/lib\/utils\/(advicePlan|accumulationPlanUtils|accumulationNarrative|operatingPlanFacts|allocationAdviceHandoff|weightOptimizer)['"]/`
  on every `.tsx` there but `ConsulentePlanTick.tsx`; a second pattern refuses a static `from
  '@/lib/services/advicePlanService'` (the `await import(` form is the allowed one); a third asserts
  `ConsulentePlanTick` is imported only through `lazyComponent()`. The sentences both routes show come from the
  import-free `lib/utils/accumuloCopy.ts` (§ 4.5).
- **React Compiler**: `buildAdvicePlan` in render is pure; `onBuild` is called from an effect keyed on the
  build's fingerprint (`JSON.stringify` of action, blocked, positions, disposals, toCreate, the source account),
  never on the object.
- **A plan restored from the persisted cache is not today's** (doc/guide/cache-persistita.md): the tick builds
  only on plans fetched after mount — `useAccumulationPlans`' `isFetchedAfterMount`; before that it shows «Preparo
  il piano…».
- **No control that spends**: the quote route is free; no model is called by this spec. In E2E the route is
  stubbed with `page.route('**/api/prices/quote*', …)`.
- **Shared account**: every write uses `ownerId`; a co-owner's click creates the owner's plan, as his editor does.
- **Cents and whole shares**: nothing here rounds; the engine does (`activatePlan`).
- **No owner data in a tracked file**; **series labels never enter code**.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/advicePlan.test.ts` › `buildAdvicePlan` on an invented portfolio (ETF A 6.000 «buy 60», ETF B 2.000 «hold», ETF C «sell 20 quote, month 3», money-market fund M1 «sell 10 quote», new N1 «buy 40»): positions A 60, B 0, C at 0 with a partial sale, `new:N1` 40, NO position for M1; two disposals, C's with `monthIndex: 3`; months, inflow, `reviewMonthIndex`; `action: 'create'`, `firstIndex: 1`, `issues` empty, `blocked: null` | build positions from the stored rows, skipping today's reconcile |
| U2 | same: since the plan was written A was sold (gone) and a new ETF D was bought → A's row dropped with its sentence, D a row at 0 % named in `notes`; the stored corrections come first, none repeated; N1 now among the assets under ANOTHER name with the same ISIN → no `toCreate`, the position on its id; twenty held instruments the plan does not name → the notes are capped and `accumulationPlanDraftSchema` parses the draft | keep the stored facts |
| U3 | same: a draft made invalid on purpose (a row removed after the reconcile, through `input.reconcile`) → `issues` not empty and `blocked` its message; no cash above the reserve, inflow 0, no sale → `blocked` the «niente da investire» sentence; every `buy` row on an unpriced new instrument → `blocked` the «nessuno … ha un prezzo» sentence | return `blocked: null` |
| U4 | same › `pickFreshQuote`: the first symbol 9 days old, the second 1 day → the second; a USD quote without `currentPriceEur` skipped; none → null; exactly 5 days → accepted | `>=` on the age |
| U5 | same › `newInstrumentFormData` and `resolveNewInstrumentPricing`: priced → the symbol, the price, `autoUpdatePrice: true`, `createdEmpty`, `isLiquid: true`, `allocationRole: 'tradable'`; unpriced with an ISIN → the ISIN as ticker, price 0, `autoUpdatePrice: false`; no ISIN → the slug, matching `tickerSchema`'s pattern; a bond with an ISIN → the ISIN as ticker, price 0, `autoUpdatePrice: true` (K4); a bond without an ISIN → the symbols' path | `autoUpdatePrice: true` always |
| U6 | `__tests__/priceUpdater.test.ts` (new; `getMultipleQuotes` and the Admin SDK mocked): an asset with `ticker: ''` is not sent to `getMultipleQuotes`; `__tests__/yahooFinanceService.test.ts` (new; `yahoo-finance2` mocked): `getQuote` returns `quotedAt` | drop the filter |
| U7 | `advicePlan.test.ts`: an open draft → `action: 'replace'`; an active plan at `k` = 4 → `action: 'revise'`, `firstIndex: 4`, `startMonth` the 4th instalment's month, the sale's month 3 → `monthIndex: 6`, the review month shifted by 3, `issues` empty with a sale in the last month; 60 months on `k` = 4 → `months: 57` and the note; a sale that plan already executed → the row stays a position at 0, no disposal, K8's sentence, `issues` empty; an active plan with no intact instalment → `blocked: ACCUMULO_PLAN_NOTHING_TO_REVISE` | leave the months unshifted |
| U8 | `__tests__/advicePlanService.test.ts` (`assetService`, `accumulationPlanService`, `modelPortfolioService`, the settings service mocked): `create` → `createAsset` once per missing instrument, THEN `createAndActivatePlan` once with the draft on the real ids, no `existingDraftId`, `activate` on the re-read assets and `model` with A 60 / N1 40 / B 0, `origin: 'manual'` and the basis given (the written goals) | call `createAndActivatePlan` before creating the instruments |
| U9 | same: `replace` → `createAndActivatePlan` with `existingDraftId`; `revise` → `revisePlan` with `remainingMonths: draft.months`, `diffRevisionDisposals`' three fields, `reviewMonthIndex`, `advisorNotes`, then `saveModelPortfolio`, never `createAndActivatePlan` | pass `reconciled.months` |
| U10 | same: `createAndActivatePlan` rejects with a `PlanWriteError` at `activate` → `AdvicePlanError` with `step: 'activate'`, `done: ['instruments', 'plan']`; a second run with the instrument already among the assets creates none; `createAndActivatePlan` resolves with a `modelError` → the result carries it, no throw; `revise` with `saveModelPortfolio` rejecting → the same; a source account missing from the re-read → `step: 'plan'`, `done: []`, no service called | create without the re-read |
| U11 | `__tests__/allocationAdviceDocument.test.ts`: the exports removed are gone (a `// @ts-expect-error` import list); `__tests__/accumulationPlanSchema.test.ts`: `advisorNotes` accepted, 41 refused; a source account id absent from the assets → `source_missing` with its sentence, a present cash account → no issue | skip an absent account |
| U12 | the guard of § 5 (`allocationAdviceDocument.test.ts:167-176`) | a static import of `@/lib/utils/advicePlan` in `ConsulenteReport.tsx` |
| U13 | `__tests__/allocationUtils.test.ts` › `resolveEffectiveTargets`: goal-driven on with goals → the derived targets, `fromGoals: true`; off, or no goal → `settings.targets`; no settings → the defaults | return `settings.targets` always |
| U14 | `__tests__/allocationAdviceNarrative.test.ts`: `describeAdvicePlanSummary` (the four sales' clauses), `describeApplySummary` with the plan, `describeAdvicePlanFailure` (with and without the settings' clause), `describeNewInstrument`'s four lines | — |
| U15 | `__tests__/accumulationPlanService.test.ts` (Firestore mocked as the file does today) › `createAndActivatePlan`: a draft with an issue → `PlanWriteError` `step: 'plan'` and no write; `existingDraftId` → the draft is updated, not created; an activation that rejects → `step: 'activate'` with the `planId`; a model that rejects → resolves with `modelError`, the plan active. › `updateDraftPlan`: a draft without `advisorNotes`, `reviewMonthIndex`, `optimizerSnapshot` clears the three with `deleteField()` | validate after `createDraftPlan` |
| U16 | `__tests__/allocationAdviceRoutes.test.ts`: a second POST of `applied` with a `planId` keeps the first `at` | stamp `new Date()` |
| R1 | `__tests__/consulentePlanTick.test.tsx` (new, `dom`; hooks mocked): the label by action, the summary, the instruments' lines with ticker · price · date, «Corretto dall'app»; a role turned `frozen` in the assets given leaves no position in the build reported | hide the notes |
| R2 | same: no investment account → the select; without a choice the checkbox is disabled; with one `onBuild` carries it and `saveSourceAsSetting: true` | enable without a choice |
| R3 | same: plans loading / failed, no source account, targets unticked, `blocked` (the reconcile's sentence; decision 98's with the link «Apri Accumulo») → the sentences, the checkbox off and disabled, `onBuild(null)`; plans from the restored cache only → «Preparo il piano…» | enable on a failed read |
| R4 | `__tests__/consulenteBookPlan.test.tsx`: the applied body with `planId` (the three sentences, the link, the model line when given) and without (the failure, the button, disabled while `creatingPlan`) | show the button with a `planId` |
| E1 | `e2e/allocation.consulente.report.spec.ts`: a planted `ready` report with a planted plan (one new instrument, one sale in month 2); the quote route stubbed fresh → the tick, the summary, the line «ticker · prezzo · data»; «Applica alle impostazioni» → «Piano creato»; through firebase-admin: the asset at 0 quotes with the symbol, the plan `active`, `disposals[0].monthIndex` 2, `advisorNotes`, the model document | — |
| E2 | same: the quote stubbed stale on every symbol → the «senza prezzo» line; after the click the asset has `autoUpdatePrice: false` and the plan is active with that position unpriced | — |
| E3 | same: no investment account → the select; after the click `assetAllocationSettings/<uid>.investmentCashAssetId` is the chosen one and the targets written are intact | — |
| E4 | same: a planted draft → the «al posto della bozza» label; after the click ONE plan, active | — |
| E5 | same: a planted active plan (the Accumulo fixture) → «Rivede il piano…»; after the click the plan has a new `revisions` row and the Consulente's positions | — |
| E6 | same: a planted `applied` report with a plan and no `planId` → «Crea il piano di accumulo» → «Piano creato» | — |
| E7 | same: an asset with the new instrument’s ISIN and a DIFFERENT name is planted first (as a first press that created it and then failed would leave it) → no line «da creare» for it; after the click ONE asset with that ISIN, and the plan buys it | — |
| E8 | `e2e/accumulo.spec.ts`: `?tab=accumulo&da=consulente` → the URL is cleaned, no dialog | — |

Every E test that writes cleans after itself in `afterEach`: `removeOwnerPlans()` (`e2e/accumuloFixture.ts`,
NOVE-23), the assets the click created (deleted through firebase-admin by their planted ISIN), the settings
document restored to the seed's (`targets`, `investmentCashAssetId`), the model document deleted and the advice
document re-planted — the next spec file finds the seed account as `emulators:seed` left it.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account, with a planted report and a planted operating plan, the
«Applica» page shows the plan's tick with a summary whose first instalment equals the one the Accumulo tab shows
after the click; one press creates the missing instrument and an ACTIVE plan with the Consulente's quotas and the
sale in its month; «Apri Accumulo» shows «Questo mese» with the notes; with a planted draft the click replaces
it; with a planted active plan it revises it; no model is called and no window opens.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/allocation.consulente
  e2e/accumulo` in every project.
- **B**: emulators + `emulators:seed` + `dev:emulator`; a scratchpad script (from inside the repo) plants
  `plant('ready')` with an operating plan built by `reconcileOperatingPlan` on the seed portfolio: two buys (one a
  NEW instrument with three invented symbols), one hold, one sale of 5 quotes in month 2, review month 6; the dev
  server's quote route is used for real (Yahoo is free) with one real, liquid, public ETF symbol among the three and
  two invented ones first — the app must skip the two and take the third.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the «Applica» page with the fourth tick (the
  lines wrap at 390), the select «Da quale conto?», the click, «Piano creato» and the link; Accumulo's «Questo
  mese» with «Dal Consulente» and the notes; the calendar.
- **D (data)**: `accumulationPlans/<id>`: `status: 'active'`, positions = the plan's rows with Σ 100,00, the sale
  with `monthIndex: 2`, `reviewMonthIndex: 6`, `advisorNotes`, `liquidity.sourceCashAssetIds` = the one account,
  `installments` whose first month spends no sale money and whose instalments rise from month 2, the sale's
  month (decisions 68 and 93); `assets/<new>`: `quantity: 0`, `createdEmpty`, the third symbol as ticker, a price,
  `autoUpdatePrice: true`, `isLiquid: true`, no `assetTransactions` row; `modelPortfolios/<uid>` with the plan's
  weights; `allocationAdvice/<uid>.applied.planId`; `assetAllocationSettings/<uid>` with the new targets AND
  `investmentCashAssetId`.
- **E (edges)**: every symbol invented → «senza prezzo», the click still creates the plan (the other rows buy)
  and «Questo mese» says the position has no price; the ONLY `buy` row on an unpriced instrument → the tick off
  with its sentence; untick «I target» → the tick goes off with its sentence; plant a draft → replace; plant the
  active fixture → revise (the executed instalments keep their figures: compare before and after with the script);
  plant an active plan with every instalment closed → the tick off with decision 98's sentence and «Apri
  Accumulo»; delete the investment account between the page's load and the click → targets, roles and goals are
  written, the plan is not: the «Il conto per gli investimenti non c'è più…» sentence, then «Crea il piano di
  accumulo» with the select; press «Applica alle impostazioni» twice quickly → one run, one plan; a planted
  government bond with an ISIN among the new instruments → created with the ISIN, `autoUpdatePrice: true`, its
  line on the tick.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); a plan built by hand in the script
  (as NOVE-24's F) is planted on his mirrored report; he reads the tick's summary, the instruments' lines and the
  corrections, presses «Applica» on the MIRROR and opens Accumulo. Nothing touches production; no model runs.
  `npm run mirror:remove`.
- **G**: `npm run perf:budget`, every route green (`/dashboard/allocation` must not grow: the hand-off leaves it —
  record the drop; the Consulente route's weight before and after in doc/guide/velocita.md § Registro dei tetti
  alzati, the lazy chunk named); `mobile:census` + `mobile:budget` on the standard fixture (its plan has no notes):
  green and unchanged — the notes appear only on a plan that has them, which no budget entry measures; stop the
  servers, delete the scripts, remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration. After the deploy, on the owner's production account: his
report has no operating plan until NOVE-24's «Scrivi il piano operativo» ran (one Opus call, his key); then the
«Applica» page offers «Crea il piano di accumulo» (his document is already applied) — he reads the summary, the
tickers with price and date, the corrections, and decides whether to press: THIS press writes real data (a plan,
possibly instruments at 0 quotes). The plan can be interrupted from Accumulo («Interrompi piano») and the
instruments at 0 quotes deleted from Patrimonio. Then NOVE-22.

## 9. Documentation

- `doc/guide/consulente-piano.md` (the guide NOVE-24 created; `doc/guide/consulente.md` is past 500 lines and
  takes nothing): the bullet «After «Applica», a plan of accumulation» is REWRITTEN as the click — the fourth
  tick, its states, the targets the plan goes toward (`resolveEffectiveTargets`), the click's steps and their
  order, the applied body, «Crea il piano di accumulo» on an applied document; § Files: `advicePlan.ts`,
  `advicePlanService.ts`, `ConsulentePlanTick.tsx`, `useAdviceQuotes.ts`, `accumuloCopy.ts`; blind spots: «a plan
  failure after the three writes leaves the document applied: the button creates the plan later»; «a model not
  written is said once, on the press that left it».
- `doc/guide/accumulo.md`: § «Dal Consulente» is REWRITTEN as «Il piano del Consulente» — the plan arrives active
  from the click, its notes (`advisorNotes`), `updateDraftPlan` replacing the draft whole, `createAndActivatePlan`;
  the hand-off's three views, the seed and the kept-sale note are deleted from the guide; § Files.
- `doc/guide/patrimonio.md`: where `/api/prices/quote` is described (`:28`), `quotedAt`; § Per-page blind spots:
  «an instrument created by the Consulente's click may have no price and a ticker that is its ISIN or a slug: it
  is completed from its form; it is never auto-updated until it has a symbol — but a government bond with its
  ISIN is, from the first daily update».
- `doc/guide/dialog.md`: `AssetDialog` loses `prefill`; the mounts' count is RE-MEASURED with the guide's own
  command (`grep -rnw '<ResponsiveModal' components app`: 50 mounts in 48 files on 2026-11-19, the guide still
  says 42 in 41) and written with its date — after this spec's deletion of `ConsulenteHandoff.tsx`, 49 in 47; the
  «42 modals» of `CLAUDE.md` § Key Features follows the measured figure.
- `AGENTS.md` § 3 Allocazione › Consulente, il piano operativo and › Accumulo: one bullet each (the click; no
  editor on this path).
- `DESIGN.md`: § 4.8's amendment.
- `CLAUDE.md`: «Latest» REPLACED, not extended; the Consulente line of Key Features rewritten at equal or shorter
  length — the hand-off clause («then a hand-off to a plan of accumulation … PIANO DI ACCUMULO block») out, «one
  «Applica» creates the plan of accumulation, active» in; under 20.000 characters, measured with the command of
  README § 8.
- `README.md:37` (what the user sees): the hand-off sentence replaced by the click. `Draft Release Temp.md:7`: the
  entry «Consulente → Allocazione › Accumulo — un piano verso la nuova allocazione» is REWRITTEN as the one-click
  entry — the window never shipped (decision 62), so nothing is told as «changed».
- `doc/nove/NOVE-20-temi-giro-b.md`: its header (`:8`) names NOVE-21's `ConsulenteHandoff.tsx`, deleted here — the
  clause is removed; every line it cites in a file this spec edits (`ConsulenteBook.tsx`,
  `ConsulenteBookPages.tsx`, `ConsulenteReport.tsx`, `AccumulationPlanDialog.tsx`, `QuestoMeseTile.tsx`,
  `PianoTile.tsx:223`) is re-read on the new code and rewritten with its new number, in the same commit.
- `doc/nove/README.md`: § 6 the row; § 7 the hand-off's contract marked removed.

## 10. Declared out of scope

- **Editing the plan before it is created** (an editor between the report and the plan): none, declared — after
  the click the plan is revised from Accumulo («Rivedi il piano»; NOVE-26 makes that a guided path).
- **Completing a government bond's terms at the click** (K4): none, declared — the asset form owns them; its
  price arrives by itself (decision 97).
- **Two tabs pressing at the same instant** (K6): the same instrument can be created twice; none, declared — the
  duplicate is deleted from Patrimonio, the plans' lock keeps the plan single.
- **A `markApplied` that fails after the plan was created**: the next press revises the plan just created with the
  same figures (§ 4.5); none, declared.
- **The currency of an unpriced instrument**: `EUR` until its form says otherwise; none, declared.
- **The model's failure sentence after a reload**: not stored; Accumulo's «superato» verdict tells it.
- **Searching a symbol by ISIN on the app's side**: none, declared (measured: one listing, a validation throw).
- **Undoing the click as one action**: none, declared — «Interrompi piano» and the asset's deletion exist.
- **Groups of equivalent instruments in a plan made by the click**: none, declared — the Consulente names one
  instrument per row.
- **The Assistente creating a plan**: none, declared.
- **A plan by hand** → NOVE-22, which reuses `resolvePlanReserve`'s `sourceIds` (NOVE-24),
  `resolveEffectiveTargets`, `accumuloCopy.ts` and this spec's create → activate → model sequence,
  `createAndActivatePlan` (README § 7); the path adds instruments through the asset form, never through
  `newInstrumentFormData`.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-25-un-solo-applica.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-25-un-solo-applica.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/consulente.md, doc/guide/consulente-piano.md, doc/guide/accumulo.md,
  doc/guide/ottimizzatore.md, doc/guide/patrimonio.md, doc/guide/impostazioni.md,
  doc/guide/dialog.md, doc/guide/cache-persistita.md, doc/guide/server.md,
  doc/guide/velocita.md, doc/guide/prima-schermata.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Leggi DESIGN.md (The AI-Accent Rule, The Modal-Is-A-Tile Rule, The Absence-Has-Three-Names
  Rule) e PRODUCT.md
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Controlla i processi rimasti da sessioni precedenti: node ~/.claude/processi-collaudo.mjs

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

Implementa la spec così com'è scritta, nell'ordine: il documento del piano (§ 4.1) con la
parte di U15 su updateDraftPlan; la quotazione con la sua data e la guardia
sull'aggiornamento prezzi (§ 4.2, § 4.7) con U6; il costruttore puro (§ 4.3) con U1-U5, U7
e U13; createAndActivatePlan e l'esecutore (§ 4.4) con U8-U10 e U15; la pagina «Applica»,
il componente caricato a richiesta e accumuloCopy.ts (§ 4.5) con U16; le note in «Questo
mese» e le rimozioni (§ 4.6); l'emendamento di DESIGN.md (§ 4.8). I test PRIMA del codice,
ciascuno visto rosso con la sua mutazione; cifre inventate e tonde. Nessun controllo che
spende: nessuna corsa del Consulente; il documento e il piano operativo si piantano; la
route dei prezzi negli E2E è finta. Fermati e chiedimi se: il clic può scrivere un piano
con un problema che validateDraftAgainstAssets segnala; una seconda pressione crea un
secondo strumento o un secondo piano; il peso della route del Consulente, misurato prima e
dopo, non è scritto in doc/guide/velocita.md § Registro dei tetti alzati con il nome del
chunk caricato a richiesta; perf:budget o mobile:budget diventano rossi oltre la regola
della § 8 dell'indice; una rimozione della § 4.6 ha un chiamante che la spec non nomina.
Collaudo: § 7, la F sul mirror al mio «pronto» (premo io «Applica» sul mirror); il
controllo in produzione lo faccio io dopo il deploy (§ 8). Un branch, un commit, solo dopo
il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with shared contracts (the plan document, `buildAdvicePlan`,
`executeAdvicePlan`, `resolvePlanReserve`, the quote route) across the Consulente route, the Accumulo tab, the asset
service and the price update, and a removal with many callers. Estimated size: 1 session, ~7 h; ~340 lines pure,
~190 of service, ~280 across components, ~700 of tests (U1–U16, R1–R4), eight E2E tests.
