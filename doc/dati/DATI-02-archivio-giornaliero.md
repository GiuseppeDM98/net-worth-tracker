# DATI-02 — The daily archive: one row a day, beside the monthly snapshots

> Series `doc/dati/` (index: [README.md](README.md)). Depends on: nothing. Written on 2026-11-23; every `file:line`
> is cited @ b0bf8276 (a line number is a hint, the function's name is the anchor). Owner's point 5; decisions 10,
> 11, 28, 48, 49, 50, 53 and 88. Defines the shared contract **C1** (index § 7).

## 1. The problem today (evidence on the code)

- **The cron runs every day and keeps one value a month.** `vercel.json` schedules `/api/cron/monthly-snapshot` at
  `0 18 * * *`; its phase 1 (`app/api/cron/monthly-snapshot/route.ts:92-141`) posts to `/api/portfolio/snapshot` for
  every user, and that route writes ONE document, `monthly-snapshots/${userId}-${year}-${month}`
  (`app/api/portfolio/snapshot/route.ts:212`), with a `.set()` that REPLACES it (`:247-252`). Thirty runs, one
  survivor: the last of the month. The header of the cron says so (`route.ts:30-32`).
- **No daily series exists anywhere**: no collection in `firestore.rules` holds one, and the only historical price
  call in the code is monthly (`yahooFinance.chart(…, { interval: '1mo' })`, `app/api/benchmarks/returns/route.ts:110-113`).
  The prices the cron reads every evening (`updateUserAssetPrices`, `route.ts:141-148`) are thrown away the next day.
- **The monthly collection cannot take daily documents.** 38 readers assume one document per month — «previous
  document» = previous month (`lib/services/dashboardOverviewService.ts:378-380`), a month's whole flow subtracted
  per pair (`lib/services/performanceService.ts:168-218`), `.where('year','==').where('month','==').limit(1)` in the
  emails (`lib/server/monthlyEmailService.ts:1211-1227`), `find(year, month)` in the Assistente
  (`lib/services/assistantMonthContextService.ts:87-96`). A second document in a month breaks each of them.
- **What the owner asked** (point 5): whether a daily record is worth having, for daily price charts, better
  volatility and more context for the Assistente and the Consulente. Decision 10: yes, in an archive of its own.

## 2. Goal and acceptance criteria

From the day this ships, every snapshot run of TODAY also files one compact row of that Italian day — net worth,
liquidity, value per class, and per instrument the quantity and the value in euro — in a store no existing reader
touches. This spec builds the store, its writer, its rules, its pure helpers and its two readers (client hook, server
function); it draws nothing. The consumers are DATI-13, DATI-14 and DATI-15.

1. A snapshot run with no `year`/`month` in its body writes `dailySnapshots/{userId}/months/{YYYY-MM}` with the row
   under `days.{DD}`, the Italian day of the run. Proof: R1 (§ 6).
2. A second run the same day replaces that day's row whole and leaves the other days of the document untouched.
   Proof: R1 asserts the `mergeFields` option names exactly `days.{DD}` beside the three header fields; E2 plants
   another day of the month, calls the route once on the emulator and reads both days back.
3. A run with an explicit `year` or `month` (a past month rewritten) writes no daily row. Proof: R2.
4. A failure of the daily write does not fail the snapshot: the route answers `success: true`, the monthly document
   is written, the error is logged. Proof: R3.
5. The row skips an instrument with quantity 0 and value 0, rounds the euro figures to cents and keeps the quantity as
   it is. Proof: U1, U2.
6. `monthly-snapshots` is written exactly as before: the monthly `.set()` call and its argument are unchanged. Proof:
   the existing snapshot tests of `__tests__/apiAuthRoutes.test.ts` (the block that asserts the monthly `set`) stay
   green with their bodies untouched; only the file's `adminDb` mock gains a branch (§ 6).
7. The owner and a member of the shared account read a month through the client SDK; another signed-in user is
   refused; nobody writes from the browser; a month never written reads as «absent», not as an error. Proof: E1.
8. `useDailySnapshots(ownerId, days)` returns the points of the last `days` Italian days in ascending order, reading
   one document per month touched, each month a query of its own; a month read after it closed is never read again
   while the device keeps it (decision 88). Proof: U4 (the flattening), U6 (the finality rule), H1 (the hook under
   jsdom with the service mocked), P1 (the key is persisted).
9. `mirror:seed` copies the account's daily months into the emulators and `mirror:remove` deletes them. Proof: M1
   (the lists), the planted month deleted by `mirror:remove` in the guided verification (§ 7 G), and the measure of
   § 8.4 on the first morning the archive holds a day.
10. «Crea snapshot» makes the daily readers read today's row again. Proof: H2.
11. `npx tsc --noEmit`, `npm run lint`, `TZ=Europe/Rome npx vitest run`, `TZ=UTC npx vitest run` green.

## 3. Decisions

- **Decision 10** (owner, 2026-11-23): a daily archive of its own; the monthly collection and its readers stay identical.
- **Decision 28** (owner, 2026-11-23): no reconstruction of the past — the archive starts the day it ships.
- **Decision 11** (owner, 2026-11-23): four consumers in this series (Patrimonio › Andamento, Assistente and
  Consulente, Rendimenti, Panoramica) — built by DATI-13, 14, 15, not here.
- **Decision 49** (owner, 2026-11-23): the cron stays at 18:00 UTC; a US instrument's row is its price at that hour,
  mid-session, not the close — accepted and declared (§ 9, blind spots). Every day is taken at the same hour, so the
  daily series is consistent with itself.
- **Decision 50** (owner, 2026-11-23): when the evening's price update fails the row is written on the prices already
  stored and carries no mark; declared (§ 9, blind spots).
- **Decision 53** (owner, 2026-11-23): what has no market price — an account, a pension fund, a property, a loan —
  has no daily price. The row keeps `q` and `v` for every instrument; `dailyUnitPrice` answers null where the
  arithmetic has no meaning (below), and the readers that hold the asset (DATI-13, DATI-15) apply the type rule of
  DATI-12 (`hasNoMarketPrice`).
- **Decision 88** (owner, 2026-11-23): Rendimenti's daily risk follows the chosen period, whatever its length; the
  months it needs are read once and kept by the device — (e) below.
- **Decision 48** (owner, 2026-11-23): a verification step may reach a paid or external service only after the
  owner's yes, asked before; § 6 and § 7 are built so that none is needed.
- Adopted, reversible:
  - (a) **one document per account per month, a map of days** (`days.{DD}`), not one document per day: ~1,4 KB a day
    for thirty instruments, ~42 KB a month, twelve reads a year — a document per day would cost 365 reads a year and
    the same bytes. Far from the 1 MiB limit (it would take ~700 instruments).
  - (b) **the path is nested under the uid** (`dailySnapshots/{userId}/months/{YYYY-MM}`), the shape of
    `budgetHistory` (`firestore.rules:220-227`): the rule never reads `resource.data`, so a missing month answers null.
  - (c) **per instrument the row stores `q` and `v`** (quantity, value in euro), the monthly `byAsset` convention: the
    euro unit price is `v / q` where both are positive. A loan keeps its residual principal in `q` at price 1 and
    its value is `−q` (`calculateAssetValue`, `lib/services/assetService.ts`): its `v / q` is −1, not a price, so
    `dailyUnitPrice` answers null when `q ≤ 0` or `v < 0`.
  - (d) **every day is written, weekends included** (the cron runs daily): a reader that wants trading days filters
    them (DATI-14 does).
  - (e) **kept forever, one query per month, persisted** (decision 88): the key is
    `['daily-snapshots', uid, 'YYYY-MM']` and `['daily-snapshots']` joins `PERSISTED_QUERY_PREFIXES`
    (`lib/constants/persistCache.ts`). A month fetched AFTER it closed is final — `staleTime: Infinity`; the month in
    course, and a past month whose copy was fetched while it was still open, take the global five-minute default.
    The persisted cache lives 24 hours (`PERSIST_CACHE_MAX_AGE_MS`): «read once» means once a day per device at
    most, whatever the period's length. No bump of `PERSIST_CACHE_VERSION` (a new prefix renames nothing).
  - (f) **«Crea snapshot» on Panoramica also writes today's row** (it posts with no year/month): the row carries its
    instant (`at`), so a reader can tell the evening cron from a later click; the mutation invalidates the daily
    keys (§ 4.5).
  - (g) the two dead entries found by the count of 2026-11-23 leave with this spec (§ 4.6).

## 4. Solution

### 4.1 Document shape (no DDL: Firestore; the «schema» is this type and the rule of § 4.4)

`dailySnapshots/{userId}/months/{YYYY-MM}`:

```
{ userId: string, month: 'YYYY-MM', updatedAt: Timestamp,
  days: { '01': DailySnapshotDay, '02': …, '31': … } }
```

### 4.2 Pure module — `lib/utils/dailySnapshot.ts` (new, written here)

```ts
/**
 * The daily archive's row and its arithmetic.
 *
 * One document per account per month holds a map day → row (`dailySnapshots/{uid}/months/{YYYY-MM}`):
 * the monthly snapshots keep one value a month and thirty-eight readers count on it, so the days live
 * beside them, never among them. A row is what the evening cron already computed, cut to what a daily
 * reader needs: the totals, the classes, and per instrument the quantity and the value in euro.
 */
import type { MonthlySnapshot } from '@/types/assets';
import { roundToCents } from '@/lib/utils/cents';

export const DAILY_SNAPSHOTS_COLLECTION = 'dailySnapshots';
export const DAILY_SNAPSHOTS_SUBCOLLECTION = 'months';

/** One instrument on one day. A loan keeps its residual principal in `q` and a negative `v`. */
export interface DailyAssetRow {
  q: number;
  v: number;
}

export interface DailySnapshotDay {
  netWorth: number;
  liquid: number;
  byClass: Record<string, number>;
  assets: Record<string, DailyAssetRow>;
  /** ISO instant of the write: the evening cron and a later «Crea snapshot» share a day, not an hour. */
  at: string;
}

export interface DailySnapshotMonth {
  userId: string;
  month: string;
  days: Record<string, DailySnapshotDay>;
}

/** A row with its Italian day, 'YYYY-MM-DD': what every reader works on. */
export interface DailyPoint extends DailySnapshotDay {
  iso: string;
}

export interface DailySnapshotInput {
  totalNetWorth: number;
  liquidNetWorth: number;
  byAssetClass: Record<string, number>;
  byAsset: MonthlySnapshot['byAsset'];
  at: Date;
}

export function buildDailySnapshotDay(input: DailySnapshotInput): DailySnapshotDay {
  const assets: Record<string, DailyAssetRow> = {};
  for (const row of input.byAsset) {
    // A sold-out instrument stays in the monthly breakdown as a zero row; thirty of them a day is noise.
    if (row.quantity === 0 && row.totalValue === 0) continue;
    assets[row.assetId] = { q: row.quantity, v: roundToCents(row.totalValue) };
  }
  const byClass: Record<string, number> = {};
  for (const [name, value] of Object.entries(input.byAssetClass)) byClass[name] = roundToCents(value);
  return {
    netWorth: roundToCents(input.totalNetWorth),
    liquid: roundToCents(input.liquidNetWorth),
    byClass,
    assets,
    at: input.at.toISOString(),
  };
}

export function splitIsoDay(iso: string): { monthKey: string; day: string } {
  return { monthKey: iso.slice(0, 7), day: iso.slice(8, 10) };
}

/** The month keys from `fromIso`'s month to `toIso`'s, both included, ascending. */
export function monthKeysBetween(fromIso: string, toIso: string): string[] {
  const keys: string[] = [];
  const last = toIso.slice(0, 7);
  let year = Number(fromIso.slice(0, 4));
  let month = Number(fromIso.slice(5, 7));
  for (;;) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    if (key > last) break;
    keys.push(key);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/** `days` calendar days before `todayIso`, as an ISO day. Pure calendar arithmetic, no time zone. */
export function isoDaysBefore(todayIso: string, days: number): string {
  const [year, month, day] = todayIso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day - days)).toISOString().slice(0, 10);
}

/** The rows of `months` between the two days (included), ascending by day. */
export function flattenDailyMonths(months: DailySnapshotMonth[], fromIso: string, toIso: string): DailyPoint[] {
  const points: DailyPoint[] = [];
  for (const record of months) {
    for (const [day, value] of Object.entries(record.days ?? {})) {
      const iso = `${record.month}-${day}`;
      if (iso < fromIso || iso > toIso) continue;
      points.push({ iso, ...value });
    }
  }
  return points.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
}

/**
 * The euro unit price of a row, or null where `v / q` is not a price: nothing to divide by, or a
 * loan (its quantity is the residual principal, its value the same figure below zero). Whether the
 * instrument has a MARKET price at all — an account, a pension fund and a property have none — is
 * the reader's question: it holds the asset, the row does not.
 */
export function dailyUnitPrice(row: DailyAssetRow | undefined): number | null {
  if (!row || row.q <= 0 || row.v < 0) return null;
  return row.v / row.q;
}

/**
 * Whether the copy of a month is final: it was fetched on an Italian day after the month's last.
 * A copy taken while the month was open misses its later days, however old the month is now.
 */
export function isDailyMonthFinal(monthKey: string, fetchedOnIso: string): boolean {
  return fetchedOnIso.slice(0, 7) > monthKey;
}
```

### 4.3 Server — `lib/server/dailySnapshotStore.ts` (new) and the route

```ts
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  DAILY_SNAPSHOTS_COLLECTION, DAILY_SNAPSHOTS_SUBCOLLECTION, flattenDailyMonths, monthKeysBetween, splitIsoDay,
  type DailyPoint, type DailySnapshotDay, type DailySnapshotMonth,
} from '@/lib/utils/dailySnapshot';

function monthRef(db: Firestore, userId: string, monthKey: string) {
  return db.collection(DAILY_SNAPSHOTS_COLLECTION).doc(userId).collection(DAILY_SNAPSHOTS_SUBCOLLECTION).doc(monthKey);
}

/**
 * Files one day. `mergeFields` names the day's own path, so the row is REPLACED whole and the other
 * days are not read nor touched; `{ merge: true }` would merge the nested maps key by key and keep
 * the row of an instrument sold since the morning.
 */
export async function writeDailySnapshotDay(db: Firestore, userId: string, isoDay: string, day: DailySnapshotDay): Promise<void> {
  const { monthKey, day: dayKey } = splitIsoDay(isoDay);
  await monthRef(db, userId, monthKey).set(
    { userId, month: monthKey, updatedAt: Timestamp.now(), days: { [dayKey]: day } },
    { mergeFields: ['userId', 'month', 'updatedAt', `days.${dayKey}`] },
  );
}

export async function readDailyPoints(db: Firestore, userId: string, fromIso: string, toIso: string): Promise<DailyPoint[]> {
  const snaps = await Promise.all(monthKeysBetween(fromIso, toIso).map((key) => monthRef(db, userId, key).get()));
  const months = snaps.filter((snap) => snap.exists).map((snap) => snap.data() as DailySnapshotMonth);
  return flattenDailyMonths(months, fromIso, toIso);
}
```

`app/api/portfolio/snapshot/route.ts`, after `invalidateDashboardOverviewSummaryServer(…)` (`:253-256`) and before the
Hall of Fame comment: when the validated body carries neither `year` nor `month`, build the day with
`buildDailySnapshotDay({ totalNetWorth, liquidNetWorth, byAssetClass: allocation.byAssetClass, byAsset, at: now })`
and call `writeDailySnapshotDay(adminDb, userId, getItalyDateIso(now), day)` inside its own `try/catch`
(`console.error('Error writing daily snapshot:', error)`). `now` is ONE instant for the two archives: where the route
resolves the Italian month (`getItalyMonthYear()`, `:182`) it becomes `const now = new Date();` and
`getItalyMonthYear(now)`, and `getItalyDateIso` comes from the same dynamic import of `dateHelpers` — a click at
midnight of a month's last day files the same month in both. That line is the only change above `:253`. The JSON
answer gains `data.dailyWritten: boolean`. A run on an account with no asset answers `success: false` before the
write, as today: no daily row.
The manual route (`app/api/portfolio/snapshot/manual/route.ts`) writes no daily row: it files a typed total for a
chosen month, not today's portfolio.

### 4.4 Rules — `firestore.rules`, after the `budgetHistory` block (`:220-227`)

```
    // Archivio giornaliero - una riga al giorno per mese, scritta SOLO dallo snapshot (Admin SDK).
    // Percorso annidato sotto lo uid, come budgetHistory: la rule non tocca resource.data e un mese
    // mai scritto risponde null.
    match /dailySnapshots/{userId}/months/{month} {
      allow read: if canAccess(userId);
      allow write: if false;
    }
```

No index: the documents are read by id.

### 4.5 Client — service, key, hook

- `lib/services/dailySnapshotService.ts`: `getDailySnapshotMonths(userId: string, monthKeys: string[]): Promise<DailySnapshotMonth[]>`,
  one `getDoc(doc(db, 'dailySnapshots', userId, 'months', key))` per key, the missing ones dropped — the body of
  `getBudgetHistory` (`lib/services/budgetHistoryService.ts:18-36`); each existing snap maps to
  `{ userId: data.userId, month: data.month, days: data.days ?? {} }` (`updatedAt`, the document's only Timestamp, is
  dropped). Beside it `getDailySnapshotMonth(userId: string, monthKey: string): Promise<DailySnapshotMonth | null>`,
  the same read for one key, null when the document is absent.
- `lib/query/queryKeys.ts`:
  `dailySnapshots: { all: (userId: string) => ['daily-snapshots', userId] as const, month: (userId: string, monthKey: string) => ['daily-snapshots', userId, monthKey] as const }`.
- `lib/constants/persistCache.ts`: `['daily-snapshots']` joins `PERSISTED_QUERY_PREFIXES`, with the comment «the
  daily archive, a query per month: a closed month is read once and kept (2026-11-23)».
- `lib/hooks/useDailySnapshots.ts`: `useDailySnapshots(ownerId: string | undefined, days: number)` — `toIso =
  getItalyDateIso()`, `fromIso = isoDaysBefore(toIso, Math.max(1, days) - 1)`, `monthKeys = monthKeysBetween(fromIso,
  toIso)`; `useQueries` with one query per key — `queryKey: queryKeys.dailySnapshots.month(ownerId, key)`,
  `queryFn: () => getDailySnapshotMonth(ownerId, key)`, `enabled: Boolean(ownerId)`,
  `staleTime: (query) => (isDailyMonthFinal(key, getItalyDateIso(new Date(query.state.dataUpdatedAt))) ? Infinity : QUERY_STALE_TIME_MS)`
  (`QUERY_STALE_TIME_MS` from `lib/query/queryDefaults`, the global default; `dataUpdatedAt` 0 reads as 1970, never final) — and
  `combine` to ONE result:

  ```ts
  export interface DailySnapshotsResult {
    /** Ascending; undefined until every month of the window has answered once. */
    data: DailyPoint[] | undefined;
    isPending: boolean;
    /** A month failed and no copy of it is held. */
    isError: boolean;
  }
  ```

  `data` is `flattenDailyMonths(months that are not null, fromIso, toIso)` once no query is pending; `isError` is
  true when a query is in error with `data === undefined`. The hook returns that object, the same reference while
  its inputs are the same (`combine` is memoised by the library). The demo account reads its own archive like any
  other (the cron writes it) and is not persisted (`isPersistableQuery` refuses the demo uid).
- `lib/hooks/useSnapshots.ts`, `useCreateSnapshot`: its `onSuccess` also invalidates
  `queryKeys.dailySnapshots.all(userId)`, the prefix of every month key, so the page that holds the button — the
  Panoramica, whose line DATI-14 draws on the days — reads today's row again.

### 4.6 Mirror and the two dead entries

- `scripts/mirrorCollections.ts`: new `export const PER_USER_MONTH_DOCS = ['dailySnapshots'];` («one document per
  account whose rows are a `months` subcollection, copied from production»). `scripts/mirrorProdAccount.mts`: the
  seed dumps `dailySnapshots/{sourceUid}/months/*` under the key `months:dailySnapshots`, the child writes each to
  `dailySnapshots/{MIRROR_UID}/months/{id}` with `userId: MIRROR_UID`, and `remove` adds the list to the
  `recursiveDelete` loop (`:176`). `__tests__/mirrorCollections.test.ts:13-22` takes the new list into the union it
  holds against the rules' uid-keyed paths.
- `'goals'` leaves `USER_COLLECTIONS` (`scripts/mirrorCollections.ts:7`, `scripts/seedCensusE2E.mts:76`): no code reads
  or writes a `goals` collection (the goals live in `goalBasedInvesting/{uid}`). The `price-history` composite index
  leaves `firestore.indexes.json` (`:267-…`, the whole object): no code names that collection.

## 5. Constraints and traps

- **«A bare `.set()` on a server-owned doc DELETES every field its object omits»** (AGENTS.md § Firestore Writes):
  here it means the daily write is never a bare `.set()` (it would erase the other days) and never `{ merge: true }`
  (it would deep-merge the day); it is `mergeFields` with the day's path, and R1 holds the option object.
- **`removeUndefinedDeep`** (AGENTS.md § Firestore Writes): here it means the row is built from numbers and strings
  only — `buildDailySnapshotDay` never emits `undefined`, so no stripping pass is needed; keep it that way.
- **Italian day, not UTC** (`lib/utils/dateHelpers.ts:61`): here it means the key is `getItalyDateIso(now)`; at 18:00
  UTC the two agree, at a «Crea snapshot» click at 00:30 Italian time they do not.
- **Rules are published by hand and are inert until then** (AGENTS.md § Firestore Writes): here it means the cron's
  write works before the publish (Admin SDK), the readers of DATI-13/14 do not — § 8 has the publish done before or
  with the merge; the readers arrive with DATI-13.
- **The persisted cache restores a query as it was fetched** (doc/guide/cache-persistita.md): here it means a
  restored month keeps its `dataUpdatedAt`, which is what `isDailyMonthFinal` reads — a copy taken on the 20th is
  read again after the month closes, a copy taken after it never is.
- **The three enforcement layers**: here it means a reader passes `ownerId` (the account), never `user.uid`, as every
  hook does.
- **No owner data in a tracked file**: the tests and E1 use invented round figures (10.000, 2.500) and ids like
  `asset-a`.
- **A series label never enters the code**: comments cite «2026-11-23», never this spec.
- **Max 3 `.where()` on a chain that is unit-tested**: not touched — the readers go by id.

## 6. Tests per level (each with the mutation that proves it)

| # | Level · file | What it asserts | Mutation that must turn it red |
|---|---|---|---|
| U1 | unit · `__tests__/dailySnapshot.test.ts` | a zero row (quantity 0, value 0) is not in `assets`; a loan (quantity 50.000, price 1, value −50.000) is, as `{ q: 50000, v: -50000 }` | delete the `continue` |
| U2 | unit · same | 1.000,005 → 1.000,01 on `netWorth`, `v`, `byClass`; `q` 3,333333 kept | drop `roundToCents` on `v` |
| U3 | unit · same | `monthKeysBetween('2026-11-20','2027-02-03')` = four keys ending `2027-02` | `month > 12` → `month > 11` |
| U4 | unit · same | `flattenDailyMonths` sorts across two months and drops a day outside the window | remove the window test |
| U5 | unit · same | `dailyUnitPrice` null on `q: 0`, null on the loan `{ q: 50000, v: -50000 }`, 25 on `{ q: 4, v: 100 }`; `isoDaysBefore('2026-03-01', 1)` = `2026-02-28` | `row.q <= 0` → `row.q < 0`; and, for the loan, drop `\|\| row.v < 0` |
| U6 | unit · same | `isDailyMonthFinal('2026-10', '2026-11-01')` true; `('2026-10', '2026-10-31')` false; `('2026-10', '1970-01-01')` false | `>` → `>=` |
| R1 | unit · `__tests__/apiAuthRoutes.test.ts` (snapshot block) | with the clock at 2026-04-23T16:00:00Z the cron path calls the months doc `2026-04`'s `set` with `days: { '23': … }` and `mergeFields` equal to the four paths | `{ merge: true }` in the store |
| R2 | unit · same | a body with `month: 4` writes the monthly document and no daily row | drop the year/month guard |
| R3 | unit · same | the daily `set` rejecting → 200, `success: true`, `data.dailyWritten: false`, monthly `set` called, `console.error` called with 'Error writing daily snapshot:' | remove the `try/catch` |
| H1 | dom · `__tests__/useDailySnapshots.test.tsx` | clock at 2026-03-02T12:00:00Z, `days` = 3, the service mocked per month (2026-02 with '27','28', 2026-03 with '01','02'): `data` = the points of 2026-02-28, 2026-03-01, 2026-03-02; the service is called once for `2026-02` and once for `2026-03`; `ownerId` undefined → no call | `isoDaysBefore(toIso, days - 1)` → `days` |
| H2 | dom · `__tests__/useSnapshots.test.tsx` (new) | `useCreateSnapshot`'s success invalidates `['daily-snapshots', uid]` (a spy on `queryClient.invalidateQueries`) | remove the invalidation |
| P1 | unit · `__tests__/persistCache.test.ts` | `isPersistableQuery(queryKeys.dailySnapshots.month(OWNER, '2026-11'), DEMO)` is true, false for the demo uid | remove the prefix |
| M1 | unit · `__tests__/mirrorCollections.test.ts` | `dailySnapshots` is owned by the mirror; `goals` is in no list | remove the new list |
| E1 | e2e · `e2e/daily-snapshots.rules.spec.ts` | REST on the Firestore emulator with Auth-emulator ID tokens: owner 200, another user 403, the same user 200 once `account-access/{owner}` names it as a member, a PATCH by the owner 403, a month never written 404 | rule → `allow read: if isAuthenticated()` |
| E2 | e2e · same | one POST to `/api/portfolio/snapshot` as the account itself, on a month document that already holds another day, leaves both keys under `days` | bare `.set()` in the store |

**The unit harness.** `__tests__/apiAuthRoutes.test.ts` throws on a collection its `adminDb` mock does not list: the
mock gains a `dailySnapshots` branch — `doc() → { collection: () => ({ doc: (monthKey) => ({ set: dailyMonthSetMock }) }) }`,
the month key recorded — and the existing tests keep their bodies. The file mocks `getItalyMonthYear` and leaves
`getItalyDateIso` real, so R1–R3 fix the clock (`vi.useFakeTimers({ toFake: ['Date'] })`,
`vi.setSystemTime(new Date('2026-04-23T16:00:00Z'))`, restored in `afterEach`).

**The emulator specs.** E1/E2 plant and read through REST at
`:8080/v1/projects/demo-net-worth/databases/(default)/documents` as `e2e/accumuloFixture.ts` does; the ID tokens come
from the Auth emulator (`:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake`, password
`test1234`). E1's owner is `test@example.com`, the other user `degraded@example.com`; the member case plants
`account-access/test-user-1 { memberUids: [<the uid of degraded>] }` through the Admin REST (`Bearer owner`) and
deletes it in `finally`. E2 runs on an account of its own, created in `beforeAll` in the Auth emulator
(`daily-e2e@example.com`) and given, through the Admin REST, one cash account and one instrument with
`autoUpdatePrice: false`: the route's price update finds nothing to ask the market, so the spec reaches no market
service and rewrites no price of the shared seed. It plants a row under another day of the CURRENT month's document
(`'02'` when today's Italian day is `'01'`, else `'01'`), calls the route once with
`Authorization: Bearer <the account's ID token>` and body `{ userId }` — the «Crea snapshot» path; the Playwright
runner has no `CRON_SECRET` — and reads both keys. `afterAll` deletes the account, its assets, its monthly snapshot
and `dailySnapshots/{its uid}`.

## 7. Guided verification (WORKFLOW.md § 2)

Expected outcome, declared first: after one «Crea snapshot» on Panoramica the emulator UI shows
`dailySnapshots/{uid}/months/{this month}` with one key under `days` (today), its `netWorth` equal to the Panoramica's
figure to the cent, and `monthly-snapshots` unchanged in shape.

The phases are WORKFLOW.md § 2's. B–E are automated by a throwaway Playwright script on the emulators, on E2's kind
of account (a cash account and instruments with `autoUpdatePrice: false`, never `test-user-1`): no step reaches a
market service, a model or a mailbox, so no yes of the owner's is needed (decision 48).

- A, invariance — the diff read by the owner; the month's `monthly-snapshots` document has the same fields before
  and after a run.
- B, change of context — a second account's click writes under its own uid, never the first's.
- C, the new behaviour — the click and the document; a second click the same day → still one key, a later `at`.
- D, under the UI — the route called directly with a loan (quantity 50.000, value −50.000) and a zero-quantity
  instrument planted (decoys «ornitorinco», «fenicottero») → the first is in `assets`, the second is not.
- E, the negative pair — another account reads the month through the client SDK → permission-denied; the owner →
  the document.
- G, the mirror — a month planted at `dailySnapshots/prod-mirror/months/{this month}` through the Admin REST, then
  `npm run mirror:remove`: the document is gone. `npm run mirror:seed -- <email>` reads production, where the
  archive holds no day before the first evening after the merge to `main`: it logs 0 months copied and does not
  fail. It is run once, with the owner (it reads his account).
- F — at the owner's «pronto», on the mirror: Panoramica › «Crea snapshot», then the document in the emulator UI.

## 8. Putting it into service

1. The owner publishes `firestore.rules` (the hand deploy of SETUP.md) — before or with the merge: nothing reads the
   path until DATI-13.
2. The owner publishes `firestore.indexes.json` when convenient — after the deploy, alone, and before this spec's
   retirement (decision 96): the deploy offers to delete `price-history`; yes.
3. Merge to `develop`, then `develop → main` at once, as every spec of this series (index § 8, rule 13): days not
   filed are lost (decision 28).
4. Measure, the morning after the first 18:00 UTC run in production: one key under `days` per account; then
   `npm run mirror:seed -- <email>` logs one daily month copied, and `npm run mirror:remove` closes it. No budget
   moves (`perf:budget`: no page imports the hook yet; run it once to see +0,0).

## 9. Documentation

- `doc/guide/storico.md` — new § «The daily archive» (the path, the row, who writes, `mergeFields`, what it is not:
  not a second snapshot series, never read by the monthly readers; one query per month, a closed month final and
  persisted, 24 hours of persisted cache); its § Files gains the four modules (util, server store, client service,
  hook) and `e2e/daily-snapshots.rules.spec.ts`; its § Per-page blind spots gains: a US instrument's row is its
  price at 18:00 UTC, mid-session (decision 49); a row written after a failed price update repeats the stored price
  and carries no mark (decision 50); a day the cron skipped stays a hole; a deleted asset stays as a key in the old
  rows; the manual snapshot route files no daily row; no daily price exists for an instrument the account does not
  hold.
- `doc/guide/cache-persistita.md` — the new prefix and the finality rule (`isDailyMonthFinal`), one paragraph.
- `AGENTS.md` § Firestore Writes — one sentence inside the bare-`.set()` bullet, which is rewritten and not grown by
  more than two lines (the file is at 989 of ~1.000): a day inside a map document is written with `mergeFields` on
  its path (2026-11-23).
- `CLAUDE.md` — Architecture Snapshot, one clause («a daily archive beside the monthly snapshots,
  doc/guide/storico.md § The daily archive»); the «Latest» entry REPLACED whole (decision 46: the date, this spec in
  one sentence, «Open: doc/dati/ (README § 6)», «Next: DATI-03»); under 20.000 characters, counted with `node`
  (doc/guide/collaudo.md § Where things are recorded).
- `doc/guide/e2e-emulatori.md` — the mirror's new list.
- `Draft Release Temp.md`: no entry (nothing a user sees yet).
- `doc/dati/README.md` § 6: status row.

## 10. Declared out of scope

- Every consumer: the daily chart and the month-to-date figure → DATI-13; Rendimenti's daily volatility and drawdown
  and Panoramica's daily line → DATI-14; the Assistente's and the Consulente's thirty-day block → DATI-15.
- A reconstruction of the past from Yahoo's daily history → not planned (decision 28).
- A daily row from the manual snapshot route → not planned (it files a typed total of another month); recorded in
  doc/guide/storico.md § Per-page blind spots.
- Daily prices of instruments the account does not hold → not planned; recorded in doc/guide/storico.md § Per-page
  blind spots.
- A mark on a row whose prices were not refreshed, the US close instead of the 18:00 UTC price → not planned
  (decisions 50 and 49); recorded in the same blind spots.

## 11. The prompt that implements it

```
Ciao, in questa sessione vorrei implementare la spec doc/dati/DATI-02-archivio-giornaliero.md

Contesto, prima di toccare qualsiasi file (le regole del repo cambiano il modo di lavorare):
- Leggi WORKFLOW.md (regole di sessione e di collaudo; l'ultima sezione dice come si
  applicano in questo repo)
- Leggi AGENTS.md (pattern, convenzioni, gotcha)
- CLAUDE.md (l'indice: che cos'è e dove sta ogni cosa, lo stato corrente) è già nel
  contesto: usalo per trovare la guida giusta
- Leggi la spec per intero e l'indice della serie doc/dati/README.md (decisioni, contratti
  condivisi — qui C1 —, regole della serie)
- Leggi doc/guide/storico.md (gli snapshot), doc/guide/server.md (le route e l'autorizzazione),
  doc/guide/e2e-emulatori.md e doc/guide/e2e-playwright.md PRIMA di scrivere codice in quei domini
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

Implementa la spec così com'è scritta, nell'ordine: il modulo puro con i suoi test (U1–U5, ognuno
visto rosso con la sua mutazione: U1–U6), lo store server e la route (R1–R3, con il ramo nuovo del mock
descritto nel § 6), la rule, il servizio client con chiavi, prefisso persistito e hook (H1, P1),
l'invalidazione in useCreateSnapshot (H2), il mirror e le due voci morte (M1), poi E1 ed E2 sugli
emulatori, i documenti del § 9 e la riga 02 di doc/dati/README.md § 6 a `implemented`. Il codice dei
§ 4.2 e § 4.3 è già scritto: copialo. I due comandi del § 8 (rules, indexes) li lancio io: dammeli una
riga alla volta con l'esito atteso. `npm run perf:budget` una volta, atteso +0,0.

Fermati e chiedimi se: la route dello snapshot non è più come la descrive il § 1 (commit b0bf8276),
`mergeFields` con un percorso `days.DD` non si comporta sull'emulatore come dice il § 4.3, oppure un
test esistente dello snapshot diventa rosso.

Collaudo: § 7 (nessun passo raggiunge un servizio di mercato, un modello o una casella: se uno ti serve,
chiedimelo prima), la G con me, la F al mio «pronto». Un branch, un commit, solo dopo il mio OK con il
riassunto del diff. SESSION_NOTES.md non si committa. A commit in develop, ricordami la PR develop → main
(regola 13 dell'indice): i giorni non archiviati sono persi.
```

Model: **Opus 5.5**, effort **medium** — a new collection with its security rule and a shared contract. Estimated
size: M (four new modules, one route, the rules, the mirror; 16 tests).
