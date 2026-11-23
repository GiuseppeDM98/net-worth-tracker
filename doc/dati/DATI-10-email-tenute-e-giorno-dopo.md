# DATI-10 — Periodic emails: two kept, three removed, sent the day after the period closes, once

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: DATI-08 (the email contract's two lines and the
> stripped tail are already there). DATI-11 depends on it.
> Written on 2026-11-23; every `file:line` is cited @ b0bf8276. Owner's point 9; decisions 24, 26, 27. Defines the
> shared contract **C5** (what is due when, and the delivery ledger, index § 7).

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
   `lib/utils/emailPeriodComparison.ts:154-155`), while the AI bundle uses the Italian bounds
   (`assistantMonthContextService.ts:1177`): a row of the 1st, at Italian midnight, falls in the previous month's email.
3. **Nothing makes a send happen once**: a second run of the cron on the same day sends again; a failed run sends
   never. No record of what was sent exists.
4. **No way back to the app**: the email has no link.
5. On 31 December four emails leave together, each with its own model call and its own read of the whole history;
   the Sunday «weekly» budget email is not weekly at all (it shows the current month and year,
   `lib/server/weeklyBudgetEmailService.ts:132-215`).
6. The cron route declares no `maxDuration`; the comment runs on Sonnet 5.5 (`lib/constants/aiModels.ts:54`).

## 2. Goal and acceptance criteria

1. Only two periodic emails exist: «Mensile» and «Annuale». The quarterly, the half-yearly and the Sunday budget
   email are gone from the cron, the manual send, the settings, the UI and the code. Proof: C1, S1, D1, the grep of § 6.
2. The monthly email of a month leaves on the 1st of the next month (Italian date); the yearly on 1 January, after
   December's monthly. A run on the 2nd or 3rd sends what the 1st did not. Proof: U1, C2.
3. Each (account, kind, period) is sent at most once by the cron; a failed send frees the period for the next run.
   Proof: U2, L1, C3.
4. The data window is the Italian one: a row at Italian midnight of the 1st belongs to its own month, under `TZ=UTC`
   and `Europe/Rome`. Proof: W1.
5. The email of a closed period carries no «non è ancora concluso» note; «Invia ora» sends the last CLOSED period.
   Proof: W2, S1.
6. The email has one link, «Apri Net Worth Tracker», when `NEXT_PUBLIC_APP_URL` is set; none otherwise. Proof: H1.
7. The AI comment runs on Opus 5.5; a truncated comment is still dropped, never sent cut. Proof: A1.
8. The cron route declares `maxDuration = 300`. Proof: V1.
9. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green; E1 green.

## 3. Decisions

- **Decision 24** (owner, 2026-11-23): keep «Mensile» and «Annuale»; remove the quarterly, the half-yearly and the
  Sunday budget email.
- **Decision 26** (owner, 2026-11-23): send the day after, with the period closed.
- **Decision 27** (owner, 2026-11-23): the emails' model is Opus 5.5, like the Assistente's.
- Adopted, reversible:
  - (a) a catch-up window of three days: due on the 1st, sent on the 2nd or the 3rd if the 1st failed; after that
    «Invia ora» is the way.
  - (b) the ledger is a server-only collection, one document per send; «Invia ora» ignores it (the owner asked) and
    records its send.
  - (c) a claim left «sending» for more than 30 minutes (a crashed run) can be taken again.
  - (d) the stored settings keep their three dead flags; nothing reads them (no migration).
  - (e) the comment keeps its six sections; its budget goes to 16.000 tokens (monthly) and 24.000 (yearly), effort
    `high` — a batch has no reader waiting, and Opus 5.5 thinks inside the same budget.
  - (f) on 1 January both emails leave (December, then the year): they answer different questions.

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
- `scripts/mirrorCollections.ts:7`: `'emailDeliveries'` joins `USER_COLLECTIONS` (documents carrying `userId`), so
  `mirror:remove` and the account cleanup do not leave them behind.

### 4.3 The cron — `app/api/cron/monthly-snapshot/route.ts`

- `export const maxDuration = 300;`.
- Phases 2–6 (`:151-334`) are replaced by ONE phase after the snapshots:

```ts
const todayIso = getItalyDateIso(now);
const emailResults = { sent: 0, skipped: 0, errors: 0 };
for (const due of emailsDueOn(todayIso)) {
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    if (userId === process.env.NEXT_PUBLIC_DEMO_USER_ID) { emailResults.skipped++; continue; }
    try {
      const settings = await getSettingsAdmin(userId);
      const enabled = due.kind === 'monthly' ? settings?.monthlyEmailEnabled : settings?.yearlyEmailEnabled;
      if (!enabled || !settings?.monthlyEmailRecipients?.length) { emailResults.skipped++; continue; }
      if (!(await claimEmailDelivery(userId, due.kind, due.periodKey, now))) { emailResults.skipped++; continue; }
      try {
        const sent = await buildAndSendForPeriod(userId, settings.monthlyEmailRecipients, due.kind, due.year, due.month);
        if (sent) { await confirmEmailDelivery(userId, due.kind, due.periodKey, new Date()); emailResults.sent++; }
        else { await releaseEmailDelivery(userId, due.kind, due.periodKey); emailResults.skipped++; }
      } catch (sendError) {
        await releaseEmailDelivery(userId, due.kind, due.periodKey);
        throw sendError;
      }
    } catch (emailError) {
      console.error(`[cron] ${due.kind} email failed for user ${userId}:`, emailError);
      emailResults.errors++;
    }
  }
}
```

  The response's `quarterlyEmails`, `semiAnnualEmails`, `yearlyEmails`, `weeklyBudgetEmails` keys collapse into
  `emails: emailResults`. The goals and budget-history phases (7, 8) are untouched.

### 4.4 The service — `lib/server/monthlyEmailService.ts`

- `EmailPeriodType = 'monthly' | 'yearly'` (`:113`); deleted with their tests: `isLastDayOfMonthItaly`,
  `isLastDayOfQuarterItaly`, `isLastDayOfYearItaly`, `isLastDayOfHalfYearItaly`, `monthToQuarter`,
  `getQuarterStartMonth`, `getPreviousQuarterEnd`, `getMostRecentCompletedQuarterEnd`, `monthToSemester`,
  `getSemesterStartMonth`, `getPreviousHalfEnd`, `getMostRecentCompletedHalfYearEnd`,
  `getMostRecentCompletedYearEnd` (`:184-340`), `buildAndSendQuarterly`, `buildAndSendSemiAnnual`,
  `buildAndSendYearly` (`:1969-2000`; the cron and the manual route call `buildAndSendForPeriod`), every `quarterly` /
  `semiannual` branch (`getPeriodWindowStartMonth` `:396`, `buildPeriodEmailData` `:1190-1204`, `periodTitle`, the
  budgets `EMAIL_AI_MAX_TOKENS` `:752-757` → `{ monthly: 16000, yearly: 24000 }`).
- **The window** (`:1206-1209`): `const windowStart = getItalyMonthBoundsUtc(year, windowStartMonth).start;`
  `const windowEnd = getItalyMonthBoundsUtc(year, month).end;` (`lib/utils/dateHelpers.ts:166`); the same two bounds in
  `lib/utils/emailPeriodComparison.ts:154-155` for each compared period.
- **The link**: `generateEmailHtml` (`:1687`) renders, under the verdict, one button «Apri Net Worth Tracker» →
  `${process.env.NEXT_PUBLIC_APP_URL}/dashboard` when the variable is set and starts with `https://`; styled from
  `printTokens` (DESIGN → The Out-Of-DOM Token Rule), a table-cell button, the same at 390, 600 and 1440.
- **The model**: `lib/constants/aiModels.ts:54` `EMAIL_ANALYSIS_MODEL = 'claude-opus-5-5'` («The prose of the periodic
  emails (Opus 5.5 since 2026-11-23, owner's decision)»). The request (`:825-832`) already sends adaptive thinking,
  `output_config: { effort: 'high' }` and the fallback beta — all accepted by Opus 5.5; nothing else changes.
- `lib/server/assistant/prompts.ts:880-887`: `EmailPeriodicPeriodType = 'monthly' | 'yearly'`, `EMAIL_PERIOD_SCOPE`
  loses two keys; section 4 of the contract («se il periodo è annuale…», `:910`) is unchanged.
- `lib/services/assistantMonthContextService.ts:1246-1248`: the note stays (the Assistente's own ranges can be in
  progress); the email no longer meets its condition.
- Deleted: `lib/server/weeklyBudgetEmailService.ts`, `__tests__/weeklyBudgetEmail*.test.ts`, and the helpers only it
  used (a grep per export before deleting; `overspendHtml` and `generateWeeklyBudgetComment` go with the file).

### 4.5 «Invia ora» — `app/api/user/monthly-email/send/route.ts`

The `weekly-budget` branch (`:43-56`) and the quarterly/half-yearly ones (`:58-97`) go. `periodType` is `'yearly'` or
`'monthly'`; the period is `lastClosedYear(todayIso)` with month 12, or `lastClosedMonth(todayIso)` — never the month
in progress (`:76` today). After a successful send: `confirmEmailDelivery(userId, kind, periodKey, now, true)`. The
route keeps answering for the token's own uid (`:37`).

### 4.6 Settings

`quarterlyEmailEnabled`, `semiAnnualEmailEnabled`, `weeklyBudgetEmailEnabled` leave: `types/assets.ts:491-492`,
`getSettings` (`lib/services/assetAllocationService.ts:170`), `setSettings` (`:412-414`, `:615-617`),
`lib/utils/settingsDraft.ts` (`:174`, `:414`, `:570`), `getSettingsAdmin` (`monthlyEmailService.ts:876`),
`__tests__/fixtures/storedSettings.ts:130-131`, `WRITTEN_KEYS` (`__tests__/settingsDraft.test.ts:46-49`),
`describeEmails` (`lib/utils/settingsNarrative.ts:361-380`: «Mensile e annuale», «Solo mensile», «Solo annuale»,
«Nessuna email»).

`components/settings/tabs/GeneraleTab.tsx:602-727`, tile «Email periodiche»: two rows — «Mensile» («Il 1° di ogni
mese, sul mese appena chiuso») and «Annuale» («Il 1° gennaio, sull'anno appena chiuso») — each with its switch and
its «Invia ora» («Invia ora il riepilogo di {mese anno}» / «…del {anno}», the last closed period); the recipients
field unchanged. The three removed rows and their handlers go.

## 5. Constraints and traps

- **Settings — the FIVE places** (doc/guide/impostazioni.md): here it means the three flags leave ALL five (type,
  get, set, draft, admin getter) and the fixtures — S1's `WRITTEN_KEYS` proves the set side.
- **`removeUndefinedDeep` / no `undefined` to Firestore**: the ledger writes only defined fields.
- **A transaction reads before it writes**: `claimEmailDelivery` is one `get` then one `set`.
- **Italian day and month** (`getItalyDateIso`, `getItalyMonthBoundsUtc`): the cron runs at 18:00 UTC = 19:00 or
  20:00 in Rome, the same Italian day; the due day and the window are both Italian.
- **The snapshot the email reads** is the closed month's, last written by the cron on that month's last evening
  (phase 1 writes the month in progress): the 1st's run writes the NEW month's snapshot first and does not touch it.
- **A cron secret, never a user token** (`verifyCronSecret`, `:67-74`): unchanged.
- **A Vercel function's config is held by `__tests__/vercelConfig.test.ts`**: `maxDuration` is asserted there.
- **The Out-Of-DOM Token Rule**: the button's colours come from `printTokens.ts`, not from CSS variables.
- **A probe never opens a control that spends**: no automated step sends through Resend or calls the model — both
  are mocked; the throwaway render (doc/guide/email-pdf.md, the render at 390/600/1440) uses a canned comment.
- **No owner data**: the fixtures' recipient is `census@example.com`.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/emailSchedule.test.ts` | 1 November → October monthly; 3 November → the same; 4 November → nothing; 1 January 2027 → December 2026 then year 2026; 31 October → nothing | due on the last day |
| U2 | unit · same | no record → claimable; «sent» → never; «sending» 10 minutes old → no; 31 minutes → yes | ignore the status |
| L1 | unit · `__tests__/emailDeliveries.test.ts` | two claims of the same period: the first true, the second false; release → claimable again; confirm → never again | `set` without the read |
| C1 | unit · `__tests__/cronMonthlySnapshot.test.ts` | on 31 March, on a Sunday, on 30 June: no email function is called | keep phase 3 |
| C2 | unit · same | 1 January: `buildAndSendForPeriod` called with `monthly, 2026, 12` then `yearly, 2026, 12`; a disabled kind is skipped | one kind only |
| C3 | unit · same | a second run the same day sends nothing; a send that throws releases the claim and the next run sends | confirm before the send |
| W1 | unit · `__tests__/monthlyEmailService.test.ts` | a row at Italian midnight of 1 November is in November's email and not in October's, under both zones | `new Date(year, month - 1, 1)` |
| W2 | unit · same | the bundle of a closed month has no «non è ancora concluso» note | send for the month in progress |
| H1 | unit · same | the HTML has one `<a>` to `https://…/dashboard` with the variable set; none without it or with `http://` | always render |
| A1 | unit · same | the request's model is `claude-opus-5-5`; a `max_tokens` stop still returns no comment | return the cut text |
| S1 | unit · `__tests__/settingsDraft.test.ts`, `__tests__/monthlyEmailSendRoute.test.ts` | `WRITTEN_KEYS` has no removed flag; «Invia ora» monthly on 15 November sends October; `weekly-budget` → 400 | send the current month |
| V1 | unit · `__tests__/vercelConfig.test.ts` | the cron route exports `maxDuration` 300 | remove it |
| D1 | dom · `__tests__/generaleTab.email.test.tsx` (new) | the tile has exactly two switches, «Mensile» and «Annuale»; the button reads «Invia ora il riepilogo di ottobre 2026» on 15 November | render a third row |
| E1 | e2e · `e2e/settings.spec.ts` | Impostazioni › Generale: toggling «Annuale» and saving persists; no «Trimestrale», «Semestrale», «Budget» row | — (presence) |

The grep that closes criterion 1: `grep -rn "quarterly\|semiannual\|semiAnnual\|weeklyBudget\|weekly-budget" app lib
components types __tests__ e2e` prints nothing.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: with the clock on 1 November the cron sends October's email once, a second run
sends nothing, the email shows October's rows up to the 31st at midnight, no «parziali» note, one button to the app;
Impostazioni shows two emails.

- A — the diff, the list of deleted files. B–E on the emulators with Resend and the model mocked, the cron route
  called with the secret and a pinned clock (`vi.setSystemTime` in a throwaway vitest, not a browser): B 1 November;
  C the second run; D 1 January (two emails, in order); a send that fails, then succeeds on the 2nd; E the render of
  the two emails at 390, 600 and 1440 with a canned comment, light and dark; the settings tile at 1440 and 390.
  Decoy rows: «ornitorinco» dated 1 November 00:00 Italian (not in October's email), «fenicottero» dated 31 October
  23:30 Italian (in it).
- F — at the owner's «pronto», on the mirror: «Invia ora» for the month, to his own address — the one step that
  sends and spends; he reads the email on his phone.

## 8. Putting it into service

`firebase deploy --only firestore:rules` (the new server-only block) — the owner runs it, one line, expected «rules
released». No index (the ledger is read by document id). The first automatic send is the 1st of the month after the
deploy. The stored dead flags stay.

## 9. Documentation

- `doc/guide/email-pdf.md` — the two emails, when they leave and why the day after, the ledger (C5), the window in
  Italian bounds, «Invia ora» on the closed period, the link; the sections on the three removed emails deleted;
  § blind spots: after the third day of the month only «Invia ora» sends; the ledger does not stop a manual send.
- `doc/guide/impostazioni.md` — the tile's two rows. `doc/guide/server.md` — the cron's `maxDuration`.
- `README.md` — the emails' feature lines; `SETUP.md` — `NEXT_PUBLIC_APP_URL` also feeds the email's link.
- `AGENTS.md` § 3 — the emails' stub. `CLAUDE.md` — «Periodic emails» line: «monthly and yearly, sent the day after
  the period closes, once (2026-11)»; Data & Integrations: «Opus 5.5 for the Assistente, the emails and the
  Consulente; Sonnet 5.5 for the performance report»; under 20.000 characters.
- `Draft Release Temp.md` — «Email: restano la mensile e l'annuale, arrivano il giorno dopo a periodo chiuso»,
  «Rimosse le email trimestrale, semestrale e del budget».
- `doc/dati/README.md` § 6 and § 7 (C5 as built).

## 10. Declared out of scope

- The email that reviews the spending → DATI-11.
- An unsubscribe link → doc/guide/email-pdf.md § blind spots (the recipients are the owner's own list in Impostazioni).
- The comment's six sections against the Assistente's one form → doc/guide/email-pdf.md § blind spots (an email is
  scanned by section; the owner asked for the form in the chat).
- The cron in parallel per user → doc/guide/server.md § blind spots (sequential inside 300 s for the accounts there are).

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
  doc/guide/server.md e doc/guide/e2e-emulatori.md PRIMA di scrivere codice in quei domini
- Tocca la UI: leggi DESIGN.md (The Out-Of-DOM Token Rule) e PRODUCT.md prima di disegnare
- Tocca l'API di Anthropic: usa la skill claude-api prima di cambiare il modello della richiesta
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

Implementa la spec così com'è scritta, nell'ordine: il modulo delle scadenze con U1 e U2 (ognuno visto
rosso con la sua mutazione), il registro degli invii e la regola Firestore (L1), il cron (C1–C3, V1), il
servizio — finestra italiana, link, modello, i periodi tolti (W1, W2, H1, A1) —, «Invia ora» e le
impostazioni (S1, D1), poi E1 e il grep del § 6. Il codice del § 4.1 è già scritto: copialo.

Fermati e chiedimi se: DATI-08 non è in develop (le due righe del contratto dell'email), una funzione da
cancellare ha un chiamante che la spec non nomina, oppure una verifica automatica manderebbe un'email
vera o chiamerebbe il modello.

Collaudo: § 7, la F al mio «pronto» (un «Invia ora» vero, verso il mio indirizzo). La regola Firestore la
pubblico io: dammi il comando, una riga, con l'esito atteso. Un branch, un commit, solo dopo il mio OK
con il riassunto del diff. SESSION_NOTES.md non si committa.
```

Model: **Opus 5.5**, effort **medium** — an M spec with a new server-only collection, a rule, a cron and a shared
contract. Estimated size: M (two new modules, one deleted service, ~14 files touched, ~14 tests).
