# DATI-10 — Periodic emails: two kept, three removed, sent the day after the period closes, once

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-08 (the shared core the emails read is
> rewritten there, and the form of the chat's answer is out of it). DATI-11 depends on it.
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276 (a line number is a hint, the function's name is the
> anchor). Owner's point 9; decisions 24, 26, 27, 75 and 76. Defines the shared contract **C5** (what is due when,
> the delivery ledger, the email's link, index § 7).

## 1. The problem today (evidence on the code)

Five emails leave from one cron route (`app/api/cron/monthly-snapshot/route.ts`, daily at 18:00 UTC, `vercel.json:3-7`):
monthly (`:151-187`), quarterly (`:189-224`), half-yearly (`:226-264`), yearly (`:266-300`) and the Sunday budget
email (`:302-334`). The owner keeps the monthly and the yearly. What is wrong with those two:

1. **They leave before the period is over.** The monthly goes on the LAST day of the month at 18:00 UTC
   (`isLastDayOfMonthItaly`, `lib/server/monthlyEmailService.ts:184-192`; the yearly on 31 December, `:211`): the
   evening's rows are missing, and the AI bundle prints «{label} non è ancora concluso: i dati del periodo sono
   parziali» (`lib/services/assistantMonthContextService.ts:1246-1248`), which the comment repeats.
2. **The data window is in the server's zone, not Italy's**: `new Date(year, windowStartMonth - 1, 1)` …
   `new Date(year, month, 0, 23, 59, 59)` (`monthlyEmailService.ts:1206-1209`; the comparison,
   `lib/server/emailPeriodComparison.ts:154-155`), while the AI bundle uses the Italian bounds
   (`assistantMonthContextService.ts:1177`): a row of the 1st, at Italian midnight, falls in the previous month's email.
3. **Nothing makes a send happen once**: a second run of the cron on the same day sends again; a failed run sends
   never. No record of what was sent exists.
4. **No way back to the app**: the email has no link.
5. On 31 December four emails leave together, each with its own model call and its own read of the whole history;
   the Sunday «weekly» budget email is not weekly at all (it shows the current month and year,
   `lib/server/weeklyBudgetEmailService.ts:132-215`).
6. The cron route declares no `maxDuration`; the comment runs on Sonnet 5.5 (`lib/constants/aiModels.ts:54`), on a
   request that is not streamed (`anthropic.beta.messages.create`, `monthlyEmailService.ts:824`).
7. «Invia ora» (`app/api/user/monthly-email/send/route.ts`) reads any unknown `periodType` as `monthly` and does
   not refuse the demo account.

## 2. Goal and acceptance criteria

1. Only two periodic emails exist: «Mensile» and «Annuale». The quarterly, the half-yearly and the Sunday budget
   email are gone from the cron, the manual send, the settings, the UI and the code. Proof: C1, S2, N1, D1, the grep
   of § 6.
2. The monthly email of a month leaves on the 1st of the next month (Italian date); the yearly on 1 January, beside
   December's monthly. A run on the 2nd or 3rd sends what the 1st did not. Proof: U1, C2.
3. Each (account, kind, period) is sent at most once by the cron; a failed send frees the period for the next run;
   a send that went out is never freed. Proof: U2, L1, C3.
4. The data window is the Italian one: a row at Italian midnight of the 1st belongs to its own month, under `TZ=UTC`
   and `Europe/Rome`. Proof: W1, W1b.
5. The email is always about a CLOSED period — the cron's and «Invia ora»'s — so its bundle never meets the «non è
   ancora concluso» note. Proof: C2, S2.
6. The email has one link, «Apri Net Worth Tracker», when `NEXT_PUBLIC_APP_URL` is set and begins with `https://`;
   none otherwise. Proof: H1.
7. The AI comment runs on Opus 5.5, on a streamed request; a truncated comment is still dropped, never sent cut.
   Proof: A1.
8. The emails leave from their OWN cron (`/api/cron/periodic-emails`, 19:00 UTC), an hour after the snapshots; both
   cron routes declare `maxDuration = 300`. Proof: C0, V1.
9. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green;
   `npm run perf:budget` green with no ceiling raised (the settings page only loses code).

## 3. Decisions

- **Decision 24** (owner, 2026-11-23): keep «Mensile» and «Annuale»; remove the quarterly, the half-yearly and the
  Sunday budget email.
- **Decision 26** (owner, 2026-11-23): send the day after, with the period closed.
- **Decision 27** (owner, 2026-11-23): the emails' model is Opus 5.5, like the Assistente's.
- **Decision 75** (owner, 2026-11-23): the periodic emails get a cron of their own, and the comment keeps effort
  `high`. The hours, one per cron (Vercel fires a daily cron anywhere inside its hour): snapshots and dividends at
  18:00 UTC, the periodic emails at 19:00, the spending review (DATI-11) at 20:00.
- **Decision 76** (owner, 2026-11-23): the reading of the tile «Email periodiche» keeps the number of recipients
  and its warning when there is none.
- Adopted, reversible:
  - (a) a catch-up window of three days: due on the 1st, sent on the 2nd or the 3rd if the 1st failed; after that
    «Invia ora» is the way.
  - (b) the ledger is a server-only collection, one document per send; «Invia ora» ignores it (the owner asked) and
    records its send.
  - (c) a claim left «sending» for more than 30 minutes (a crashed run, or a confirm that failed after the email
    went out) can be taken again: in the second case the next day's run sends the period a second time.
  - (d) the stored settings keep their three dead flags; nothing reads them (no migration).
  - (e) the comment keeps its six sections; its budget goes to 16.000 tokens (monthly) and 24.000 (yearly), effort
    `high` — a batch has no reader waiting, and Opus 5.5 thinks inside the same budget. The request is streamed:
    above 21.333 tokens the SDK refuses one that is not.
  - (f) on 1 January both emails leave: they answer different questions. Their two comments are written side by
    side, never one after the other — two `high` requests in a row do not fit 300 seconds — so the order they
    reach the inbox in is not fixed.
  - (g) a kind switched on during the first three days of a month receives the month just closed.
  - (h) «Invia ora» refuses the demo account (403) and any `periodType` it does not know (400).

## 4. Solution

### 4.1 What is due — `lib/utils/emailSchedule.ts` (new, written here) — contract C5

```ts
/**
 * Which periodic emails are due on an Italian day, and whether one may still be sent.
 *
 * An email is about a CLOSED period and leaves the day after it ends (owner, 2026-11-23: it used to
 * leave on the period's last evening, with the day's rows missing and a note saying so). The cron
 * that sends it runs daily: the first three days of a month are its window, and a ledger of what
 * was sent makes each period go out once.
 */
export type PeriodicEmailKind = 'monthly' | 'yearly';

export interface DueEmail {
  kind: PeriodicEmailKind;
  /** The period's year and its LAST month (12 for a year). */
  year: number;
  month: number;
  /** «2026-10» for a month, «2026» for a year: the period's name in the ledger. */
  periodKey: string;
}

/** The days of a month on which the email of the period just closed may still leave. */
export const EMAIL_CATCH_UP_DAYS = 3;

export function monthPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** The month that ended before the Italian day `todayIso`. */
export function lastClosedMonth(todayIso: string): { year: number; month: number } {
  const [year, month] = todayIso.split('-').map(Number);
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

/** The year that ended before the Italian day `todayIso`. */
export function lastClosedYear(todayIso: string): number {
  return Number(todayIso.slice(0, 4)) - 1;
}

/** What may leave today, in sending order: the month just closed and, in January, the year just closed. */
export function emailsDueOn(todayIso: string): DueEmail[] {
  if (Number(todayIso.slice(8, 10)) > EMAIL_CATCH_UP_DAYS) return [];
  const closed = lastClosedMonth(todayIso);
  const due: DueEmail[] = [{ kind: 'monthly', ...closed, periodKey: monthPeriodKey(closed.year, closed.month) }];
  if (closed.month === 12) due.push({ kind: 'yearly', year: closed.year, month: 12, periodKey: String(closed.year) });
  return due;
}

export type EmailDeliveryStatus = 'sending' | 'sent';

/** A claim older than this with no «sent» belongs to a run that died. */
export const EMAIL_CLAIM_STALE_MS = 30 * 60 * 1000;

/** Whether a run may take this (account, kind, period): never sent, and not being sent right now. */
export function canClaimDelivery(existing: { status: EmailDeliveryStatus; claimedAtMs: number } | null, nowMs: number): boolean {
  if (!existing) return true;
  return existing.status === 'sending' && nowMs - existing.claimedAtMs > EMAIL_CLAIM_STALE_MS;
}

export function emailDeliveryId(userId: string, kind: string, periodKey: string): string {
  return `${userId}_${kind}_${periodKey}`;
}
```

`kind` in `emailDeliveryId` is a `string` on purpose: DATI-11 files its own kind in the same ledger.

### 4.2 The ledger — `lib/server/emailDeliveries.ts` (new)

Collection `emailDeliveries`, document `emailDeliveryId(userId, kind, periodKey)`:
`{ userId, kind, periodKey, status: 'sending' | 'sent', claimedAt: Timestamp, sentAt?: Timestamp, manual?: true }`.

```ts
export const EMAIL_DELIVERIES_COLLECTION = 'emailDeliveries';
/** Takes the period for this run in a transaction (read, then `canClaimDelivery`, then write «sending»). */
export async function claimEmailDelivery(userId: string, kind: string, periodKey: string, now: Date): Promise<boolean>;
/** The send went out. */
export async function confirmEmailDelivery(userId: string, kind: string, periodKey: string, now: Date, manual?: boolean): Promise<void>;
/** The send failed or there was nothing to send: the period is free for the next run. */
export async function releaseEmailDelivery(userId: string, kind: string, periodKey: string): Promise<void>;
```

- `firestore.rules`: after the `budgetHistory` block, `match /emailDeliveries/{deliveryId} { allow read, write: if
  false; }` with the comment «Server-only: what the cron sent, so a period leaves once (2026-11-23).»
- `scripts/mirrorCollections.ts:7`: `'emailDeliveries'` joins `USER_COLLECTIONS` (documents carrying `userId`):
  `mirror:seed` copies the account's ledger, so a cron run on the emulators does not send again what production
  sent, and `mirror:remove` deletes it.
- The writes: `claimEmailDelivery` is a transaction — one `get`, `canClaimDelivery`, one `set` of `{ userId, kind,
  periodKey, status: 'sending', claimedAt: now }`; `confirmEmailDelivery` is a `set` with `merge` of `{ userId, kind,
  periodKey, status: 'sent', sentAt: now }`, plus `manual: true` when asked and `claimedAt: now` when the document
  did not exist — valid with no claim before it, which is how «Invia ora» records its send; `releaseEmailDelivery`
  deletes the document in a transaction, and only when its status is `'sending'` (a «sent» is never released).

### 4.3 The crons

**`app/api/cron/monthly-snapshot/route.ts`** — `export const maxDuration = 300;`; phases 2–6 (`:151-334`) are
deleted with their imports and counters. `const now = new Date()`, declared today at the top of phase 2, stays,
moved above phase 7: the goals and budget-history phases read it and are otherwise untouched. The response's
`emailSummary`, `quarterlyEmailSummary`, `semiAnnualEmailSummary`, `yearlyEmailSummary` and
`weeklyBudgetEmailSummary` keys go: this route sends no email.

**`app/api/cron/periodic-emails/route.ts`** (new) — the secret check of the snapshot cron (`verifyCronSecret`,
`:67-74`), then:

```ts
export const maxDuration = 300;

type Outcome = 'sent' | 'skipped' | 'errors';

export async function GET(request: NextRequest) {
  // …the snapshot cron's secret check, 401 otherwise.
  const now = new Date();
  const due = emailsDueOn(getItalyDateIso(now));
  const emails: Record<Outcome, number> = { sent: 0, skipped: 0, errors: 0 };
  // Twenty-seven days a month there is nothing to send: no read at all.
  if (due.length === 0) return NextResponse.json({ success: true, emails });

  const usersSnapshot = await adminDb.collection('users').get();
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) {
      emails.skipped += due.length;
      continue;
    }
    let settings: Awaited<ReturnType<typeof getSettingsAdmin>>;
    try {
      settings = await getSettingsAdmin(userId);
    } catch (settingsError) {
      console.error(`[cron] email settings unreadable for user ${userId}:`, settingsError);
      emails.errors += due.length;
      continue;
    }
    // On 1 January two comments are due: side by side — two `high` requests in a row do not fit 300 s.
    const outcomes = await Promise.all(due.map((email) => sendDueEmail(userId, settings, email, now)));
    for (const outcome of outcomes) emails[outcome] += 1;
  }
  return NextResponse.json({ success: true, emails });
}

/** One (account, kind, period): claimed, sent, confirmed. Never throws. */
async function sendDueEmail(
  userId: string,
  settings: Awaited<ReturnType<typeof getSettingsAdmin>>,
  due: DueEmail,
  now: Date,
): Promise<Outcome> {
  const enabled = due.kind === 'monthly' ? settings?.monthlyEmailEnabled : settings?.yearlyEmailEnabled;
  const recipients = settings?.monthlyEmailRecipients ?? [];
  if (!enabled || recipients.length === 0) return 'skipped';
  try {
    if (!(await claimEmailDelivery(userId, due.kind, due.periodKey, now))) return 'skipped';
  } catch (claimError) {
    console.error(`[cron] ${due.kind} claim failed for user ${userId}:`, claimError);
    return 'errors';
  }
  let sent: boolean;
  try {
    sent = await buildAndSendForPeriod(userId, recipients, due.kind, due.year, due.month);
  } catch (sendError) {
    console.error(`[cron] ${due.kind} email failed for user ${userId}:`, sendError);
    await releaseEmailDelivery(userId, due.kind, due.periodKey).catch(() => undefined);
    return 'errors';
  }
  if (!sent) {
    // Nothing to send (no snapshot for the period): free for tomorrow's run.
    await releaseEmailDelivery(userId, due.kind, due.periodKey).catch(() => undefined);
    return 'skipped';
  }
  // The email is out: a confirm that fails must NOT free the period — it would leave twice today.
  try {
    await confirmEmailDelivery(userId, due.kind, due.periodKey, new Date());
  } catch (confirmError) {
    console.error(`[cron] confirm failed for user ${userId} (${due.kind} ${due.periodKey}):`, confirmError);
  }
  return 'sent';
}
```

**`vercel.json`** — a third cron, `{ "path": "/api/cron/periodic-emails", "schedule": "0 19 * * *" }`; the two
existing ones keep 18:00. 19:00 UTC is 20:00 or 21:00 in Rome: the same Italian day as the snapshot's.

### 4.4 The service — `lib/server/monthlyEmailService.ts`

- `EmailPeriodType = 'monthly' | 'yearly'` (`:113`); deleted with their tests: `isLastDayOfMonthItaly`,
  `isLastDayOfQuarterItaly`, `isLastDayOfYearItaly`, `isLastDayOfHalfYearItaly`, `monthToQuarter`,
  `getQuarterStartMonth`, `getPreviousQuarterEnd`, `getMostRecentCompletedQuarterEnd`, `monthToSemester`,
  `getSemesterStartMonth`, `getPreviousHalfEnd`, `getMostRecentCompletedHalfYearEnd`,
  `getMostRecentCompletedYearEnd` (`:184-340`), `buildAndSendQuarterly`, `buildAndSendSemiAnnual`,
  `buildAndSendYearly` (`:1969-2000`; the cron and the manual route call `buildAndSendForPeriod`), every `quarterly` /
  `semiannual` branch (`getPeriodWindowStartMonth` `:396`, `buildPeriodEmailData` `:1190-1204`, `periodTitle`, the
  budgets `EMAIL_AI_MAX_TOKENS` `:752-757` → `{ monthly: 16000, yearly: 24000 }`).
- **The other readers of what is deleted**, each cleaned in this session: `lib/server/emailPeriodComparison.ts` (its
  imports of the quarter and half-year helpers and its `quarterly` / `semiannual` branches);
  `lib/utils/emailNarrative.ts` (`EmailPeriodKind = 'monthly' | 'yearly'`, the `quarter` and `semester` fields of the
  period, the two branches of the period's name and noun, with their cases in its test);
  `__tests__/cronSecretAuth.test.ts` (the four `isLastDayOf…Italy` names leave its mock of the service);
  `__tests__/monthlyEmailService.test.ts` and `__tests__/settingsNarrative.test.ts` (the cases on the removed
  periods and flags). `e2e/cashflow.centri.spec.ts` and `e2e/ring-chart.centri*.spec.ts` hold a local
  `isLastDayOfYear` of their own: not this one, not touched.
- **The window** (`:1206-1209`): `const windowStart = getItalyMonthBoundsUtc(year, windowStartMonth).start;`
  `const windowEnd = getItalyMonthBoundsUtc(year, month).end;` (`lib/utils/dateHelpers.ts:166`); the same two bounds in
  `lib/server/emailPeriodComparison.ts:154-155` for each compared period.
- **The link** — `lib/server/emailHtml.ts`, where the emails' chrome lives, gains
  `export function emailAppLink(appUrl: string | undefined): string`: `''` when `appUrl` is absent or does not begin
  with `https://`; else one table-cell button «Apri Net Worth Tracker» → `${appUrl without its trailing
  slashes}/dashboard`, styled from `printTokens` (DESIGN → The Out-Of-DOM Token Rule), the same at 390, 600 and
  1440. `generateEmailHtml` (`:1687`) prints `emailAppLink(process.env.NEXT_PUBLIC_APP_URL)` right under the
  verdict. DATI-11 calls the same function.
- **The model**: `lib/constants/aiModels.ts:54` `EMAIL_ANALYSIS_MODEL = 'claude-opus-5-5'` («The prose of the periodic
  emails (Opus 5.5 since 2026-11-23, owner's decision)»). The request (`:825-832`) already sends adaptive thinking,
  `output_config: { effort: 'high' }` and the fallback beta — all accepted by Opus 5.5. It becomes
  `anthropic.beta.messages.stream({ …the same parameters }).finalMessage()`: the SDK throws «Streaming is required»
  for a non-streamed request above 21.333 `max_tokens`, so at 24.000 the yearly would always leave without its
  comment. The handling of the returned message (the text blocks, `stop_reason === 'max_tokens'` → no comment) is
  unchanged.
- `lib/server/assistant/prompts.ts:880-887`: `EmailPeriodicPeriodType = 'monthly' | 'yearly'`, `EMAIL_PERIOD_SCOPE`
  loses two keys; section 4 of the contract («se il periodo è annuale…», `:910`) is unchanged.
- `lib/services/assistantMonthContextService.ts:1246-1248`: the note stays (the Assistente's own ranges can be in
  progress); the email no longer meets its condition.
- Deleted: `lib/server/weeklyBudgetEmailService.ts`, `__tests__/weeklyBudgetEmail*.test.ts`, and the helpers only it
  used (a grep per export before deleting; `overspendHtml` and `generateWeeklyBudgetComment` go with the file).

### 4.5 «Invia ora» — `app/api/user/monthly-email/send/route.ts`

The `weekly-budget` branch (`:43-56`) and the quarterly/half-yearly ones (`:58-97`) go. `periodType` absent →
`'monthly'`; `'monthly'` and `'yearly'` are accepted; any other value (`'quarterly'`, `'semiannual'`,
`'weekly-budget'` included) → 400 `{ error: 'periodType non valido' }` before any read. The demo account
(`decodedToken.uid === process.env.NEXT_PUBLIC_DEMO_USER_ID`) → 403 `{ error: 'Non disponibile in demo' }`. The
period is `lastClosedYear(todayIso)` with month 12, or `lastClosedMonth(todayIso)` — never the month in progress
(`:76` today) — with `todayIso = getItalyDateIso(new Date())`. After a successful send:
`confirmEmailDelivery(userId, kind, periodKey, now, true)` in a `try` of its own — a failed confirm is logged and
the route still answers that the email went. The route keeps answering for the token's own uid (`:37`): a
co-owner's «Invia ora» reads the co-owner's own settings, as today.

### 4.6 Settings

`quarterlyEmailEnabled`, `semiAnnualEmailEnabled`, `weeklyBudgetEmailEnabled` leave: `types/assets.ts:491-492`,
`getSettings` (`lib/services/assetAllocationService.ts:170`), `setSettings` (`:412-414`, `:615-617`),
`lib/utils/settingsDraft.ts` (`:174`, `:414`, `:570`), `getSettingsAdmin` (`monthlyEmailService.ts:876`),
`__tests__/fixtures/storedSettings.ts:130-131`, `WRITTEN_KEYS` (`__tests__/settingsDraft.test.ts:46-49`),
`describeEmails` (`lib/utils/settingsNarrative.ts:361-380`): `EmailsInput` loses `quarterly`, `semiAnnual` and
`weeklyBudget`, and the function their three names; its sentences stay as they are (decision 76) — «Report mensile
e annuale attivi, verso 2 destinatari.», «Report mensile attivo, ma senza destinatari: aggiungi un indirizzo o non
parte nulla.», «Nessun report attivo: nessuna email in partenza.».

`components/settings/tabs/GeneraleTab.tsx:602-727`, tile «Email periodiche»: two rows — «Mensile» («Il 1° di ogni
mese, sul mese appena chiuso») and «Annuale» («Il 1° gennaio, sull'anno appena chiuso») — each with its switch and
its «Invia ora» («Invia ora il riepilogo di {mese anno}» / «…del {anno}», the last closed period, from
`lastClosedMonth` / `lastClosedYear` on `getItalyDateIso(new Date())`); the recipients field unchanged. The button
is shown as today (its switch on, in the saved settings) and its hint becomes «Manda adesso il riepilogo
dell'ultimo periodo chiuso, anche se è già partito.» The three removed rows and their handlers go.

## 5. Constraints and traps

- **Settings — the FIVE places** (doc/guide/impostazioni.md): here it means the three flags leave ALL five (type,
  get, set, draft, admin getter) and the fixtures — S1's `WRITTEN_KEYS` proves the set side.
- **`removeUndefinedDeep` / no `undefined` to Firestore**: the ledger writes only defined fields.
- **A transaction reads before it writes**: `claimEmailDelivery` is one `get` then one `set`.
- **Italian day and month** (`getItalyDateIso`, `getItalyMonthBoundsUtc`): the emails' cron runs inside the hour
  of 19:00 UTC = 20:00 or 21:00 in Rome, the same Italian day; the due day and the window are both Italian.
- **The snapshot the email reads** is the closed month's, last written by the snapshot cron on that month's last
  evening: the 1st's run writes the NEW month's snapshot and does not touch it, so the two crons' order on the 1st
  does not matter.
- **A cron secret, never a user token** (`verifyCronSecret`, `:67-74`): the new route copies the check.
- **A Vercel function's config is held by `__tests__/vercelConfig.test.ts`**: today it reads `vercel.json` and
  `package.json` only; V1 adds the third cron and reads the two routes' SOURCE for `export const maxDuration =
  300;` (importing a cron route drags its whole module graph).
- **A cron route's cold import is slow under Vitest**: `__tests__/cronSecretAuth.test.ts` imports its route in a
  `beforeAll` with a 60 s timeout; the new test does the same.
- **Never deploy the change of the due day inside its own window**: on days 1–3 the old cron has already sent the
  month just closed and the ledger, born empty, would send it again (§ 8).
- **The Out-Of-DOM Token Rule**: the button's colours come from `printTokens.ts`, not from CSS variables.
- **A probe never opens a control that spends**: no automated step sends through Resend or calls the model — both
  are mocked; the throwaway render (doc/guide/email-pdf.md, the render at 390/600/1440) uses a canned comment.
- **No owner data**: the fixtures' recipient is `census@example.com`.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/emailSchedule.test.ts` | 1 November → October monthly; 3 November → the same; 4 November → nothing; 1 January 2027 → December 2026 then year 2026; 31 October → nothing | due on the last day |
| U2 | unit · same | no record → claimable; «sent» → never, also with a claim two hours old; «sending» 10 minutes old → no; 31 minutes → yes | ignore the status |
| L1 | unit · `__tests__/emailDeliveries.test.ts` (new) | two claims of the same period: the first true, the second false; release → claimable again; confirm → never again; a release after a confirm deletes nothing; a manual confirm with no claim before it writes «sent» with `manual: true` | `set` without the read; `update` in the confirm |
| C0 | unit · `__tests__/cronSecretAuth.test.ts` | `/api/cron/periodic-emails` answers 401 without the secret and reads nothing | drop the check |
| C1 | unit · `__tests__/cronPeriodicEmails.test.ts` (new) | on 4 November, 31 March, a Sunday (8 November) and 30 June: `buildAndSendForPeriod` is never called and `users` is not read | due on the last day |
| C2 | unit · same | 1 November: called once with `monthly, 2026, 10` — never 11; 1 January 2027: called with `monthly, 2026, 12` and `yearly, 2026, 12`, the second started before the first resolves; a disabled kind and an empty recipients list are skipped; the demo user is skipped | one kind only; `await` the two in a row |
| C3 | unit · same | a second run the same day sends nothing; a send that throws releases the claim and the next run sends; a send that returns false releases; a confirm that throws after a send does NOT release (the next run the same day sends nothing) and the run counts it sent | drop the release from the catch; confirm inside the `try` that releases |
| W1 | unit · `__tests__/monthlyEmailService.test.ts` | `buildPeriodEmailData(…, 2026, 11, 'monthly')` queries the expenses and the dividends with `>=` `getItalyMonthBoundsUtc(2026, 11).start` and `<=` its `.end`, under both zones (the file's `buildQueryMock` records the arguments of `where`: today it ignores them) | `new Date(year, month - 1, 1)` |
| W1b | unit · `__tests__/emailPeriodComparison.test.ts` | each compared period is read between its own Italian bounds | `new Date(year, month, 0, 23, 59, 59)` |
| H1 | unit · `__tests__/emailHtml.test.ts` and `__tests__/monthlyEmailService.test.ts` | `emailAppLink('https://example.com/')` has one `<a>` to `https://example.com/dashboard`; `undefined` and `http://localhost:3000` → `''`; the email's HTML has the link right after the verdict | always render; keep the trailing slash |
| A1 | unit · `__tests__/monthlyEmailService.test.ts` | the request goes through `messages.stream` (the spy moves from `create` to `stream`, returning `{ finalMessage }`), its model is `claude-opus-5-5`, the yearly's `max_tokens` is 24000; a `max_tokens` stop still returns no comment | `create` with 24000; return the cut text |
| S1 | unit · `__tests__/settingsDraft.test.ts` | `WRITTEN_KEYS` has no removed flag | keep one flag in `setSettings` |
| S2 | unit · `__tests__/monthlyEmailSendRoute.test.ts` (new) | on 15 November «Invia ora» monthly sends `monthly, 2026, 10`, yearly sends `yearly, 2025, 12`, and each confirms with `manual: true`; no `periodType` → monthly; `weekly-budget` and `quarterly` → 400 with no read; the demo uid → 403; a confirm that throws → still a success | send the current month; fall back to monthly |
| N1 | unit · `__tests__/settingsNarrative.test.ts` | `describeEmails`: both on, two recipients → «Report mensile e annuale attivi, verso 2 destinatari.»; one on, none → the warning; none on → «Nessun report attivo…» | drop the recipients' branch |
| V1 | unit · `__tests__/vercelConfig.test.ts` | three crons, `/api/cron/periodic-emails` at `0 19 * * *`; the source of both cron routes holds `export const maxDuration = 300;` | remove it |
| D1 | dom · `__tests__/generaleTab.email.test.tsx` (new) | the tile has exactly two switches, «Mensile» and «Annuale»; the button reads «Invia ora il riepilogo di ottobre 2026» on 15 November | render a third row |
| E1 | e2e · `e2e/settings.spec.ts` | Impostazioni › Generale: toggling «Annuale» and saving persists; no «Trimestrale», «Semestrale», «Budget» row | keep the «Trimestrale» row |

**The harness of `cronPeriodicEmails.test.ts`**: the route imported in a `beforeAll` with a 60 s timeout;
`vi.setSystemTime` for the day; `@/lib/server/monthlyEmailService` mocked (`getSettingsAdmin`,
`buildAndSendForPeriod`); `@/lib/server/emailDeliveries` REAL on a fake `adminDb` held in a `Map` (`collection().get()`
for `users`, `doc().get/set/delete`, `runTransaction` passing a `tx` with `get`, `set`, `delete`), so C3 runs on the
ledger's own rules; `emailDeliveries.test.ts` uses the same fake.

The grep that closes criterion 1 — on the proper names, since `quarterly` and `semiannual` are also a coupon's and a
pension fund's frequency: `grep -rnE
"quarterlyEmailEnabled|semiAnnualEmailEnabled|weeklyBudget|weekly-budget|buildAndSend(Quarterly|SemiAnnual|Yearly)|isLastDayOf(Month|Quarter|HalfYear|Year)Italy|MostRecentCompleted|monthToQuarter|monthToSemester|QuarterStartMonth|SemesterStartMonth|PreviousQuarterEnd|PreviousHalfEnd|Riepilogo (Trimestrale|Semestrale)"
app lib components types __tests__ e2e scripts` prints nothing.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: with the clock on 1 November the cron sends October's email once, a second run
sends nothing, the email shows October's rows up to the 31st at midnight, no «parziali» note, one button to the app;
Impostazioni shows two emails.

- A — the diff, the list of deleted files. B–E on the emulators with Resend and the model mocked, the emails' cron
  route called with the secret and a pinned clock (`vi.setSystemTime` in a throwaway vitest, not a browser): B 1
  November; C the second run; D 1 January (two emails); a send that fails, then succeeds on the 2nd; E the render
  of the two emails at 390, 600 and 1440 with a canned comment and `NEXT_PUBLIC_APP_URL=https://example.com` (the
  emails have one look, on a white sheet: no dark render); the settings tile at 1440 and 390, light and dark.
  Decoy rows: «ornitorinco» dated 1 November 00:00 Italian (not in October's email), «fenicottero» dated 31 October
  23:30 Italian (in it).
- F — at the owner's «pronto», on the mirror: «Invia ora» for the month, to his own address — the one step that
  sends and spends; he reads the email on his phone.

## 8. Putting it into service

`firebase deploy --only firestore:rules` (the new server-only block) — the owner runs it, one line, expected «rules
released». No index (the ledger is read by document id). The stored dead flags stay.

With phase F closed and the commit in `develop`, the owner opens the PR `develop` → `main` (index § 8 rule 13) —
**from the 4th of the month on**: on days 1–3 the old cron has already sent the month just closed, and the new one
would send it again. The first automatic send is the 1st of the month after the merge; that evening the owner
finds the email in the inbox, or reads the `emails` key of the cron's response in Vercel's log. A third cron fits
every Vercel plan (a hundred a project; on Hobby each runs once a day, inside its hour).

## 9. Documentation

- `doc/guide/email-pdf.md` — the two emails, when they leave and why the day after, their own cron and its hour,
  the ledger (C5), the window in Italian bounds, «Invia ora» on the closed period, the link (`emailAppLink`), the
  streamed request; the sections on the three removed emails deleted; § Per-page blind spots: after the third day
  of the month only «Invia ora» sends, and a cron that missed all three days leaves no trace; a period without a
  snapshot is retried on days 2 and 3, then silently dropped; the ledger does not stop a manual send; a confirm
  that fails after the email went out lets the next day's run send it again; on 1 January the two emails arrive in
  no fixed order; the CASHFLOW block of the comment is read at the send, so the new month's first day is in it; the
  comment keeps its six sections; no unsubscribe link.
- `doc/guide/impostazioni.md` — the tile's two rows. `doc/guide/server.md` — the three crons, their hours and their
  `maxDuration`; § Per-page blind spots: the emails' cron walks the accounts one after the other.
- `doc/guide/cashflow-budget.md` — the weekly email's passages deleted (the suites and its two mentions).
  `doc/guide/assistente.md` — the weekly comment's builder leaves the list of the prompt's readers.
  `doc/guide/e2e-emulatori.md` — `emailDeliveries` among the mirrored collections.
- `DESIGN.md` → The Declared-Window Rule: its second example (the budget email, «sent weekly») removed, by hand,
  nothing else of the rule touched. `PRODUCT.md` — the sentence listing the periodic emails names the two kept.
- `README.md` — the emails' feature lines and the Budget tab's line; `SETUP.md` — `NEXT_PUBLIC_APP_URL` also feeds
  the email's link (`https://` only).
- `AGENTS.md` § 3 — the emails' stub rewritten at equal or shorter length (decision 47). `CLAUDE.md` — the line
  «Periodic emails · budget email · PDF export» becomes «Periodic emails · PDF export», rewritten at equal or
  shorter length with «monthly and yearly, sent the day after the period closes, once»; Data & Integrations: «Opus
  5.5 for the Assistente and the emails, Sonnet 5.5 for Rendimenti's prose, Haiku 5.5 for the extraction and the
  router, Opus 5.5 + Sonnet 5.5 for the Consulente»; the «Latest» entry REPLACED whole (decision 46: the date, this
  spec in one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-11»); under 20.000 characters, counted with
  `node`.
- `Draft Release Temp.md` — two entries prepended, in the file's form: in `## 🔧 Improvements` «**Email — a periodo
  chiuso, una volta sola** — Changed the monthly and yearly emails to leave the day after the period ends, with the
  whole period in them, once, and with a button back to the app.»; in the same section «**Email rimosse** — Removed
  the quarterly, half-yearly and Sunday budget emails.»
- `doc/dati/README.md` § 6 (the row of 10 to `implemented`) and § 7 (C5 as built).

## 10. Declared out of scope

- The email that reviews the spending → DATI-11.
- An unsubscribe link → doc/guide/email-pdf.md § Per-page blind spots (the recipients are the owner's own list in
  Impostazioni).
- The comment's six sections against the Assistente's one form → doc/guide/email-pdf.md § Per-page blind spots (an
  email is scanned by section; the owner asked for the form in the chat).
- The emails' cron in parallel per ACCOUNT → doc/guide/server.md § Per-page blind spots (one account after the
  other inside 300 s, for the accounts there are).
- A notice to the user when a period was never sent → doc/guide/email-pdf.md § Per-page blind spots.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-10-email-tenute-e-giorno-dopo.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C5 —, regole della serie)
- Leggi doc/guide/email-pdf.md, doc/guide/impostazioni.md (§ Settings — the FIVE places),
  doc/guide/server.md, doc/guide/cashflow-budget.md e doc/guide/e2e-emulatori.md PRIMA di scrivere
  codice in quei domini
- Tocca la UI: leggi DESIGN.md (The Out-Of-DOM Token Rule) e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic: usa la skill claude-api prima di cambiare il modello della richiesta (la
  richiesta diventa in streaming: sopra 21.333 token l'SDK rifiuta quella che non lo è)
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

Implementa la spec così com'è scritta, nell'ordine: il modulo delle scadenze con U1 e U2, il registro
degli invii e la regola Firestore (L1), il cron nuovo delle email e quello degli snapshot alleggerito
(C0–C3, V1, con il finto adminDb descritto in fondo al § 6), il servizio — finestra italiana, link,
modello e richiesta in streaming, i periodi tolti e gli altri lettori elencati al § 4.4 (W1, W1b, H1, A1)
—, «Invia ora» e le impostazioni (S1, S2, N1, D1), poi E1, il grep del § 6, i documenti del § 9 e la riga
10 di doc/dati/README.md § 6 a `implemented` (e C5 nel § 7 com'è costruito). OGNI test del § 6 va visto
rosso con la sua mutazione. Il codice del § 4.1 e la route del § 4.3 sono già scritti: copiali.

Fermati e chiedimi se: DATI-08 non è in develop (`ANSWER_CONTRACT`: la forma della risposta fuori dal
nucleo che le email leggono), una funzione da cancellare ha un chiamante che il § 4.4 non nomina, oppure
una verifica automatica manderebbe un'email vera o chiamerebbe il modello.

Collaudo: § 7, la F al mio «pronto» (un «Invia ora» vero, verso il mio indirizzo). La regola Firestore la
pubblico io: dammi il comando, una riga, con l'esito atteso. Un branch, un commit, solo dopo il mio OK
con il riassunto del diff. SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR
develop → main (regola 13 dell'indice) e che va aperta dal giorno 4 del mese in poi (§ 8).
```

Model: **Opus 5.5**, effort **medium** — an M spec with a new server-only collection, a rule, a cron and a shared
contract. Estimated size: M (two new modules, one new cron route, one deleted service, about twenty files touched,
17 tests).
