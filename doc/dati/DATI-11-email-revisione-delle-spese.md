# DATI-11 — The «Revisione delle spese» email: the closed month, row by row, with three to five cuts and their figure

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-09 (contract C3: the pure queries of
> `lib/utils/assistantExpenseQueries.ts` with their `QueryClock`, `buildAssistantToolContext`, `computeBudgetState`)
> and DATI-10 (contract C5: the schedule and the delivery ledger, `emailAppLink`; the emails' cron this one copies).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a line number is a hint, the function's name is the
> anchor). Owner's point 9; decisions 25, 27, 77 and 78. ADDS to C5: `SPENDING_REVIEW_KIND`, `spendingReviewDueOn`.

## 1. The problem today (evidence on the code)

The owner asked for an email in which the AI goes through the spending and says where to cut. Nothing does it:

- The periodic emails' comment (`generateEmailAiComment`, `lib/server/monthlyEmailService.ts:780-857`) reads
  aggregates; the only single rows it sees are the five largest (ten in the yearly). Its contract asks for six
  sections on net worth, comparison and causes (`lib/server/assistant/prompts.ts:903-918`), with «1-2 osservazioni
  pratiche» at the end.
- The Sunday budget email — the only one that listed rows (those of the lines over budget, HTML only,
  `lib/server/weeklyBudgetEmailService.ts:366-385`) with a two-sentence comment that saw none (`:288-330`) — is
  removed by DATI-10.
- A month is about 150 rows, some 4–5 thousand tokens (the measure in the session's reading of
  `formatRecentRow`, `lib/utils/assistantRegisterContext.ts:407-419`): the whole month fits in one request.

## 2. Goal and acceptance criteria

One email a month, on its own switch, the day after the month closes: a verdict computed by code (spent against the
typical month), the tiles that hold it, then three to five cuts written by the model — each with what to cut, how
much it saves a month and a year, and the rows that show it.

1. A new setting «Revisione delle spese» (off by default), its own row in Impostazioni › Generale › «Email
   periodiche», the same recipients. Proof: S1, D1.
2. It leaves on the 1st–3rd of the month for the month just closed, once, through the ledger of C5, from its own
   cron route (20:00 UTC, `maxDuration = 300`); on any other day the route reads nothing. Proof: U1, C1, V1.
3. The review is built by code from every spending row of the month and the up-to-twelve months before it: the
   total against the typical month, each category against its own average, what rose, what is new, the
   subcategories with four rows or more, the largest rows. Proof: R1–R5. The budget lines over their ceiling —
   monthly ones on the month, annual ones on the year up to that month, income targets left out. Proof: A1, H1.
4. The model receives the review and every row of the month (at most 400, the omission declared) and returns three
   to five cuts as structured data; a cut naming a category the month does not have, a category made only of
   instalments, or saving more than that category spent, is dropped by code; one malformed cut does not cost the
   others. Proof: K1–K3, A1, A2.
5. With fewer than three months of history the email still leaves, without the «typical month» figures and saying
   so. With no spending row in the month it does not leave. Proof: R6, A2.
6. The model failing, or returning no valid cut, sends the email with its tiles and without the cuts' section —
   never a silent nothing, never a cut made up by code. Proof: A2.
7. The email renders at 390, 600 and 1440 from `printTokens` — light only, as every email (`color-scheme: light`)
   — with `documentElement.scrollWidth === clientWidth` at each width. Proof: H1, § 7 E.
8. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
   `npm run perf:budget` green with `/dashboard/settings` inside its ceiling, raised by no more than 1 KB gz and
   only with the register row (index § 8 rule 7).

## 3. Decisions

- **Decision 25** (owner, 2026-11-23): monthly, an email of its own.
- **Decision 26** (owner, 2026-11-23): the day after, with the period closed (C5).
- **Decision 27** (owner, 2026-11-23): Opus 5.5.
- **Decision 75** (owner, 2026-11-23, DATI-10): one cron per email family, each in its own hour — this one at 20:00
  UTC, the fourth entry of `vercel.json` (Vercel allows a hundred a project on every plan).
- **Decision 77** (owner, 2026-11-23): the «Budget» tile reads a monthly line against the month and an annual line
  against the year up to that month; each row says its window; income targets are not in it.
- **Decision 78** (owner, 2026-11-23): the AI's section «Dove puoi tagliare» comes AFTER the tiles computed by code
  — a declared exception to «the AI comment is a tile in second position»: here it follows the tiles it cites.
- Adopted, reversible:
  - (a) the verdict and the tiles are code; the model writes only the cuts. The closing line with their total is
    code.
  - (b) «typical month» = the median of the monthly totals from the first month of the previous twelve that holds a
    spending row (the empty months after it count at zero), from three months up; a category's typical = its total
    over those months ÷ their number. A category is matched to its history by its ID: a rename keeps the history.
  - (c) one request, no tool loop: everything the model needs is in the message.
  - (e) transfers never count. A category whose rows of the month are ALL instalments (`debt`) is never a cut:
    `keepValidCuts` drops it. «IMPEGNI RICORRENTI» is the sum of the month's rows of a recorded series or instalment
    plan (`RowLine.recurring`), whatever their type. Taxes and medical rows are kept out by the prompt only.
  - (f) «Invia ora» for this email too, on the last closed month.
  - (g) effort `high`, `max_tokens` 16.000: a batch with no reader waiting, as the periodic emails (DATI-10 (e)).
  - (h) the history's floor (`cashflowHistoryStartYear`) applies, as in every cashflow query (decision 73; `selectRows` in `lib/utils/assistantExpenseQueries.ts`).
  - (i) a refund — a spending row with a positive amount — counts as spending, as in the queries (`Math.abs` in `selectRows`, `lib/utils/assistantExpenseQueries.ts`).

## 4. Solution

### 4.1 The review — `lib/utils/spendingReview.ts` (new, written here)

```ts
/**
 * The spending of one closed month read for what can be cut (2026-11-23).
 *
 * Code does the sums — the month against the typical one, each category against its own average,
 * what rose, what is new, the subcategories that repeat — and the model, which also reads every row,
 * proposes the cuts. A cut is checked back against these figures before it is printed.
 * Pure: the queries are the Assistente's (lib/utils/assistantExpenseQueries.ts), their clock a parameter.
 */
import { NO_SUBCATEGORY_KEY, type Expense } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';
import { foldName, listRows, totalsBy, type QueryClock, type RowLine } from '@/lib/utils/assistantExpenseQueries';

export const REVIEW_HISTORY_MONTHS = 12;
export const REVIEW_MIN_HISTORY_MONTHS = 3;
export const REVIEW_ROWS_CAP = 400;
/** A category «rose» when it is this many euro AND this share above its own average. */
export const REVIEW_RISE_MIN_EUR = 20;
export const REVIEW_RISE_MIN_SHARE = 0.15;
/** A subcategory «repeats» from this many rows in the month. */
export const REVIEW_FREQUENT_ROWS = 4;
export const REVIEW_CUTS_MIN = 3;
export const REVIEW_CUTS_MAX = 5;

export interface ReviewCategory {
  /** The category's id (the queries' group key): what the history is matched on. */
  key: string;
  /** Its label in the month's data — the type in parentheses when two categories share the name. */
  category: string;
  month: number;
  /** Its average over the history months; null without enough history. */
  typical: number | null;
  delta: number | null;
  rows: number;
  /** With enough history, no row of it in those months. */
  isNew: boolean;
  /** Every row of the month is an instalment (`debt`): never a cut. */
  debtOnly: boolean;
}

export interface SpendingReview {
  periodKey: string;
  fromIso: string;
  toIso: string;
  total: number;
  rows: number;
  historyMonths: number;
  typicalTotal: number | null;
  delta: number | null;
  byType: Array<{ label: string; total: number }>;
  categories: ReviewCategory[];
  risen: ReviewCategory[];
  newCategories: string[];
  frequent: Array<{ label: string; rows: number; total: number }>;
  largestRows: RowLine[];
  /** Rows of a recorded series or instalment plan; null when the month has more rows than the cap. */
  committedTotal: number | null;
  allRows: RowLine[];
  omittedRows: number;
}

const pad = (value: number) => String(value).padStart(2, '0');

function monthBounds(index: number): { fromIso: string; toIso: string; key: string } {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { fromIso: `${year}-${pad(month)}-01`, toIso: `${year}-${pad(month)}-${pad(lastDay)}`, key: `${year}-${pad(month)}` };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function buildSpendingReview(expenses: readonly Expense[], year: number, month: number, clock: QueryClock): SpendingReview {
  const index = year * 12 + (month - 1);
  const current = monthBounds(index);
  const spending = { kind: 'spending' as const };
  const monthQuery = { ...spending, fromIso: current.fromIso, toIso: current.toIso };

  const byCategory = totalsBy(expenses, monthQuery, 'category', clock);
  const debtRowsByCategory = new Map(
    totalsBy(expenses, { ...monthQuery, types: ['debt'] }, 'category', clock).groups.map((group) => [group.key, group.rows] as const),
  );
  const byType = totalsBy(expenses, monthQuery, 'type', clock).groups.map(({ label, total }) => ({ label, total }));

  // The history: the months before this one, from the first that holds a row, at most twelve.
  const window = { fromIso: monthBounds(index - REVIEW_HISTORY_MONTHS).fromIso, toIso: monthBounds(index - 1).toIso };
  const monthly = totalsBy(expenses, { ...spending, ...window }, 'month', clock).groups;
  const first = monthly.findIndex((group) => group.rows > 0);
  const history = first === -1 ? [] : monthly.slice(first);
  const historyMonths = history.length;
  const enough = historyMonths >= REVIEW_MIN_HISTORY_MONTHS;
  const typicalTotal = enough ? roundToCents(median(history.map((group) => group.total))) : null;

  // By the category's ID, never its name: a renamed category keeps its history.
  const historyByCategory = new Map<string, number>();
  if (enough) {
    const from = monthBounds(index - historyMonths).fromIso;
    for (const group of totalsBy(expenses, { ...spending, fromIso: from, toIso: window.toIso }, 'category', clock).groups) {
      historyByCategory.set(group.key, group.total);
    }
  }

  const categories: ReviewCategory[] = byCategory.groups.map((group) => {
    const typical = enough ? roundToCents((historyByCategory.get(group.key) ?? 0) / historyMonths) : null;
    return {
      key: group.key,
      category: group.label,
      month: group.total,
      typical,
      delta: typical === null ? null : roundToCents(group.total - typical),
      rows: group.rows,
      isNew: enough && !historyByCategory.has(group.key),
      debtOnly: debtRowsByCategory.get(group.key) === group.rows,
    };
  });

  const risen = categories
    .filter((line) => line.typical !== null && line.typical > 0 && line.delta !== null
      && line.delta >= REVIEW_RISE_MIN_EUR && line.delta / line.typical >= REVIEW_RISE_MIN_SHARE)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 5);
  const newCategories = categories.filter((line) => line.isNew).map((line) => line.category);

  // The rows with no subcategory are the rest of their category, not a «voce».
  const frequent = totalsBy(expenses, monthQuery, 'subcategory', clock).groups
    .filter((group) => group.rows >= REVIEW_FREQUENT_ROWS && !group.key.endsWith(`/${NO_SUBCATEGORY_KEY}`))
    .slice(0, 5)
    .map(({ label, rows, total }) => ({ label, rows, total }));

  const all = listRows(expenses, monthQuery, 'date-asc', REVIEW_ROWS_CAP, clock, REVIEW_ROWS_CAP);
  const largestRows = listRows(expenses, monthQuery, 'amount-desc', 10, clock).shown;
  const committedTotal = all.omitted > 0
    ? null
    : roundToCents(all.shown.filter((row) => row.recurring).reduce((sum, row) => sum + row.amount, 0));

  return {
    periodKey: current.key,
    fromIso: current.fromIso,
    toIso: current.toIso,
    total: byCategory.total,
    rows: byCategory.rows,
    historyMonths,
    typicalTotal,
    delta: typicalTotal === null ? null : roundToCents(byCategory.total - typicalTotal),
    byType,
    categories,
    risen,
    newCategories,
    frequent,
    largestRows,
    committedTotal,
    allRows: all.shown,
    omittedRows: all.omitted,
  };
}

/** What the model proposes: one cut. */
export interface SpendingCut {
  title: string;
  category: string;
  monthlySaving: number;
  why: string;
  how: string;
}

/**
 * The cuts that may be printed: the category is one of the month's and not one made of instalments
 * only, the saving is positive and not above what that category spent, no category twice, at most
 * five. Fewer than three is still an answer; none is «no cuts section».
 */
export function keepValidCuts(cuts: readonly SpendingCut[], review: SpendingReview): SpendingCut[] {
  const spent = new Map(review.categories.map((line) => [foldName(line.category), line] as const));
  const seen = new Set<string>();
  const kept: SpendingCut[] = [];
  for (const cut of cuts) {
    const key = foldName(cut.category);
    const line = spent.get(key);
    if (!line || line.debtOnly || seen.has(key)) continue;
    if (!(cut.monthlySaving > 0) || cut.monthlySaving > line.month) continue;
    seen.add(key);
    kept.push({ ...cut, category: line.category, monthlySaving: roundToCents(cut.monthlySaving) });
    if (kept.length === REVIEW_CUTS_MAX) break;
  }
  return kept;
}

/** The verdict's sentence, by code. */
export function describeReviewVerdict(review: SpendingReview, monthLabel: string, formatEur: (value: number) => string): string {
  const head = `A ${monthLabel} hai speso ${formatEur(review.total)}`;
  if (review.typicalTotal === null || review.delta === null) {
    return `${head}. Servono almeno ${REVIEW_MIN_HISTORY_MONTHS} mesi registrati per confrontarlo con il tuo mese tipico.`;
  }
  if (Math.abs(review.delta) < 1) return `${head}: come il tuo mese tipico.`;
  return review.delta > 0
    ? `${head}: ${formatEur(review.delta)} più del tuo mese tipico (${formatEur(review.typicalTotal)}).`
    : `${head}: ${formatEur(-review.delta)} meno del tuo mese tipico (${formatEur(review.typicalTotal)}).`;
}
```

### 4.2 The model's part — `lib/server/spendingReviewEmailService.ts` (new)

- `SPENDING_REVIEW_SYSTEM` (a module constant, static; NOT the Assistente's core):

```
Sei il revisore delle spese di Net Worth Tracker. Leggi le spese di UN mese chiuso di un investitore italiano e proponi dove tagliare. Rispondi in italiano.

Ricevi: i totali già calcolati (il mese, il mese tipico, ogni categoria contro la sua media, che cosa è salito, che cosa è nuovo, le voci che si ripetono, gli impegni ricorrenti, le voci di budget sforate) e TUTTE le righe del mese.

Proponi da 3 a 5 tagli, dal più grande al più piccolo. Ogni taglio:
- riguarda UNA categoria, scritta esattamente come compare nei dati;
- ha un risparmio mensile in euro che discende dalle righe: la somma delle righe che non rifaresti, o la differenza tra questo mese e la media della categoria. Mai più di quanto la categoria ha speso nel mese;
- dice perché in una frase che cita le righe o i numeri («4 consegne a domicilio, 86 €»), e come in una frase concreta.
Non proporre mai di tagliare una rata di mutuo o di prestito, le imposte, le spese mediche, né una voce che compare una volta sola ed è già finita. Non inventare righe né cifre: i conti sono fatti, usali. Niente premesse, niente morale, niente consigli generici («fai un budget»).
Se il mese non offre tre tagli difendibili, proponine meno.
```

- The output: `spendingCutSchema = z.object({ title: z.string().min(1).max(80), category: z.string().min(1).max(80),
  monthlySaving: z.number(), why: z.string().min(1).max(240), how: z.string().min(1).max(240) })` and
  `spendingReviewAnswerSchema = z.object({ cuts: z.array(spendingCutSchema).max(8) })`, sent as `output_config: {
  effort: 'high', format: { type: 'json_schema', schema: betaZodOutputFormat(spendingReviewAnswerSchema).schema } }`
  — the call shape of the Consulente's structured stages (`lib/server/allocationAdvice/run.ts`,
  `ALLOCATION_ANSWER_FORMAT`: only `type` and `schema` go out): `anthropic.beta.messages.stream({ model:
  EMAIL_ANALYSIS_MODEL, betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks: 'default', max_tokens: 16000, system:
  SPENDING_REVIEW_SYSTEM, thinking: { type: 'adaptive' }, output_config, messages: [{ role: 'user', content }]
  }).finalMessage()`. The client is created as `generateEmailAiComment` creates its own (a lazy `import` of the
  SDK, so a missing `ANTHROPIC_API_KEY` is a caught failure, not a module that cannot load).
- Reading the answer — `readSpendingCuts(message): SpendingCut[] | null`: a `stop_reason` other than `end_turn`, a
  text that `JSON.parse` refuses, or a JSON without an array `cuts` → `null`, logged; else EACH element goes
  through `spendingCutSchema.safeParse`: an invalid one is dropped and logged (`[spending-review] cut dropped`) —
  the limits of length are not guaranteed by the wire format — and the valid ones go to `keepValidCuts`. A thrown
  request → `null`, logged.
- The budget — `const budget = computeBudgetState({ year, month }, context)` (DATI-09) inside a `try`: an
  `AssistantToolError` (the budget could not be read) or `configured: false` → no budget in the email. The lines
  the email reads, `overBudget`: those with `kind === 'expense'` and `spent > ceiling`; each says its window from
  `measuredOver` — `'month'` → «nel mese», `'yearToMonth'` → «nell'anno fino a {mese}» (decision 77).
- The user content, built by `formatSpendingReviewForPrompt(review, overBudget)`: «MESE: ottobre 2026 (dal … al …)»,
  «TOTALE», «MESE TIPICO» («non calcolato: meno di 3 mesi registrati» without history), «PER TIPO», «CATEGORIE (mese
  · media · differenza · righe)» with «solo rate» after a `debtOnly` one, «SALITE», «NUOVE», «VOCI CHE SI RIPETONO»,
  «IMPEGNI RICORRENTI: {committedTotal} €» or «IMPEGNI RICORRENTI: non calcolati (più di 400 righe)», «BUDGET
  SFORATO (voce · finestra · tetto · speso)» or «BUDGET SFORATO: nessuna voce», then «RIGHE DEL MESE ({n}{, omesse
  le ultime m per data})», one line per row: `{date} | {type} | {category} › {subCategory} | {amount} | {ricorrente}
  | {notes}` — a null subcategory prints «Senza sottocategoria» (`NO_SUBCATEGORY_LABEL`), a null note nothing after
  the last `|`, `{ricorrente}` is «ricorrente» or empty.
- The closing is ALWAYS code: «In tutto: {sum} € al mese, {sum × 12} € in un anno.», where `sum` is the total of the
  KEPT cuts; the model is not asked for a total.
- `buildAndSendSpendingReview(userId, recipients, year, month, now): Promise<boolean>`:
  1. `const context = await buildAssistantToolContext(userId, now)` (DATI-09) — a rejection is the caller's (the
     cron releases the claim, «Invia ora» answers 500);
  2. `const review = buildSpendingReview(context.expenses, year, month, context.clock)`; `review.rows === 0` →
     `false`;
  3. the budget, as above;
  4. the model's cuts → `keepValidCuts`;
  5. `sendSpendingReviewEmail(recipients, html)` through the same Resend client and sender as
     `sendMonthlyEmail` (`monthlyEmailService.ts:1897-1917`), subject «Revisione delle spese · {mese anno}».
- The HTML, `generateSpendingReviewHtml(review, overBudget, cuts)`, on the periodic email's shell
  (`lib/server/emailHtml.ts`) and `printTokens`, in this order (decision 78): verdict (`describeReviewVerdict`) →
  `emailAppLink(process.env.NEXT_PUBLIC_APP_URL)` (DATI-10) → tile «Dove sono andati» (the categories, month against
  typical, the first eight and «altre») → tile «Cosa è salito» (risen and new; omitted when empty, and without
  history) → tile «Voci che si ripetono» (omitted when empty) → tile «Budget» (one row per `overBudget` line: label,
  its window, spent against ceiling; omitted when none) → tile «Le spese più grandi» (ten rows) → section «Dove puoi
  tagliare», an `emailTile` with `muted: true`, the eyebrow «Tagli proposti dall'AI» and the AI comment's footer
  («Generato da Assistente AI — verifica sempre le informazioni prima di agire.») — the emails' existing mark for
  model text, no new token in `printTokens`: one card per cut — title, «{monthlySaving} € al mese · {× 12} €
  l'anno», why, how — then the closing. Without valid cuts the section is one line: «Questo mese l'AI non ha
  proposto tagli.» Every string of the model and every note goes through `escapeHtml`.

### 4.3 The schedule, the cron, the setting

- `lib/utils/emailSchedule.ts` (C5): `export const SPENDING_REVIEW_KIND = 'spending-review';` and
  `export function spendingReviewDueOn(todayIso: string): { year: number; month: number; periodKey: string } | null` —
  null after day `EMAIL_CATCH_UP_DAYS`, else the month of `lastClosedMonth` with `periodKey = monthPeriodKey(year,
  month)`.
- New route `app/api/cron/spending-review/route.ts`, the shape of DATI-10's `periodic-emails` route: `export const
  maxDuration = 300;`, the secret check, `const due = spendingReviewDueOn(getItalyDateIso(now))` — null → `{
  success: true, emails: { sent: 0, skipped: 0, errors: 0 } }` without reading the users; else, for each user but
  the demo one, one after the other: `settings.spendingReviewEmailEnabled` and recipients present (else skipped,
  no claim taken) → `claimEmailDelivery(userId, SPENDING_REVIEW_KIND, due.periodKey, now)` →
  `buildAndSendSpendingReview` in the `try` that releases → a `false` releases and counts skipped → the confirm in a
  `try` of its own that never releases. Answers `{ success, emails: { sent, skipped, errors } }`.
- `vercel.json` crons: a fourth entry `{ "path": "/api/cron/spending-review", "schedule": "0 20 * * *" }`.
- `app/api/user/monthly-email/send/route.ts`: `periodType: 'spending-review'` joins the two accepted values → the
  last closed month, `spendingReviewEmailEnabled` required as the other two require their switch; a `false` from
  `buildAndSendSpendingReview` → 404 `{ error: 'Nessuna spesa registrata nel mese' }`; after a send,
  `confirmEmailDelivery(…, true)`. The demo's 403 and the token's own uid are DATI-10's.
- Setting `spendingReviewEmailEnabled?: boolean` (default false) in the five places (`types/assets.ts:491`,
  `getSettings`, BOTH write chains of `setSettings`, `settingsDraft.ts`, `getSettingsAdmin`) and the fixtures
  (`__tests__/fixtures/storedSettings.ts`: `STORED_SETTINGS`, and `FULL_PAGE_SETTINGS` at `true`; `WRITTEN_KEYS`).
  `describeEmails` (`lib/utils/settingsNarrative.ts`): `EmailsInput` gains `spendingReview: boolean` and the
  function `active.push('revisione delle spese')` after «annuale» — «Report mensile, annuale e revisione delle
  spese attivi, verso 2 destinatari.», «Report revisione delle spese attivo, …»; its recipients' sentences are
  untouched.
- `components/settings/tabs/GeneraleTab.tsx`, tile «Email periodiche»: a third row «Revisione delle spese» — «Il 1°
  di ogni mese: le spese del mese appena chiuso, riga per riga, con i tagli proposti dall'AI» — its switch (disabled
  in demo as the other two) and its «Invia ora la revisione di {mese anno}», a button of the same look as the other
  two rows' (it sends an email; the model's text is marked in the email).

## 5. Constraints and traps

- **C5 is used IDENTICAL**: the ledger's three functions and the three-day window; this spec adds a kind, not a
  mechanism.
- **Settings — the FIVE places** (doc/guide/impostazioni.md): the new flag enters all five and `WRITTEN_KEYS`.
- **Classification by `type`, transfers out, the Italian day**: inherited from the queries — R1 holds it here too.
- **Opus 5.5 refuses a forced `tool_choice`**: the structured answer goes through `output_config.format`, as the
  Consulente's.
- **The model's figures are never printed unchecked**: `keepValidCuts` is the gate; the closing's sums are code.
- **The Out-Of-DOM Token Rule** and the emails' mark for model text (doc/guide/email-pdf.md: a tile on `--muted`
  with its eyebrow and footer): the cuts' section is the only generated part and carries it; `printTokens` gains no
  token.
- **«The AI comment is a tile in SECOND position»** (AGENTS.md, doc/guide/email-pdf.md): this email is the declared
  exception (decision 78), written in the guide by this session.
- **`__tests__/vercelConfig.test.ts`** holds the crons — its «keeps the three crons» case becomes four — and reads
  the route's source for `export const maxDuration = 300;`, as DATI-10's V1 does.
- **Key by id, label by name**: the review matches a category to its history by the queries' `key`; a cut is
  matched by the LABEL the model read, folded.
- **A cron route's cold import is slow under Vitest** and **the confirm never sits in the `try` that releases**:
  both as in DATI-10 (§ 5, § 4.3).
- **A probe never opens a control that spends**: Resend and the model are mocked in every automated step.
- **No owner data**: fixtures are «Consegne a domicilio 20 €» × 5, «Abbonamento 15 €», «Mutuo 500 €».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| R1 | unit · `__tests__/spendingReview.test.ts` | the month's total excludes a transfer and an income row; a row at Italian midnight of the 1st of the next month is out | `toISOString` day |
| R2 | unit · same | twelve months of history with one empty month before the first row and one after it → `historyMonths` counts from the first row, the later empty month in it at zero; the typical total is the median; a category renamed in the month keeps the history of its id | mean; key the history on `foldName(group.label)` |
| R3 | unit · same | a category at 130 against an average of 100 is «risen»; at 220 against 200 it is not (20 € but 10%: below the share); at 100,50 against 85 it is not (18% but 15,50 €: below the euro) | drop the share threshold; drop the euro threshold — one at a time |
| R4 | unit · same | a category absent from the history is «new», one whose history rounds to 0,00 is not; four rows in one subcategory are «frequent», three are not; six rows with no subcategory are not | `>=` → `>` on the count; drop the `NO_SUBCATEGORY_KEY` test |
| R5 | unit · same | 450 rows → 400 in `allRows` (the first by date), `omittedRows: 50`, `committedTotal: null`; 20 rows with two recurring → their sum | sum of the shown when omitted |
| R6 | unit · same | two months of history → `typicalTotal: null`, no «new» and no «risen», the verdict says «Servono almeno 3 mesi»; the three verdict sentences (more, less, same) | typical from one month |
| R7 | unit · same | a floor of 2026 (`clock.floorIso`): the rows of 2025 are out of the history, and `historyMonths` counts from January 2026 | pass a clock without the floor |
| K1 | unit · same | `keepValidCuts`: an unknown category, a saving above the category's month, a saving of zero, a repeated category are dropped; the category's spelling becomes the data's; at most five | no ceiling check |
| K2 | unit · same | one valid cut of eight proposed → one kept (fewer than three is allowed) | return `[]` under three |
| K3 | unit · same | a category whose month is one «Mutuo 500 €» `debt` row is `debtOnly` and a cut on it is dropped; a category with a `debt` row and a `fixed` one is not `debtOnly` | drop the `debtOnly` test |
| A1 | unit · `__tests__/spendingReviewEmailService.test.ts` (new) | the request: model `claude-opus-5-5`, a `json_schema` format, no `tool_choice`, the static system; the user content has every row of the fixture; a monthly budget line over its ceiling is printed «nel mese», an annual one «nell'anno fino a ottobre», an income target reached is not printed | rows capped at 10; keep the `income` lines |
| A2 | unit · same | the model throwing, a `max_tokens` stop, invalid JSON → the email is sent with «Questo mese l'AI non ha proposto tagli.»; one cut of four with a `why` of 300 characters → the other three are printed; an unreadable budget → the email leaves without its «Budget» tile; no rows in the month → not sent | throw to the caller; `safeParse` the whole answer |
| H1 | unit · same | the HTML: the verdict before any tile; «Dove puoi tagliare» after «Le spese più grandi»; one card per kept cut with «€ al mese · € l'anno»; the code closing equals the sum of the kept cuts × 12; a note «<b>» is printed escaped | the section right after the verdict; drop `escapeHtml` |
| U1 | unit · `__tests__/emailSchedule.test.ts` | `spendingReviewDueOn`: 1–3 November → October 2026, `periodKey` «2026-10»; 4 November → null | no window |
| C1 | unit · `__tests__/cronSpendingReview.test.ts` (new) | 401 without the secret; on 15 November no user is read and nothing is sent; on 1 November the demo user is skipped, a second run sends nothing, a failed send releases the claim, a confirm that throws does not | skip the due check; confirm inside the `try` that releases |
| C2 | unit · same | setting off → skipped, no claim taken | claim first |
| V1 | unit · `__tests__/vercelConfig.test.ts` | four crons, the new path at `0 20 * * *`; the route's source holds `export const maxDuration = 300;` | remove the fourth entry; remove `maxDuration` |
| S1 | unit · `__tests__/settingsDraft.test.ts`, `__tests__/settingsRoundTrip.test.ts` | the flag is in `WRITTEN_KEYS`, written by both chains of `setSettings` and read back at `true` | drop the flag from the no-merge chain of `setSettings` |
| S2 | unit · `__tests__/monthlyEmailSendRoute.test.ts` | on 15 November «Invia ora» with `spending-review` sends October and confirms with `manual: true`; the setting off → 400; no spending row → 404 | send the month in progress |
| N1 | unit · `__tests__/settingsNarrative.test.ts` | `describeEmails`: the three on → «Report mensile, annuale e revisione delle spese attivi, verso 2 destinatari.»; the review alone, no recipient → «Report revisione delle spese attivo, ma senza destinatari…» | drop the push |
| D1 | dom · `__tests__/generaleTab.email.test.tsx` | DATI-10's assertion rewritten: exactly three switches — «Mensile», «Annuale», «Revisione delle spese» — the third off by default; its button reads «Invia ora la revisione di ottobre 2026» on 15 November | default the third switch to on |
| E1 | e2e · `e2e/settings.spec.ts` | toggling «Revisione delle spese» and saving persists | — (presence) |

The harnesses are DATI-10's: `cronSpendingReview.test.ts` imports its route in a `beforeAll` with a 60 s timeout and
runs the real ledger on the in-memory `adminDb`; `spendingReviewEmailService.test.ts` spies
`Anthropic.Beta.Messages.prototype.stream` returning `{ finalMessage }` and mocks Resend and
`buildAssistantToolContext`.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on a seeded month with five «Consegne a domicilio» rows, one new subscription and a
category 40% above its average, the email's verdict states the month against the typical one, the tiles show the
three facts, and (with a canned model answer) three cut cards whose yearly figure is twelve times the monthly one; a
canned cut above its category's spending does not appear.

- A — the diff; the system prompt read aloud. B–E on the emulators with Resend and the model mocked: B the cron on
  1 November (one email, the ledger written); C the second run; D two months of history (no typical figures); a
  month with no rows (nothing sent); a failing model (the line in place of the cuts); E the render at 390, 600 and
  1440 (one look, light: no dark render); the settings row at 1440 and 390, light and dark. Decoys: «ornitorinco»
  (a transfer of 9.999 €: in no total), «fenicottero» (a canned cut on a category the month lacks: not printed) and
  «pangolino» (a canned cut on the mortgage's category: not printed).
- F — at the owner's «pronto», on the mirror: «Invia ora la revisione» to his own address — the one step that sends
  and spends. He reads the cuts against his month in Cashflow › Analisi: each figure must be findable there.

## 8. Putting it into service

No rule (the ledger's is DATI-10's), no index. With phase F closed and the commit in `develop`, the owner opens the
PR `develop` → `main` (index § 8 rule 13). After the deploy: Vercel › Cron Jobs lists four entries (the owner's
check); the switch is off until he turns it on — turned on in the first three days of a month, the review of the
month just closed leaves that evening; otherwise the first one is the 1st of the following month.

## 9. Documentation

- `doc/guide/email-pdf.md` — § «Revisione delle spese»: what code computes and what the model writes, the gate on
  the cuts, the thresholds and why, the cron, the failure modes, and the exception to «the AI comment is a tile in
  second position» (here it follows the tiles it cites; decision 78); § Per-page blind spots: a month above 400 rows
  is reviewed on its first 400 by date — the last days are the ones the model does not read, the totals still count
  them; a category made of instalments only is never a cut, taxes and medical rows are kept out by the prompt alone;
  a cut on a subcategory's name is dropped (a cut names a category); the cuts are proposals on one month, not a
  plan; whether a cut was followed is not tracked; no yearly review; with less than three months recorded there is
  no «typical month», no «new» and no «risen»; past sixty categories in the history the smallest read as new; a run
  cut by the function's timeout after the send leaves a stale claim, and the next day's run sends the review again.
- `doc/guide/impostazioni.md` — the third row; § Per-page blind spots: the recipients are shared by the three
  emails, no per-recipient switch. `doc/guide/server.md` — the fourth cron and its hour; the review walks the
  accounts one after the other inside 300 s.
- `README.md` — the emails' feature lines. `AGENTS.md` § 3 — the emails' stub rewritten at equal or shorter length
  (decision 47); the sentence «the AI comment is a tile in SECOND position» gains «(the spending review: after its
  tiles)».
- `CLAUDE.md` — the «Periodic emails · PDF export» line rewritten at equal or shorter length with «a monthly
  spending review with the AI's cuts»; the «Latest» entry REPLACED whole (decision 46: the date, this spec in one
  sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-12»); under 20.000 characters, counted with `node`.
- `Draft Release Temp.md` — one entry prepended in `## ✨ New Features`, in the file's form: «**Email «Revisione
  delle spese»** — Added a monthly email, on its own switch: the day after the month closes the AI reads the
  spending row by row and proposes three to five cuts, each with its figure a month and a year.»
- `doc/dati/README.md` § 6 (the row of 11 to `implemented`) and § 7 (C5: the two names this spec adds).

## 10. Declared out of scope

- A yearly review → doc/guide/email-pdf.md § Per-page blind spots (a year is some 50 thousand tokens of rows: a
  different shape).
- Tracking whether a proposed cut was followed the next month → doc/guide/email-pdf.md § Per-page blind spots.
- The review inside the app (a page or a tile) → not planned; the Assistente answers the same question with its
  tools (DATI-09) — doc/guide/email-pdf.md § Per-page blind spots says so.
- Per-recipient switches → doc/guide/impostazioni.md § Per-page blind spots.
- The review in parallel per account → doc/guide/server.md § Per-page blind spots.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-11-email-revisione-delle-spese.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C5 e C3, da usare IDENTICI; a C5 questa spec aggiunge due nomi —, regole della serie)
- Leggi doc/guide/email-pdf.md, doc/guide/assistente.md (§ The tools), doc/guide/cashflow.md,
  doc/guide/cashflow-budget.md, doc/guide/impostazioni.md (§ Settings — the FIVE places),
  doc/guide/server.md e doc/guide/e2e-emulatori.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (The Out-Of-DOM Token Rule) e PRODUCT.md prima di disegnare; il testo
  del modello nell'email si segna come il commento AI di oggi (tile `muted`, occhiello, piede): nessun
  token nuovo
- Tocca l'API di Anthropic: usa la skill claude-api (output strutturato) prima di scrivere la richiesta
- Leggi COMMENTS.md e DEVELOPMENT_GUIDELINES.md: il codice che scrivi li segue

Prima di tutto: lancia `node ~/.claude/processi-collaudo.mjs` (conta gli script di collaudo e i servizi
che questo repo usa — emulatori Firebase, server Next — ancora accesi; la seconda riga dell'output
dice quali servizi ha cercato). Se trova qualcosa non è di
questa sessione, che è appena iniziata: quelli «di un'altra sessione aperta» non si toccano; quelli
«di nessuna sessione nota» me li nomini (cosa, da quanto) e li chiudi con `--chiudi --anche-ignote`
solo dopo il mio sì. Dimmelo in una riga: «processi: nessuno» oppure l'elenco.

Se il repo ha un lockfile: lancia l'audit del gestore di pacchetti e confrontalo con
doc/guide/dipendenze.md (regola 8 di WORKFLOW.md). Rispondimi in una riga: invariate dal
<data>, oppure gli avvisi nuovi; quelli nuovi li registriamo nella guida con una decisione,
non si aggiorna nulla in questa sessione. Se la guida manca, creala.

Prima della prima modifica: controlla il branch attivo (git branch --show-current) e crea
il branch di sessione da lì. Mai modificare un file sul branch di integrazione.

Crea SESSION_NOTES.md per tracciare il lavoro (non tracciato: a fine sessione si riversa
nei documenti e si cancella).

Ogni dubbio o scelta che spetta a me me la chiedi SUBITO con AskUserQuestion, una scelta
per domanda, a gruppi di quattro: mai un «da decidere» lasciato nel codice, nei documenti o
nel riassunto. Se serve un comando che solo io posso lanciare (produzione, un login
interattivo), dammelo una riga alla volta con l'esito atteso.

Implementa la spec così com'è scritta, nell'ordine: il modulo della revisione con R1–R7, K1–K3, il
servizio — budget, richiesta al modello, lettura taglio per taglio, HTML, invio — (A1, A2, H1), la
scadenza e il cron (U1, C1, C2, V1), l'impostazione, la lettura del riquadro e «Invia ora» (S1, S2, N1,
D1), poi E1, i documenti del § 9 e la riga 11 di doc/dati/README.md § 6 a `implemented` (e i due nomi
aggiunti a C5 nel § 7). OGNI test del § 6 va visto rosso con la sua mutazione. Il codice del § 4.1 e il
prompt di sistema del § 4.2 sono già scritti: copiali.

Fermati e chiedimi se: DATI-09 o DATI-10 non sono in develop (`totalsBy` con il `QueryClock`,
`computeBudgetState`, `claimEmailDelivery`, `emailAppLink`, la route `periodic-emails`), oppure una
verifica automatica manderebbe un'email vera o chiamerebbe il modello.

Collaudo: § 7, la F al mio «pronto» (un «Invia ora la revisione» vero, verso il mio indirizzo). Un
branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa. A
commit in develop, ricordami la PR develop → main (regola 13 dell'indice).
```

Model: **Opus 5.5**, effort **medium** — an L spec with a new cron, a model request with a structured answer and a
gate on its figures, on two shared contracts. Estimated size: L (two new modules, one route, the setting's fan-out,
23 tests).
