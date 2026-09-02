# Allocazione

> **Quando aprire questa guida** — chi tocca `app/dashboard/allocation/page.tsx`, `components/allocation/*` o i moduli puri
> `lib/utils/{allocazioneSummary,allocazioneNarrative,allocationUtils,leverageAwareAllocationUtils,assetExposureUtils,equityBondsAutoTargets}.ts`,
> `lib/services/assetAllocationService.ts`, `lib/server/portfolioExposureService.ts`. In `AGENTS.md` resta lo stub con
> l'essenziale; qui c'è la regola completa. Moduli e file: `CLAUDE.md` → *Key Files* → *Allocazione / exposure*. Nessuna
> spec Playwright copre la pagina (lo dice *Per-page blind spots*).

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
  `byAssetClass` (CLAUDE.md → Known Issues).
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
- **Deleted on 2026-08-25**: `AllocationHero`, `BalanceScoreGauge`, `RebalanceBandControl`, `ActionPlanner`, `RebalancePanel`/`ContributionPanel`/`WithdrawalPanel`, `AllocationCompositionBar`, `PensionAllocationCards`, `ExposureSection`, `AllocationPageSkeleton`. `CompositionList` prints its share through chartService's formatter since then (it printed `42.4%`).

## Per-page blind spots
- **Allocazione**: no Playwright spec; Esposizione fetches `/api/portfolio/exposure` on mount (Yahoo on the first visit, then the 24 h cache) and truncates names at 128 px; a class held WITHOUT a target never enters `byAssetClass` (`compareAllocations` iterates the targets), so the score charges it as drift — the Bilanciamento reading names it, the verdict lists only targeted classes; a Ribilancia is «a saldo zero» only when the in-band classes carry no gap; «Modifica target» points to Impostazioni even with goal-derived targets; theoretical specific-asset targets are rows without a tick; `BandToggle` snaps 2 or 5 typed in the custom field back to the preset.
