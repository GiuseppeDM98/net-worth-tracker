# DATI-11 — The «Revisione delle spese» email: the closed month, row by row, with three to five cuts and their figure

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-09 (the pure queries of
> `lib/utils/assistantExpenseQueries.ts`, the tool context, `budget_stato`) and DATI-10 (contract C5: the schedule
> and the delivery ledger; the Italian window; the link).
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 9; decisions 25 and 27.

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
   cron route with `maxDuration = 300`. Proof: U1, C1, V1.
3. The review is built by code from every spending row of the month and the up-to-twelve months before it: the
   total against the typical month, each category against its own average, what rose, what is new, the small rows
   that repeat, the largest rows, the budget lines. Proof: R1–R5.
4. The model receives the review and every row of the month (at most 400, the omission declared) and returns three
   to five cuts as structured data; a cut naming a category the month does not have, or saving more than that
   category spent, is dropped by code. Proof: K1, K2, A1.
5. With fewer than three months of history the email still leaves, without the «typical month» figures and saying
   so. With no spending row in the month it does not leave. Proof: R6, C2.
6. The model failing, or returning no valid cut, sends the email with its tiles and without the cuts' section —
   never a silent nothing, never a cut made up by code. Proof: A2.
7. The email renders at 390, 600 and 1440, light and dark, from `printTokens`. Proof: H1, § 7 E.
8. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green.

## 3. Decisions

- **Decision 25** (owner, 2026-11-23): monthly, an email of its own.
- **Decision 26** (owner, 2026-11-23): the day after, with the period closed (C5).
- **Decision 27** (owner, 2026-11-23): Opus 5.5.
- Adopted, reversible:
  - (a) the verdict and the tiles are code; the model writes only the cuts and one closing line (DESIGN: verdict
    first, AI second).
  - (b) «typical month» = the median of the monthly totals of the previous twelve months that have rows, from three
    months up; a category's typical = its average over those months.
  - (c) one request, no tool loop: everything the model needs is in the message.
  - (d) a third Vercel cron at 18:30 UTC, after the snapshot cron, so the month's email and this one do not share a
    function's time.
  - (e) transfers never count; a `debt` row (an instalment) is listed among the commitments and is never proposed as
    a cut.
  - (f) «Invia ora» for this email too, on the last closed month.

## 4. Solution

### 4.1 The review — `lib/utils/spendingReview.ts` (new, written here)

```ts
/**
 * The spending of one closed month read for what can be cut (2026-11-23).
 *
 * Code does the sums — the month against the typical one, each category against its own average,
 * what rose, what is new, the small rows that add up — and the model, which also reads every row,
 * proposes the cuts. A cut is checked back against these figures before it is printed.
 * Pure: the queries are the Assistente's (lib/utils/assistantExpenseQueries.ts), «today» a parameter.
 */
import type { Expense } from '@/types/expenses';
import { roundToCents } from '@/lib/utils/cents';
import { foldName, listRows, totalsBy, type RowLine } from '@/lib/utils/assistantExpenseQueries';

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
  category: string;
  month: number;
  /** Its average over the history months; null without enough history. */
  typical: number | null;
  delta: number | null;
  rows: number;
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

export function buildSpendingReview(expenses: readonly Expense[], year: number, month: number, todayIso: string): SpendingReview {
  const index = year * 12 + (month - 1);
  const current = monthBounds(index);
  const spending = { kind: 'spending' as const };
  const monthQuery = { ...spending, fromIso: current.fromIso, toIso: current.toIso };

  const byCategory = totalsBy(expenses, monthQuery, 'category', todayIso);
  const byType = totalsBy(expenses, monthQuery, 'type', todayIso).groups.map(({ label, total }) => ({ label, total }));

  // The history: the months before this one, from the first that holds a row, at most twelve.
  const window = { fromIso: monthBounds(index - REVIEW_HISTORY_MONTHS).fromIso, toIso: monthBounds(index - 1).toIso };
  const monthly = totalsBy(expenses, { ...spending, ...window }, 'month', todayIso).groups;
  const first = monthly.findIndex((group) => group.rows > 0);
  const history = first === -1 ? [] : monthly.slice(first);
  const historyMonths = history.length;
  const enough = historyMonths >= REVIEW_MIN_HISTORY_MONTHS;
  const typicalTotal = enough ? roundToCents(median(history.map((group) => group.total))) : null;

  const historyByCategory = new Map<string, number>();
  if (enough) {
    const from = monthBounds(index - historyMonths).fromIso;
    for (const group of totalsBy(expenses, { ...spending, fromIso: from, toIso: window.toIso }, 'category', todayIso).groups) {
      historyByCategory.set(foldName(group.label), group.total);
    }
  }

  const categories: ReviewCategory[] = byCategory.groups.map((group) => {
    const typical = enough ? roundToCents((historyByCategory.get(foldName(group.label)) ?? 0) / historyMonths) : null;
    return { category: group.label, month: group.total, typical, delta: typical === null ? null : roundToCents(group.total - typical), rows: group.rows };
  });

  const risen = categories
    .filter((line) => line.typical !== null && line.typical > 0 && line.delta !== null
      && line.delta >= REVIEW_RISE_MIN_EUR && line.delta / line.typical >= REVIEW_RISE_MIN_SHARE)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 5);
  const newCategories = categories.filter((line) => line.typical === 0).map((line) => line.category);

  const frequent = totalsBy(expenses, monthQuery, 'subcategory', todayIso).groups
    .filter((group) => group.rows >= REVIEW_FREQUENT_ROWS)
    .slice(0, 5)
    .map(({ label, rows, total }) => ({ label, rows, total }));

  const all = listRows(expenses, monthQuery, 'date-asc', REVIEW_ROWS_CAP, todayIso, REVIEW_ROWS_CAP);
  const largestRows = listRows(expenses, monthQuery, 'amount-desc', 10, todayIso).shown;
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
 * The cuts that may be printed: the category is one of the month's, the saving is positive and not
 * above what that category spent, no category twice, at most five. Fewer than three is still an
 * answer; none is «no cuts section».
 */
export function keepValidCuts(cuts: readonly SpendingCut[], review: SpendingReview): SpendingCut[] {
  const spent = new Map(review.categories.map((line) => [foldName(line.category), line] as const));
  const seen = new Set<string>();
  const kept: SpendingCut[] = [];
  for (const cut of cuts) {
    const key = foldName(cut.category);
    const line = spent.get(key);
    if (!line || seen.has(key)) continue;
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

Ricevi: i totali già calcolati (il mese, il mese tipico, ogni categoria contro la sua media, che cosa è salito, che cosa è nuovo, le voci piccole che si ripetono, gli impegni ricorrenti, lo stato del budget) e TUTTE le righe del mese.

Proponi da 3 a 5 tagli, dal più grande al più piccolo. Ogni taglio:
- riguarda UNA categoria, scritta esattamente come compare nei dati;
- ha un risparmio mensile in euro che discende dalle righe: la somma delle righe che non rifaresti, o la differenza tra questo mese e la media della categoria. Mai più di quanto la categoria ha speso nel mese;
- dice perché in una frase che cita le righe o i numeri («4 consegne a domicilio, 86 €»), e come in una frase concreta.
Non proporre mai di tagliare una rata di mutuo o di prestito, le imposte, le spese mediche, né una voce che compare una volta sola ed è già finita. Non inventare righe né cifre: i conti sono fatti, usali. Niente premesse, niente morale, niente consigli generici («fai un budget»).
Se il mese non offre tre tagli difendibili, proponine meno.
`closing` è UNA riga: il risparmio mensile totale dei tagli e quanto fa in un anno.
```

- The output: `spendingReviewAnswerSchema = z.object({ cuts: z.array(z.object({ title: z.string().min(1).max(80),
  category: z.string().min(1).max(80), monthlySaving: z.number(), why: z.string().min(1).max(240), how:
  z.string().min(1).max(240) })).max(8), closing: z.string().max(240) })`, sent as `output_config: { effort: 'high',
  format: { type: 'json_schema', schema: betaZodOutputFormat(spendingReviewAnswerSchema).schema } }` — the call shape
  of the Consulente's structured stages (`lib/server/allocationAdvice/run.ts:133`, `:177-198`):
  `anthropic.beta.messages.stream({ model: EMAIL_ANALYSIS_MODEL, betas: [SERVER_SIDE_FALLBACK_BETA], fallbacks:
  'default', max_tokens: 16000, system: SPENDING_REVIEW_SYSTEM, thinking: { type: 'adaptive' }, output_config,
  messages: [{ role: 'user', content }] }).finalMessage()`. The text block is `JSON.parse`d and `safeParse`d; a
  `stop_reason` other than `end_turn`, a parse failure or a throw → `null`, logged.
- The user content, built by `formatSpendingReviewForPrompt(review, budget)`: «MESE: ottobre 2026 (dal … al …)»,
  «TOTALE», «MESE TIPICO», «PER TIPO», «CATEGORIE (mese · media · differenza · righe)», «SALITE», «NUOVE», «VOCI CHE
  SI RIPETONO», «IMPEGNI RICORRENTI: …», «BUDGET (voce · tetto · speso)», then «RIGHE DEL MESE ({n}{, omesse m})»,
  one line per row: `{date} | {type} | {category} › {subCategory} | {amount} | {ricorrente} | {notes}`.
- The closing is ALWAYS code: «In tutto: {sum} € al mese, {sum × 12} € in un anno.», where `sum` is the total of the
  KEPT cuts. The model's `closing` is never printed (it is in the schema so the model states its own total, which the
  log compares with the code's: a difference above 1 € is logged as `[spending-review] closing mismatch`).
- `buildAndSendSpendingReview(userId, recipients, year, month, now): Promise<boolean>`:
  1. `const context = await buildAssistantToolContext(userId, now)` (DATI-09);
  2. `const review = buildSpendingReview(context.expenses, year, month, getItalyDateIso(now))`; `review.rows === 0`
     → `false`;
  3. `const budget = await budgetState.run({ year, month }, context)` (the `budget_stato` tool's own function);
  4. the model's cuts → `keepValidCuts`;
  5. `sendSpendingReviewEmail(recipients, html)` through the same Resend client and sender as
     `sendMonthlyEmail` (`monthlyEmailService.ts:1897-1917`), subject «Revisione delle spese · {mese anno}».
- The HTML, `generateSpendingReviewHtml(review, budget, cuts, closing)`, on the periodic email's shell and
  `printTokens`: verdict (`describeReviewVerdict`) → the link button (DATI-10) → tile «Dove sono andati» (the
  categories, month against typical, the first eight and «altre») → tile «Cosa è salito» (risen and new; omitted
  when empty) → tile «Voci che si ripetono» (omitted when empty) → tile «Budget» (only the lines over their ceiling;
  omitted when none or not configured) → section «Dove puoi tagliare», marked as written by the AI (the email's AI
  accent): one card per cut — title, «{monthlySaving} € al mese · {× 12} € l'anno», why, how — then the closing →
  tile «Le spese più grandi» (ten rows). Without valid cuts the section is replaced by one line: «Questo mese l'AI
  non ha proposto tagli.»

### 4.3 The schedule, the cron, the setting

- `lib/utils/emailSchedule.ts` (C5): `export const SPENDING_REVIEW_KIND = 'spending-review';` and
  `export function spendingReviewDueOn(todayIso: string): { year: number; month: number; periodKey: string } | null` —
  the same three-day window as `emailsDueOn`, the month from `lastClosedMonth`.
- New route `app/api/cron/spending-review/route.ts`: `export const maxDuration = 300;` `verifyCronSecret` as the
  snapshot cron (`app/api/cron/monthly-snapshot/route.ts:67-74`); for each user but the demo one: the setting on and
  recipients present → `claimEmailDelivery(userId, SPENDING_REVIEW_KIND, periodKey, now)` → send →
  `confirmEmailDelivery` / `releaseEmailDelivery` exactly as DATI-10 § 4.3. Answers `{ success, emails: { sent,
  skipped, errors } }`.
- `vercel.json` crons: a third entry `{ "path": "/api/cron/spending-review", "schedule": "30 18 * * *" }`.
- `app/api/user/monthly-email/send/route.ts`: `periodType: 'spending-review'` → the last closed month, the setting
  required, `confirmEmailDelivery(…, true)`.
- Setting `spendingReviewEmailEnabled?: boolean` (default false) in the five places (`types/assets.ts:491`,
  `getSettings`, `setSettings`, `settingsDraft.ts`, `getSettingsAdmin`) and the fixtures; `describeEmails` counts it
  («Mensile, annuale e revisione delle spese»).
- `components/settings/tabs/GeneraleTab.tsx`, tile «Email periodiche»: a third row «Revisione delle spese» — «Il 1°
  di ogni mese: le spese del mese appena chiuso, riga per riga, con i tagli proposti dall'AI» — its switch and its
  «Invia ora la revisione di {mese anno}».

## 5. Constraints and traps

- **C5 is used IDENTICAL**: the ledger's three functions and the three-day window; this spec adds a kind, not a
  mechanism.
- **Settings — the FIVE places** (doc/guide/impostazioni.md): the new flag enters all five and `WRITTEN_KEYS`.
- **Classification by `type`, transfers out, the Italian day**: inherited from the queries — R1 holds it here too.
- **Opus 5.5 refuses a forced `tool_choice`**: the structured answer goes through `output_config.format`, as the
  Consulente's.
- **The model's figures are never printed unchecked**: `keepValidCuts` is the gate; the closing's sums are code.
- **The Out-Of-DOM Token Rule** and the email's AI accent (doc/guide/email-pdf.md): the cuts' section is the only
  generated part and is marked.
- **`vercelConfig.test.ts`** holds the crons and the functions' config: the third cron and `maxDuration` are
  asserted there.
- **A probe never opens a control that spends**: Resend and the model are mocked in every automated step.
- **No owner data**: fixtures are «Consegne a domicilio 20 €» × 5, «Abbonamento 15 €», «Mutuo 500 €».

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| R1 | unit · `__tests__/spendingReview.test.ts` | the month's total excludes a transfer and an income row; a row at Italian midnight of the 1st of the next month is out | `toISOString` day |
| R2 | unit · same | twelve months of history with one empty month before the first row → `historyMonths` counts from the first row; the typical total is the median | mean |
| R3 | unit · same | a category at 130 against an average of 100 is «risen»; at 110 it is not (below the share); at 100,50 against 85 it is not (below the euro) | drop one threshold |
| R4 | unit · same | a category absent from the history is «new»; five rows in one subcategory are «frequent», three are not | `>=` → `>` on the count |
| R5 | unit · same | 450 rows → 400 in `allRows`, `omittedRows: 50`, `committedTotal: null`; 20 rows with two recurring → their sum | sum of the shown when omitted |
| R6 | unit · same | two months of history → `typicalTotal: null`, the verdict says «Servono almeno 3 mesi»; the three verdict sentences (more, less, same) | typical from one month |
| K1 | unit · same | `keepValidCuts`: an unknown category, a saving above the category's month, a saving of zero, a repeated category are dropped; the category's spelling becomes the data's; at most five | no ceiling check |
| K2 | unit · same | one valid cut of eight proposed → one kept (fewer than three is allowed) | return `[]` under three |
| A1 | unit · `__tests__/spendingReviewEmailService.test.ts` (new) | the request: model `claude-opus-5-5`, a `json_schema` format, no `tool_choice`, the static system; the user content has every row of the fixture and the budget lines | rows capped at 10 |
| A2 | unit · same | the model throwing, a `max_tokens` stop, invalid JSON → the email is sent with «Questo mese l'AI non ha proposto tagli.»; no rows in the month → not sent | throw to the caller |
| H1 | unit · same | the HTML: the verdict before any tile; one card per kept cut with «€ al mese · € l'anno»; the code closing equals the sum of the kept cuts × 12 | print the model's sum |
| U1 | unit · `__tests__/emailSchedule.test.ts` | `spendingReviewDueOn`: 1–3 November → October; 4 November → null | no window |
| C1 | unit · `__tests__/cronSpendingReview.test.ts` (new) | 401 without the secret; the demo user skipped; a second run sends nothing; a failed send releases the claim | confirm before sending |
| C2 | unit · same | setting off → skipped, no claim taken | claim first |
| V1 | unit · `__tests__/vercelConfig.test.ts` | three crons, the new path at `30 18 * * *`; the route exports `maxDuration` 300 | — |
| S1 | unit · `__tests__/settingsDraft.test.ts`, `__tests__/monthlyEmailSendRoute.test.ts` | the flag is written and read; «Invia ora» with `spending-review` sends the last closed month | — |
| D1 | dom · `__tests__/generaleTab.email.test.tsx` | the tile has three switches; the third is off by default | — |
| E1 | e2e · `e2e/settings.spec.ts` | toggling «Revisione delle spese» and saving persists | — |

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: on a seeded month with five «Consegne a domicilio» rows, one new subscription and a
category 40% above its average, the email's verdict states the month against the typical one, the tiles show the
three facts, and (with a canned model answer) three cut cards whose yearly figure is twelve times the monthly one; a
canned cut above its category's spending does not appear.

- A — the diff; the system prompt read aloud. B–E on the emulators with Resend and the model mocked: B the cron on
  1 November (one email, the ledger written); C the second run; D two months of history (no typical figures); a
  month with no rows (nothing sent); a failing model (the line in place of the cuts); E the render at 390, 600 and
  1440, light and dark; the settings row at 1440 and 390. Decoys: «ornitorinco» (a transfer of 9.999 €: in no
  total) and «fenicottero» (a canned cut on a category the month lacks: not printed).
- F — at the owner's «pronto», on the mirror: «Invia ora la revisione» to his own address — the one step that sends
  and spends. He reads the cuts against his month in Cashflow › Analisi: each figure must be findable there.

## 8. Putting it into service

No rule (the ledger's is DATI-10's), no index. After the deploy: Vercel › Cron Jobs lists three entries (the owner's
check); the switch is off until he turns it on. The first automatic review is the 1st of the following month.

## 9. Documentation

- `doc/guide/email-pdf.md` — § «Revisione delle spese»: what code computes and what the model writes, the gate on
  the cuts, the thresholds and why, the cron, the failure modes; § blind spots: a month above 400 rows is reviewed on
  its first 400; an instalment is never a cut; the cuts are proposals on one month, not a plan.
- `doc/guide/impostazioni.md` — the third row. `doc/guide/server.md` — the third cron.
- `README.md` — the emails' feature lines. `AGENTS.md` § 3 — the emails' stub.
- `CLAUDE.md` — «Periodic emails» line: «… and a monthly spending review with the AI's cuts (2026-11)», under
  20.000 characters.
- `Draft Release Temp.md` — «Nuova email «Revisione delle spese»: ogni mese l'AI rilegge le spese riga per riga e
  propone da tre a cinque tagli con la loro cifra».
- `doc/dati/README.md` § 6.

## 10. Declared out of scope

- A yearly review → doc/guide/email-pdf.md § blind spots (a year is some 50 thousand tokens of rows: a different
  shape).
- Tracking whether a proposed cut was followed the next month → doc/guide/email-pdf.md § blind spots.
- The review inside the app (a page or a tile) → not planned; the Assistente answers the same question with its
  tools (DATI-09).
- Per-recipient switches → doc/guide/impostazioni.md § blind spots.

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
  condivisi — qui C5 e C3, da usare IDENTICI —, regole della serie)
- Leggi doc/guide/email-pdf.md, doc/guide/assistente.md (§ The tools), doc/guide/cashflow.md,
  doc/guide/cashflow-budget.md, doc/guide/impostazioni.md (§ Settings — the FIVE places) e
  doc/guide/server.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (The Out-Of-DOM Token Rule, The AI-Accent Rule) e PRODUCT.md prima di
  disegnare
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

Implementa la spec così com'è scritta, nell'ordine: il modulo della revisione con R1–R6, K1, K2 (ognuno
visto rosso con la sua mutazione), il servizio — richiesta al modello, HTML, invio — (A1, A2, H1), la
scadenza e il cron (U1, C1, C2, V1), l'impostazione e «Invia ora» (S1, D1), poi E1. Il codice del § 4.1 e
il prompt di sistema del § 4.2 sono già scritti: copiali.

Fermati e chiedimi se: DATI-09 o DATI-10 non sono in develop (le interrogazioni pure, il registro degli
invii), l'anteprima di Vercel rifiuta il terzo cron, oppure una verifica automatica manderebbe un'email
vera o chiamerebbe il modello.

Collaudo: § 7, la F al mio «pronto» (un «Invia ora la revisione» vero, verso il mio indirizzo). Un
branch, un commit, solo dopo il mio OK con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an L spec with a new cron, a model request with a structured answer and a
gate on its figures, on two shared contracts. Estimated size: L (two new modules, one route, the setting's fan-out,
~18 tests).
