# Allocazione

> **Quando aprire questa guida** — chi tocca `app/dashboard/allocation/page.tsx`, `components/allocation/*` o i moduli puri
> `lib/utils/{allocazioneSummary,allocazioneNarrative,allocationUtils,leverageAwareAllocationUtils,assetExposureUtils,equityBondsAutoTargets}.ts`,
> `lib/services/assetAllocationService.ts`, `lib/server/portfolioExposureService.ts`. In `AGENTS.md` resta lo stub con
> l'essenziale; qui c'è la regola completa. Moduli e file: § *Files*, sotto. Nessuna
> spec Playwright copre la pagina (lo dice *Per-page blind spots*).

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Allocazione / exposure**: `app/dashboard/allocation/page.tsx`, `components/allocation/*` (+ `tiles/*`), pure `lib/utils/{allocazioneSummary,allocazioneNarrative}.ts` over `lib/utils/{allocationUtils,leverageAwareAllocationUtils,assetExposureUtils}.ts` (`allocationUtils` owns `ASSET_CLASS_SEQUENCE`, `ASSET_CLASS_LABELS`, `ASSET_CLASS_CHART_INDEX`), `lib/services/assetAllocationService.ts`, `lib/server/portfolioExposureService.ts`; `exposure-cache/{userId}`

## Auto-Calculated Targets (`lib/utils/equityBondsAutoTargets.ts`)
- **The Bull's formula prescribes an EQUITY share and says nothing about the other classes, so they are funded out of
  Azioni**: `bonds = 100 − formula`, `equity = formula − other`. Charging them to the bond sleeve makes the *defensive*
  allocation the shock absorber for every satellite and drives it to ~0%.
- **Derive the second member of a percentage pair from the ALREADY ROUNDED first one**, never from the raw input twice —
  rounding both yields totals like 100,01%, and the total is what Save validates. Generalise: *when two values must sum
  to a constant, round one and subtract.*
- **An effect that sums over an `AssetClass` union must list that same union in its deps**, or a newly added class
  enters the sum without re-triggering the effect.
- Equity floors at 0 when the other classes exceed the formula's share and the overflow falls back on bonds: preserving
  the 100% total beats preserving the bond share, because a wrong total blocks Save.

## Allocation — `allocationRole` and where the filter must live
- **`Asset.allocationRole` is ONE field with THREE values**: `tradable` (default, in denominator and plans); `frozen`
  (**in the denominator, never in the plans** — dropping a bond-heavy pension fund from the totals would report the free
  portfolio's mix as your real exposure, and counting it makes the plans *compensate*, which is the value of the role);
  `excluded` (**out of the page entirely, denominator included**, or a house pegs its class permanently off-target).
- **Legacy read-fallback: `excludeFromAllocation: true` → `excluded`, never `frozen`**; never write that field again.
- **No role is ever inferred at read time** — the `realestate → excluded` / `Private Equity → frozen` / `pensionFund →
  frozen` suggestion is a FORM default for NEW assets, one ternary in the existing touched-flag effect. The role is
  orthogonal to `isLiquid` (only the liquid/illiquid split) and `isPrimaryResidence` (only FIRE net worth).
- **THE RULE: partition upstream of `compareAllocations`, never downstream.** Filtering the *output* is wrong twice:
  every other class's `targetValue = target% × totalValue` measures against the wrong base, and it breaks the
  Σ(current − target) = 0 invariant the balance score halves.
- **Do NOT push the filter into `calculateCurrentAllocation`** — it also serves `/api/portfolio/snapshot`, which must keep
  freezing the WHOLE portfolio. **Consequence kept on screen**: the Allocazione header's total excludes `excluded`, so it is
  SMALLER than the Panoramica net worth; the Bilanciamento footer says so and keeps `frozen` (inside the total) and
  `excluded` (outside it) as **two** sentences, and the Dettaglio lists them in two tiles.
- **The orphaned target is the trap this feature sets**: flag the house and its 70% sub-target survives with zero
  allocatable value, so new money pours into a bucket that cannot hold it. Any target-driven surface owes two things:
  `findOrphanedTargets` (positive target + ~zero allocatable value + excluded value behind it; a class is not orphaned if
  any sub-target is still reachable) and `stripOrphanedSubTargets`, which must REMOVE them from the map handed to
  the Piano tile's plans **and** the Per classe rows, not merely warn.
- **An empty target is not an orphaned target** — an unfunded sub-category MUST keep receiving money. The distinguishing
  condition is *excluded value behind it*, never "current value is zero".
- **The subcategory is OPTIONAL, so every euro of a class must land in a bucket** (2026-08-30). The snapshot files a
  holding with no `subCategory` under `NO_SUBCATEGORY_LABEL` («Senza sottocategoria»): dropping it made the class total
  — the DENOMINATOR of every sleeve — larger than the sum of the sleeves, so each targeted sleeve read under target by
  the unclassified share while its euros appeared nowhere. `toLegacyAllocationResult` emits that bucket as a row with
  **no target, no gap and action `OK`**, rendered by `AllocationRow untargeted` (share and value, no chip, no tick) and
  sorted LAST: the answer to «troppo o troppo poco?» there is «classificalo», which no COMPRA/VENDI chip can say. Both
  plans must treat it as "no opinion": `buildContributionPlan` drops it as a destination (you cannot buy the absence of
  a sleeve) and `buildWithdrawalSubCategoryNodes` ignores its 0 target and keeps the pro-rata fallback, or a withdrawal
  would drain the unclassified holdings first.

## Allocation — the two plans and the leverage engine
- **"Versa" and "Preleva" are ONE tree with the sign flipped**: both return `PlanNode[]` (`amount` always positive).
- `splitFromSurplus` mirrors `splitTowardTarget` and drains what sits ABOVE target first, with two constraints the
  contribution side has no analogue for: `take ≤ capacity` per item and `Σtake ≤ Σcapacity`. The invariant every caller
  relies on: **Σamount === min(requested, Σcapacity)** at every level.
- **`currentValue` and `capacity` are DIFFERENT inputs to `splitFromSurplus`**: the surplus is measured on `currentValue`
  (a frozen fund really does push its class above target), the take is capped at the TRADABLE slice. `buildRebalancePlan`
  caps the SELL side at `tradableByClass` and never the BUY side.
- **The "neutral targets" trick**: passing a synthetic `targetPercentage = value / bucketTotal × 100` makes BOTH split
  functions degenerate to pro-rata below the class level, with no branch. Do not add a second algorithm.
- **THE ASYMMETRY is the design**: *you can be told to buy something you do not own; you can never be told to sell it.*
  Versa's sub-category buckets come from the configured TARGETS, Preleva's from the HOLDINGS (splitting across
  only-targeted subs would strand every euro in an untargeted one).
- **Neither plan may ever name a `frozen` holding**; Versa additionally drops a sub-category that is *entirely* frozen,
  renormalizing onto what you CAN buy. An **unfunded** target is a different thing and must stay. **A composite asset
  yields one holding per component**, each carrying the parent's `tradable` flag.
- **The balance score is band-INDEPENDENT — do not "fix" it to read the action.** With Σtarget > 100 the drifts do not
  cancel, so it decomposes: `leverageGapPp = Σd`, `misallocationPct = (Σ|d| − |Σd|)/2`, `score = 100 − misallocation −
  |gap|`. Only the verdict, plan and chips react to the band; a class held WITHOUT a target entry never enters
  `byAssetClass` (§ Per-page blind spots).
- **Leverage**: `expandAssetExposure` must NOT special-case `pensionFund`. The class residual is solved against the
  post-trade **MARKET** base — `classCoeff[c][i] = exposurePerEuro[c][i]` (no `instrumentLeverage` term), `classConst[c]
  = currentNotional[c] − tf[c]·marketAfterTrade` — because scaling by the *notional* total re-multiplies by the current
  leverage. The *leverage* term keeps `instrumentLeverage` as its coefficient.
- **`AllocationResult.totalValue` is the NOTIONAL total** (== market at leverage 1);
  `marketValue`/`notionalValue`/`leverageRatio`/`hasLeveragedExposure` are REQUIRED so `tsc` forces the band
  re-classifier to copy all four through. **The whole leverage UI is a `hasLeveragedExposure` fork, not a rewrite.**
- `ASSET_CLASS_CHART_INDEX` is the single source of a class's chart slot, so a class is the same hue on Allocazione and
  Storico. **A synthetic series is not exempt** — Storico's "Previdenza" band is slot 8, past the 0-7 the union owns;
  anything new starts past 8.
- **`ASSET_CLASS_SEQUENCE` (`lib/utils/allocationUtils.ts`) is the ONE enumeration of the `AssetClass` union**, typed
  `AssetClass[]` so widening the union without extending it is a compile error. A surface that hand-lists class names
  drops the newer ones in silence — and **dropping a class drops its EUROS, not merely its label**: `pdfDataService`'s
  six-name array left `trendFollowing` and `carry` out of the PDF's allocation table entirely, so the printed rows
  stopped accounting for the whole portfolio while every one of them still looked right (2026-08-30). Known readers, all of which must stay
  readers: `assetAllocationService`'s `ALL_ASSET_CLASSES` and `buildTargetsFromGoalAllocation`, `chartService`'s
  `byClass`, `pdfDataService`, `historyComposition`'s band vocabulary, `manualSnapshotAmounts`, `GoalFormDialog`,
  `AllocationBreakdown`'s order, and the goal-proposal schema in `lib/server/assistant/prompts.ts` — the model cannot
  propose a class it is never shown, while `goalProposal.ts` already accepted it. **Two maps stay hand-written on
  purpose and must be extended by hand**: `assetService`'s `ASSET_CLASS_ORDER` holds RANKS, not membership, and a class
  missing from it sorts last (`|| 999`) whatever its weight; `getDefaultTargets` holds the seed PERCENTAGES a new user
  starts from, and a class missing from it never appears in their target document at all.
- **Widening `AssetClass` only breaks the Records actually typed `Record<AssetClass, …>`** — grep first. The costly one is
  the zod `z.enum([...])` in `AssetDialog.tsx`, surfacing as indirect assignability errors on `reset()`/`setValue()`
  sites that never name the enum.
- **A label map has its own REGISTER and is extended, never consolidated.** Five Italian label maps exist on purpose:
  `allocationUtils.ASSET_CLASS_LABELS` (nominal — «Azioni», the canonical one), `chartService.getAssetClassName`
  (nominal, feeds Panoramica › Composizione and Patrimonio › Classi), `pdfDataService.getAssetClassName` (**adjectival**
  — «Azionario»), `PortfolioSection.getAssetClassShort` (abbreviated to the column — «Materie P.») and
  `monthlyEmailService.ASSET_CLASS_LABELS` (lowercase — «Materie prime»). Routing them all through one constant renames
  four classes in the PDF for a fix that was meant to add two keys. **Add the key to each map**; they all close with
  `|| assetClass`, so a missing one prints the camelCase Firestore key on screen (2026-08-30: it did, for
  `trendFollowing` and `carry`, on the Panoramica, Patrimonio, the PDF and the periodic emails).
- **A raw class key must never reach the model either.** `lib/server/assistant/prompts.ts` resolves every
  `assetClass` through `assetClassLabel()` before interpolating: the blocks are quoted back to the user in Italian
  prose, so «dell'trendFollowing» is how a Firestore key becomes a sentence.

## Allocazione — a verdict over tiles (`app/dashboard/allocation/page.tsx`, `components/allocation/tiles/*`, `lib/utils/{allocazioneSummary,allocazioneNarrative}.ts`)
- **The page has no axis; the band is a SCOPE.** `BandToggle` (the `AsideToggle` form, with the custom `pp` field beside it) sits in the Bilanciamento tile's aside: it re-classifies every COMPRA/VENDI/OK — verdict, Piano, Per classe chips — while `computeBalanceScore` stays band-independent and the ring never moves. Never put the band beside the verdict (DESIGN.md → The Scope-Is-Not-An-Axis Rule).
- **Three pieces of page state feed the words**: `band`, `planMode` and `amountInput` (default `'1000'`). The verdict's last clause is ALWAYS `summarizeNextMoney(planInputs, amount)` — the Versa split — whatever mode the Piano shows; the tile's reading is `describePlan(buildPlanView(mode, amount, inputs), band)`. A verdict that followed the toggle would be the tile's title.
- **`leverageGapPp` is a leverage figure only when leverage is in play** (`hasLeveragedExposure || targetLeverageRatio > 1.01`). Otherwise a negative Σdrift is wealth in classes the targets do not name (`untargetedClassLabels`, from the holdings not in `byAssetClass`) and `describeBalance` says «il 78% è in classi senza target (Immobili, Liquidità)» — the page passes `leverageGapPp: 0` plus `untargeted` in that case, never both.
- **A drift wears no sign token.** Every figure of `allocazioneNarrative.ts` is `mono` and uncoloured; the action hues (`useActionColors`, resolved ONCE per tile and passed down — `InstrumentTradeList` takes them as a required prop) colour the chips, the plan amounts and the ring only.
- **`summarizeHoldings` counts ASSETS, not rows**: a composite asset is one holding per leg in `buildHoldings` (`id` = `{assetId}:{index}`), and «2 asset» for one 70/30 fund is a lie. The per-holding share of a group (`rows[].sharePct`) is the summary's, so the Dettaglio computes nothing.
- **`PlanView` is a discriminated union and the Piano narrows on `view.mode`, never on the toggle**; under leverage it renders `trades` (instruments), never `moves`. `MIN_VISIBLE_AMOUNT` lives in `allocazioneSummary.ts` (re-exported by `PlanRow`). A Ribilancia with nothing to do draws no body: the reading already says «Tutto in linea», and «a saldo zero» is said only when Σsell and Σbuy agree within a euro (a class inside the band keeps its gap).
- **`AllocationRow` is ONE line + a 3px `TargetTick`** with fixed mono columns (52 · 44 · min 76 px) and a `basis-[140px]` name block: below that room the columns drop to a second line (`ml-auto`) — at 390 the name used to shrink to an ellipsis. The orphan-stripped `bySubCategory` feeds the rows AND the plans; the orphans themselves are the tile's footer (a warning block), not a page banner. Classes follow `assetClassSequenceIndex` (`allocationUtils.ts`), not `ASSET_CLASS_ORDER` from `assetService`, which drags the SDK into a tile.
- **Esposizione fetches on mount** (`usePortfolioExposure(userId, true)`; the server cache is 24 h and keyed on the composition) — the old collapsible waited for a click. The remainder row is «Resto del portafoglio» for every view; one row open at a time, its sources in a persistent `aria-live` block under the list (a live region mounted together with its content announces nothing); the empty-view sentences are `describeExposureEmpty`'s.
- **The Previdenza tile is the ONE place the excluded wealth is part of a picture** (`buildPensionLookThrough` takes the full asset list, `calculateAssetValue` injected so the module stays SDK-free); its heading says «esclusi compresi» whenever it is, and the reading says whether the fund is inside the allocated total (`allFrozen`).
- **A fixed-amount cash target («fisso €») keeps a STALE `targetPercentage` in Settings**, whose total reads «100% (excl. cash)». Two rules follow: `deriveTargetLeverageRatio` skips cash when `useFixedAmount` (it read a plain 100% plan as a 1,05× leverage target), and `compareAllocations` re-expresses every other class's `targetPercentage` on the MARKET base (`targetValue / marketBase`) so Σtarget% = 100 like Σcurrent% — before, a 70% equity target on 175k of 200k printed «70%» beside a current share measured on 200k, and every class read under target by the cash share. Read the EFFECTIVE targets from `byAssetClass`, never the raw Settings (the Bilanciamento target bar and the leverage engine's `targetPercentageByAssetClass` do).
- **`buildCompositionPair` normalises the target on its own sum** (a leveraged target sums above 100) and computes `targetPercentage * 100 / sum`, not `(pct / sum) * 100` — the second prints `55.00000000000001`. `buildCompositionLegend` is the ONE legend of the two bars (current order, target-only classes appended, a gap where a side is missing).
- **Ribilancia descends to the INSTRUMENT, through the flow plans' own splits** (2026-09-21): `buildRebalancePlan` takes an optional `RebalanceDescent` (`bySubCategory` already stripped of orphans, `bySpecificAsset`, `holdings`) and fills `RebalanceMove.children` — a SELL through `buildWithdrawalSubCategoryNodes`, a BUY through `buildContributionSubCategoryNodes`, which was extracted from `buildContributionPlan` for exactly this. A rebalance IS a withdrawal and a contribution at once, so its legs must be the ones Preleva and Versa would name for the same euros; **never add a second algorithm**. Σchildren === the class amount at every level, and a BUY descends **exactly as far as Versa does — no further**: with no configured sub-target a contribution has no bucket, and so has the rebalance's buy leg.
- **Un livello che ripete quello sopra sparisce** (`collapseRepeatedLevels`, 2026-09-21): una sotto-riga che riceve TUTTA la mossa della sua classe e tiene UN solo strumento stampa la stessa cifra due volte sotto due nomi («ETF Obbligazionari a Breve Termine +3000 €» sopra «CSBGE3 +3000 €»). Sopravvive il FIGLIO — lo strumento è la riga su cui si agisce, e la sua sottocategoria resta nominata in Per classe — mentre un nodo con due figli tiene il suo livello, perché «All World» sopra VWCE e SWDA è una vera ripartizione. Cinque righe su quindici sul conto del proprietario; il Piano è passato da 1062 a 857px. **La funzione prende la lista il cui PROPRIO livello può sparire**: il Ribilancia le passa `move.children`, i piani di flusso le passano i figli di ogni classe e la classe resta, perché porta il chip, la deriva e l'azione.
- **Quale riga è uno strumento è un fatto del NODO, non della sua profondità** (`PlanNode.isInstrument`): da quando il collasso solleva un figlio unico, un ETF può stare a profondità 1, e `PlanRow` che leggeva `depth === 2` gli metteva sotto «→ 100,0%» — cioè «tieni tutto», esattamente la lettura che il suo docstring esiste per vietare. I tre costruttori di nodi-strumento lo dichiarano.
- **Le due colonne della griglia stanno a altezza naturale** (2026-09-21): il Piano che nomina gli strumenti è ~860px contro i ~380 di Bilanciamento, e una tessera gonfiata a riempire quel divario è una card vuota, non un layout. A sinistra Bilanciamento + Per classe (`contents` sotto `desktop:`, `desktop:flex-col`, `desktop:self-start`), a destra il Piano, sotto l'Esposizione a tutta larghezza; il telefono tiene il suo ordine con gli `order-*`. Il vuoto è sceso da 684 a ~90px e la pagina da 2359 a 2112px.
- **A plan that SELLS prices the withholding** (2026-09-21): `estimatePlanSaleTax(planSaleNodes(view), holdings)` reads the leaf nodes — instruments, keyed by holding id — and taxes the realized fraction of each one's unrealized gain (`amount × (value − costBasisEur) / value`, floored at 0) through `estimateSaleTax`, the app's ONE tax rule. `AllocatableHolding` carries `costBasisEur`, `taxRate` and `taxableOnSale` for it (`buildHoldings`; a cash account and a fondo pensione are `taxableOnSale: false` — they contribute 0 AND do not make the estimate unknown, the same two exemptions `calculateUnrealizedGains` applies). **Any taxable leg without a basis or a rate makes the whole estimate `null` WITH a reason**, never a silent zero: the clause is then dropped and the footer keeps saying the tax is not counted. The two must never both appear.
- **«Prelevare 1000 €» vuol dire 1000 € IN MANO** (`solveWithdrawalGross`, 2026-09-21): il piano vende il LORDO che, tolta la ritenuta, lascia la cifra chiesta. **Non è una divisione per (1 − aliquota)**: la ritenuta dipende da QUALI strumenti il piano drena e da quanta plusvalenza porta ciascuno, e quali strumenti drena dipende dall'importo — è un punto fisso, `gross = netto + tax(plan(gross))`, risolto per iterazione (converge perché la tassa cresce molto più lentamente del lordo). Tre uscite oneste: ritenuta non stimabile → vende la cifra chiesta e non promette alcun netto (`grossedUp: false`); niente plusvalenza → lordo uguale al netto; lordo oltre il negoziabile → `exceedsPortfolio`, e la frase dice che il netto non si raggiunge. Le RIGHE sommano il lordo, quindi la frase lo nomina: chi le controlla deve ritrovare la cifra stampata. Il motore con leva non si lorda (pianifica su strumenti che la stima non legge) e lo dichiara.
- **A DORMANT class keeps its row and loses its verdict** (`isDormantClass`, 2026-09-21): neither allocated value nor a target (it exists only because the target document carries a 0% entry). It cannot be off target, so an `OK` chip on it is a verdict on a void — and it was one: Per classe printed «Immobili · OK · 0,0% · 0% · 0 €» while the Previdenza tile, on the same screen, printed «Immobili 60.000 € · 20%», because the house is `excluded`. It takes the `dormant` form of `AllocationRow` (the note says where its money is, «esclusa dall'allocazione · 60.000 €», from `sumHoldingsByClass(excludedHoldings)`), sorts LAST like the residual sleeve, and leaves the counts: the page reads `activeClassGaps(gaps)` for `classCount`, for `offTargetGaps` and for `describeClasses`, never the raw list. It is NOT the orphaned target, which is a POSITIVE target stranded behind excluded value.
- **The sub-rows' «corrente» is a share of their CLASS** (`assetAllocationService.ts:903-904` against `:854`) and the column is the same one. The open region declares it with a `TILE_SUB_EYEBROW_CLASS` line — «% della classe · target · gap» — and the tile's footer says the sleeves compensate inside the class. They DO reconcile: on the owner's account 40.000 − 15.000 = 25.000, exactly the class gap; the defect was that the page never showed it.
- **The Esposizione reading follows its VIEW** (`describeExposure(highlights, view)`, 2026-09-21): it keeps all three facts and opens on the one the reader is looking at. It was `useMemo(…, [exposure])` with no `view` dep, so on «Settori» and «Emittenti» it still named the heaviest holding — the only reading on the page that did not answer its own state. The aside names the base of the percentage column («% del portafoglio»), because the reading says an issuer emits «il 46% degli ETF» and the row under it prints 29% of the portfolio.
- **The row carries NO `aria-label`** (2026-09-21): an accessible name on a `role="button"` REPLACES its contents, so «Espandi Azioni» made a screen reader hear eight class names and not one figure — and this tile IS the page's data table. The expand wording moved onto the chevron as `sr-only`. The band announces its reclassification through a page-level `role="status"` (`describeBandChange`), mounted with the page so it is being watched before it changes.
- **ONE Tab stop per list** (`useRovingFocus`, 2026-09-21): the three `AsideToggle` groups (the primitive itself, `orientation: 'horizontal'`, its Tab stop the SELECTED option), the Per classe class rows and `RankedRows`. «Dettaglio» went from 41 presses to 23; inside `main`, from 27 stops to 8.
- **Deleted on 2026-08-25**: `AllocationHero`, `BalanceScoreGauge`, `RebalanceBandControl`, `ActionPlanner`, `RebalancePanel`/`ContributionPanel`/`WithdrawalPanel`, `AllocationCompositionBar`, `PensionAllocationCards`, `ExposureSection`, `AllocationPageSkeleton`. `CompositionList` prints its share through chartService's formatter since then (it printed `42.4%`).

## Le tinte d'azione sono TESTO, non slot di grafico
- **`useActionColors` clamps into a measured band** (`ACTION_LIGHT_MAX_L` 0,46 · `ACTION_DARK_MIN_L` 0,80 · `ACTION_CHIP_FILL_PCT` 8, in `allocationUtils.ts`): COMPRA/VENDI/OK come from `--chart-3/5/2`, which are pitched at ~3:1 against a plot area, and this page prints them as a 10px chip label, an 18px plan amount and a 13px gap column — all text, none of it WCAG «large», so the floor is 4,5:1. `__tests__/actionColorContrast.test.ts` holds all twelve theme blocks to it on `--card` AND on the chip's own fill (the harder surface: a `color-mix` of the text's own hue always pulls the background towards the text — at 14% the same clamp gave 4,06:1, at 8% it gives 4,64:1).
- **The old clamp was DEAD CODE, and that is the trap to remember** (2026-09-21): it matched `/oklch\(/` on `getComputedStyle().getPropertyValue('--chart-3')`, and **the browser answers in CSS `lab()`** — `oklch(0.700 0.160 72)` comes back as `lab(64.8793% 25.0679 78.4211)`. The regex never matched, the function returned its input, and the page shipped the raw slots as text at 2,39–4,02:1 while the hook's docstring claimed to «guarantee contrast in both modes». The parse now lives in `lib/utils/actionColor.ts` (`parseToOklch`, Lab D50 → XYZ → Bradford → OKLab), the TEST calls that function rather than a copy of the rule, and three real browser serialisations are pinned in it.

## Per-page blind spots
- **Allocazione**: `e2e/allocation.spec.ts` since 2026-09-21 (roving focus, the row's own figures, the sub-category base, the rebalance's descent, no sideways scroll) — it does NOT cover the withholding, whose figure depends on cost bases the base fixture does not carry; Esposizione fetches `/api/portfolio/exposure` on mount (Yahoo on the first visit, then the 24 h cache) and truncates names at 128 px; a class held WITHOUT a target never enters `byAssetClass` (`compareAllocations` iterates the targets), so the score charges it as drift — the Bilanciamento reading names it, the verdict lists only targeted classes; a Ribilancia is «a saldo zero» only when the in-band classes carry no gap; «Modifica target» points to Impostazioni even with goal-derived targets; theoretical specific-asset targets are rows without a tick; `BandToggle` snaps 2 or 5 typed in the custom field back to the preset.
