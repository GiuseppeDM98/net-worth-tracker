# Email periodiche e PDF export

> **Quando aprire questa guida** — chi tocca `lib/server/{monthlyEmailService,emailHtml,emailPeriodComparison,emailAiComment,emailDeliveries}.ts`, `lib/utils/{emailNarrative,emailSchedule,pdfNarrative}.ts`, `lib/utils/pdfGenerator.tsx`, `lib/services/pdfDataService.ts`, `components/pdf/*`, `lib/constants/printTokens.ts`, il cron `app/api/cron/periodic-emails/route.ts`, «Invia ora» `app/api/user/monthly-email/send/route.ts`. Entrambe rendono fuori dal DOM: si verificano renderizzandole, e nessuna verifica è nella suite. In `AGENTS.md` resta lo stub con l'essenziale; qui c'è la regola completa. File: § *Files*, sotto.

## Files

Moved here from `CLAUDE.md` → *Key Files* on 2026-09-19.

- **Email · PDF · token fuori dal DOM**: `lib/constants/printTokens.ts` (l'unica sede di un hex fuori dal DOM); email `lib/utils/emailNarrative.ts` (parole), `lib/server/emailHtml.ts` (chrome, tabelle annidate), `lib/server/{monthlyEmailService,emailPeriodComparison,emailAiComment}.ts`, what is due `lib/utils/emailSchedule.ts`, the ledger `lib/server/emailDeliveries.ts`; PDF `lib/utils/pdfNarrative.ts` (`pdfSafeText` = il confine WinAnsi), `components/pdf/primitives/*` (`PDF_RAMP`), `lib/utils/pdfGenerator.tsx` → `lib/services/pdfDataService.ts` → `components/pdf/{PDFDocument,sections/*}`, `lib/utils/pdfTimeFilters.ts`, `types/pdf.ts`; crons `app/api/cron/periodic-emails/route.ts` (the emails) and `app/api/cron/monthly-snapshot/route.ts` (the snapshot, phases 7-8), the manual send `app/api/user/monthly-email/send/route.ts`, `lib/server/{assetAdminRepository,dividendUseCase,dividendProcessor}.ts`

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
- **The engine is loaded at the press, not with the page** (2026-09-30): `lib/utils/pdfGenerator.tsx` — and
  with it `@react-pdf/renderer`, pdfkit, `components/pdf/*` and `pdfDataService` — is reached only by the `import()` in
  `loadPDFGenerator` (`components/pdf/PDFExportDialog.tsx`): ONE promise for the session, started by «Esporta PDF»,
  awaited by «Genera PDF», forgotten on failure so the next press retries. Nothing else may import `pdfGenerator` or
  `components/pdf/*` statically, or 513 KB gz go back into Storico's first paint — `e2e/bundle.lazy.spec.ts` goes red.
  `printTokens.ts` stays where it is (the emails read it on the server; it is small). Seen on the mirror: the modal in
  ~110 ms, a 13-page report downloaded 3,5 s after the press.
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
  `preparePerformanceData` without the ledger (a return about a point off the page's) — call `fetchPDFData` through the
  client SDK on the emulators (a `globalThis.fetch` shim prefixes the tour server's origin to the relative yield
  routes) and compare its metrics with `getAllPerformanceData`'s.
- **The note under «Risparmio netto»** is `describeNetSavingsNote(income, spending)` (`pdfNarrative.ts`, 2026-11-12):
  «28,2% di quanto è entrato», «−30,0% …» with the typographic minus, no note without income or below the savings
  floor (`meaningfulSavingsRate`) — the euro figure above it says it. Pinned by `__tests__/pdfNarrative.test.ts`.

## Periodic Emails (`lib/server/monthlyEmailService.ts`)

- **Two emails, about a CLOSED period, the day after it ends, once** (2026-11-28). The monthly leaves on the 1st
  for the month just closed, the yearly on 1 January for the year just closed; the 2nd and the 3rd are catch-up days
  (`emailsDueOn`, `EMAIL_CATCH_UP_DAYS`, `lib/utils/emailSchedule.ts`). Why: an email sent on the last day was
  about a period still running — its last evening's expenses and the dividends credited overnight were missing.
- **Their own cron, an hour after the snapshot's**: `/api/cron/periodic-emails` at `0 19 * * *` UTC (`vercel.json`),
  20:00 or 21:00 in Rome — the same Italian day. Twenty-seven days a month it reads nothing and answers
  `{ emails: { sent: 0, skipped: 0, errors: 0 } }`. It reads the CLOSED month's snapshot, last written by the
  snapshot cron on that month's last evening, so the two crons' order on the 1st does not matter. On 1 January the
  two comments are written side by side (`Promise.all`): two `high` requests in a row do not fit `maxDuration` 300 s.
- **The ledger `emailDeliveries/{userId}_{kind}_{periodKey}`** (server-only, `allow read, write: if false`;
  `lib/server/emailDeliveries.ts`): a run CLAIMS (`status: 'sending'`, a transaction that reads before it writes),
  SENDS, CONFIRMS (`'sent'`). A send that throws, or one with nothing to send (no snapshot), RELEASES the claim for
  the next run; a confirm that fails after the email went out does NOT release — the email would leave twice the
  same day. A claim older than `EMAIL_CLAIM_STALE_MS` (30 minutes) is a crashed run and can be claimed again.
- **The window is the period's Italian bounds**: `buildPeriodEmailData` and `emailPeriodComparison` read expenses and
  dividends from `getItalyMonthBoundsUtc(year, startMonth).start` to `getItalyMonthBoundsUtc(year, month).end` — a
  row dated 1 November 00:00 in Rome is November's, one dated 31 October 23:30 is October's, in every zone the
  server runs in.
- **«Invia ora»** (`POST /api/user/monthly-email/send`, `{ periodType: 'monthly' | 'yearly' }`, absent = monthly,
  any other value 400 before any read, the demo 403) sends the LAST CLOSED period (`lastClosedMonth` /
  `lastClosedYear`), never the month in progress, even if the cron already sent it; the send is recorded with
  `manual: true`, so the cron does not send that period again. A failed record is logged, the email still counts.
- **One link back to the app** (`emailAppLink`, `lib/server/emailHtml.ts`): a table-cell button «Apri Net Worth
  Tracker» → `{NEXT_PUBLIC_APP_URL}/dashboard`, right under the verdict, in print-token colours; `''` when the URL
  is absent or not `https://` — a dev or emulator URL in a real inbox is a link to nowhere.
- **A year takes its article** (2026-11-28): `periodBaselineAfter` writes «sul 2025» and «Rispetto al 2025» where the
  yearly email printed «su il 2025» and «Rispetto a il 2025»; a month keeps none («su settembre»). Pinned in
  `__tests__/emailNarrative.test.ts`.

- **A verdict over tiles, out of the DOM** (2026-09-01). Both messages open on a RULE-GENERATED
  verdict from `lib/utils/emailNarrative.ts` — never on the AI comment, whose generation is
  non-blocking and can simply be absent, which is why an email that opened on it opened on a number
  whenever Anthropic was unavailable. The comment is a tile on `--muted` in SECOND position. The
  verdict's headline is also the hidden **preheader**, so the inbox preview answers the question.
- **Every hex comes from `lib/constants/printTokens.ts`** and nothing else (DESIGN → *The Out-Of-DOM
  Token Rule*). The chrome — shell, verdict, tile, hero, KPI row, ranked rows, budget track,
  comparison table, alert rows — lives in `lib/server/emailHtml.ts`, and **every layout is a nested
  table**: Outlook on Windows renders through Word, so flex and grid do not exist there.
- **ONE template serves the two period types.** They differ only in labels (resolved from the
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
- **Income targets have their own tile** (`Obiettivi di entrata`): «am I within my budgets?» and «did what I expected arrive?» are two questions, and only the first has a limit to breach. The budget track carries **today's mark on the row's own window** — day of month for a monthly budget, day of year for an annual one — drawn as a split table row, because out of the DOM there is no positioning to overlay it with.
- **Comparison data is deterministic, AI only interprets**: **net worth = end-of-period snapshots (point-in-time);
  income/expenses/savings = flows over the window**, made explicit in the caption. The Hall of Fame mention is likewise
  deterministic, ranked with `lib/utils/hallOfFameRecords.ts` — the SAME definition as the in-app page.
- **The email AI comment is a DEDICATED Anthropic call**, not the assistant pipeline; AI and comparison failures are
  both non-blocking — and so is the context bundle, built inside the same `try`.
- **The comment's markdown becomes HTML in `emailMarkdownToHtml`** (`lib/server/emailHtml.ts`, 2026-11-28): bold,
  italics, headings, bullet and numbered lists with one level of indented sub-items (`foldSubLists` hangs them on the
  item above as a nested `<ul>`), and tables. A table becomes an email `<table>` with a right-aligned
  column of figures. A list and a table are written on ONE line, because a newline inside them would become a `<br/>`.
  The October 2026 email on Opus 5.5 printed its tables as pipes and an empty line between every bullet, and both
  models' sub-items as «  - voce»; the tests are in `__tests__/emailHtml.test.ts`.
- **The comment's contract** (`buildEmailPeriodicFormatContract`, owner, phase F, 2026-11-28): a year has ONE
  comparison section, «Rispetto all'anno precedente», because its previous period IS the previous year (with two,
  both models wrote two paragraphs saying the 2024 was missing). The contract closes on the email rule: no offer to
  act («se vuoi, preparo…»), no name of the app's data blocks («dati sulla Hall of Fame non ce ne sono»), and a goal,
  instrument, category or account called by its exact name, never shortened (Sonnet dropped a goal's first word). The
  yearly subject is «Riepilogo annuale 2025 — Net Worth Tracker». Pinned in `__tests__/assistantPromptBundle.test.ts`
  and `__tests__/monthlyEmailService.test.ts`.
- **Only a reply that ended on `end_turn` is a comment** (2026-10-12): the comment is read through
  `readCompleteEmailComment` (`lib/server/emailAiComment.ts`). A decline is an HTTP 200 with
  `stop_reason: 'refusal'` that can follow some text, a `max_tokens` cut stops mid-sentence, a `pause_turn` is the
  server-tool loop paused: each is a fragment, and an email cannot say «incompleto» the way Rendimenti's dialog does, so
  it goes out WITHOUT the AI tile, as when the call fails (the log says why). The call runs with the server-side fallback
  (`betas: [SERVER_SIDE_FALLBACK_BETA]` + `fallbacks: 'default'` on `anthropic.beta.messages`, `lib/constants/aiModels.ts`):
  a `cyber` or `frontier_llm` decline is rewritten by the fallback model in the same call, and the email names no
  model; the log line says which one wrote the comment. Pinned by `generateEmailAiComment` in
  `__tests__/monthlyEmailService.test.ts` (exported for that; refusal and cut seen red before the fix).
- **Sonnet 5.5, streamed, read whole** (owner, 2026-11-28; Opus 5.5 from 2026-11-23): `EMAIL_ANALYSIS_MODEL =
  'claude-sonnet-5-5'`, adaptive thinking, `effort: 'high'`, through `anthropic.beta.messages.stream({…}).finalMessage()`. The SDK refuses a
  NON-streamed request above 21.333 `max_tokens` («Streaming is required»), and the yearly asks 24.000: sent with
  `create`, it would always leave without its comment. Pinned by the spy on `stream` (`create` answers nothing).
  Why not Opus: on the mirror (phase F, 2026-11-28) Opus 5.5 at `high` took 168–204 s for a monthly and 174 s for a
  yearly, and on 1 January the cron sends both in ONE call under `maxDuration = 300` — the yearly would be killed,
  left «sending», and sent on the 2nd by the stale claim (or twice, if the kill fell between Resend and the confirm).
- **The AI comment reads the CASHFLOW 12 MESI block** (owner, 2026-11-07, doc/guide/assistente.md § Prompt
  builders): `generateEmailAiComment` reads it at the send instant through `readCashflowBlockForPrompt`; it closes
  the periodic user turn, `system` untouched. A failed read sends the email WITHOUT the comment and spends no call —
  never a comment on a silent empty cashflow.
- **The prompt BODY is the assistant's own block**: `buildEmailAiPrompt` = `formatBundleForPrompt(bundle, label)` +
  the sections only the email has (market effect, comparisons, category deltas, Hall of Fame, budget alerts,
  household split), then the CASHFLOW 12 MESI block under its note — the one figure that is not the window's. Do not
  re-list what the bundle already carries — the largest single expenses are the standing example — and do not add a
  second cashflow computation: `resolveEmailPeriodRange` hands the email's own window to the range builder, whose
  baseline is by construction the same snapshot the email calls `previousNetWorth`.
- **The market effect is precomputed, never left to the model** (`Δ patrimonio − risparmio netto`, both from the
  bundle). It is a STRUCTURAL residual — it also absorbs untracked movements — and the block must keep saying so, or
  the comment presents it as pure market performance.
- **The email's «mercato» nets out the tax on the period's sales** (2026-09-11): `marketEffectOf` = `Δ − risparmio
  netto + tasse stimate` (`MonthlyEmailData.periodSales`, read from the ledger by `summarizePeriodSales` over the
  email's own window, `null` without a sale, never blocking). Why: the broker's withholding leaves the account with no
  cashflow row, so inside the residual a 4.000 € tax read as a market loss. The
  verdict then follows the Panoramica's `resolveDeclineCause` («il mercato ha pesato, le tasse sulle vendite di più»),
  the split has THREE parts that still sum to Δ («… viene dal mercato, +1000 € da quanto hai risparmiato e −4000 €
  dalle tasse sulle vendite»), the sale is told by `describeSales` and the Patrimonio tile's footer names the tax
  «circa». The AI prompt's market block is unchanged (it still prints `Δ − risparmio`): a known asymmetry, and a
  tax the owner ALSO records as a cashflow expense would be counted twice in the split (doc/guide/panoramica.md § Per-page blind spots).
- **…and the user's money that moved outside the cashflow** (owner, 2026-10-14): `marketEffectOf` also subtracts
  `MonthlyEmailData.periodFlows` — the pension contributions and the principal repaid per debt between the two
  snapshots (`buildPeriodFlows`, Storico's rules from `lib/utils/marketEffect.ts`; `null` without `byAsset` on both
  snapshots or on a failed read, never blocking, and then they stay in the residual as before). The verdict names them
  in its «da …» form («+300 € dal debito rimborsato (Mutuo) e +1800 € da quanto hai versato nel fondo pensione»), the
  Patrimonio tile's footer as «debito rimborsato +300 €, fondo pensione +1800 €», both uncoloured. Why: the month's TFR
  read as «mercato» — the Panoramica printed the same euro as «altre variazioni». `getSettingsAdmin` reads
  `pensionReturnStartMonth` for it (the seventh place, doc/guide/impostazioni.md). The AI prompt's market block is
  still `Δ − risparmio` (the asymmetry above). Pinned by `__tests__/{emailNarrative,monthlyEmailService}.test.ts`.
- **Every email cap is stated in the prompt**: `MAX_CATEGORY_DELTAS` (12) is named in the section header together with
  how many categories were left out. The selection is by SPEND, not by size of variation — describe it as it is.
- **The periodic comment's contract names the spending types as the app prints them** (2026-11-12):
  «Spese Necessarie/Spese Non Necessarie/Debiti» (`buildEmailPeriodicFormatContract`, `lib/server/assistant/prompts.ts`), never
  the labels retired on 2026-10-20.
- **`max_tokens` scales with the period** (`EMAIL_AI_MAX_TOKENS`: 16.000 monthly, 24.000 yearly, thinking included), and the format contract names the period in its
  length line instead of a word count. Web search is offered only when `includeMacroContext` allows it, like the
  assistant's structured analyses.
- **A deficit without a baseline reads as the Cashflow tile reads it** (2026-11-12): the period verdict's fallback
  (no snapshot before the period) says «Sono usciti 600 € più di quanto è entrato.», never «Hai messo da parte −600 €, il
  −30,0%»; a surplus keeps its share, from `meaningfulSavingsRate`, as `describeCashflowTile` does. Pinned by
  `__tests__/emailNarrative.test.ts`. Both «Hai messo da parte» sentences take the article from the figure as printed
  («l'81,0%», The Comma Rule, 2026-11-14), and so does the income tile's ranked category («Stipendio copre l'86,1%»,
  the share passed to the lead-in as a number).

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

- **The YEARLY PDF of the current year measures one month less than Rendimenti's «YTD»** (seen 2026-10-04, driving the
  export on the mirror; not changed): the dialog hands the report the year's snapshots only (`filterSnapshotsByTime`), so
  January's snapshot is the starting valuation and the window is February → today, where the page reaches back to
  December and measures from January. TWR, ROI and the two yields are annualised over 9 months against the page's 10; the
  dividends received are the same. The TOTAL export has the page's whole-history window, and its twelve yield fields were
  equal to the page's, field by field.
- **An email with an AI comment reads the cashflow twice** (2026-11-07): the bundle on its window and the CASHFLOW 12
  MESI block on the whole history — two queries apart, accepted for a cron that sends a handful. The block is read at
  the send, so on the 1st the new month's first day is already in it.
- **After the third day of the month only «Invia ora» sends** (2026-11-28): a cron that missed the 1st, the 2nd and the
  3rd leaves no trace and no notice; a period without a snapshot is retried on the 2nd and the 3rd, then silently
  dropped.
- **The ledger does not stop a manual send**: «Invia ora» sends the closed period again even when the cron sent it.
- **A confirm that fails after the email went out** leaves the claim «sending»: the same day nothing leaves again, but
  past `EMAIL_CLAIM_STALE_MS` the next day's run claims it and sends the period a second time.
- **On 1 January the two emails arrive in no fixed order**: the two comments are written side by side.
- **The comment keeps its six sections**, not the Assistente's one form (an email is scanned by section; the owner
  asked for the form in the chat). **No unsubscribe link**: the recipients are the owner's own list in Impostazioni.
- **Fuori dal DOM restano tre punti ciechi**: le email non rispecchiano i cinque temi nominati (scelta — si leggono su una scheda bianca); «un hex sta solo in `printTokens`» è documentato ma **non applicato da un linter**; e `@react-pdf/renderer` scarta in SILENZIO ogni carattere fuori da WinAnsi (`pdfSafeText` copre U+2212; frecce, simboli ed emoji no). Le tre superfici si verificano solo renderizzandole, e **nessuna di quelle verifiche è nella suite**. doc/guide/email-pdf.md. (moved from `CLAUDE.md` → Known Issues on 2026-09-19)
