# NOVE-24 — The Consulente's «Piano» stage: the operating plan, its data and its page

> Series `doc/nove/` (README.md § 5): **depends on NOVE-23** (a sale's month counts, `reviewMonthIndex`,
> `investmentCashAssetId`, `disposalMonthIndex`) and on NOVE-21's retirement (`planConsulenteHandoff`, the PIANO DI
> ACCUMULO block). Second of the five specs of «dal Consulente al piano di accumulo, in un clic»: this one makes
> the Consulente WRITE the plan — what to sell and how much, when, what to buy and in which quotas, when to look
> again — as ONE structured object, and shows it in the report. It creates no plan of accumulation: NOVE-25's click
> does, from this object. Between the two, NOVE-21's hand-off («Dal Consulente») stays as it is.
> Written on 2026-11-19; every `file:line` is cited on `develop` @ 7909fa4c. Executes decisions 67, 69, 70, 74, 78,
> 81, 82, 84, 85 (README.md § 3); overturns decision 28 and README § 10's «no section with the Consulente's own
> figures».

## 1. The problem today (evidence on the code)

**The Consulente reasons about a plan and is forbidden to write one.** The review's section 6 ends «Il piano
esatto lo calcola l'app dopo «Applica» […]: niente tabelle di rate né quote mensili per strumento»
(`lib/server/allocationAdvice/prompts.ts:460`, pinned by `__tests__/allocationAdvicePrompts.test.ts:500-510`); the
strategy's section 5 gives «la rata mensile come ordine di grandezza» (`:159`). The plan the owner then gets is the
optimizer's (`buildHandoffSeed`, `lib/utils/allocationAdviceHandoff.ts:130-209`): quotas no one explained, no sale,
no month.

**No stage has what a plan needs.** The strategy reads every data block and writes before the instruments exist;
the review knows the instruments and reads NO data block (`run.ts:398`, «The review reads no data block…»): it sees
no quantity, no price, no tax, no cash. Neither can write «vendi 20 quote del fondo X al terzo mese».

**The model has no handle on an instrument.** A proposal names instruments by text (`subTargets[].instrument`,
«nome e ISIN»); `planConsulenteHandoff` re-joins them by name, ticker, ISIN or sleeve
(`allocationAdviceHandoff.ts:57-128`). A plan with a row per instrument needs a key that cannot be misspelt.

**One ticker, on the exchange the user named, is not the ticker that updates.** The instruments contract asks for
instruments «negoziabili sulla borsa indicata dall'utente» with one `ticker` (`prompts.ts:406-422`,
`instrumentCandidateSchema`, `lib/utils/allocationAdviceProposal.ts:293-310`). The owner's case (2026-11-19): a
share bought in Milan and tracked on its Xetra symbol because Milan's stayed still for days.

**The book has no page for figures of a plan.** `passi` («Cosa fare adesso») is text only (`figures.passi: false`,
`lib/utils/allocationAdviceBook.ts:268`; no `case 'passi'` in `piecesOf`,
`components/allocation/consulente/ConsulenteBook.tsx`); `e2e/allocation.consulente.report.spec.ts:146-158` pins it
as the shortest page.

**A stage is all or nothing.** `runAllocationAdviceStage`'s catch marks the whole document `failed`
(`run.ts:551-560`); the review sets `ready` (`:418`). A plan stage wired like the others would hide a finished
report behind its own failure.

## 2. Goal and acceptance criteria

1. A full path runs five stages; the fifth, «Scrivo il piano operativo», writes `document.operatingPlan` with
   `status: 'ready'` and the plan; the document's `status` is the review's (`ready`) throughout. **Proof**: U1, E1.
2. The stage's prompt carries the report with its proposal, the instruments with their block, the DATI PER IL
   PIANO OPERATIVO block, the CASHFLOW 12 MESI block and the PIANO DI ACCUMULO block; `system` is byte-identical for
   every user. **Proof**: U2, U3.
3. The data block gives every instrument a key (S…, N…, M…) and, per held instrument, quantity, unit price, value,
   the tax estimated if sold whole (or why it cannot be estimated), «DA TENERE» and the limits of «Criteri del
   modello»; never an asset id, a tax rate or a held ISIN. **Proof**: U4.
4. The plan is checked by `reconcileOperatingPlan`: sum 100, known keys, buyable, the limits, the «da tenere», the
   quantities held; every correction is one Italian sentence stored with the plan. **Proof**: U5–U9.
5. A failed or unreadable plan leaves the report readable and applicable: `operatingPlan.status: 'failed'` with its
   sentence, the document still `ready`; the run ends on the report. **Proof**: U10, E2.
6. The book has the page «Il piano operativo» after «Cosa fare adesso», only when the plan is ready and usable; it
   draws ONLY from the stored object. **Proof**: U11, R1, E1.
7. «Chiedi una modifica» reruns the review and then the plan; the old plan is dropped with the old report.
   **Proof**: U12, E3.
8. A report without a plan (an older document, a failed stage, a dropped plan) shows on «Applica» the row «Il
   piano operativo non c'è ancora» with «Scrivi il piano operativo», which runs ONLY the plan stage; it works on an
   applied document too. **Proof**: R2, E2.
9. The instruments stage writes up to three Yahoo symbols per candidate; an older block without them still parses.
   **Proof**: U13.
10. The review's section 6 no longer forbids the figures: it reasons in words and points to the page after.
    **Proof**: U14.
11. No test and no verification step calls a model. **Proof**: § 7.

## 3. Decisions

- **Owner 67 (2026-11-19)**: the purchase quotas of each instrument are written by the Consulente in the
  operating plan; the app checks them with rules (sum 100, buyable, the limits of «Criteri del modello») and says
  every correction in one sentence. Overturns decision 27's «computed by code» for this path.
- **Owner 69**: a review month indicated by the Consulente. **Owner 70**: a NEW stage «Piano» after the review
  (Opus 5.5): «Riprova» repeats only it; «Chiedi una modifica» reruns review + plan; all the plan's figures live in
  ONE structured object.
- **Owner 74**: the instruments search writes up to three Yahoo symbols per instrument, the user's exchange first.
- **Owner 78**: the «da tenere» of the answers wins: the contract forbids selling such an instrument; if the plan
  does, the app removes the sale and says so; «smetti di comprare» stays allowed.
- **Owner 81**: the taxes of the sales are estimated by the app (`saleTaxPerEuro`), given to the stage and shown; no
  cap; a sale the app cannot estimate stays, with «tasse non stimabili».
- **Owner 82**: a held instrument the plan forgets is a row at 0 %, named; a new instrument takes the quota the
  Consulente writes, also in a class without sub-targets (decision 58 no longer applies on this path).
- **Owner 84**: a NEW page «Il piano operativo», after «Cosa fare adesso» and before «Rischi e revisione», present
  only with a valid plan. **Owner 85**: a report without a plan stays applicable; «Scrivi il piano operativo» runs
  the plan stage alone.
- **Overturned**: decision 28 (2026-11-12, «the exact figures are the engine's; the prompt changes, the schema and
  the book do not») and README § 10 «No section «Come arrivarci» written by the Consulente with its own figures» —
  by decisions 67 and 70 (2026-11-19).
- **Adopted, reversible (this spec)**:
  - P1. The plan lives in `document.operatingPlan`, with its OWN status; the document's `status`, `stage` and
    `error` are never touched by the plan stage.
  - P2. The model addresses instruments by a key the app prints (S = held and buyable, N = new from the report, M =
    money-market fund); the stored plan carries the key's legend with the asset id.
  - P3. A quota is the instrument's target weight in the plan (the engine's `targetPercentage`): the «buy» rows sum
    to 100, «hold» and «sell» rows carry 0.
  - P4. The stage gives the unit price and the estimated tax in euros of the HELD instruments (a plan in quotes
    cannot be written without them); still never an id, a rate or a held ISIN.
  - P5. The plan stage counts one slot of the hourly limit (12), like a revision.
  - P6. Opus 5.5 at effort `medium`, 16.000 output tokens, structured output; «di solito ~1 min».
  - P7. `reconcileOperatingPlan` is ONE pure function run twice: here on the server with the facts of the writing,
    in NOVE-25 at the click with the live ones.
  - P8. A plan with no «buy» row above 0 after the corrections is `usable: false`: no page, the absence row says
    why.
  - P9. The plan stage reads the per-instrument LIMITS of «Criteri del modello» (a quota the app would correct is
    better not written) — nothing else of the criteria, never the model: choice i of the index is amended to say
    so, and README § 10's sentence with it.

## 4. Solution

### 4.1 Types (`types/allocationAdvice.ts`, `lib/utils/operatingPlan.ts` new, zod-free)

```ts
// types/allocationAdvice.ts
export type AllocationAdviceStage = 'context' | 'strategy' | 'instruments' | 'review' | 'plan';
export const ALLOCATION_ADVICE_STAGES: readonly AllocationAdviceStage[] = ['context', 'strategy', 'instruments', 'review', 'plan'];
export type AllocationAdviceRunStage = 'strategy' | 'instruments' | 'review' | 'plan' | 'revise';
export const ALLOCATION_ADVICE_RUN_STAGES: readonly AllocationAdviceRunStage[] = ['strategy', 'instruments', 'review', 'plan'];

export interface AllocationAdviceOperatingPlan {
  status: 'running' | 'ready' | 'failed';
  plan: OperatingPlan | null;      // 'ready' only
  error: string | null;            // 'failed' only
  model: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  /** `report.finishedAt` of the report it was written on: a plan of another report is not this report's. */
  reportFinishedAt: Date;
}
// AllocationAdviceDocument gains: operatingPlan?: AllocationAdviceOperatingPlan | null;
```

```ts
// lib/utils/operatingPlan.ts
export type OperatingPlanAction = 'buy' | 'hold' | 'sell';

/** The legend of a key: what the app knew of the instrument when the plan was written. */
export interface OperatingPlanInstrument {
  ref: string;                                  // 'S1' | 'N1' | 'M1'
  kind: 'held' | 'new' | 'cashFund';
  name: string;
  assetClass: AssetClass;
  subCategory?: string;
  assetId?: string;                             // held, cashFund
  /** new only: what the asset is created from (the hand-off's prefill and the candidate's symbols). */
  prefill?: AssetPrefill;
  symbols?: string[];
}

export interface OperatingPlanRow {
  ref: string;
  action: OperatingPlanAction;
  targetPercentage: number;                     // the target weight in the plan: 'buy' rows sum to 100
  sellQuantity?: number;                        // absent on a sale = every share
  sellMonth?: number;                           // 1..months; absent = 1
  reason: string;
  /** Sales only, the app's figures at writing time. */
  estimatedProceedsEur?: number;
  estimatedTaxEur?: number | null;              // null = not estimable
  taxUnknownReason?: 'cost-basis' | 'rate';
}

export interface OperatingPlan {
  summary: string;
  monthlyInflowEur: number;
  months: number;
  rows: OperatingPlanRow[];
  instruments: OperatingPlanInstrument[];
  reviewMonth?: number;
  reviewReason: string;
  departures: string[];
  /** The app's corrections at writing time, one sentence each. */
  corrections: string[];
  usable: boolean;                              // false = no 'buy' row above 0
}

/** What a reconcile needs to know of today's portfolio, by key. */
export interface OperatingPlanFacts {
  instruments: OperatingPlanInstrument[];
  held: Record<string, {
    quantity: number; priceEur: number; valueEur: number; keep: boolean;
    tax: SaleTaxPerEuro; minPct?: number; maxPct?: number;
  }>;
}

/** The plan of this report, or null: absent, running, failed, unusable, or written on another report. */
export function operatingPlanOf(document: Pick<AllocationAdviceDocument, 'operatingPlan' | 'report'> | null | undefined): OperatingPlan | null {
  const stored = document?.operatingPlan;
  if (!stored || stored.status !== 'ready' || !stored.plan?.usable || !document?.report) return null;
  return stored.reportFinishedAt.getTime() === document.report.finishedAt.getTime() ? stored.plan : null;
}
```

`mapAllocationAdviceData` (`lib/utils/allocationAdviceDocument.ts:126-146`) maps `operatingPlan` with its three
dates (`toDate`), `null` when absent.

### 4.2 The facts (`lib/utils/operatingPlan.ts`)

```ts
export function buildOperatingPlanFacts(input: {
  assets: Asset[];
  proposal: AllocationAdviceProposal;
  candidates: InstrumentCandidates | null;
  keepNames: readonly string[];                 // answers.keepAssets
  limits: IdealAllocationSettings['instrumentLimits'];
  valueOf: (asset: Asset) => number;
  priceOf: (asset: Asset) => number;
}): OperatingPlanFacts
```

- `handoff = planConsulenteHandoff(proposal, candidates, keepNames, assets)` (NOVE-21's matcher, unchanged,
  `lib/utils/allocationAdviceHandoff.ts:57`).
- **S**: every asset with `isPlanBuyable(asset, assets)` and (`valueOf(asset) > 0` or `asset.createdEmpty`), in
  the order of `assets` sorted by class sequence then name: `S1…`.
- **M**: every `isPlanCashFund(asset, assets)` with value: `M1…`.
- **N**: `handoff.toCreate`, `N1…`, with its `prefill`; `symbols` = the candidate's `yahooSymbols` (§ 4.6) found by
  the prefill's ISIN or name among `candidates`, else `prefill.ticker ? [prefill.ticker] : []`.
- `held[ref]`: quantity, `priceOf`, `valueOf`, `keep` (`handoff.keepAssetIds.includes(asset.id)`), `tax = candidateSaleTaxPerEuro(asset.id, buildHoldings(assets, valueOf))`, and the asset's
  entry in `limits`.

### 4.3 The reconcile (`lib/utils/operatingPlan.ts`)

```ts
export interface RawOperatingPlan {
  summary: string; monthlyInflowEur: number; months: number;
  rows: Array<{ ref: string; action: OperatingPlanAction; targetPercentage: number; sellQuantity?: number; sellMonth?: number; reason: string }>;
  reviewMonth?: number; reviewReason: string; departures: string[];
}

export function reconcileOperatingPlan(raw: RawOperatingPlan, facts: OperatingPlanFacts): OperatingPlan
```

The rules, in this order; each correction pushes ONE sentence (the constants live in the module, exported for the
tests):

| # | Rule | Sentence |
| --- | --- | --- |
| 1 | `months` outside 1..60 is clamped | «La durata indicata non è fra 1 e 60 mesi: il piano dura {n} mesi.» |
| 2 | `monthlyInflowEur` negative or not finite → 0 | — (silent) |
| 3 | A row whose `ref` is not in `facts.instruments`, or a second row for a key, is dropped | «Il piano citava uno strumento che non è fra i tuoi né fra quelli del report: la riga non entra.» (once) |
| 4 | N key with `hold`/`sell` → dropped (silent); M key with `buy` → `hold` | «{nome} è un fondo monetario: il piano non lo compra.» |
| 5 | `sell` on a `keep` instrument → `hold` when its quota is 0, else `buy`; the sale is removed | «Hai indicato di tenere {nome}: la vendita non entra nel piano.» |
| 6 | `sellQuantity`: floored; ≤ 0 → the sale is removed (silent); ≥ the quantity held → absent (every share), and when it was ABOVE: | «Il Consulente indicava {n} quote di {nome}: il piano ne vende {held}, quelle che possiedi.» |
| 7 | A sale of every share of an S instrument forces its quota to 0 | — (silent) |
| 8 | `sellMonth` outside 1..`months` → clamped | «La vendita di {nome} era fissata fuori dal piano: va al mese {m}.» |
| 9 | Every S key without a row gets `{ action: 'hold', targetPercentage: 0, reason: '' }` | «{nomi}: il piano non li cita. Restano dove sono e il piano non li compra.» (once, names joined) |
| 10 | Quotas: negative → 0; a `buy` at 0 → `hold`; a `hold`/`sell` above 0 with no partial sale → `buy` (silent) | — |
| 11 | Limits: a `buy` above its `maxPct` is lowered, below its `minPct` raised; the difference goes to (comes from) the other `buy` rows in proportion to their quotas, never past their own limits | «{nome}: quota portata dal {a}% al {b}%, il limite dei tuoi Criteri del modello.» |
| 12 | Σ of the `buy` quotas off 100 by more than `PROPOSAL_SUM_TOLERANCE` (0,5) → scaled in proportion | «Le quote sommavano a {s}%: riportate a 100 in proporzione.» |
| 13 | Quotas rounded to two decimals, the largest remainder absorbs the cents so that Σ = 100,00 | — (silent) |
| 14 | `reviewMonth` outside 1..`months` → dropped | — (silent) |
| 15 | No `buy` row above 0 → `usable: false` | «Il piano non compra niente: non può diventare un piano di accumulo.» |

Then, for every row that still sells: `estimatedProceedsEur = roundToCents(quantitySold × priceEur)`;
`estimatedTaxEur` = `roundToCents(estimatedProceedsEur × perEuro)` when `tax.kind === 'taxed'`, `0` when `exempt`,
`null` with `taxUnknownReason` when `unknown`. The rows are returned in the order of `facts.instruments` (S, N, M).
The function is idempotent: `reconcile(reconcile(raw))` adds no sentence (U9).

### 4.4 The data block and the contract (`lib/server/allocationAdvice/prompts.ts`)

```ts
export function formatOperatingPlanFacts(input: {
  facts: OperatingPlanFacts;
  firstMonthLabel: string;                      // «dicembre 2026»: the month after `now`, Italian
  investmentAccount: { name: string; balanceEur: number } | null;
  accountsEur: number;                          // Σ of the source accounts
  reserveEur: number;                           // the proposal's cash quota on today's base
}): string
```

prints, one fact per line:

```
--- DATI PER IL PIANO OPERATIVO ---
Mese 1 del piano: dicembre 2026.
Conto per gli investimenti: Conto Arancio, saldo €12.000.            | «non impostato: i conti liquidi sommano €18.000.»
Riserva di liquidità dell'allocazione proposta: €10.000. Sopra la riserva ci sono €2.000.   | «Mancano €3.000 alla riserva.»
Strumenti posseduti che un piano può comprare (chiave · nome · classe › sotto-categoria · quote · prezzo · valore · tasse stimate se venduto tutto):
S1 · ETF Mondo · Azioni › Mondo · 120 quote · €100,00 · €12.000 · tasse stimate €520 · DA TENERE
S2 · ETF Emergenti · Azioni › Emergenti · 40 quote · €50,00 · €2.000 · tasse non stimabili (manca l'aliquota) · limite: massimo 15%
S3 · ETF Oro · Materie prime · 0 quote, mai comprato · €60,00
Fondi monetari (si possono vendere, mai comprare):
M1 · Fondo Monetario Euro · 300 quote · €10,00 · €3.000 · esente
Strumenti nuovi indicati dal report (0 quote, da creare):
N1 · ETF Obbligazioni Euro 1-3 (IE00AAAAAAA1) · Obbligazioni › Euro 1-3 anni
```

A section with no row prints «nessuno». `buildPlanPrompt(answers, reportMarkdown, instrumentsMarkdown, candidates,
{ factsBlock, cashflowBlock, accumulationPlan })` returns `{ system: CONSULENTE_CORE + '\n' + PLAN_CONTRACT,
userContent }`; `userContent` is, in order: `formatAnswersForPrompt(answers)`, «--- IL REPORT (la revisione) ---» +
the report with its `allocation-proposal` block, «--- STRUMENTI TROVATI ---» + the instruments with their block, the
facts block, the cashflow block, the PIANO DI ACCUMULO block, «Scrivi il piano operativo come descritto.».

`PLAN_CONTRACT` (a constant; the text below is the contract):

```
# Cosa devi produrre
La risposta è UN oggetto JSON: il PIANO OPERATIVO, cioè il piano di accumulo mensile che porta il portafoglio di oggi verso l'allocazione del report. Il report è già scritto e non lo riscrivi: lo traduci in operazioni che l'utente può eseguire. L'app creerà il piano da questo oggetto, con un clic.
Campi:
{
  "summary": string (2-3 frasi: il piano in breve, a parole),
  "monthlyInflowEur": number (quanto l'utente versa nel piano ogni mese, in euro: dentro la mediana del risparmio mensile del blocco CASHFLOW 12 MESI; se la superi, dillo in "departures" con il perché),
  "months": number (la durata in mesi, da 1 a 60),
  "rows": [ { "ref": chiave copiata ESATTAMENTE dal blocco DATI PER IL PIANO OPERATIVO (S…, N…, M…), "action": "buy" | "hold" | "sell", "targetPercentage": number, "sellQuantity"?: number (quote intere da vendere; assente = tutte), "sellMonth"?: number (il mese del piano in cui vendere, da 1 a "months"; assente = 1), "reason": string (una frase: perché) } ],
  "reviewMonth"?: number (il mese del piano in cui riguardare quote e rata, se ha senso riguardarle prima della fine),
  "reviewReason": string,
  "departures": [ string ] (dove il piano si discosta dal report o dalla strategia, una frase ciascuna; vuoto se non si discosta)
}
Regole:
- Una riga per OGNI chiave S: "buy" (il piano lo compra), "hold" (smetti di comprarlo: resta dov'è) o "sell". Una riga "buy" per ogni chiave N che il piano compra. Le chiavi M compaiono solo se le vendi.
- "targetPercentage" è il peso a cui il piano porta lo strumento fra gli strumenti che compra: le righe "buy" sommano esattamente a 100; "hold" e "sell" hanno 0. I pesi seguono l'allocazione e i sotto-target del report; rispetta i limiti scritti accanto a uno strumento.
- Vendi solo quando serve ad arrivare ai target in un tempo ragionevole o a uscire da uno strumento che il report sostituisce: ogni vendita ha un costo fiscale, scritto nel blocco («tasse stimate»), e la sua ragione lo pesa. Non vendere MAI uno strumento segnato DA TENERE: puoi solo smettere di comprarlo.
- Una vendita in un mese successivo al primo fa entrare il suo ricavato nelle rate da quel mese: usala per diluire le tasse o per non restare fuori dal mercato.
- Le quote da vendere non superano quelle possedute. Non scrivere prezzi né importi che non siano nei campi: gli importi delle rate li calcola l'app dai tuoi campi.
- Usa esclusivamente i numeri dei blocchi: non ricalcolarli e non inventarne.
```

The structured-output schema (`lib/utils/operatingPlanSchema.ts`, new, zod, server only):

```ts
export const operatingPlanAnswerSchema = z.object({
  summary: z.string().trim().min(1).max(800),
  monthlyInflowEur: z.number().finite(),
  months: z.number().finite(),
  rows: z.array(z.object({
    ref: z.string().trim().min(1).max(8),
    action: z.enum(['buy', 'hold', 'sell']),
    targetPercentage: z.number().finite(),
    sellQuantity: z.number().finite().optional(),
    sellMonth: z.number().finite().optional(),
    reason: z.string().max(400),
  })).max(80),
  reviewMonth: z.number().finite().optional(),
  reviewReason: z.string().max(400),
  departures: z.array(z.string().max(400)).max(10),
});
export function parseOperatingPlanAnswer(text: string): RawOperatingPlan | null  // JSON.parse + safeParse; integers by Math.round on months/sellMonth/reviewMonth
```

The bounds are loose on purpose: the API guarantees the shape, `reconcileOperatingPlan` owns the numbers.

**The review's section 6** (`prompts.ts:460`) — before: «… Il piano esatto lo calcola l'app dopo «Applica» («Crea un
piano di accumulo verso questa allocazione»): niente tabelle di rate né quote mensili per strumento.» After: «… Le
cifre del piano — versamento, mesi, quote, vendite — le scrive il passo successivo, nella pagina «Il piano
operativo»: qui ragiona a parole, niente tabelle di rate né quote per strumento.» The strategy's section 5 is
unchanged.

### 4.5 The stage on the server (`lib/server/allocationAdvice/run.ts`, the route)

```ts
async function runPlan(document: AllocationAdviceDocument, onStage: (stage: AllocationAdviceStage) => void, now: Date): Promise<void>
```

1. `report?.proposal` and `instruments` are required, else `AllocationAdviceStageError('plan', 'Non c'è un report
   finito su cui scrivere il piano. Avvia la ricerca.', false)`.
2. Reads, in parallel: `getUserAssetsAdmin(userId)`, the settings (the Admin mapper of
   `lib/services/assistantMonthContextService.ts:196-212`, which gains `investmentCashAssetId` and
   `idealAllocation`), `readCashflowBlockForPrompt`, `readAccumulationPlanForAdvice`.
3. `facts = buildOperatingPlanFacts({ assets, proposal: report.proposal, candidates: instruments.candidates,
   keepNames: answers.keepAssets, limits: settings.idealAllocation?.instrumentLimits ?? [], valueOf:
   calculateAssetValue, priceOf: unitPriceEur })` — `calculateAssetValue` is the function
   `lib/services/assistantMonthContextService.ts:282` already injects on the server.
4. Patches `operatingPlan: { status: 'running', plan: null, error: null, model: null, startedAt: now, finishedAt:
   null, reportFinishedAt: report.finishedAt }` and calls `onStage('plan')` — never `enterStage` (P1).
5. `callModel('plan', { model: ALLOCATION_ADVICE_STRATEGY_MODEL, effort: ALLOCATION_ADVICE_STRATEGY_EFFORT, format:
   OPERATING_PLAN_FORMAT, prompt: buildPlanPrompt(…), maxTokens: ALLOCATION_ADVICE_PLAN_MAX_TOKENS /* 16000 */ })`.
6. `raw = parseOperatingPlanAnswer(answer.text)`; `null` → the failure of step 8 with «Il Consulente non ha
   scritto un piano leggibile. Riprova: di norma la seconda volta rientra.»
7. `plan = reconcileOperatingPlan(raw, facts)`; patches `operatingPlan: { status: 'ready', plan, error: null, model:
   answer.model, startedAt, finishedAt: new Date(), reportFinishedAt }`.
8. Any failure: patches `operatingPlan: { status: 'failed', plan: null, error: <sentence>, … }` and throws
   `AllocationAdviceStageError('plan', <sentence>, true)`.

`runAllocationAdviceStage` dispatches `stage === 'plan'` to `runPlan`, and its catch returns BEFORE the
document-level patch when `stage === 'plan'` (the failure is already on `operatingPlan`; `document.status` stays).
`runRevise`'s final patch adds `operatingPlan: null`. `runAllocationAdvice` (the three stages in sequence) runs the
plan fourth and swallows its failure. `CallStage` already unions `AllocationAdviceStage`.

The route (`app/api/allocation-advice/run/route.ts`): `'plan'` passes the stage check through
`ALLOCATION_ADVICE_RUN_STAGES`; the rate limit counts `strategy`, `revise`, `interview` and `plan` (P5).
`maxDuration = 300` is unchanged (one request per stage).

### 4.6 The instruments stage: the Yahoo symbols (decision 74)

- `instrumentCandidateSchema` gains `yahooSymbols: z.array(z.string().trim().min(1).max(20)).max(3).optional()`.
- `CANDIDATES_SCHEMA_TEXT` gains, after `"ticker"?: string`: `"yahooSymbols"?: [ string ] (da 1 a 3 simboli con cui
  Yahoo Finance quota lo strumento: il primo sulla borsa indicata dall'utente, poi altri listini in euro, es.
  "SWDA.MI", "EUNL.DE", "IWDA.AS")`.
- `INSTRUMENTS_CONTRACT` gains one sentence after «Non inventare ISIN o ticker…»: «Per ogni strumento che
  l'utente non possiede scrivi in "yahooSymbols" i simboli di Yahoo Finance che hai verificato con la ricerca: il
  primo sulla borsa indicata, poi fino a due altri listini in euro dello stesso strumento (stesso ISIN) — l'app
  userà il primo che ha un prezzo recente. Per un titolo di Stato basta l'ISIN.»

### 4.7 The run on the client

- `useConsulenteRun` (`components/allocation/consulente/useConsulenteRun.ts`): the loop already walks
  `ALLOCATION_ADVICE_RUN_STAGES`; a failed `plan` does not fail the run —
  `if (!result.ok) { if (stage === 'plan') break; outcome = { kind: 'failed', … }; break; }` — so the state ends
  `done` and the page shows the report.
- `useConsulenteRevision`: after a `revise` that ended ok it requests `{ stage: 'plan' }`; whatever the plan's
  outcome the state returns `idle` and `onDone` runs (the absence row tells a failed plan).
- A new hook `useConsulentePlan(ownerId)` in `components/allocation/consulente/`: `{ state: 'idle' | 'running' |
  'failed', write() }` — `requestStage(ownerId, { stage: 'plan' }, () => {})`, then invalidates
  `queryKeys.allocationAdvice.all(ownerId)`.
- Copy (`lib/utils/allocationAdviceNarrative.ts`): `STAGE_COPY.plan = { label: 'Scrivo il piano operativo', detail:
  'Opus 5.5 traduce il report in versamento, mesi, quote e vendite.' }`; `STAGE_TYPICAL_MINUTES.plan = 1`.
  `runStageStates` needs no change (it maps `ALLOCATION_ADVICE_STAGES`); the run screen and the rail show five rows.

### 4.8 The book (`lib/utils/allocationAdviceBook.ts`, `ConsulenteBook.tsx`, `ConsulenteBookPages.tsx`)

- `BookPageId` gains `'piano'`; `BOOK_PAGE_TABLE` gains, between `passi` and `rischi`: `{ id: 'piano', title: 'Il
  piano operativo', aliases: [], generated: true }`; `BookPageInput` gains `hasPlan: boolean`
  (`operatingPlanOf(document) !== null`); `figures.piano = input.hasPlan`.
- `planPieces(plan: OperatingPlan): BookPagePieces` in `ConsulenteBookPages.tsx`:
  - **aside**: `describePlanAside(plan)` → «{months} mesi · {€} al mese».
  - **reading**: `plan.summary`.
  - **body**: three groups, each a `divide-y` list with the tile's sub-eyebrow, a group absent when empty —
    «Compra» (name · the quota in mono, e.g. «40,00%» · the reason under it); «Smetti di comprare» (name · reason);
    «Vendi» (name · «{n} quote» or «tutte le quote» · «{mese}º mese» · «circa {€}» · «tasse stimate {€}» or
    «tasse non stimabili: manca l'aliquota» / «…: manca il costo fiscale» · reason). Under the groups: the total of
    the estimated taxes when at least one sale is estimable («Tasse stimate delle vendite: {€}», plus «, senza
    {n} non stimabili» when some are not); the review line when `reviewMonth` («Da riguardare al {m}º mese:
    {reviewReason}»); «Dove si discosta dal report» with `plan.departures`; «Corretto dall'app» with
    `plan.corrections`.
  - **footnote**: «Le rate esatte le calcola l'app quando crei il piano: dipendono dai prezzi di quel giorno.»
  - The names come from `plan.instruments` by `ref`; no asset is read.
- `piecesOf` gains `case 'piano'`. The page's accent follows The AI-Accent Rule as the other generated pages do
  (`generated: true`).
- The «Applica» page (`applyPieces`): a new input `planRow: { state: 'absent' | 'running' | 'failed' | 'unusable';
  message: string | null; onWrite: () => void; disabled: boolean } | null` (null when `operatingPlanOf(document)`
  is not null). Rendered in BOTH bodies (`ready` and `applied`), after the three ticks / the applied lines:
  «Il piano operativo non c'è ancora.» (absent), «Scrivo il piano operativo…» (running), the stored error (failed)
  or the last correction sentence (unusable), and the button «Scrivi il piano operativo» (`variant="outline"`,
  the book's `BUTTON_CLASS` with `AI_CONTROL_ACCENT_CLASS` and `AI_CONTROL_ACCENT_LABEL_CLASS`,
  `lib/constants/aiAccent.ts:21-25`), hidden while running. `ConsulenteReport.tsx` owns `useConsulentePlan` and
  builds the row.

### 4.9 DESIGN.md (The AI-Accent Rule, `DESIGN.md:579`)

«Scrivi il piano operativo» asks a model: it joins the list of **A control that asks a model** (the accent on
hover and focus-visible only) after «Rivedi il report»; the page «Il piano operativo» is a page «whose body is the
model's» and takes the border and the eyebrow as the others do — no new sentence for it. One clause added, the
before/after quoted in the commit.

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **`system` is byte-identical for every user** (README § 8): `PLAN_CONTRACT` is a constant; every fact — the keys,
  the month, the account — sits in `userContent`. U3 is `expect(a.system).toBe(b.system)` on two different
  portfolios.
- **A probe never runs the Consulente's model** (AGENTS.md § Allocazione › Consulente): the unit tests inject
  `callModel`'s fake as the existing run tests do; the E2E specs extend `installFakeRun`
  (`e2e/consulenteInterview.ts`) with the `plan` stage and `plant()` (`e2e/consulenteReport.ts`) with an
  `operatingPlan` option; § 7 launches no run.
- **The document's status is the report's** (P1): no code path of the plan stage calls `enterStage` or writes
  `status`, `stage`, `error`; U10 asserts the patch keys.
- **A stale run** (`isRunStale`, `RUN_STALE_AFTER_MS`): an `operatingPlan.status: 'running'` older than 20 minutes
  reads as absent in `ConsulenteReport` (the same constant), so a cut request never hides the button.
- **Tests that the fifth stage moves** (they are edited, on purpose): `allocationAdviceRun.test.ts:158-199` (the
  stage order and the patch sequence), `allocationAdviceDocument.test.ts:89-108` (four stages → five),
  `allocationAdvicePrompts.test.ts:500-510` (the review's section 6 text) and `:512-516`,
  `allocationAdviceRoutes.test.ts` (the stage list, the rate limit), `e2e/allocation.consulente.spec.ts:133-160`
  (the run screen's rows), `e2e/allocation.consulente.report.spec.ts:146-158` (the shortest page: still `passi`).
- **The Consulente route's weight** (690,1 KB gz, no budget entry): `operatingPlan.ts` is zod-free and imports
  `planConsulenteHandoff` only inside `buildOperatingPlanFacts`, which the route never calls — keep
  `buildOperatingPlanFacts` in its own module `lib/utils/operatingPlanFacts.ts` so the route's bundle does not pull
  the hand-off and the optimizer. The guard `__tests__/allocationAdviceDocument.test.ts:167-176` (no
  `allocationAdviceHandoff|weightOptimizer` under `components/allocation/consulente/`) gains
  `operatingPlanFacts|operatingPlanSchema`.
- **Structured outputs** (`ALLOCATION_ANSWER_FORMAT`, `run.ts:122`): only `type` and `schema` go out
  (`betaZodOutputFormat(operatingPlanAnswerSchema).schema`); optional keys only, no record.
- **The Path-Scene Rule / The Conversation-Is-Content Rule**: the run screen's fifth row follows the existing rows;
  the page is a book page, not a tile of its own.
- **No owner data in a tracked file**: every fixture uses invented instruments («ETF ornitorinco», «Fondo
  fenicottero») and round figures.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/allocationAdviceRun.test.ts`: the four requests in order; the plan's patches are `operatingPlan` running then ready; `status` never patched by it | call `enterStage` in `runPlan` |
| U2 | `__tests__/allocationAdvicePrompts.test.ts` › `buildPlanPrompt`: the five blocks in order, the report's `allocation-proposal` block present | drop the cashflow block |
| U3 | same: `system` equal for two portfolios; it `endsWith` the contract | interpolate the month in the contract |
| U4 | same › `formatOperatingPlanFacts`: the lines of § 4.4 on the invented portfolio; no asset id, no «26», no held ISIN in the text | print `asset.isin` |
| U5 | `__tests__/operatingPlan.test.ts` › reconcile: quotas 50/30/30 → 45,45/27,27/27,28 with the sentence; 60/40 untouched, no sentence | skip the scaling |
| U6 | same: a sale of a «da tenere» → `hold`, the sentence; a sale of 40 with 38 held → every share, the sentence; a sale in month 14 of 12 → month 12 | drop rule 5 |
| U7 | same: a forgotten S key → a `hold` row and the sentence naming it; an unknown key dropped | drop rule 9 |
| U8 | same: a quota of 40 on a `maxPct` 15 → 15, the 25 spread on the others in proportion; a plan of only `hold` rows → `usable: false` | clamp without redistributing |
| U9 | same: `reconcile(reconcile(raw))` equals `reconcile(raw)` but for the sentences, which are not repeated; proceeds and taxes: taxed, exempt, unknown (`null` + reason) | compute the tax on the raw quantity |
| U10 | `allocationAdviceRun.test.ts`: an unreadable answer → `operatingPlan.status: 'failed'`, the document's `status` still `ready`, the thrown error retryable | let the generic catch patch `status` |
| U11 | `__tests__/allocationAdviceBook.test.ts`: the page `piano` between `passi` and `rischi` only with `hasPlan`; `operatingPlanOf` null on a plan of another report | compare nothing in `operatingPlanOf` |
| U12 | `allocationAdviceRun.test.ts`: `runRevise`'s patch carries `operatingPlan: null` | omit it |
| U13 | `__tests__/allocationAdviceProposal.test.ts`: a candidate with three symbols parses; four → that sleeve is refused and the others kept (the lenient parser); none → parses | `.max(2)` |
| U14 | `allocationAdvicePrompts.test.ts:500-510`: the new text of section 6 | — (the edited assertion) |
| U15 | `__tests__/operatingPlanFacts.test.ts`: S/N/M keys and order; `keep` by name; the limit; an asset `createdEmpty` at 0 quotes is an S key; a property and a loan get no key | key every asset |
| R1 | `__tests__/consulenteBookPlan.test.tsx` (new, `dom`): `planPieces` on an invented plan — the three groups, «tasse non stimabili: manca l'aliquota», the total, the corrections | render the sell group without the month |
| R2 | same: the «Applica» row in the four states, on a `ready` and on an `applied` document; the button calls `onWrite` | hide the row on `applied` |
| E1 | `e2e/allocation.consulente.spec.ts`: the fake run shows five rows and lands on a report with the page «Il piano operativo» | — |
| E2 | `e2e/allocation.consulente.report.spec.ts`: a planted report without a plan → the row and the button; the fake plan stage fails → the stored sentence, the report still there; succeeds → the page appears | — |
| E3 | same: «Chiedi una modifica» (fake) → the plan is rewritten (a planted marker in the fake's summary changes) | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account a planted report with a planted plan shows the eleventh page
with the three groups and the app's corrections; a planted report without a plan shows the row on «Applica»; the
fake stage writes a plan and the page appears; a planted failure leaves the report readable; no model is called.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones, `npx playwright test e2e/allocation.consulente` in every
  project.
- **B**: emulators + `emulators:seed` + `dev:emulator`; a scratchpad script (run from inside the repo) plants
  `plant('ready')` and patches `operatingPlan` with an invented plan built by `reconcileOperatingPlan` on the seed
  portfolio's facts (so the stored object is what the code would store); a second prints
  `buildPlanPrompt(…).userContent` for the seed account through `buildOperatingPlanFacts` — read it line by line
  against § 4.4.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the page «Il piano operativo» (the groups wrap at
  390 without a horizontal scroll), the index with eleven pages, the «Applica» row in its four states, the run
  screen with five rows (the fake run).
- **D (data)**: `allocationAdvice/<uid>.operatingPlan` after the fake stage: `status: 'ready'`, quotas summing to
  100,00, `corrections`; `status` of the document unchanged; after the fake revision `operatingPlan` was null
  between the two requests (the script reads it in between through a paused fake).
- **E (edges)**: a planted plan whose `reportFinishedAt` is not the report's → the row, not the page; a planted
  `running` older than 20 minutes → the row with the button; a plan with `usable: false` → the row with its
  sentence.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); the SCRIPT of B prints the stage's
  `userContent` for his data and he reads the facts block (the keys, the taxes, «DA TENERE»); a plan built by
  `reconcileOperatingPlan` from a `RawOperatingPlan` written by hand in the script (two buys, one hold, one sale)
  is planted on his mirrored report and he reads the page. No model runs. `npm run mirror:remove`.
- **G**: `npm run perf:budget` (no entry for the Consulente route: record its weight before and after in
  doc/guide/velocita.md § Registro, README § 8); no first screen of a composed page changes; stop the servers, delete
  the scripts, remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no index, no migration (an absent `operatingPlan` is «no plan yet»). After the deploy
the owner checks the stage ONCE in production, with his key: on his current report, «Applica» → «Scrivi il piano
operativo» (one Opus call, about a minute) — expected: the page appears; every instrument he holds has a row; no
sale of an instrument he marked «da tenere»; the quotas sum to 100; the taxes read like Bilanciamento's. The
instruments stage's symbols are read at his next full path. Then NOVE-25.

## 9. Documentation

- `doc/guide/consulente.md`: § the stages — five, the plan stage's inputs and its own status (P1); § prompts — the
  DATI PER IL PIANO OPERATIVO block, the keys (P2), what the model may now see (P4), the contract; § the book — the
  page `piano`; § «Applica» — the absence row and «Scrivi il piano operativo»; § «Chiedi una modifica» — review +
  plan; § Per-page blind spots: «a plan stage that fails leaves the report `ready`»; § Files the three new modules.
- `doc/guide/accumulo.md` § Dal Consulente: one sentence — the hand-off still seeds from the optimizer until
  NOVE-25.
- `AGENTS.md` § 3 Allocazione › Consulente: the stub's first bullet («five stages; the plan stage reads its own
  facts block and never changes the document's status»).
- `DESIGN.md` § 4.9; `CLAUDE.md` «Latest», the Consulente line of Key Features («…a fifth stage writes the
  operating plan») and Data & Integrations if the model list changes (it does not: Opus 5.5 + Sonnet 5.5);
  `Draft Release Temp.md`: the new page and the button, in the user's words.
- `doc/nove/README.md`: § 6 the row; § 10 the overturned sentence.

## 10. Declared out of scope

- **Creating the plan of accumulation from the object** → NOVE-25 (the click, the live reconcile, the assets
  created, the symbols priced).
- **Pricing a new instrument on the server at stage time**: none, declared — the quotas need no price; NOVE-25
  prices at the click.
- **A tax cap** (decision 81): none, declared.
- **Phases with different quotas** (decision 69): none, declared.
- **The Assistente reading the operating plan**: none, declared.
- **The strategy or the review reading the facts block**: none, declared — one stage owns the figures (decision
  70).
- **Removing «Dal Consulente»** → NOVE-25.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-24-consulente-piano-operativo.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-24-consulente-piano-operativo.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/consulente.md, doc/guide/accumulo.md, doc/guide/assistente.md,
  doc/guide/server.md, doc/guide/velocita.md, doc/guide/e2e-emulatori.md e
  doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Leggi DESIGN.md (The AI-Accent Rule, The Path-Scene Rule, The Conversation-Is-Content Rule,
  The Absence-Has-Three-Names Rule) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: i tipi (§ 4.1); i fatti e la
riconciliazione, puri (§ 4.2-4.3), con U5-U9 e U15; il blocco dati, il contratto e lo schema
(§ 4.4), con le asserzioni sul testo; lo stadio sul server e la route (§ 4.5); i simboli
Yahoo nella ricerca strumenti (§ 4.6); la corsa sul client (§ 4.7); la pagina del libro e la
riga su «Applica» (§ 4.8); la frase di DESIGN.md (§ 4.9). I test PRIMA del codice, ciascuno
visto rosso con la sua mutazione; cifre inventate e tonde. Nessun controllo che spende:
nessuna corsa del Consulente, né in test né nel collaudo; il documento si pianta con
e2e/consulenteReport.ts e la corsa resta finta. Fermati e chiedimi se: lo stadio «Piano»
tocca status, stage o error del documento in un qualunque percorso; diventa rosso un test
del Consulente che la § 5 non nomina; il peso della route del Consulente cresce di più di
5 KB gz; `system` di un prompt cambia fra due utenti.
Collaudo: § 7, la F sul mirror al mio «pronto» (leggo il blocco dei fatti stampato dallo
script e la pagina con un piano piantato); il controllo in produzione lo faccio io dopo il
deploy (§ 8). Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with shared contracts (`OperatingPlan`,
`reconcileOperatingPlan`, `operatingPlanOf`, the fifth stage read by the run, the route, the book and the «Applica»
page) across the server pipeline and the Consulente route. Estimated size: 1 session, ~6 h; ~330 lines pure, ~170
of server, ~220 across components, ~550 of tests, three E2E tests.
