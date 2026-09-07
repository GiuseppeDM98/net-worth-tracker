# Email periodiche e PDF export

> **Quando aprire questa guida** — chi tocca `lib/server/{monthlyEmailService,weeklyBudgetEmailService,emailHtml,emailPeriodComparison}.ts`, `lib/utils/{emailNarrative,pdfNarrative}.ts`, `lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `components/pdf/*`, `lib/constants/printTokens.ts`, il cron `app/api/cron/monthly-snapshot/route.ts`. Entrambe rendono fuori dal DOM: si verificano renderizzandole, e nessuna verifica è nella suite. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: `CLAUDE.md` → *Key Files* → *Email*, *PDF*, *PDF export*, *Token fuori dal DOM*.

## PDF Export (`lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `lib/utils/pdfTimeFilters.ts`)

- Seven configurable sections with a Total/Annual/Monthly filter. On Cashflow, **Export Totale applies
  `cashflowHistoryStartYear` as a floor** (fallback 2025); Storico, Rendimenti and FIRE stay unbounded — do not "fix"
  the asymmetry, the cashflow before the floor is bulk-imported noise. **The Cashflow section DECLARES that floor**
  in its scope line and in a note (`historyFloorYear` on `CashflowData`, set only for a Totale export): a reader told
  "Totale" otherwise reads the missing years as years without spending (DESIGN → *The Declared-Window Rule*).
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
  and reading the extracted text is what caught the missing minus signs. `tsc` catches neither.

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
- **Every email cap is stated in the prompt**: `MAX_CATEGORY_DELTAS` (12) is named in the section header together with
  how many categories were left out. The selection is by SPEND, not by size of variation — describe it as it is.
- **`max_tokens` and the word ceiling scale together** per period (6000/8000/8000/10000 against 500/700/700/900 words):
  raise one and the other has to follow. Web search is offered only when `includeMacroContext` allows it, like the
  assistant's structured analyses.
