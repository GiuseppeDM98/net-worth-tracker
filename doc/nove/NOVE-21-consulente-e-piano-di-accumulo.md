# NOVE-21 — The Consulente and the plan of accumulation: a hand-off after «Applica», a plan in its data

> Series `doc/nove/` (README.md § 5): **depends on NOVE-16** (the plan document, the lock, `describeOpenPlanForAdvice`,
> `APPLY_ACTIVE_PLAN_NOTE`, `isPlanBuyable`, «+ Nuovo asset» at quantity 0) **and NOVE-17** (`runOptimizer`,
> `buildStandaloneCandidates` with `assetsById`, `valueOf`, `baseEur`, `fixBounds`, `negativeFixedKeys`,
> `LIQUIDITY_CANDIDATE_KEY`, `roundWeights`, `toModelWeights`, `describeNegativeFixed`, `PlanSeedDraft`, `ModelBasis`, the
> editor's `seedDraft` and `basis`); implemented after NOVE-18, whose `runOptimizer` input `holdings?` and snapshot fields it leaves
> unset; nothing is implemented after it that reads what it defines. Written on 2026-11-12; every `file:line` is cited on `develop` @ b841cbd7, a PR line as
> `pr488:file:line` on the local ref `refs/tmp/pr488` (the head of #488, which carries #486 and #487). Executes
> decisions 27, 28, 29 and the adopted choices i, r, t (README.md § 3-4).

## 1. The problem today (evidence on the code)

**After «Applica» the book stops.** `applyPieces` (`components/allocation/consulente/ConsulenteBookPages.tsx:270-309`
@ b841cbd7) renders a body only for `document.status === 'ready' && proposal` (`:276`); an applied document reads
«Il piano è già nelle impostazioni: rifai il percorso per cambiarlo.» (`:274`) and its footer holds «Rifai il
percorso» alone (`components/allocation/consulente/ConsulenteBook.tsx:270-281`). Nothing turns the new targets into
monthly purchases; after NOVE-16 the one seeder of a new plan is the model's dialog
(`pr488:components/allocation/IdealCompositionDialog.tsx:240-253`, `handleCreatePac`).

**The Consulente never reasons about accumulating.** The strategy's section 5 is «Cosa cambia rispetto a oggi — le
differenze principali … in punti percentuali» (`lib/server/allocationAdvice/prompts.ts:156`); the review's section 6
«Cosa fare adesso» asks only «i passi concreti, in ordine, con i costi fiscali» (`:428`). With a median monthly
saving in the CASHFLOW 12 MESI block, the report never says whether the gap closes by buying or by selling.

**The Consulente never sees a running plan.** The strategy and the interview read `formatBundleForPrompt(bundle)` +
the OBBLIGAZIONI block (`lib/server/allocationAdvice/run.ts:321-325`); the review and the revision read no data block
at all — the answers, the interview, the strategy and the instruments only (`prompts.ts:446-506`). No
`accumulationPlans` read exists under `lib/server`.

**What the hand-off has to cross**, found on the code:

- `findAssetByName` (`lib/utils/allocationAdviceApply.ts:30-53`) knows the name, «name (TICKER)» and the ticker;
  never the ISIN — while the review writes every sub-target's `instrument` as «nome e ISIN» (`prompts.ts:431`).
- The instruments stage keeps candidates per sleeve (`lib/utils/allocationAdviceProposal.ts:312-324`: `assetClass`,
  `subTarget`, `candidates[]` with `name`, `isin?`, `ticker?`, `alreadyHeld?`); a class without sub-targets is
  searched under the class's label (`prompts.ts:395-398`), not under a sub-target's name.
- The editor's «Aggiorna anche il portafoglio modello» is ON whenever no model is passed
  (`pr488:components/allocation/AccumulationPlanDialog.tsx:607-608`, `modelDiffers = !model || …`); the model is
  read only on the Accumulo tab (choice l). The editor therefore opens on the tab, never on the Consulente route.
- `AssetDialog` opens a create on step 1 with empty fields (`components/assets/AssetDialog.tsx:1165`, the create
  branch `:1286-1327`); no caller can hand it a name, an ISIN or a sub-category.
- NOVE-16's `APPLY_ACTIVE_PLAN_NOTE` is rendered inside the ready body only (NOVE-16 § 4 «The Assistente and the
  Consulente»): after «Applica» the line disappears with the body.

## 2. Goal and acceptance criteria

1. After an «Applica» that wrote the targets, with no open plan, the «Applica» page shows `HANDOFF_READING` and the
   primary link «Crea un piano di accumulo verso questa allocazione», «Rifai il percorso» beside it. **Proof**: R1, E1.
2. With an active plan: no link, `APPLY_ACTIVE_PLAN_NOTE` in the applied body too; with a draft: `HANDOFF_DRAFT_NOTE`,
   no link; plans still loading: no link; plans read failed: the link; targets not written: neither the link nor the hand-off's reading
   (an active plan's note still shows). **Proof**: U11, R1, E2.
3. The link lands on Allocazione › Accumulo with `?da=consulente`; the tab opens «Dal Consulente» once and rewrites
   the URL to `?tab=accumulo`; with an open plan or an advice that is not applied with targets, it only cleans the
   URL; a failed advice read cleans it too. **Proof**: E1, E2.
4. The hand-off dialog is a tile (eyebrow, title, reading, footer); its rows say what is held, what is to create,
   what has no instrument and what a plan cannot buy. **Proof**: R3.
5. An instrument is matched by name, «name (TICKER)», «name (ISIN)», an ISIN alone, or through its sleeve's
   candidates; a class without sub-targets reads the first sleeve of its class; cash and real estate never.
   **Proof**: U1.
6. «Crea» opens `AssetDialog` on step 2 prefilled; the asset is created at quantity 0 with no trade; the row then
   reads «0 quote». **Proof**: R4, E3, § 7 D.
7. The seed is the optimizer's: mode `'ideal'`, no new money, the targets of the proposal, the owner's criteria plus
   one factor objective per class with sub-targets; positions sum to 100,00, every one plan-buyable, no disposals,
   `optimizerSnapshot.mode === 'ideal'`; an instrument at 0 quotes gets a share > 0 inside a class WITH sub-targets;
   inside a class without them it stays a row at 0 % and the reading says so (decision 58); every tradable
   instrument held is in the seed, and the reading names the ones the Consulente did not name (decision 59).
   **Proof**: U2, U3.
8. A property below its loans, or an optimizer that is not `ok`: the matched instruments at 0%, the reading says
   why. **Proof**: U4.
9. «Apri l'editor» replaces the hand-off with `AccumulationPlanDialog` seeded; never two modals at once. **Proof**: R2.
10. The editor warns when the plan sells in month 1 an instrument the Consulente keeps. **Proof**: U5, R5, § 7 E.
11. The strategy, the interview, the review and the revision carry «--- PIANO DI ACCUMULO ---» in one of three
    states; the instruments stage does not; a failed read never fails a stage. **Proof**: U6, U7, U8.
12. The strategy's section 5 and the review's section 6 carry the path (accumulate or sell, an indicative horizon);
    the review keeps seven sections; `system` is byte-identical across users and with or without the block.
    **Proof**: U9, U10.
13. The Consulente route imports nothing of the optimizer; `/dashboard/allocation` within the ceiling
    `perf/budget.json` holds for it when the session starts (605 KB gz on 2026-11-12; the page gains one prop, its
    first load gains no module). **Proof**: U12, § 7 G.

## 3. Decisions

- **Owner 27 (2026-11-12)**: a hand-off after «Applica», «Crea un piano di accumulo verso questa allocazione»,
  «calcolato dal codice (ottimizzatore + `seedDraft`), il proprietario conferma nell'editor».
- **Owner 28 (2026-11-12)**: the Consulente reasons about a PAC in words inside «Cosa fare adesso» (accumulate or
  sell, an indicative horizon, from the cashflow); the exact figures are the engine's; the prompt changes, the schema
  and the book do not.
- **Owner 29 (2026-11-12)**: with an active plan the data carry one line (month k of N, instalment, end month) plus
  what the plan buys and sells with its quotas; never the model nor its criteria.
- **Owner 58 (2026-11-12)**: a new instrument at 0 quotes in a class WITHOUT sub-targets is accepted near 0 %: the
  seed keeps it as a row at 0 % and the reading says «Dentro {classe} lo strumento nuovo parte da 0%: dagli tu una
  quota nell'editor.» — no rule invents a share the targets do not state.
- **Owner 59 (2026-11-12)**: the seed holds EVERY tradable instrument held, named by the Consulente or not (the
  optimizer's candidates are the portfolio); the reading names the others: «Il piano compra anche {nomi}, che tieni
  oggi: se il Consulente propone di lasciarli, togli o vendi la riga nell'editor.»
- **Adopted (README § 4)**: i (no model, no criteria), r (an instrument not held is offered at quantity 0,
  prefilled), t (the warning on a month-1 sale of a kept instrument); read from NOVE-16: l, p.
- **Adopted, reversible (this spec)**:
  - C1. The seed: `runOptimizer` in mode `'ideal'`, `investEur` 0, targets `buildTargetsFromProposal(proposal)`,
    criteria `handoffCriteria(owner's ?? DEFAULT_IDEAL_ALLOCATION, …)`, which adds a `'high'` factor objective for
    every class with sub-targets the owner did not list (without it the split inside a class follows today's
    weights and an instrument at 0 quotes stays near 0).
  - C2. The hand-off opens on the Accumulo tab through `?da=consulente` (the `?obiettivi=1` pattern), where the
    model is loaded and the editor's props exist; the Consulente's control is a link.
  - C3. No disposal is seeded: a sale is the owner's toggle in the editor's step 2.
  - C4. The PIANO DI ACCUMULO block is always printed, in three states; strategy, interview, review and revision read
    it; the instruments stage does not.
  - C5. A draft, a completed or a cancelled plan print «Nessun piano di accumulo attivo.» (`describeOpenPlanForAdvice`
    is null unless active).
  - C6. A created instrument: type `'crypto'` for the crypto class; `'bond'` for the bonds class when its ISIN
    starts with `IT` or `XS` and it has no ticker (a government or euro bond, quoted by Borsa Italiana through the
    ISIN); `'etf'` otherwise; `subCategory` = the sub-target's name (empty for a class without sub-targets); the
    candidate's ticker verbatim; with no ticker and not a bond the row's aside reads «senza ticker: inseriscilo
    per il prezzo» (`AssetDialog` quotes by ticker; without one the price is 0 and the plan marks the position
    `unpriced`).
  - C7. Kept = the matched sub-target instruments ∪ the answers' `keepAssets` that `findAssetByName` finds.
  - C8. Plans read failed on the Consulente route: the link stays (NOVE-16's lock refuses a second open plan).
  - C9. An applied document whose targets were not written shows nothing of the hand-off.
  - C10. A sleeve's candidate: the one the sub-target names (ISIN, then name); ONLY when the sub-target names no
    instrument, the `alreadyHeld` one, else the first. When the sub-target names an instrument that is neither an
    asset nor a candidate, the row is created from the review's own name and ISIN, with no ticker: the review is
    the Consulente's last word, and a prefill never mixes one instrument's name with another's ISIN.
  - C11. A class with sub-targets whose candidate instruments carry a sub-category the targets do not list gets no
    added factor objective, and the reading says so.
  - C12. Weights of instruments a plan cannot buy (a money-market fund) are dropped and the rest brought back to 100
    by NOVE-17's `roundWeights` with free bounds. An owner's `instrumentLimits` bound the instrument's weight in the
    WHOLE portfolio; the plan's quotas are shares of the buyable part, so a 30 % cap may read 33,33 % in the plan —
    as in the saved model (NOVE-17's `toModelWeights`); declared (accumulo.md § Per-page blind spots).
  - C13. The strategy's section 5 «Cosa cambia rispetto a oggi» also names the path (accumulate or sell, an
    indicative time, the monthly instalment as a round order of magnitude), from the CASHFLOW 12 MESI block it
    alone reads; the review's «Cosa fare adesso» copies the strategy's estimates without recomputing them (it has
    no cashflow block, and `CONSULENTE_CORE` forbids a number that is not in the data).
  - C14. Saving the hand-off's draft keeps the editor's default for «Aggiorna anche il portafoglio modello» (on
    when the plan differs from the model, `pr488:AccumulationPlanDialog.tsx:607-608`): after «Applica» the model
    is stale by design (choice h) and the seed is computed under the owner's own criteria; the owner can untick it.
  - C15. The kept-sale warning is its own component, `KeptSalesNote`, tested alone; the editor's wiring is
    proven in the browser (§ 7 E).
- **Overturned**: nothing of develop.

## 4. Solution

### 4.1 The plan in the Consulente's data (decision 29, C4, C5)

`lib/server/allocationAdvice/accumulationPlan.ts` (new, beside `store.ts`):

```ts
import 'server-only';
import { adminDb } from '@/lib/firebase/admin';
import { ACCUMULATION_PLANS_COLLECTION, docToAccumulationPlan, selectOpenPlan } from '@/lib/utils/accumulationPlanDoc';
import { describeOpenPlanForAdvice, type OpenPlanForAdvice } from '@/lib/utils/accumuloMonth';
import { toMonthKey } from '@/lib/utils/planMonths';

export type AccumulationPlanRead = { read: true; plan: OpenPlanForAdvice | null } | { read: false };

/** The active plan as the Consulente reads it (2026-11-12); a failed read is logged, never a failed stage. */
export async function readAccumulationPlanForAdvice(userId: string, now: Date): Promise<AccumulationPlanRead> {
  try {
    const plans = await adminDb.collection(ACCUMULATION_PLANS_COLLECTION).where('userId', '==', userId).get();
    const open = selectOpenPlan(plans.docs.map((doc) => docToAccumulationPlan(doc.id, doc.data())));
    if (!open || open.status !== 'active') return { read: true, plan: null };
    const assets = await adminDb.collection('assets').where('userId', '==', userId).get();
    const names = new Map(assets.docs.map((doc) => [doc.id, String(doc.data().name ?? '').trim()]));
    const labels = new Map(open.positions.map((position) => [position.buyAssetId, position.label]));
    const nameOf = (id: string) => names.get(id) || labels.get(id) || 'strumento non più in portafoglio';
    return { read: true, plan: describeOpenPlanForAdvice(open, toMonthKey(now), nameOf) };
  } catch (error) {
    console.error('[consulente] accumulation plan not read', error);
    return { read: false };
  }
}
```

The four states of the query: no document or only `completed`/`cancelled` → `{ read: true, plan: null }`; a draft →
the same, assets not read; an active plan before its first month → `monthIndex: 0` (the first instalment); a running
one → `monthIndex` 1..N. `prompts.ts` imports `import type { AccumulationPlanRead } from './accumulationPlan';` and
`import type { InstallmentLineStatus } from '@/types/accumulationPlan';` — types only, so the prompts' tests never
load `server-only` nor the Admin SDK. Beside `formatPreviousPathsForPrompt`:

```ts
const PLAN_SALE_STATUS: Record<InstallmentLineStatus, string> = {
  planned: 'da fare', executed: 'fatta', skipped: 'saltata',
};

/** The PIANO DI ACCUMULO block (2026-11-12): the active plan, its buys and sells — or which absence it is. */
export function formatAccumulationPlanForPrompt(state: AccumulationPlanRead): string {
  const header = '--- PIANO DI ACCUMULO ---';
  if (!state.read) return `${header}\nIl piano di accumulo non è stato letto in questa corsa: non so se ce n'è uno.`;
  const plan = state.plan;
  if (!plan) return `${header}\nNessun piano di accumulo attivo.`;
  const head = plan.monthIndex === 0
    ? `Piano attivo, non ancora partito: parte a ${plan.startMonth}, ${plan.months} mesi fino a ${plan.endMonth}, `
      + `prima rata ${eur(plan.instalmentEur)}.`
    : `Piano attivo: mese ${plan.monthIndex} di ${plan.months}, rata del mese ${eur(plan.instalmentEur)}, `
      + `ultimo mese ${plan.endMonth}.`;
  const buys = plan.buys.map((buy) => `${buy.name} ${buy.targetPercentage}%`).join(' · ');
  const sells = plan.sells.length === 0 ? 'niente' : plan.sells.map((sell) =>
    `${sell.name}, ${sell.quantity === null ? 'tutte le quote' : `${sell.quantity} quote`}, al mese `
    + `${sell.monthIndex ?? 1} (${PLAN_SALE_STATUS[sell.status]})`).join(' · ');
  return [header, head, `Compra, con le quote del piano: ${buys}.`, `Vende: ${sells}.`].join('\n');
}
```

Wiring in `run.ts`:

- `buildConsulenteContext` (`:321-325`) reads the plan with the other two and appends the block to the data:
  `Promise.all([buildAssistantYtdContext(userId), readCashflowBlockForPrompt(userId, now),
  readAccumulationPlanForAdvice(userId, now)])`; `dataBlock: `${formatBundleForPrompt(bundle)}\n\n${bondBlock}\n\n${
  formatAccumulationPlanForPrompt(planRead)}``. The strategy and the interview get it inside `dataBlock`; the function's doc
  comment (`:318-320`) gains «the PIANO DI ACCUMULO block (2026-11-12) is the one read that never fails the
  caller: a failed read prints its own sentence». The
  cashflow position pinned at `__tests__/allocationAdvicePrompts.test.ts:114` and `:116` therefore does not move.
- `runReview(document, onStage, now)` and `runRevise(document, request, interview, onStage, now)` gain `now`
  (passed at `:535` and `:538`); before `enterStage` each computes `const accumulationPlan =
  formatAccumulationPlanForPrompt(await readAccumulationPlanForAdvice(document.userId, now));` and passes it.
- `buildReviewPrompt` and `buildRevisionPrompt` take `opts.accumulationPlan?: string`, printed as
  `...(opts.accumulationPlan ? [opts.accumulationPlan, ''] : [])` right before their last line («Scrivi il report
  finale come descritto.», «Riscrivi il report intero applicando l'ultima richiesta, come descritto.»).

`DATA_INTRO` (`prompts.ts:192`) — BEFORE: «… PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI e CASHFLOW 12 MESI sono
esaustivi. …» AFTER: «… PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI, PIANO DI ACCUMULO e CASHFLOW 12 MESI sono
esaustivi. …» (the rest unchanged). `DATA_INTRO_WITHOUT_CASHFLOW` (`:194`) — BEFORE: «… FAMIGLIA e OBBLIGAZIONI sono
esaustivi.» AFTER: «… FAMIGLIA, OBBLIGAZIONI e PIANO DI ACCUMULO sono esaustivi.»

### 4.2 The path in words (decision 28)

`STRATEGY_CONTRACT` section 5 (`prompts.ts:156`) — BEFORE:
«5. **Cosa cambia rispetto a oggi** — le differenze principali con i target attuali e con le classi attuali, in punti
percentuali.»
AFTER:
«5. **Cosa cambia rispetto a oggi** — le differenze principali con i target attuali e con le classi attuali, in punti
percentuali; poi come arrivarci: accumulando con il risparmio mensile (un piano di accumulo che compra le classi
sotto target) o vendendo, e in quanto tempo all'incirca, con la rata mensile come ordine di grandezza (una cifra
tonda), dalla mediana del risparmio mensile del blocco CASHFLOW 12 MESI (senza quel blocco non stimare né il tempo né
la rata); se il blocco PIANO DI ACCUMULO descrive un piano attivo, se va già in
quella direzione o va rivisto. Nessuna tabella di rate o di quote per strumento: le cifre esatte le calcola l'app
dopo «Applica».»

`REVIEW_CONTRACT` section 6 (`prompts.ts:428`) — BEFORE:
«6. **Cosa fare adesso** — i passi concreti, in ordine, con i costi fiscali di un eventuale cambio di strumento.»
AFTER:
«6. **Cosa fare adesso** — i passi concreti, in ordine, con i costi fiscali di un eventuale cambio di strumento; poi
la strada che la strategia indica per arrivare ai target — accumulare con il risparmio mensile o vendere, il tempo
indicativo e la rata come la strategia li stima, senza ricalcolarli — e, se il blocco PIANO DI ACCUMULO descrive un piano attivo, se va verso
i nuovi target o va rivisto. Il piano esatto lo calcola l'app dopo «Applica» («Crea un piano di accumulo verso questa
allocazione»): niente tabelle di rate né quote mensili per strumento.»

Both are constants of `system`; the per-user facts stay in `userContent`. Assertions that change in
`__tests__/allocationAdvicePrompts.test.ts`:

- `:122` → `'PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI, PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi. Il blocco
  CASHFLOW del periodo copre solo l\'anno in corso: per entrate, spesa e risparmio usa il blocco CASHFLOW 12 MESI.'`
- `:124` → `'PREVIDENZA, MUTUI, FAMIGLIA, OBBLIGAZIONI e PIANO DI ACCUMULO sono esaustivi.'`
- `:305` → `at('PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi')`
- `:350` → `'MUTUI, FAMIGLIA, OBBLIGAZIONI, PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi'`
- `:351` → `'FAMIGLIA, OBBLIGAZIONI e PIANO DI ACCUMULO sono esaustivi.'`
- `:153` (`'7. **Rischi e revisione**'`) stays as it is: seven sections, no new one (U10).
- `__tests__/allocationAdviceRun.test.ts:393` → `'OBBLIGAZIONI, PIANO DI ACCUMULO e CASHFLOW 12 MESI sono esaustivi'`.

### 4.3 The «Applica» page (decision 27, choices p, C8, C9)

`lib/utils/allocationAdviceDocument.ts` (no `db`; a type-only import of `AccumulationPlan`):

```ts
/** The proposal a plan may be built toward: an applied document that wrote the targets (2026-11-12). */
export function handoffProposalOf(
  document: AllocationAdviceDocument | null | undefined,
): AllocationAdviceProposal | null {
  if (!document || document.status !== 'applied' || !document.applied?.targetsWritten) return null;
  return document.report?.proposal ?? document.strategy?.proposal ?? null;
}

export type ApplyHandoff = 'offer' | 'draft' | 'none';
export const CONSULENTE_HANDOFF_HREF = '/dashboard/allocation?tab=accumulo&da=consulente';

/** What «Applica» offers after the write: the link, the draft's note, or nothing (an active plan has its own note). */
export function applyHandoffOf(document: AllocationAdviceDocument,
  plans: 'loading' | 'failed' | { open: AccumulationPlan | undefined }): ApplyHandoff {
  if (!handoffProposalOf(document) || plans === 'loading') return 'none';
  if (plans === 'failed') return 'offer';
  if (plans.open?.status === 'active') return 'none';
  return plans.open?.status === 'draft' ? 'draft' : 'offer';
}
```

`lib/utils/allocationAdviceNarrative.ts`, beside `APPLY_ACTIVE_PLAN_NOTE`:

- `HANDOFF_ACTION_LABEL` = «Crea un piano di accumulo verso questa allocazione»
- `HANDOFF_READING` = «Il passo dopo: un piano di accumulo che compra verso questi target con i versamenti dei
  prossimi mesi. Le quote le calcola l'app; le confermi tu nell'editor.»
- `HANDOFF_DRAFT_NOTE` = «Hai una bozza di piano di accumulo: completala o eliminala in Allocazione › Accumulo, poi
  torna qui per crearne una verso questa allocazione.»

`ConsulenteReport.tsx` (which already reads `useAccumulationPlans(ownerId)` and `selectOpenPlan` for NOVE-16's note)
adds to the `apply` object (`:155-170`): `handoff: applyHandoffOf(document, plansQuery.isPending ? 'loading' :
plansQuery.isError ? 'failed' : { open: selectOpenPlan(plansQuery.data) })`. `ApplyPiecesInput`
(`ConsulenteBookPages.tsx:252-267`) gains `handoff: ApplyHandoff`; `applyPieces`' body becomes, after the ready branch:

```tsx
      ) : document.status === 'applied' && (input.activePlanNote || input.handoff !== 'none') ? (
        <div className="mt-3 flex flex-col gap-3">
          {input.activePlanNote && <p className="text-[12px] text-warning-foreground">{input.activePlanNote}</p>}
          {input.handoff === 'offer' && (
            <p className="text-[13px] leading-[1.45] text-muted-foreground">{HANDOFF_READING}</p>
          )}
          {input.handoff === 'draft' && <p className="text-[12px] text-warning-foreground">{HANDOFF_DRAFT_NOTE}</p>}
        </div>
      ) : null,
```

`ConsulenteBook.tsx`, in the `applica` footer (`:270-281`), after the ready button (`next/link` imported):

```tsx
{document.status === 'applied' && props.apply.handoff === 'offer' && (
  <Button asChild className={cn(BUTTON_CLASS, 'tablet:order-2')}>
    <Link href={CONSULENTE_HANDOFF_HREF}>{HANDOFF_ACTION_LABEL}</Link>
  </Button>
)}
```

### 4.4 The landing on Accumulo (C2)

`app/dashboard/allocation/page.tsx` passes `advice={adviceQuery.isError ? null : adviceQuery.data}` to the tab (the
query already read at `:182` @ b841cbd7): a failed read is «no advice», so the landing only cleans the URL —
with `data` left `undefined` the effect below would wait for ever and `?da=consulente` would stay. `AccumuloTab` gains `advice: AllocationAdviceDocument | null | undefined` and, beside the
`?obiettivi=1` effect (`pr488:components/allocation/AccumuloTab.tsx:105-114`):

```tsx
  const [handoffOpen, setHandoffOpen] = useState(false);
  const handoffProposal = handoffProposalOf(advice);
  const wantsHandoff = searchParams.get('da') === 'consulente';
  const plansSettled = !plansQuery.isPending;
  useEffect(() => {
    if (!wantsHandoff || !plansSettled || advice === undefined) return;
    // Deferred like `?obiettivi=1`: the effect body itself sets no state (react-hooks/set-state-in-effect).
    const timer = setTimeout(() => {
      if (!plan && handoffProposal) setHandoffOpen(true);
      router.replace(`${pathname}?tab=accumulo`, { scroll: false });
    }, 0);
    return () => clearTimeout(timer);
  }, [wantsHandoff, plansSettled, advice, plan, handoffProposal, pathname, router]);
```

and renders, beside `ObiettiviDialog`: `{handoffOpen && handoffProposal && advice && (<ConsulenteHandoff
ownerId={ownerId} basis={modelBasis} proposal={handoffProposal} candidates={advice.instruments?.candidates ?? null}
keepAssets={advice.answers.keepAssets} allAssets={allAssets} targets={targets} band={band}
targetLeverageRatio={targetLeverageRatio} idealAllocation={idealAllocation} model={model}
onAssetsChanged={onAssetsChanged} onClose={() => setHandoffOpen(false)} />)}`.

### 4.5 The hand-off, pure (`lib/utils/allocationAdviceHandoff.ts`, new; C1, C3, C6, C7, C10-C12)

```ts
const ISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;
const norm = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ');

export interface HandoffRow { assetClass: AssetClass; subTarget: string }
export interface ConsulenteHandoffPlan {
  matched: Array<HandoffRow & { assetId: string; name: string; held: boolean }>;
  toCreate: Array<HandoffRow & { name: string; prefill: AssetPrefill }>;
  unnamed: HandoffRow[];
  notBuyable: Array<HandoffRow & { assetId: string; name: string }>;
  keepAssetIds: string[];
}

/** «Nome (IE00…)», an ISIN alone, or a plain name. */
function splitNamed(text: string): { head: string; isin?: string } {
  const printed = /^(.*)\s\(([^()]+)\)$/.exec(text.trim());
  if (printed && ISIN.test(printed[2].trim().toUpperCase())) {
    return { head: printed[1].trim(), isin: printed[2].trim().toUpperCase() };
  }
  return ISIN.test(text.trim().toUpperCase()) ? { head: '', isin: text.trim().toUpperCase() } : { head: text.trim() };
}

function findAssetByIsin(assets: readonly Asset[], isin: string | undefined): Asset | null {
  if (!isin) return null;
  const wanted = isin.trim().toUpperCase();
  return assets.find((asset) => (asset.isin ?? '').trim().toUpperCase() === wanted) ?? null;
}

/** The Consulente's instruments against the assets: what a plan can buy now, what to create, what is missing. */
export function planConsulenteHandoff(proposal: AllocationAdviceProposal, candidates: InstrumentCandidates | null,
  keepAssets: readonly string[], assets: readonly Asset[]): ConsulenteHandoffPlan {
  const out: ConsulenteHandoffPlan = { matched: [], toCreate: [], unnamed: [], notBuyable: [], keepAssetIds: [] };
  for (const cls of proposal.classes) {
    if (cls.assetClass === 'cash' || cls.assetClass === 'realestate') continue;
    const sleeves = (candidates?.sleeves ?? []).filter((sleeve) => sleeve.assetClass === cls.assetClass);
    const subs = cls.subTargets.length > 0 ? cls.subTargets
      : [{ name: ASSET_CLASS_LABELS[cls.assetClass] ?? cls.assetClass, instrument: undefined }];
    for (const sub of subs) {
      const row: HandoffRow = { assetClass: cls.assetClass, subTarget: sub.name };
      const sleeve = cls.subTargets.length > 0 ? sleeves.find((s) => norm(s.subTarget) === norm(sub.name)) : sleeves[0];
      const named = splitNamed(sub.instrument ?? '');
      const list = sleeve?.candidates ?? [];
      const namesOne = named.head !== '' || !!named.isin;
      const candidate = list.find((c) => !!named.isin && (c.isin ?? '').toUpperCase() === named.isin)
        ?? list.find((c) => named.head !== '' && norm(c.name) === norm(named.head))
        ?? (namesOne ? null : list.find((c) => c.alreadyHeld) ?? list[0] ?? null);
      const asset = (sub.instrument ? findAssetByName(assets, sub.instrument) : null)
        ?? findAssetByIsin(assets, named.isin) ?? (named.head ? findAssetByName(assets, named.head) : null)
        ?? (candidate ? findAssetByIsin(assets, candidate.isin) ?? findAssetByName(assets, candidate.name)
          ?? (candidate.ticker ? findAssetByName(assets, candidate.ticker) : null) : null);
      if (asset) {
        if (!isPlanBuyable(asset, assets)) out.notBuyable.push({ ...row, assetId: asset.id, name: asset.name });
        else if (!out.matched.some((m) => m.assetId === asset.id)) {
          out.matched.push({ ...row, assetId: asset.id, name: asset.name, held: asset.quantity > 0 });
        }
        continue;
      }
      const name = candidate?.name ?? named.head;
      if (!name) { out.unnamed.push(row); continue; }
      if (out.toCreate.some((c) => norm(c.name) === norm(name))) continue;
      const ticker = candidate?.ticker ?? '';
      const isin = candidate ? candidate.isin : named.isin; // one source: never a name with another's ISIN
      const type = cls.assetClass === 'crypto' ? 'crypto'
        : cls.assetClass === 'bonds' && !ticker && /^(IT|XS)/.test(isin ?? '') ? 'bond' : 'etf';
      out.toCreate.push({ ...row, name, prefill: { name, ticker, isin, type,
        assetClass: cls.assetClass, subCategory: cls.subTargets.length > 0 ? sub.name : '' } });
    }
  }
  const kept = keepAssets.map((name) => findAssetByName(assets, name)).filter((a): a is Asset => a !== null);
  out.keepAssetIds = [...new Set([...out.matched.map((m) => m.assetId), ...kept.map((a) => a.id)])];
  return out;
}
```

A name only (`named.head` with no candidate) still reaches `toCreate`: the prefill carries that name and the ISIN
when the review wrote one, no ticker (C10). The seed:

```ts
/** Classes with sub-targets the owner did not list as factor objectives get one, at 'high' (2026-11-12). */
export function handoffCriteria(base: IdealAllocationSettings, targets: AssetAllocationTarget,
  unmapped: readonly AssetClass[]): IdealAllocationSettings {
  const listed = new Set(base.factorObjectives.map((objective) => objective.assetClass));
  const added = ASSET_CLASS_SEQUENCE.filter((c) => {
    const target = targets[c];
    return !!target?.subCategoryConfig?.enabled && Object.keys(target.subTargets ?? {}).length > 0
      && !listed.has(c) && !unmapped.includes(c);
  }).map((assetClass) => ({ assetClass, priority: 'high' as const }));
  return { ...base, factorObjectives: [...base.factorObjectives, ...added] };
}

export type HandoffSeedOutcome =
  | { kind: 'computed'; seed: PlanSeedDraft; unmappedClasses: AssetClass[];
      /** Classes of a matched instrument the optimizer left at 0 % (decision 58). */ zeroClasses: AssetClass[];
      /** Held instruments in the seed that the Consulente did not name, by label (decision 59). */ extraNames: string[] }
  | { kind: 'manual'; seed: PlanSeedDraft; reason: 'negative_fixed' | 'infeasible_bounds' | 'no_candidates';
      negativeFixedLabels: string[] };

export function buildHandoffSeed(input: { proposal: AllocationAdviceProposal; assets: Asset[];
  matchedAssetIds: readonly string[]; criteria: IdealAllocationSettings; targetLeverageRatio: number;
  valueOf: (asset: Asset) => number; now: Date; generateId?: () => string }): HandoffSeedOutcome {
  const targets = buildTargetsFromProposal(input.proposal);
  const standalone = buildStandaloneCandidates(input.assets, input.valueOf, 0, new Set(input.matchedAssetIds));
  const labelOf = (key: string) => standalone.positions.find((p) => p.key === key)?.label ?? key;
  const manual = (reason: 'negative_fixed' | 'infeasible_bounds' | 'no_candidates', labels: string[] = []) => ({
    kind: 'manual' as const, reason, negativeFixedLabels: labels, seed: { positions: weightsToSeedPositions(
      input.matchedAssetIds.map((id) => ({ key: id, label: labelOf(id), proposedPct: 0 })), input.generateId) } });
  if (standalone.negativeFixedKeys.length > 0) {
    return manual('negative_fixed', standalone.negativeFixedKeys.map(labelOf));
  }
  const unmappedClasses = ASSET_CLASS_SEQUENCE.filter((c) => {
    const listed = Object.keys(targets[c]?.subTargets ?? {});
    return listed.length > 0 && standalone.positions.some((p) => {
      const asset = standalone.assetsById.get(p.buyAssetId);
      return asset?.assetClass === c && asset.type !== 'realestate' && p.key !== LIQUIDITY_CANDIDATE_KEY
        && !listed.includes(asset.subCategory?.trim() || NO_SUBCATEGORY_LABEL);
    });
  });
  const criteria = handoffCriteria(input.criteria, targets, unmappedClasses);
  const result = runOptimizer({ positions: standalone.positions, assetsById: standalone.assetsById, settings: criteria,
    mode: 'ideal', baseEur: standalone.baseEur, valueOf: standalone.valueOf, targets,
    targetLeverageRatio: input.targetLeverageRatio, fixBounds: standalone.fixBounds });
  if (result.status !== 'ok') return manual(result.status);
  const fit = toModelWeights(result.weights.map((w) => {
    const members = standalone.positions.find((p) => p.key === w.key)?.memberAssetIds ?? [w.key];
    return { assetId: w.key, pct: w.proposedPct, ...(members.length > 1 ? { memberAssetIds: members } : {}) };
  }), standalone.assetsById);
  const matched = new Set(input.matchedAssetIds);
  // A matched instrument the optimizer left at 0 % stays as a row at 0 %: the owner gives it a share (decision 58).
  const buyable = fit.weights.filter((w) => (w.pct > 0 || matched.has(w.assetId))
    && isPlanBuyable(standalone.assetsById.get(w.assetId)!, input.assets));
  const total = buyable.reduce((sum, w) => sum + w.pct, 0);
  if (buyable.length === 0 || total <= 0) return manual('no_candidates');
  // What a plan cannot buy leaves; the rest back to Σ = 100 with the optimizer's own rounding (free bounds).
  const pcts = roundWeights(buyable.map((w) => w.pct / total), buyable.map(() => 0), buyable.map(() => 1));
  const positions = weightsToSeedPositions(buyable.map((w, i) => ({ key: w.assetId, label: labelOf(w.assetId),
    proposedPct: pcts[i], ...(w.memberAssetIds ? { memberAssetIds: w.memberAssetIds } : {}) })), input.generateId);
  const classOf = (id: string) => standalone.assetsById.get(id)!.assetClass;
  const zeroClasses = ASSET_CLASS_SEQUENCE.filter((c) =>
    buyable.some((w, i) => pcts[i] === 0 && matched.has(w.assetId) && classOf(w.assetId) === c));
  const extraNames = buyable.filter((w, i) => pcts[i] > 0 && !matched.has(w.assetId)).map((w) => labelOf(w.assetId));
  return { kind: 'computed', unmappedClasses, zeroClasses, extraNames, seed: { positions, optimizerSnapshot: { computedAt: input.now,
    mode: 'ideal', settingsUsed: criteria, objectives: result.objectives, conflicts: result.conflicts,
    weights: result.weights.map((w) => ({ key: w.key, proposedPct: w.proposedPct })) } } };
}

/** Month-1 sales of an instrument the Consulente keeps (2026-11-12); an absent `monthIndex` is month 1. */
export function findKeptSales(disposals: readonly PlanDisposal[], keepAssetIds: readonly string[]): PlanDisposal[] {
  return disposals.filter((d) => (d.monthIndex ?? 1) === 1 && d.status !== 'executed'
    && keepAssetIds.includes(d.assetId));
}
```

`ConsulenteHandoffProps` carries `basis: ModelBasis` (NOVE-17's; `AccumuloTab` passes its `modelBasis`): the
editor writes the model through `saveModelPortfolio(…, basis)` when its checkbox is on (C14).

`AssetPrefill` lives in `types/assets.ts`: `{ name: string; ticker: string; isin?: string; type:
AssetType; assetClass: AssetClass; subCategory: string }`.

### 4.6 The hand-off dialog (`components/allocation/ConsulenteHandoff.tsx`, new)

```tsx
type HandoffView =
  | { kind: 'handoff' } | { kind: 'asset'; prefill: AssetPrefill } | { kind: 'pac'; seed: PlanSeedDraft };

export function ConsulenteHandoff(props: ConsulenteHandoffProps) {
  const { proposal, candidates, keepAssets, allAssets, idealAllocation, onClose } = props;
  const [view, setView] = useState<HandoffView>({ kind: 'handoff' });
  const [openedAt] = useState(() => new Date()); // the snapshot's clock, fixed for the dialog's life
  const handoff = useMemo(() => planConsulenteHandoff(proposal, candidates, keepAssets, allAssets),
    [proposal, candidates, keepAssets, allAssets]);
  const outcome = useMemo(() => buildHandoffSeed({ proposal, assets: allAssets,
    matchedAssetIds: handoff.matched.map((m) => m.assetId), criteria: idealAllocation ?? DEFAULT_IDEAL_ALLOCATION,
    targetLeverageRatio: deriveTargetLeverageRatio(buildTargetsFromProposal(proposal)),
    valueOf: calculateAssetValue, now: openedAt }), [proposal, allAssets, handoff, idealAllocation, openedAt]);
  // A row just created waits for the assets' re-read: no second «Crea» in between (the refetch is not awaited).
  const [createdNames, setCreatedNames] = useState<string[]>([]);
  if (view.kind === 'asset') return (<AssetDialog open createEmpty prefill={view.prefill}
    onCreated={() => { setCreatedNames((names) => [...names, view.prefill.name]); props.onAssetsChanged(); }}
    onClose={() => setView({ kind: 'handoff' })} />);
  if (view.kind === 'pac') return (<AccumulationPlanDialog open plan={null} seedDraft={view.seed}
    advisorKeepAssetIds={handoff.keepAssetIds} ownerId={props.ownerId} allAssets={allAssets}
    targets={props.targets ?? buildTargetsFromProposal(proposal)} band={props.band}
    targetLeverageRatio={props.targetLeverageRatio} idealAllocation={idealAllocation} model={props.model} basis={props.basis}
    onAssetsChanged={props.onAssetsChanged} onSaved={onClose} onClose={onClose} />);
  // the ResponsiveModal below
}
```

`<ResponsiveModal open onClose={onClose} width="lg" eyebrow={HANDOFF_EYEBROW} title={HANDOFF_TITLE}
reading={describeHandoffReading(handoff, outcome)} footer={…}>`. Body, in order: one row per `matched`
(«{sub-target} · {name}», aside «in portafoglio» when `held`, else «0 quote»); one row per `toCreate` («{sub-target} ·
{name}», an outline «Crea» `h-11 desktop:h-9` → `setView({ kind: 'asset', prefill: row.prefill })`; when
`row.prefill.ticker === ''` and `row.prefill.type !== 'bond'` the aside `HANDOFF_NO_TICKER` under the name; a row
whose name is in `createdNames` shows the aside `HANDOFF_CREATED_PENDING` and no «Crea» until the re-read moves it
to `matched`); then
`describeHandoffUnnamed(subs)` and `describeHandoffNotBuyable(names)` as `text-[12px] text-muted-foreground` lines.
Footer: «Annulla» (outline, `onClose`) · «Apri l'editor» (primary, `tablet:order-2`), disabled when
`outcome.seed.positions.length === 0`, `onClick={() => setView({ kind: 'pac', seed: outcome.seed })}`. After a
create the page re-reads the assets, `handoff` recomputes and the row moves to `matched` with «0 quote».

Sentences, in `lib/utils/accumulationNarrative.ts` (`joinNames` = «a, b e c»):

- `HANDOFF_EYEBROW` = «Dal Consulente»; `HANDOFF_TITLE` = «Un piano verso la nuova allocazione».
- computed: «Quote calcolate dall'app sui nuovi target e sul patrimonio di oggi, per {n} {strumento|strumenti}: le
  confermi o le cambi nell'editor.»
- manual `negative_fixed`: `describeNegativeFixed(labels)` (NOVE-17's) + « Nell'editor gli strumenti partono da 0%:
  le quote le scegli tu.»; manual otherwise: «L'app non riesce a calcolare le quote su questi target: nell'editor gli
  strumenti partono da 0%, le quote le scegli tu.»
- with `outcome.seed.positions.length === 0` (nothing matched yet), in place of the manual sentence: «Nessuno
  strumento del piano è ancora fra i tuoi asset: crea almeno uno di quelli proposti per aprire l'editor.»
- `HANDOFF_NO_TICKER` = «senza ticker: inseriscilo per il prezzo»; `HANDOFF_CREATED_PENDING` = «creato, in
  aggiornamento».
- then, when `toCreate` is not empty: «Uno strumento proposto non è ancora fra i tuoi asset: «Crea» lo aggiunge a 0
  quote e le quote si ricalcolano.» / «{n} strumenti proposti non sono ancora fra i tuoi asset: «Crea» li aggiunge a
  0 quote e le quote si ricalcolano.»
- then, with `unmappedClasses`: «Dentro {Azioni e Obbligazioni} le quote seguono la classe intera: qualche strumento
  ha una sottocategoria che i nuovi target non elencano.»
- then, with `zeroClasses`: `describeHandoffZero(classLabels)` = «Dentro {Obbligazioni} lo strumento nuovo parte da
  0%: dagli tu una quota nell'editor.» (the classes joined by `joinNames`; the same words for more than one).
- then, with `extraNames`: `describeHandoffExtra(names)` = «Il piano compra anche {nomi}, che tieni oggi: se il
  Consulente propone di lasciarli, togli o vendi la riga nell'editor.»
- `describeHandoffUnnamed(subs)` = «Senza uno strumento indicato: {sub-target}.»;
  `describeHandoffNotBuyable(names)` = «Fuori dal piano (un conto, un immobile, un prestito o un ruolo non
  negoziabile): {nomi}.»

### 4.7 `AssetDialog` prefill (choice r)

`AssetDialogProps` (`components/assets/AssetDialog.tsx:503`) gains `prefill?: AssetPrefill` (create mode only, beside
NOVE-16's `createEmpty`). `:1165` becomes `setStep(asset || initialType || prefill ? 2 : 1);`. The create branch
(`:1286-1327`) reads it, every other field as written:

```ts
        ticker: prefill?.ticker ?? '',
        name: prefill?.name ?? '',
        isin: prefill?.isin,
        type: prefill?.type ?? initialType ?? 'etf',
        assetClass: prefill?.assetClass ?? TYPE_TO_CLASS[initialType ?? 'etf'],
        subCategory: prefill?.subCategory ?? '',
```

The effect's deps (`:1330`) gain `prefill`; the one caller holds the object in state (`view.prefill`), so it is
stable across renders.

### 4.8 The kept-sale warning (choice t)

`AccumulationPlanDialog` gains `advisorKeepAssetIds?: readonly string[]` (absent everywhere but the hand-off). In
the component, at the end of the `step === 2` block (`pr488:components/allocation/AccumulationPlanDialog.tsx:989`)
and of the `step === 3` block (`:1375`): `<KeptSalesNote disposals={draft.disposals} keepAssetIds={advisorKeepAssetIds
?? []} nameOf={(id) => assetsById.get(id)?.name ?? id} />`. `components/allocation/KeptSalesNote.tsx` (new):
`const kept = findKeptSales(disposals, keepAssetIds);`, `null` when empty, else `<p role="status"
className="text-[12px] text-warning-foreground">{describeKeptSales(kept.map((d) => nameOf(d.assetId)))}</p>`.
`describeKeptSales` (in
`accumulationNarrative.ts`): «{nome} è fra gli strumenti che il Consulente propone di tenere: il piano lo vende al
primo mese.» / «{a e b} sono fra gli strumenti che il Consulente propone di tenere: il piano li vende al primo mese.»

### 4.9 DESIGN.md (The AI-Accent Rule, `DESIGN.md:579`)

BEFORE: «… «Applica», «Applica alle impostazioni», «Salta il colloquio», …»
AFTER: «… «Applica», «Applica alle impostazioni», «Crea un piano di accumulo verso questa allocazione», «Salta il
colloquio», …»

## 5. Constraints and traps (AGENTS.md / DESIGN.md, «here it means that»)

- **`system` is byte-identical for every user** (README § 8): here it means the two contract sentences are constants
  and the plan line sits in `userContent`; U9 is `expect(a.system).toBe(b.system)` with and without the block.
- **A probe never runs the Consulente's model** (AGENTS.md § Allocazione › Consulente): here it means the E2E specs
  plant an applied document through `e2e/consulenteReport.ts` with `installFakeRun` armed; § 7 launches no run.
- **Choice l**: the model and the plans' weights are read only on the Accumulo tab; the «Applica» page reads the
  plans' STATE only (NOVE-16's `useAccumulationPlans`), never the model — which is why the editor opens on the tab.
- **The Modal-Is-A-Tile Rule** (`DESIGN.md:262`) and one modal at a time: here it means the hand-off, `AssetDialog`
  and the editor are three views of one state, as `PortafoglioModelloTile` does
  (`pr488:components/allocation/tiles/PortafoglioModelloTile.tsx:110`).
- **The AI-Accent Rule** (`DESIGN.md:579`): the link asks no model, so it is a plain primary (§ 4.9).
- **The React Compiler**: no `try/finally` in a component; the clock is `useState(() => new Date())`; the landing
  effect is deferred like `?obiettivi=1`; `buildHandoffSeed` runs in a `useMemo` on inputs that change only on open
  and after a create (no keystroke reaches it).
- **Dialog Form Reset / Two-Step Create Dialogs** (AGENTS.md § 2): the prefill enters the create branch that already
  enumerates every field; the step is settled during render; `e2e/assets.rows.spec.ts` «AssetDialog leaves with its exit animation
  … «Aggiungi asset» then opens on step 1» stays green.
- **THE RULE of the roles**: `isPlanBuyable` resolves the role WITH the financed asset; a loan named by the review is
  «Fuori dal piano», never a position.
- **A `list` carries `userId`**: both Admin queries filter on it (the Admin SDK bypasses the rules; the shape is the
  client's, and the mirror's).
- **The factor row reads the asset's `subCategory`** (`pr488:lib/utils/weightOptimizer.ts:151-162`): an instrument
  whose sub-category the targets do not list is pushed toward 0 by an added factor objective — hence C11.
- **Dynamic imports**: `allocationAdviceHandoff.ts` (the optimizer, `accumulationPlanUtils`) is imported only by
  `ConsulenteHandoff`, under the lazy tab; the Consulente route imports `allocationAdviceDocument.ts` and three
  constants. U12 pins it.
- **The Absence-Has-Three-Names Rule**: the block tells «nessun piano» from «non letto»; the page shows no link while
  the plans load rather than a link it may withdraw.
- **Sentences in `*Narrative.ts`**; **the series' labels never enter the code**.

## 6. Tests per level (with the mutation that proves each)

| # | Test | Mutation that turns it red |
| --- | --- | --- |
| U1 | `__tests__/allocationAdviceHandoff.test.ts` › `planConsulenteHandoff`: «ETF ornitorinco (IE00AAAAAAA1)» matches the asset named «Ornitorinco World UCITS ETF» with `isin: 'IE00AAAAAAA1'` (a different name: only the ISIN joins them); «ETF ornitorinco (ORNI)» by ticker; a sleeve's held candidate by ISIN; a class without sub-targets reads its first sleeve; `cash` skipped; a sub-target with no instrument and no sleeve is `unnamed`; the loan «fenicottero» named → `notBuyable`; `keepAssets` merged; a sub-target naming «ETF fenicottero (IE00BBBBBBB2)», neither an asset nor a candidate of its sleeve (which holds a held candidate) → `toCreate` with that name, that ISIN, ticker `''`, never the held candidate; a bonds sub-target naming «BTP ornitorinco (IT0000000001)» with no ticker → prefill `type: 'bond'` | drop `findAssetByIsin` from the chain; restore the `alreadyHeld` fallback when the sub-target names one |
| U2 | same › `buildHandoffSeed` on ETF A 6.000 (equity), ETF B at 0 quotes (bonds), a money-market fund 1.000, account 3.000; targets 60/30/10: positions A and B only, Σ = 100,00, snapshot `mode: 'ideal'`, no `disposals`; B (a class without sub-targets, 0 quotes) is a row at 0 % and `zeroClasses` = [bonds]; with a held ETF D 2.000 that `matchedAssetIds` does not list, D is a position and `extraNames` = [D's name]; `describeHandoffZero` / `describeHandoffExtra` give the two sentences of § 4.6 | drop the `isPlanBuyable` filter |
| U3 | same › equity sleeves «Mondo» 70 / «Emergenti» 30, ETF A «Mondo» 6.000 and ETF C «Emergenti» at 0: C's share > 0 and `zeroClasses` is empty; with C's sub-category «Altro» the class is in `unmappedClasses` and gets no added objective | `handoffCriteria` returns `base` |
| U4 | same › property 100.000 with mortgage −120.000 → `manual`, `negative_fixed`, matched at 0%; three candidates with `minPct: 40` in the owner's `instrumentLimits` (Σ lower 120 > 100: three caps at 30 % would not do, «Liquidità» always has room up to 100) → `manual`, `infeasible_bounds`; nothing matched → `manual`, `no_candidates`, an empty seed | return the computed seed regardless |
| U5 | same › `findKeptSales`: absent `monthIndex` of a kept asset → named; month 2 → not; executed → not; not kept → not | `d.monthIndex === 1` |
| U6 | `__tests__/allocationAdvicePrompts.test.ts` › `formatAccumulationPlanForPrompt`: `{read:false}`, `plan: null`, `monthIndex: 0` («non ancora partito: parte a 2027-01»), month 3 of 12 with a sale «tutte le quote, al mese 1 (da fare)» | print «mese 0 di 12» |
| U7 | `__tests__/allocationAdvicePlanRead.test.ts` (new; `adminDb` faked) › no plan → `plan: null`; a draft → `plan: null`, assets not read; an active plan starting next month → `monthIndex: 0`; a completed one → `null`; a rejected `get` → `{ read: false }` and one `console.error` | rethrow in the catch |
| U8 | `__tests__/allocationAdviceRun.test.ts` gains `vi.mock('@/lib/server/allocationAdvice/accumulationPlan', () => ({ readAccumulationPlanForAdvice: planMock }))`, `planMock` resolving `{ read: true, plan: null }` in every `beforeEach` (with today's `adminDb: {}`, `:27`, every existing run test would take the `{ read: false }` path and log) › a whole run: strategy and review user turns contain `--- PIANO DI ACCUMULO ---`, the instruments' does not; the reader called with `('u1', NOW)`; a reader answering `{ read: false }` still completes | skip the block in `runReview` |
| U9 | `allocationAdvicePrompts.test.ts` › strategy `system` contains «poi come arrivarci» and «con la rata mensile come ordine di grandezza», review `system` contains «senza ricalcolarli», review `system` contains «Crea un piano di accumulo verso questa allocazione»; strategy, review and revision `system` `toBe` across users, with and without `accumulationPlan` | put the plan line in `system` |
| U10 | same › `:153` unchanged; review `system` does not contain «8. **» | add an eighth section |
| U11 | `__tests__/allocationAdviceDocument.test.ts` › `applyHandoffOf`: ready → none; applied, targets not written → none; loading → none; failed → offer; draft → draft; active → none; no plan → offer | `'offer'` while loading |
| U12 | same › the sources of `components/allocation/consulente/*.tsx` (read as text) never import `allocationAdviceHandoff` nor `weightOptimizer` | import the hand-off into `ConsulenteReport` |
| R1 | `__tests__/consulenteBook.test.tsx` (the shared `apply` fixture at `:122` gains `handoff: 'none'`) › an applied document with `handoff: 'offer'`: the reading and a link «Crea un piano di accumulo verso questa allocazione» to `CONSULENTE_HANDOFF_HREF`; `'draft'` → the note, no link; `activePlanNote` rendered in the applied body; a ready document → no link | render the link on `ready` |
| R2 | `__tests__/consulenteHandoff.test.tsx` (new; `AssetDialog` and `AccumulationPlanDialog` mocked) › «Crea» renders only `AssetDialog` with the row's prefill; «Apri l'editor» renders only the editor with `seedDraft` and `advisorKeepAssetIds`; after `onCreated` and before the assets change the row shows «creato, in aggiornamento» and no «Crea»; with nothing matched «Apri l'editor» is disabled and the reading is «Nessuno strumento del piano è ancora fra i tuoi asset…»; a `toCreate` row with no ticker shows «senza ticker: inseriscilo per il prezzo» | render the hand-off under the editor; drop `createdNames` |
| R3 | same › eyebrow «Dal Consulente», the title, the reading in the header, «Annulla» and «Apri l'editor» in the footer | the buttons in the body |
| R4 | `__tests__/assetDialogCreateEmpty.test.tsx` (NOVE-16's) › with `prefill`: opens on step 2, name, ISIN and sub-category filled; `createAsset` with `quantity: 0`, no transaction | drop `prefill` from `setStep` |
| R5 | `__tests__/keptSalesNote.test.tsx` (new) › a disposal of a kept asset without `monthIndex` renders «… il piano lo vende al primo mese.» with `role="status"`; two kept assets the plural; empty `keepAssetIds` renders nothing | ignore `keepAssetIds` |
| E1 | `e2e/accumulo.consulente.spec.ts` (new, desktop) › `plant('applied')`, no plan: «Applica» → the link → URL `?tab=accumulo` without `da`, «Un piano verso la nuova allocazione» open with «ETF ornitorinco» and «Crea»; «Apri l'editor» → the editor's dialog, the hand-off gone | drop `router.replace` |
| E2 | same › with `seedAccumuloFixture()`: the active note, no link; with `seedAccumuloFixture({ status: 'draft' })`: `HANDOFF_DRAFT_NOTE`; `?da=consulente` typed with the plan open → no dialog, URL `?tab=accumulo`; `?da=consulente` typed over `plant('ready')` and no plan → no dialog, URL `?tab=accumulo` | open the dialog with a plan |
| E3 | same › «Crea» → `AssetDialog` on step 2 with «ETF ornitorinco» filled; save; the row reads «0 quote» | the prefill ignored |

`e2e/consulenteReport.ts`: `ReportStatus` gains `'applied'` → `{ ...base, status: 'applied', stage: 'review',
strategy, instruments, report, error: null, applied: { at: now, targetsWritten: true, rolesChanged: 0, goalsWritten: 0
} }`. `e2e/accumuloFixture.ts` (NOVE-16's): its options gain `status?: 'active' | 'draft'`, default `'active'`; a
`'draft'` is written with `installments: []`, no `baseline`, no `activatedAt` (NOVE-16's draft shape); the lock is
written either way. `e2e/accumulo.consulente.spec.ts` keeps `rememberHeld` / `restoreHeld` and, in `afterAll`,
deletes through firebase-admin every `assets` document of the seed account whose `name` is «ETF ornitorinco»
(none exists in `scripts/seedEmulator.ts`): the suite runs on one worker over the same account, and the specs
that follow would read the extra asset.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on the seed account, with an applied document planted and no plan, the «Applica»
page offers the plan; the link lands on Accumulo and opens «Dal Consulente» with «ETF ornitorinco» to create and the
loan «fenicottero» out of the plan; «Crea» adds the ETF at 0 quotes; «Apri l'editor» shows weights summing to 100
with the ETF > 0; with a planted active plan the page shows the note and no link; no model is called.

- **A**: `npx tsc --noEmit`, lint, Vitest in three zones (machine, `TZ=Europe/Rome`, `TZ=UTC`), `npx playwright test
  e2e/accumulo e2e/allocation.consulente` in every project.
- **B**: emulators + `emulators:seed` + `dev:emulator`; a scratchpad script run from inside the repo (AGENTS.md §
  Emulator Exercise Scripts) calls `plant('applied')`, then patches the report's bonds class to `subTargets: [{ name:
  'Euro 1-3 anni', targetPercentage: 100, instrument: 'Prestito fenicottero' }]`; in Patrimonio the loan «Prestito
  fenicottero» financing the seeded home (the decoy). Every class of the planted report that names an instrument
  not held carries sub-targets (decision 58: only there a new instrument gets a share), and the asset created in C
  keeps the prefilled sub-category.
- **C (browser)**: 390, 768×1024, 1024×768, 1440, light and dark: the «Applica» page's link and reading; the dialog
  (a drawer at 390), «Fuori dal piano: Prestito fenicottero.», «Crea» → `AssetDialog` → back to the dialog, «Apri
  l'editor» → the editor; at no moment two modals.
- **D (data)**: the new asset has `quantity: 0`, the prefilled name and sub-category, no `assetTransactions` row;
  «Salva bozza» in the editor writes `accumulationPlans/<id>` `status: 'draft'`, `optimizerSnapshot.mode: 'ideal'`,
  positions summing to 100 and naming the new id with a share > 0 and, with «Aggiorna anche il portafoglio modello» left on,
  `modelPortfolios/<ownerUid>` with the plan's weights and `origin: 'manual'` (C14). A second scratchpad script reads the planted plans with
  firebase-admin, maps them with `docToAccumulationPlan` + `describeOpenPlanForAdvice` and prints
  `formatAccumulationPlanForPrompt` for: no plan, a draft, an active plan starting next month, one in its third month.
- **E (edges)**: the draft planted → the draft note; removed → the link back; `?da=consulente` typed over a `ready`
  document → no dialog, the URL cleaned; in the editor toggle the sale of a kept instrument → the month-1 warning.
- **F (owner, at «pronto»)**: the mirror (`npm run mirror:seed -- <email>`); the owner opens his book's «Applica»
  page; if his document is applied with targets written and no plan is open, he follows the link, reads the dialog
  and the seed, and may save a draft on the mirror; no run is launched. `npm run mirror:remove`.
- **G** (the two budgets close by README.md § 8's ONE rule, decisions 33 and 34): `npm run perf:budget` (the route this spec grows: `/dashboard/allocation`); no
  first screen changes, so no `mobile:census`; stop the servers, delete the scripts, remove the mirror.

## 8. Putting it into service

One PR to `develop`; no rule, no collection, no migration (the server reads `accumulationPlans` through the Admin
SDK; the client already reads it under NOVE-16's rule). After the deploy the owner checks the prompts ONCE in
production, with his key: «Chiedi una modifica» on his current report reruns the review only — expected: «Cosa fare
adesso» names accumulating or selling, an indicative time and an instalment as an order of magnitude, no table, and,
with his plan active, whether it goes toward the targets. The strategy's sentence is read at his next full path.

## 9. Documentation

- `doc/guide/accumulo.md` § the hand-off: «the seed holds every tradable instrument held; a new instrument in a
  class without sub-targets starts at 0 %; the reading names both (`describeHandoffZero`,
  `describeHandoffExtra`)» (decisions 58, 59).
- `doc/guide/consulente.md` § «Applica» (`:353-362`): «After «Applica», with the targets written and no open plan,
  the page offers «Crea un piano di accumulo verso questa allocazione»: a link to Accumulo `?da=consulente`; a draft
  gets a note, an active plan NOVE-16's line (owner, 2026-11-12)». § prompts (`:366-369`): the PIANO DI ACCUMULO
  block, its three states, the four stages that read it; sections 5 and 6 carry the path in words (decision 28).
- `doc/guide/accumulo.md`: § «Dal Consulente» — `planConsulenteHandoff`, `buildHandoffSeed` (mode `'ideal'`, the
  added factor objectives, C11, C12), the three views, `advisorKeepAssetIds` and `KeptSalesNote`, «the hand-off's
  editor keeps the model checkbox's default (on when the plan differs from the model)»; § Per-page blind spots: a
  limit on an instrument bounds its weight in the portfolio, not its quota in the plan (C12); § Files the new
  module and components.
- `doc/guide/dialog.md` § Two-Step Create Dialogs: `prefill` opens the create on step 2, like `initialType`.
- `AGENTS.md` § 3 Allocazione › Consulente: «the strategy, the interview, the review and the revision read the PIANO
  DI ACCUMULO block (2026-11-12)» in the stub's first bullet.
- `DESIGN.md` § 4.9; `CLAUDE.md` › Key Features (the Consulente line: «a hand-off to a plan of accumulation after
  «Applica»») and «Latest»; `Draft Release Temp.md`: the button and the dialog, in the user's words.

## 10. Declared out of scope

- **A section «Come arrivarci» with the Consulente's own figures** (README § 10): none, declared.
- **The Consulente reading the model or its criteria** (choice i): none, declared — choice i binds what the
  Consulente's prompts read; the hand-off is the Accumulo tab's code and reads the owner's criteria and the model
  exactly as «Ricalcola» and the editor already do.
- **Changing the type of a prefilled instrument**: none, declared — the prefill opens `AssetDialog` on step 2; an
  instrument C6 types wrongly is created from Patrimonio's «Aggiungi asset» and matched by name at the next open.
- **Sales seeded from the Consulente's «vendi»** (C3): none, declared — a sale under a tax cap stays NOVE-18's
  «Con vendite mirate», in the model's dialog.
- **A hand-off from a report not yet applied** (decision 27 says «after»): none, declared.
- **Re-labelling a held instrument's sub-category to the Consulente's sleeve**: none, declared (C11 says it).
- **Revising an active plan from the Consulente**: none, declared — the note sends the owner to Accumulo's own
  revision.
- **The instruments stage and the Assistente reading the plan block**: none, declared.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/nove/NOVE-21-consulente-e-piano-di-accumulo.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec doc/nove/NOVE-21-consulente-e-piano-di-accumulo.md e l'indice della serie
  doc/nove/README.md (§ 3 decisioni, § 4 scelte adottate, § 7 contratti condivisi, § 8 regole)
- Leggi doc/guide/consulente.md, doc/guide/accumulo.md, doc/guide/ottimizzatore.md,
  doc/guide/allocazione.md, doc/guide/dialog.md, doc/guide/patrimonio.md, doc/guide/velocita.md,
  doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
- Leggi DESIGN.md (The Modal-Is-A-Tile Rule, The AI-Accent Rule, The Path-Scene Rule,
  The Absence-Has-Three-Names Rule) e PRODUCT.md
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

Implementa la spec così com'è scritta, nell'ordine: il lettore server del piano e il blocco
PIANO DI ACCUMULO; le due frasi dei contratti (prima/dopo) con le asserzioni della § 4.2;
allocationAdviceHandoff.ts; il prefill di AssetDialog; la pagina «Applica» e il link; la
finestra «Dal Consulente» sulla scheda Accumulo e l'avviso nell'editor (KeptSalesNote); la frase di
DESIGN.md. I test PRIMA del codice, ciascuno visto rosso con la sua mutazione; cifre
inventate e tonde. Nessun controllo che spende: nessuna corsa del Consulente, il documento
si pianta con e2e/consulenteReport.ts e la corsa resta finta. Fermati e chiedimi se:
perf:budget, misurato prima e dopo sulla stessa macchina, supera un tetto di più di 1 KB gz (fino a 1 KB lo alzi tu, con raisedBy e una riga in velocita.md § Registro); diventa rosso un
test del Consulente che la § 6 non nomina; nel test U3 lo strumento a 0 quote della classe CON
sotto-target resta a 0 (in una classe senza sotto-target lo 0% è atteso: decisione 58).
Collaudo: § 7, la F sul mirror al mio «pronto»; il controllo in produzione lo faccio io
dopo il deploy (§ 8). Un branch, un commit, solo dopo il mio OK con il riassunto del diff.
SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with shared contracts (`readAccumulationPlanForAdvice` and the
PIANO DI ACCUMULO block read by four prompts; `planConsulenteHandoff` / `buildHandoffSeed` over NOVE-17's optimizer)
across the Consulente route, the Accumulo tab, the editor and the asset dialog. Estimated size: 1 session, ~5 h;
~260 lines pure, ~200 across components, ~450 of tests, three E2E tests.
