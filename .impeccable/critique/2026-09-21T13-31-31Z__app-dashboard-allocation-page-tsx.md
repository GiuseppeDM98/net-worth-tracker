---
target: critique Allocazione
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 5
target_identity: "file:/Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/allocation/page.tsx"
target_fingerprint: "sha256:30d945f5a95d828cd1024c522a3b85b60bbf467bc3990db481ac986c44b2bdc7"
target_path: /Users/giuseppedimaio/Documents/Github.nosync/net-worth-tracker/app/dashboard/allocation/page.tsx
timestamp: 2026-09-21T13-31-31Z
slug: app-dashboard-allocation-page-tsx
closed: true
---
Method: dual-agent (A: design review on source + 21 captures · B: detector + Playwright measurements) — browser evidence is Playwright's on the production mirror (`mirror@example.com`), the Chrome extension was not connected; 1440 and 390, light and dark. The overlay ran in a headless Playwright page: there is no user-visible tab.

# Critique — Allocazione (`app/dashboard/allocation/page.tsx`)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Every tile declares its own base («13 asset su 23 analizzati», «Aggiornato il 21/09/2026»); the band rewrites the verdict, the Piano and eight chips across four regions with no transition and no announcement |
| 2 | Match System / Real World | 3 | Ribilancia / Versa / Preleva / 5-25 are the investor's own words; «Allineato **al** 85%» is not Italian, «5/25» is defined nowhere, «pp» never spelled out |
| 3 | User Control and Freedom | 2 | Band and amount are `useState` with no URL: a trip to Impostazioni and back resets 5/25 to ±2% and the amount to 1000. No way to exclude a class from a plan, no bridge to the Registro operazioni |
| 4 | Consistency and Standards | 2 | Three of the repo's OWN named rules broken here (`<a><button>`, `desktop:h-7`, `useRovingFocus` absent); the target printed at 0 and at 1 decimal on one fold; URL state exists on Centri di Costo and not here |
| 5 | Error Prevention | 3 | Orphaned targets are stripped from the plans AND the rows and explained; a withdrawal above the tradable total is refused in words. Nothing stops a plan whose €8 legs cost more than they move |
| 6 | Recognition Rather Than Recall | 3 | The column legend lives in the aside and the gap's sign is explained in the footer; but 85 and 14,5% are the same measurement from two ends, 12px apart, with nothing linking them |
| 7 | Flexibility and Efficiency | 2 | 27 Tab stops inside `main`, 41 from the skip link to «Dettaglio»; no shortcuts, no persistence, no export of the plan |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained — one ring, flat rows, zero-chroma chrome. Undercut by two dead rows (Immobili and Carry at 0/0 with a green chip), two "other" rows in one list, a ~400px void in Bilanciamento whenever the Piano is in Versa |
| 9 | Error Recovery | 3 | The page-level `ErrorNotice` is exemplary; the Esposizione's own failure is one flat line that does not follow `describeReadFailure`, and its «Riprova» is 28px tall |
| 10 | Help and Documentation | 3 | Every footer states its own method, which is rare; but the balance score is defined nowhere — the one unauditable number on a page of audited figures |
| **Total** | | **27/40** | **Acceptable** (Rendimenti was 24, Storico 27) |

Heuristic 4 was lowered from A's 3 to 2 by the synthesis: the three violations are of rules written in `AGENTS.md`, not matters of taste, and B measured them.

## Design Specificity Verdict

**LLM assessment**: the page is **authored for this user in its vocabulary and its refusals, and generic in its act**. The vocabulary belongs to no other product: Ribilancia / Versa / Preleva as three answers to one question rather than three tabs; the band offered as ±2 · ±5 · **5/25**, which only a reader of Swedroe asks for; `allocationRole` split into tradable / frozen / excluded so a pension fund counts in the denominator and never appears in a plan. The refusals are the better half: `AllocationRow` has **three distinct grammars for "I have no opinion"** — the untargeted row prints share and value and stops (no chip, no gap, no tick, sorted last); the `theoretical` row prints a target with no tick; an orphaned target becomes a warning block naming both remedies. That is The Absence-Has-Three-Names Rule applied one level deeper than the spec requires.

Then the page reaches its one high-stakes sentence — «vendi **22.409 €** di azioni» — and becomes any tracker on the market. It names a CLASS, not an instrument, so it cannot be executed; it does not price the 26% withholding, while `lib/utils/saleTax.ts` computes it to the cent in the same repo; it names no minimum lot, while the Versa plan two clicks away proposes buying €31 of an inflation-linked ETF. PRODUCT.md stakes the whole defensible claim on "arithmetic a neighbouring tracker gets wrong, not merely lacks" — and the one number on this page that moves real money is the one it declines to finish.

**Deterministic scan**: CLI on `app/dashboard/allocation components/allocation` → **exit 0, zero findings**, and the scan is real, not a no-op: a deliberately bad `.tsx` written to the scratchpad returned `bounce-easing`, exit 2. No project waiver covers this page. Cross-check: **zero hardcoded hex, zero raw `rgb()`/`hsl()`** across `components/allocation`.

In-page overlay: **77 findings total · 75 in `main` · 7 really this page's**, of which **one rule is a genuine defect**. Of the 75: **55 are the enumerated 9/10/11px ramp** (43 at 10px, 7 at 9px, 5 at 11px — eyebrows, sub-eyebrows, footers), declared and not findings; **5 `nested-cards` are verified false positives** (every ancestor of every tile `section` up to `main` walked with computed style in both modes: `border=false`, `shadow=false`, `radius=0` all the way — `TILE_CELL_CLASS` is layout only); **7 `clipped-overflow-container` are false positives**, all the `grid-rows 0fr→1fr` technique AGENTS.md prescribes. What remains: 4 `low-contrast-text` (real, and the overlay UNDER-counts them — the measurement finds 13), 2 `line-length`, 1 `tight-leading` and 1 `all-caps-body`, the last two the shell's.

## Overall Impression

Structurally the page is **impeccable, and that is measured**: zero horizontal overflow at `main` AND inside every tile across four viewport/mode combinations, CLS ≤ 0.0008, no skeleton jump, zero console errors, zero failed requests, one exposure call, perfect light/dark parity, a coherent heading tree, a focus ring on all 42 Tab stops, a 44×44 icon rail.

The problem is not the construction, it is **what the page asserts**. It says «Immobili in linea» to someone who owns €60.000 of it, and prints that figure two tiles below. It opens on the mode that cannot be executed. It colours its two most important figures with hues that measure 2.74:1 in light mode. And its first line, at 30px, is not Italian.

## What's Working

1. **The band is a scope and the measurement refuses to follow it.** Compare `banda-2` and `banda-personalizza`: the ring stays **85**, «Fuori posizione» stays **14,5%**, only «4 su 8» → «3 su 8» and the words move. This is the rare tool where the tolerance cannot flatter the gauge — most rebalancers let you slide the threshold until the dial turns green. A fixed measurement 40px from a tunable classification is an argument made in layout.

2. **Every tile declares its own base, and the figures reconcile.** «Fuori dal totale 99.811 € esclusi (5 asset): il patrimonio è 299.684 €»; «13 asset su 23 analizzati»; the Esposizione footer naming Yahoo, the approximation and the absence of geographic coverage. A reader can audit every figure without leaving the page. **And the decomposition closes to the euro**: 35.557 − 13.148 = **22.409**, exactly the Piano's class gap.

3. **Structural rigour, with numbers.** `main` 1184/1184 at 1440 and 390/390 at 390, zero offenders with `.sr-only` excluded; six tiles measured against their own `section`, zero internal overflow; `/api/portfolio/exposure` fires **exactly once** and the three view switches never re-fire it; 42 Tab stops, **every one** with a visible focus ring.

## Priority Issues

### [P1] The three action hues are chart slots used as TEXT and fail AA in light mode
- **What**: `useActionColors` clamps lightness only above `L > 0.72`; the light palette sits under it. COMPRA is `--chart-3: oklch(0.700 …)` and **misses the clamp by 0.02**. 13 samples measured below 4.5:1: COMPRA chip **2.39:1**, OK chip **3.07:1**, VENDI chip **3.33:1**, Piano amounts at 18px/600 **2.74** and **4.02**, Per classe gap column **2.74** and **4.02**. 18px at weight 600 is **not** large text (24px, or 18.66 at ≥700), so 4.5:1 applies to all of them. Dark passes except the VENDI chip at 4.25:1. The sting: the clamp's own target is `l = 0.62`, exactly VENDI's value — **even a clamped hue would still fail**. The hook's docstring claims it is "guaranteeing contrast in both modes".
- **Why it matters**: `+14.131 €` is one of the two figures the page exists to deliver, and it is the worst of the three. PRODUCT.md binds "AA 4.5:1 … enforced by review" and declares "no open accessibility defect is known". **This is not the already-declared blind spot**: `doc/guide/temi.md` accepts `--chart-3` at 2.74:1 as a NON-TEXT signal (3:1 floor) — here it is text, and AGENTS.md states plainly that a chart slot is not a text colour.
- **Fix**: tighten the light clamp (`l > 0.58 → 0.52`, keeping hue and chroma) so all three clear 4.5:1 on `--card`, and add a contrast assertion against `--card` in both modes to `__tests__/chartPaletteDistinctness.test.ts`. The chip's tinted fill can stay; the foreground is what fails.
- **Suggested command**: /impeccable harden

### [P1] «Allineato al 85%.» is not Italian, and the repo already owns the fix
- **What**: `allocazioneNarrative.ts:193` hand-writes `` `Allineato al ${…}%.` ``. `patrimonioNarrative.ts:134` exports `atThePercent()`, documented as *"the articulated preposition 'al' before a percentage: 'al 71%', 'all'8%', 'allo 0,5%'"* — and the module **already imports** its sibling `articleForPercent` from that file (line 23) and uses it twice. `startsWithVowel` (line 105) covers 1, 8, 11 and 80–89: **13 of 101 scores broken, and the owner's live account is one of them** — «Allineato al 85%» is in all 21 captures.
- **Why it matters**: it is the first line of the page, at 30px, on a product positioned as "Italian by construction, not by translation", whose differentiator is the narrative layer itself. A reader who notices stops trusting the arithmetic underneath. The test at line 114 pins `'Allineato al 97%.'`, which is correct: **the suite is green on a bug it half-covers**.
- **Fix**: `` `Allineato ${atThePercent(input.score, 0)}${Math.round(input.score)}%.` `` plus three cases in the test (8, 11, 85). One line, one import.
- **Suggested command**: /impeccable polish

### [P1] The page says «Immobili in linea» and prints «Immobili 60.000 €» two tiles below
- **What**: Per classe shows «Immobili — OK — 0,0% · 0% · 0 €», and the reading above says *«Immobili, Liquidità, Materie Prime e Carry sono in linea»*. The Previdenza tile, on the same 1440 screen: «TUTTO IL PATRIMONIO, ESCLUSI COMPRESI → **Immobili 60.000 € · 20%**». The house is `excluded`, so the zero is correct INSIDE the allocated base — but the row is not orphaned (its target is 0%, not positive), so `findOrphanedTargets` never touches it and it survives with a green chip. Same for Carry. And because `summarizeClassGaps` (`allocazioneSummary.ts:56-72`) filters nothing, those two classes also inflate the denominator: **«4 su 8»** instead of 4 of 6 funded — 50% instead of 67%.
- **Why it matters**: «OK» is a verdict, and here it is a verdict on a void. To the reader who owns that house the page says two opposite things 600px apart. It is exactly the class of error the Untargeted-Row Rule exists for, in the case the rule does not cover: not "a target with no value", but **"neither target nor value, with real value off-stage"**.
- **Fix**: a class with current AND target at zero leaves the rows and the «fuori target» denominator, or takes the `untargeted` form (share, value, no chip, no tick, sorted last) with the cause stated: «esclusa dall'allocazione, 60.000 € — vedi Dettaglio». Bilanciamento's footer already names the 99.811 € excluded; the per-class link is what is missing.
- **Suggested command**: /impeccable clarify

### [P1] Per classe prints two denominators under one header
- **What**: `assetAllocationService.ts:854` computes the class percentage on the market base; `:903-904` computes the sub-rows' **on the class total**. Both land in the same 52px mono column under one aside reading «corrente · target · gap». On screen: **Azioni 55,1% · 44% · +22.409 €**, and 16px below **All World 100,0% · 85% · +35.557 €**, **Single Stock 0,0% · 15% · −13.148 €**. Nothing says the base changed.
- **Why it matters**: a child gap larger than its parent's is arithmetically fine and visually alarming; the only cue that the denominator moved is that the numbers stop making sense. A reader scanning the column reads «100,0%» as "the whole portfolio is All World". **Correction to Assessment A**: the two readings are NOT two mutually silent sets of orders — 35.557 − 13.148 = 22.409 **exactly**, they are the decomposition of one gap. The defect is that the page never shows it, which is worse: the reconciliation exists and is invisible.
- **Fix**: change the aside on expansion, or label the base in the row: «corrente · target · gap» at depth 0, «**della classe** · target · gap» on sub-rows, plus a footer clause. And say the reconciliation in one line: «le sottocategorie si compensano dentro la classe».
- **Suggested command**: /impeccable clarify

### [P1] Ribilancia, the page's default mode, stops at the asset class and cannot be executed
- **What**: `allocazioneSummary.ts:268-273` — without leverage, `mode === 'rebalance'` returns `buildRebalancePlan(inputs.byAssetClass, …)`, four class rows. `contribute` and `withdraw` build the class → sub-category → **instrument** tree, and Versa and Preleva accordingly name VWCE, SWDA, CETH, COPA. The mode that opens by itself is the only one that never names a ticker. The instrument tree already exists for rebalancing too: `planInstrumentRebalance`, used when leverage is in play.
- **Why it matters**: «vendi 22.409 € di azioni» is not an order anyone can carry to a broker. The page's stated question is "cosa faccio con i prossimi soldi?" and its opening state answers with an abstraction — to a user who, per PRODUCT.md, contributes monthly and sells twice a decade.
- **Fix**: run the same `splitFromSurplus` / `splitTowardTarget` tree the flow modes already use over the rebalance legs, so Ribilancia renders `PlanNode[]` at three depths (the guide already calls the two plans "ONE tree with the sign flipped"). Alternatively, and perhaps better: **Versa as the default**, which is the literal shape of the owner's monthly behaviour, with Ribilancia third and its footer declaring «a livello di classe».
- **Suggested command**: /impeccable shape

### [P2] The row has no voice, and the band rewrites four regions in silence
- **What**: three defects that compound. (1) `AllocationRow.tsx:103` puts `aria-label="Espandi Azioni"` on a `role="button"`: the accessible name REPLACES the contents, so 55,1%, 44% and +22.409 € are never announced — a screen-reader user hears «Espandi ⟨classe⟩» eight times and no figure. (2) The only live region in `components/allocation/` is the Esposizione's sources block: pressing «±5%» rewrites the verdict, the reading, the Piano's body and eight chips **with nothing announced**. (3) `useRovingFocus` — which the repo introduced on 2026-09-20 for exactly this — is not used here: 4 bands + 3 plan modes + 3 views + 7 rows + 6 ranked rows = **27 stops inside `main`**, and «Dettaglio» is Tab 41 from the skip link.
- **Why it matters**: the Per classe tile IS the page's data table, and for a screen-reader user it currently contains no numbers. PRODUCT.md declares "no open accessibility defect is known".
- **Fix**: drop the row's `aria-label` and let the contents name it (or move the label onto the chevron alone); a `role="status"` announcing the band's reclassification («soglia ±5%: 3 classi su 8 fuori target»); `useRovingFocus` on the three toggle groups and the two lists, with the `sr-only` hint the repo already uses on Storico.
- **Suggested command**: /impeccable audit

## Persona Red Flags

**Alex (power user)**: opens on Ribilancia and gets an order he cannot place. Sets the band to 5/25 because that is his real rule, goes to Impostazioni to check a number, comes back — ±2% again, amount 1000 again: `useState`, no URL, while Centri di Costo keeps its open center in `?center=`. Keyboard: 27 stops inside `main`, ten of them the three toggle groups. No way to copy the plan out, no bridge to the Registro operazioni.

**Sam (keyboard + screen reader)**: in light mode the COMPRA chips are 2.39:1 and the amber amounts 2.74:1 — for a low-vision reader the "buy" half of the plan is unreadable. Pressing «±5%» announces nothing. Navigating by button he hears eight «Espandi ⟨classe⟩» with no figure, then meets eight `role="progressbar"` (one per row) interleaved with the numbers he wanted. **Credit where due**: `CollapseRegion` marks closed content `inert` (B verified it — the REIT sub-row is out of the focus order CORRECTLY), ranked rows are real `<button>`s at 44px on the phone, the ring carries a `<title>` «Equilibrio 85 su 100», and **all 42 stops paint a focus ring**.

**Marco, the methodical Italian accumulator** (PRODUCT.md's primary user: monthly PAC, twenty-year horizon, two sales in his life): the page **opens on the action he almost never takes**. His €1000 shatters into twelve rows across three depths with legs of €31, below any Italian broker's commission floor — and the page never says so, while the verdict already holds the right answer («485 € di obbligazioni, 411 € di Trend Following e 105 € di liquidità») before the tile decomposes it into a chore. **Nothing tells him the drift is tolerable**: 85/100 with a ±2% band across eight classes reads as a failing grade to a man whose strategy is to do nothing — and the page has no vocabulary for inaction. And it tells him «Immobili in linea».

## Minor Observations

- **`<a><button>` on «Modifica target», at both breakpoints** (`page.tsx:356-361` and `368-373`): `<Link>` without `asChild`, which AGENTS.md forbids by name. Invalid HTML, two Tab stops for one action, and the 358×18 phantom anchor measured at 390. `asChild` on the Button fixes all three.
- **Three 28px targets** (`desktop:h-7`): the pp field in `BandToggle:96`, «Riprova» and «Aggiorna» in the Esposizione (`:203`, `:241`). AGENTS.md: *"`desktop:h-7` is 28px — never for a target"*, and `AsideToggle` moved to `desktop:h-8` on 2026-09-20. It passes WCAG 2.5.8 (24×24), but it is below the house floor.
- **The Esposizione tile carries two bases**: the reading says «Vanguard emette il **46%** degli ETF», the row below prints «Vanguard 85.597 € **29%**». And the reading is `useMemo(…, [exposure])` (`EsposizioneTile.tsx:147`): it **does not depend on `view`**, so on Settori and Emittenti it keeps talking about the heaviest holding — while `describeExposureEmpty(view)` does take the view. The tile adapts its EMPTY state to the view and not its reading.
- **Two "other" rows in one list**: on Emittenti, «Altro 25.884 € 9%» ranks third among named issuers, with «Resto del portafoglio 278.832 € 93%» below it.
- **The Esposizione never judges**: 29% of the look-through sits with one issuer — arguably the most actionable risk finding on the page — and the tile reports it with no threshold, no chip and no opinion, on a page where everything else has a verdict.
- **The same target printed at two precisions on one fold**: Bilanciamento's legend «Azioni 55,1% → **44%**», the Piano «55,1% → **43,9%**».
- **85 and 14,5% are the same fact** (`score = 100 − misallocation − |gap|`) printed 12px apart with nothing linking them, and the score is the one number on the page whose method is stated nowhere — on a product whose first principle is not to show a figure it cannot stand behind.
- **`TileMethodNote` («Come si calcola»), shipped on Rendimenti on 2026-09-20, has zero uses here**: every method is printed always, and the Piano's footer runs to ~113 characters a line.
- **Grid voids**: Bilanciamento stretches to the Piano's height and becomes a mostly-empty card whenever the Piano is in Versa or Preleva; the Previdenza tile puts 2 rows on the left beside 7 on the right. This is the case AGENTS.md says to cure IN THE GRID, never in the tile.
- **On the phone «Modifica target» is the first interactive element after the verdict**, above every tile: "change your plan" outranks "read your plan".
- **The custom pp field has no visible label** — a naked number box with «pp» beside it; the `aria-label` covers Sam, the eye gets nothing.
- **€8 orders**: `MIN_VISIBLE_AMOUNT = 0.5` (`allocazioneSummary.ts:38`), and a €1000 withdrawal resolves into legs of −€18, −€8 and −€8.

**Two things that are NOT findings, recorded because they look like ones.** The verdict always describing the VERSA answer even when the Piano shows Ribilancia is a documented decision in `doc/guide/allocazione.md`, and it is labelled by its verb («compreresti») — Assessment A counted it as a problem; it is not. And the desktop `h1` at 14px `text-muted-foreground` is the shell's compact form as DESIGN.md decided it ("the verdict is the real headline"), not a defect of this page.

## Evidence and its limits

- Browser evidence is Playwright's on the production mirror; the Chrome extension was not connected (WORKFLOW.md § 3). Captures: 1440 and 390, light and dark, plus 13 interaction states (three Piano modes, three Esposizione views, four bands, Dettaglio open, one Per classe row open).
- **An element screenshot of the scroll container only paints what the viewport has passed over**: the first pass truncated the phone at ~440px of 3597, and Assessment A judged the mobile layout on the fold alone. Re-captured with a tall viewport (390×4600, 1440×2200) and re-read by the synthesis; A's mobile claims were confirmed against the full capture.
- Not measured: a ≥1440px tablet in landscape (no fixture, matching the known issue in CLAUDE.md); reduced-motion behaviour; viewports between 390 and 1440. «Aggiorna» was deliberately never clicked: it forces a Yahoo Finance recompute past the 24h cache.
