/**
 * The daily archive on the emulators (2026-11-23): `dailySnapshots/{uid}/months/{YYYY-MM}`.
 *
 * Unit suites mock Firestore away, so two things only the emulators can say live here:
 *  - the RULE, read through the client REST API with Auth-emulator ID tokens — the owner reads, another
 *    account is refused, a member of the shared account reads, nobody writes, and a month never written
 *    answers 404 («absent»), not 403. Seen red with the rule loosened to `allow read: if isAuthenticated()`.
 *  - the WRITE, `mergeFields` on `days.DD`: one «Crea snapshot» POST on a month that already holds
 *    another day leaves both days. Seen red with a bare `.set()` in lib/server/dailySnapshotStore.ts.
 *
 * The write runs on an account of its own (`daily-e2e@example.com`, created and deleted here) holding a
 * cash account and an instrument with `autoUpdatePrice: false`: the route's price update finds nothing
 * to ask the market, so no market service is reached and no price of the shared seed is rewritten.
 * Invented round figures. No page is opened: the project's browser session is not used.
 */

import { expect, test } from '@playwright/test';
import { FIRESTORE_DOCUMENTS } from './emulator';

const FIRESTORE = FIRESTORE_DOCUMENTS;
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const PASSWORD = 'test1234';
const E2E_EMAIL = 'daily-e2e@example.com';

type Json = Record<string, unknown>;

/** Today in Italy, as the route keys it (`getItalyDateIso`): a spec cannot import lib/. */
function italyToday(): { monthKey: string; day: string; year: number; month: number } {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  return { monthKey: iso.slice(0, 7), day: iso.slice(8, 10), year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

function toValue(value: unknown): Json {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  return { mapValue: { fields: toFields(value as Json) } };
}

function toFields(object: Json): Json {
  return Object.fromEntries(Object.entries(object).map(([key, value]) => [key, toValue(value)]));
}

async function adminWrite(path: string, data: Json): Promise<void> {
  const res = await fetch(`${FIRESTORE}/${path}`, { method: 'PATCH', headers: ADMIN, body: JSON.stringify({ fields: toFields(data) }) });
  expect(res.ok, `${path}: ${res.status}`).toBe(true);
}

async function adminDelete(path: string): Promise<void> {
  await fetch(`${FIRESTORE}/${path}`, { method: 'DELETE', headers: ADMIN });
}

async function adminRead(path: string): Promise<{ status: number; body: Json }> {
  const res = await fetch(`${FIRESTORE}/${path}`, { headers: ADMIN });
  return { status: res.status, body: (await res.json()) as Json };
}

async function signIn(email: string): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(`${AUTH}/accounts:signInWithPassword?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const body = (await res.json()) as { localId: string; idToken: string };
  expect(res.ok, `sign-in ${email}: ${res.status}`).toBe(true);
  return { uid: body.localId, idToken: body.idToken };
}

/** The account of E2, created on first use; a run that died before its `afterAll` left it, so sign in. */
async function signUpOrIn(email: string): Promise<{ uid: string; idToken: string }> {
  const res = await fetch(`${AUTH}/accounts:signUp?key=fake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) return signIn(email);
  const body = (await res.json()) as { localId: string; idToken: string };
  return { uid: body.localId, idToken: body.idToken };
}

/** A month document of the archive, read as an end user (the rule decides). */
function readAs(idToken: string, path: string): Promise<Response> {
  return fetch(`${FIRESTORE}/${path}`, { headers: { Authorization: `Bearer ${idToken}` } });
}

function dayRow(netWorth: number): Json {
  return { netWorth, liquid: netWorth, byClass: { cash: netWorth }, assets: {}, at: '2026-01-01T12:00:00.000Z' };
}

test.describe('the daily archive — the rule', () => {
  const PLANTED_MONTH = '2001-01';
  const NEVER_WRITTEN = '2001-02';

  test('owner and member read, another account is refused, nobody writes, an absent month is 404', async () => {
    const owner = await signIn('test@example.com');
    const other = await signIn('degraded@example.com');
    const path = `dailySnapshots/${owner.uid}/months/${PLANTED_MONTH}`;
    await adminWrite(path, { userId: owner.uid, month: PLANTED_MONTH, days: { '15': dayRow(10000) } });

    try {
      expect((await readAs(owner.idToken, path)).status).toBe(200);
      expect((await readAs(other.idToken, path)).status).toBe(403);
      expect((await readAs(owner.idToken, `dailySnapshots/${owner.uid}/months/${NEVER_WRITTEN}`)).status).toBe(404);

      const patch = await fetch(`${FIRESTORE}/${path}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${owner.idToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: toFields({ userId: owner.uid, month: PLANTED_MONTH, days: {} }) }),
      });
      expect(patch.status).toBe(403);

      await adminWrite(`account-access/${owner.uid}`, { ownerUid: owner.uid, memberUids: [other.uid] });
      expect((await readAs(other.idToken, path)).status).toBe(200);
    } finally {
      await adminDelete(`account-access/${owner.uid}`);
      await adminDelete(path);
    }
  });
});

test.describe('the daily archive — the write', () => {
  let account: { uid: string; idToken: string };

  test.beforeAll(async () => {
    account = await signUpOrIn(E2E_EMAIL);
    const base = { userId: account.uid, currency: 'EUR', currentPrice: 1, autoUpdatePrice: false, createdAt: new Date(), updatedAt: new Date() };
    await adminWrite(`assets/daily-e2e-cash`, { ...base, ticker: 'CASH', name: 'Conto Alfa', type: 'cash', assetClass: 'cash', quantity: 2500, subCategory: 'Conto Corrente' });
    await adminWrite(`assets/daily-e2e-etf`, { ...base, ticker: 'ALFA', name: 'ETF Alfa', type: 'etf', assetClass: 'equity', quantity: 100, currentPrice: 75 });
  });

  test.afterAll(async () => {
    const { year, month } = italyToday();
    await adminDelete('assets/daily-e2e-cash');
    await adminDelete('assets/daily-e2e-etf');
    await adminDelete(`monthly-snapshots/${account.uid}-${year}-${month}`);
    await adminDelete(`dashboardOverviewSummaries/${account.uid}`);
    const months = await adminRead(`dailySnapshots/${account.uid}/months`);
    for (const doc of (months.body.documents as { name: string }[] | undefined) ?? []) {
      await adminDelete(`dailySnapshots/${account.uid}/months/${doc.name.split('/').pop()}`);
    }
    await fetch(`${AUTH}/accounts:delete?key=fake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: account.idToken }),
    });
  });

  test('one «Crea snapshot» files today and leaves the other day of the month', async ({ request }) => {
    const { monthKey, day } = italyToday();
    const otherDay = day === '01' ? '02' : '01';
    const path = `dailySnapshots/${account.uid}/months/${monthKey}`;
    await adminWrite(path, { userId: account.uid, month: monthKey, days: { [otherDay]: dayRow(1120) } });

    const response = await request.post('/api/portfolio/snapshot', {
      headers: { Authorization: `Bearer ${account.idToken}` },
      data: { userId: account.uid },
    });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, data: { dailyWritten: true } });

    const { status, body } = await adminRead(path);
    expect(status).toBe(200);
    const days = ((body.fields as Json).days as { mapValue: { fields: Record<string, { mapValue: { fields: Json } }> } }).mapValue.fields;
    expect(Object.keys(days).sort()).toEqual([otherDay, day].sort());
    // The planted day untouched, today's row the account's 10.000 (2.500 cash + 100 × 75).
    expect(days[otherDay].mapValue.fields.netWorth).toEqual({ integerValue: '1120' });
    expect(days[day].mapValue.fields.netWorth).toEqual({ integerValue: '10000' });
  });
});
