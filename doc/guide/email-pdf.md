# Email periodiche e PDF export

> **Quando aprire questa guida** — chi tocca `lib/server/{monthlyEmailService,weeklyBudgetEmailService,emailHtml,emailPeriodComparison}.ts`, `lib/utils/{emailNarrative,pdfNarrative}.ts`, `lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `components/pdf/*`, `lib/constants/printTokens.ts`, il cron `app/api/cron/monthly-snapshot/route.ts`. Entrambe rendono fuori dal DOM: si verificano renderizzandole, e nessuna verifica è nella suite. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Email · PDF · token fuori dal DOM**: `lib/constants/printTokens.ts` (l'unica sede di un hex fuori dal DOM); email `lib/utils/emailNarrative.ts` (parole), `lib/server/emailHtml.ts` (chrome, tabelle annidate), `lib/server/{monthlyEmailService,weeklyBudgetEmailService,emailPeriodComparison}.ts`; PDF `lib/utils/pdfNarrative.ts` (`pdfSafeText` = il confine WinAnsi), `components/pdf/primitives/*` (`PDF_RAMP`), `lib/utils/pdfGenerator.tsx` → `lib/services/pdfDataService.ts` → `components/pdf/{PDFDocument,sections/*}`, `lib/utils/pdfTimeFilters.ts`, `types/pdf.ts`; cron `app/api/cron/monthly-snapshot/route.ts` (phases 2-8), `lib/server/{assetAdminRepository,dividendUseCase,dividendProcessor}.ts`

## PDF Export (`lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `lib/utils/pdfTimeFilters.ts`)

- Seven configurable sections with a Total/Annual/Monthly filter. On Cashflow, **Export Totale applies
  `cashflowHistoryStartYear` as a floor** (fallback 2025); Storico, Rendimenti and FIRE stay unbounded — do not "fix"
  the asymmetry, the cashflow before the floor is bulk-imported noise. **The Cashflow section DECLARES that floor**
  in its scope line and in a note (`historyFloorYear` on `CashflowData`, set only for a Totale export): a reader told
  "Totale" otherwise reads the missing years as years without spending (DESIGN → *The Declared-Window Rule*).
- **The Rendimenti section measures the SAME base as the page** (2026-09-07, issue #324): `preparePerformanceData`
  receives the assets, reads the pension contributions and resolves `resolvePerformanceBase` — projected snapshots,
  pension and measured flows — before calling `calculatePerformanceForPeriod`; `PerformanceData.baseLabel`
  (`describeMeasurementBase`) sits on the section's scope line beside the window. Until then it ran on the RAW
  snapshots with no flow channel (the whole net worth, house included: +105% annualised against the page's +26% on one
  account) and told no one. Its words are named for what they are: the TWR «annualizzato», the ROI «sul capitale
  iniziale» (the note used to say «sul capitale versato», false), the CAGR beside the TWR and never as its annualised
  form; a «Capitale entrato nella base» row appears when the flows were measured.
- **A verdict over tiles** (2026-09-01): the cover is the report's verdict, not a frontispiece, and every section is
  eyebrow · scope · reading · figures. Words from `lib/utils/pdfNarrative.ts`, chrome from
  `components/pdf/primitives/PDFTile.tsx` (`PDFPage`, `PDFSection`, `PDFMetrics`, `PDFRankedRows`, `PDFNarrative`,
  `PDFNote`, `PDFHero`, `PDFVerdict`), colours from `printTokens`. The `#3B82F6` accent is gone from every page.
- **`PDF_RAMP` is DESIGN.md's ramp divided by 4/3**: react-pdf measures in POINTS (72/inch), the spec in CSS pixels
  (96/inch). A4 is 595×842pt on a 44pt margin, leaving a 507pt column.
- **There is no monospace and no typographic minus.** react-pdf ships only the standard PDF families unless font
  files are registered, and Geist arrives through `next/font/google` — so figures are Helvetica and their alignment
  comes from fixed-width right-aligned COLUMNS (a declared exception to the Mono Mandate, in `PDF_FONTS`). WinAnsi
  has no U+2212 and react-pdf drops what it cannot encode **silently**: the Allocazione gaps printed «620» where they
  meant «−620 €». `pdfSafeText` converts it at the boundary — every PDF text node goes through it.
- **Sub-tiles are a `--muted` fill with no border**: on white paper a 1px rule at 0.92 lightness is invisible, and a
  4%-ink fill survives a photocopy.
- **A section's reading must not mix two windows.** `HistoryData` carries `netWorthEvolution` (the filtered series the
  page tabulates) AND `totalGrowth` (measured between `oldestSnapshot` and `latestSnapshot`); they coincide today
  because `prepareHistoryData` receives already-filtered snapshots, but the first draft of the reading took its
  endpoints from one and its delta from the other and printed three numbers that could not all be true.
- **Verifying it means rendering it.** `renderToFile` from `@react-pdf/renderer` works under Vitest; inflating the
  content streams and collecting every `scn` operand is what proved no colour outside `printTokens` reaches the page,
  and reading the extracted text is what caught the missing minus signs. `tsc` catches neither. The text comes out as
  hex WinAnsi (`<53746f72>` = «Stor») inside kerned `TJ` arrays that split words, and the metric labels are printed
  uppercase: compare space-free and case-insensitively. **And render with the REAL data path too** (2026-09-07): a
  section rendered from hand-typed metrics passed every word while the owner's own export still ran
  `preparePerformanceData` without the ledger (26,05% against the page's 27,08%) — call `fetchPDFData` through the
  client SDK on the emulators (a `globalThis.fetch` shim prefixes the tour server's origin to the relative yield
  routes) and compare its metrics with `getAllPerformanceData`'s.

## Periodic Emails (`lib/server/monthlyEmailService.ts`, `weeklyBudgetEmailService.ts`)

- **A verdict over tiles, out of the DOM** (2026-09-01). Both messages open on a RULE-GENERATED
  verdict from `lib/utils/emailNarrative.ts` — never on the AI comment, whose generation is
  non-blocking and can simply be absent, which is why an email that opened on it opened on a number
  whenever Anthropic was unavailable. The comment is a tile on `--muted` in SECOND position. The
  verdict's headline is also the hidden **preheader**, so the inbox preview answers the question.
- **Every hex comes from `lib/constants/printTokens.ts`** and nothing else (DESIGN → *The Out-Of-DOM
  Token Rule*). The chrome — shell, verdict, tile, hero, KPI row, ranked rows, budget track,
  comparison table, alert rows — lives in `lib/server/emailHtml.ts`, and **every layout is a nested
  table**: Outlook on Windows renders through Word, so flex and grid do not exist there.
- **ONE template serves the four period types.** They differ only in labels (resolved from the
  period by `emailNarrative`) and in which tiles exist: Budget and the Hall of Fame standing are
  monthly, the income Top 10 is yearly, and **«Rispetto a un anno fa» is ABSENT on a yearly email**
  (`previousEqualsYoy`) because there the two baselines are the same window and every figure in it
  is already printed above (The One-Tile-One-Question Rule). The old «Confronti» table printed both
  columns unconditionally.
- **The class labels are the app's** (`ASSET_CLASS_LABELS` from `allocationUtils`): the local copy
  that used to live in `monthlyEmailService.ts` said «Crypto» and «Materie prime» where every screen
  says «Criptovalute» and «Materie Prime».
- **`signedPct` and `signedEur` are it-IT** (the Comma Rule reaches the email too): they printed
  `+6.8%` with a dot and `-498 €` with an ASCII hyphen until 2026-09-01.
- **A ranked list shows six rows and a residual.** The categories are ranked BY AMOUNT, so a
  catch-all category outranks real ones — that is correct, and the residual row is what keeps the
  shares reaching 100%.
- **Four period types** with independent cron phases, so 31 Dec can send Q4 + H2 + yearly (intentional). Adding one is a
  wide fan-out: the union, `MonthlyEmailData`, the date and label helpers, `buildPeriodEmailData`, `buildAndSend*`, the
  cron phase, the send route and the settings 3-place + toggle + test-send button.
- **Income targets have their own tile** (`Obiettivi di entrata`): «am I within my budgets?» and «did what I expected arrive?» are two questions, and only the first has a limit to breach. The budget track carries **today's mark on the row's own window** — day of month for a monthly budget, day of year for an annual one — drawn as a split table row, because out of the DOM there is no positioning to overlay it with.
- **The weekly budget email is a SEPARATE module and nothing in it is weekly**: it is *sent* on Sunday, but its numbers
  are month-to-date and year-to-date. `buildCommentContext` (pure, exported, tested) states the day-of-month, tags the
  overall as a MENSILE ceiling with an A FINE MESE projection and forbids "fine anno"/"settimana" for monthly budgets.
  **When you add a figure here or to its prompt, name its window.**
- Over-budget rows carry `overspendExpenses` (actual overruns only) sourced from `getPeriodExpensesForItem` so they
  reconcile with the row's `spent`. Always run user notes through `escapeHtml`.
- **Comparison data is deterministic, AI only interprets**: **net worth = end-of-period snapshots (point-in-time);
  income/expenses/savings = flows over the window**, made explicit in the caption. The Hall of Fame mention is likewise
  deterministic, ranked with `lib/utils/hallOfFameRecords.ts` — the SAME definition as the in-app page.
- **The email AI comment is a DEDICATED Anthropic call**, not the assistant pipeline; AI and comparison failures are
  both non-blocking — and so is the context bundle, built inside the same `try`.
- **The prompt BODY is the assistant's own block**: `buildEmailAiPrompt` = `formatBundleForPrompt(bundle, label)` +
  the sections only the email has (market effect, comparisons, category deltas, Hall of Fame, budget alerts). Do not
  re-list what the bundle already carries — the largest single expenses are the standing example — and do not add a
  second cashflow computation: `resolveEmailPeriodRange` hands the email's own window to the range builder, whose
  baseline is by construction the same snapshot the email calls `previousNetWorth`.
- **The market effect is precomputed, never left to the model** (`Δ patrimonio − risparmio netto`, both from the
  bundle). It is a STRUCTURAL residual — it also absorbs untracked movements — and the block must keep saying so, or
  the comment presents it as pure market performance.
- **The email's «mercato» nets out the tax on the period's sales** (2026-09-11): `marketEffectOf` = `Δ − risparmio
  netto + tasse stimate` (`MonthlyEmailData.periodSales`, read from the ledger by `summarizePeriodSales` over the
  email's own window, `null` without a sale, never blocking). Why: the broker's withholding leaves the account with no
  cashflow row, so inside the residual a 4.089 € tax read as a market loss on the real account (settembre 2026). The
  verdict then follows the Panoramica's `resolveDeclineCause` («il mercato ha pesato, le tasse sulle vendite di più»),
  the split has THREE parts that still sum to Δ («… viene dal mercato, +988 € da quanto hai risparmiato e −4089 €
  dalle tasse sulle vendite»), the sale is told by `describeSales` and the Patrimonio tile's footer names the tax
  «circa». The AI prompt's market block is unchanged (it still prints `Δ − risparmio`): a known asymmetry, and a
  tax the owner ALSO records as a cashflow expense would be counted twice in the split (doc/guide/panoramica.md § Per-page blind spots).
- **Every email cap is stated in the prompt**: `MAX_CATEGORY_DELTAS` (12) is named in the section header together with
  how many categories were left out. The selection is by SPEND, not by size of variation — describe it as it is.
- **`max_tokens` and the word ceiling scale together** per period (6000/8000/8000/10000 against 500/700/700/900 words):
  raise one and the other has to follow. Web search is offered only when `includeMacroContext` allows it, like the
  assistant's structured analyses.

## Verifying a surface with no DOM

Moved here whole from `AGENTS.md` → *Commands* on 2026-09-20; the bullet «Verifying it means rendering it» above is the
PDF half seen from inside the section, this is the recipe for both surfaces.

- **A surface with no DOM is verified by RENDERING it** — `tsc` and Vitest see neither a dropped glyph nor an off-token
  colour. PDF: `renderToFile` from `@react-pdf/renderer` under Vitest, inflate the content streams with `zlib`, collect
  every `scn` operand (no colour outside `printTokens`), read the hex text runs (silently dropped characters). Emails:
  open the rendered HTML in Chromium (`chromium.launch()`, `file://`) at 390 / 600 / 1440 and assert
  `documentElement.scrollWidth === clientWidth`. Both are throwaway scripts run from INSIDE the repo (or `playwright`
  and the `@/` alias do not resolve); neither check lives in the suite. **A render with hand-built data proves the
  WORDS, not the data path** (2026-09-07: the Rendimenti section rendered 10/10 with typed-in metrics while the real
  export still ran the base without the ledger — 26,05% against the page's 27,08%): run `fetchPDFData` itself through
  the client SDK on the emulators, with `globalThis.fetch` prefixing the tour server's origin to the relative `/api/…`
  routes the services call, and compare with the page's payload.

- **A ranked row's amount is an inert colour unless it asks for one** (2026-09-22, seen in a render).
  `EmailRankedRow.trailingSign` colours the optional THIRD column, not the amount; a list that
  passes no `trailing` — «Spese in comune» is one — printed every amount in the plain foreground,
  so a person who came up short looked exactly like one who did not. The amount takes a sign only
  through **`amountSign`**, and only where the amount IS a gain or a loss: a ranked category total
  is a magnitude, and colouring it would assert a verdict the list has no baseline for.
- **«Spese in comune» leads with the BOOKED residual**, like the tile on the page, and carries the
  calendar in its caption («Con le spese ancora in calendario mancano 500 €»). The amount and the
  caption come from two different calls, so leading with the period's figure would make the row
  contradict its own second line — which is how the divergence was found. doc/guide/cashflow-divisione.md.
- **The recipe, run for real on 2026-09-22**: `npx tsx --conditions=react-server <script>.tmp.mts`
  from the repo root, calling `buildPeriodEmailData` itself on the emulators and handing the result
  to `generateEmailHtml`. Two things the script has to do or it will not start: `--conditions=react-server`
  (the `server-only` marker throws on a plain Node import) and the four `NEXT_PUBLIC_FIREBASE_*`
  variables (the module graph reaches the CLIENT SDK, which refuses an absent API key). The email
  also refuses to build without a monthly snapshot for its window (`realCurrentDocs.length === 0
  → null`), so a fixture about expenses needs one planted for the render and removed after.

## Per-page blind spots

- **Fuori dal DOM restano tre punti ciechi**: le email non rispecchiano i cinque temi nominati (scelta — si leggono su una scheda bianca); «un hex sta solo in `printTokens`» è documentato ma **non applicato da un linter**; e `@react-pdf/renderer` scarta in SILENZIO ogni carattere fuori da WinAnsi (`pdfSafeText` copre U+2212; frecce, simboli ed emoji no). Le tre superfici si verificano solo renderizzandole, e **nessuna di quelle verifiche è nella suite**. doc/guide/email-pdf.md. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
