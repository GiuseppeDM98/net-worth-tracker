/**
 * The periodic emails' cron, on a pinned Italian day, with the REAL ledger on an in-memory Firestore:
 * what is due when (nothing outside the first three days of a month), the closed period it is about,
 * the two comments of 1 January written side by side, and each (account, kind, period) sent once —
 * a failed or empty send frees the period, a send that went out is never freed.
 *
 * The email itself is mocked (`buildAndSendForPeriod`): nothing here sends or calls the model.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAdminDb, type FakeAdminDb } from './fixtures/fakeAdminDb';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const { holder, getSettingsAdminMock, buildAndSendMock } = vi.hoisted(() => ({
  holder: { db: null as unknown },
  getSettingsAdminMock: vi.fn(),
  buildAndSendMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { verifyIdToken: vi.fn() },
  get adminDb() {
    return holder.db;
  },
}));

vi.mock('@/lib/server/monthlyEmailService', () => ({
  getSettingsAdmin: getSettingsAdminMock,
  buildAndSendForPeriod: buildAndSendMock,
}));

type CronRouteHandler = (request: NextRequest) => Promise<Response>;
const MODULE_LOAD_TIMEOUT_MS = 60_000;
const RECIPIENTS = ['census@example.com'];

let GET: CronRouteHandler;
let db: FakeAdminDb;

beforeAll(async () => {
  ({ GET } = await import('@/app/api/cron/periodic-emails/route'));
}, MODULE_LOAD_TIMEOUT_MS);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.stubEnv('CRON_SECRET', 'test-cron-secret');
  vi.stubEnv('NEXT_PUBLIC_DEMO_USER_ID', 'demo-user');
  db = createFakeAdminDb();
  holder.db = db;
  db.docs.set('users/user-a', {});
  getSettingsAdminMock.mockResolvedValue({
    monthlyEmailEnabled: true,
    yearlyEmailEnabled: true,
    monthlyEmailRecipients: RECIPIENTS,
  });
  buildAndSendMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetAllMocks();
});

/** The cron fires inside the hour of 19:00 UTC: 20:30 or 21:30 in Rome, the same Italian day. */
function atCronHour(isoDay: string) {
  vi.setSystemTime(new Date(`${isoDay}T19:30:00Z`));
}

async function run(): Promise<{ emails: { sent: number; skipped: number; errors: number } }> {
  const response = await GET(
    new NextRequest('http://localhost/api/cron/periodic-emails', { headers: { authorization: 'Bearer test-cron-secret' } }),
  );
  expect(response.status).toBe(200);
  return response.json();
}

const ledger = (id: string) => db.docs.get(`emailDeliveries/${id}`);

describe('what the emails cron sends, and when', () => {
  it.each(['2026-11-04', '2026-03-31', '2026-11-08', '2026-06-30'])('sends nothing and reads no account on %s', async (day) => {
    atCronHour(day);
    const body = await run();
    expect(buildAndSendMock).not.toHaveBeenCalled();
    expect(db.reads.get('users')).toBeUndefined();
    expect(body.emails).toEqual({ sent: 0, skipped: 0, errors: 0 });
  });

  it('sends October on 1 November, never November', async () => {
    atCronHour('2026-11-01');
    const body = await run();
    expect(buildAndSendMock).toHaveBeenCalledTimes(1);
    expect(buildAndSendMock).toHaveBeenCalledWith('user-a', RECIPIENTS, 'monthly', 2026, 10);
    expect(body.emails.sent).toBe(1);
    expect(ledger('user-a_monthly_2026-10')?.status).toBe('sent');
  });

  it('sends December and the year on 1 January, the second started before the first resolves', async () => {
    atCronHour('2027-01-01');
    const resolvers: ((sent: boolean) => void)[] = [];
    buildAndSendMock.mockImplementation(() => new Promise<boolean>((resolve) => resolvers.push(resolve)));
    const pending = run();
    await vi.waitFor(() => expect(buildAndSendMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
    expect(buildAndSendMock).toHaveBeenCalledWith('user-a', RECIPIENTS, 'monthly', 2026, 12);
    expect(buildAndSendMock).toHaveBeenCalledWith('user-a', RECIPIENTS, 'yearly', 2026, 12);
    resolvers.forEach((resolve) => resolve(true));
    const body = await pending;
    expect(body.emails.sent).toBe(2);
    expect(ledger('user-a_yearly_2026')?.status).toBe('sent');
  });

  it('skips a kind switched off', async () => {
    atCronHour('2027-01-01');
    getSettingsAdminMock.mockResolvedValue({ monthlyEmailEnabled: true, yearlyEmailEnabled: false, monthlyEmailRecipients: RECIPIENTS });
    const body = await run();
    expect(buildAndSendMock).toHaveBeenCalledTimes(1);
    expect(buildAndSendMock).toHaveBeenCalledWith('user-a', RECIPIENTS, 'monthly', 2026, 12);
    expect(body.emails).toEqual({ sent: 1, skipped: 1, errors: 0 });
  });

  it('skips an account with no recipient', async () => {
    atCronHour('2026-11-01');
    getSettingsAdminMock.mockResolvedValue({ monthlyEmailEnabled: true, yearlyEmailEnabled: true, monthlyEmailRecipients: [] });
    const body = await run();
    expect(buildAndSendMock).not.toHaveBeenCalled();
    expect(body.emails.skipped).toBe(1);
  });

  it('skips the demo account without reading its settings', async () => {
    atCronHour('2026-11-01');
    db.docs.delete('users/user-a');
    db.docs.set('users/demo-user', {});
    const body = await run();
    expect(getSettingsAdminMock).not.toHaveBeenCalled();
    expect(buildAndSendMock).not.toHaveBeenCalled();
    expect(body.emails.skipped).toBe(1);
  });
});

describe('each period leaves once', () => {
  it('sends nothing on a second run the same day', async () => {
    atCronHour('2026-11-01');
    await run();
    const second = await run();
    expect(buildAndSendMock).toHaveBeenCalledTimes(1);
    expect(second.emails).toEqual({ sent: 0, skipped: 1, errors: 0 });
  });

  it('frees the period when the send throws, and the next run sends it', async () => {
    atCronHour('2026-11-01');
    buildAndSendMock.mockRejectedValueOnce(new Error('Resend down'));
    const first = await run();
    expect(first.emails.errors).toBe(1);
    expect(ledger('user-a_monthly_2026-10')).toBeUndefined();
    atCronHour('2026-11-02');
    const second = await run();
    expect(second.emails.sent).toBe(1);
    expect(buildAndSendMock).toHaveBeenLastCalledWith('user-a', RECIPIENTS, 'monthly', 2026, 10);
  });

  it('frees the period when there was nothing to send', async () => {
    atCronHour('2026-11-01');
    buildAndSendMock.mockResolvedValueOnce(false);
    const first = await run();
    expect(first.emails.skipped).toBe(1);
    expect(ledger('user-a_monthly_2026-10')).toBeUndefined();
    await run();
    expect(buildAndSendMock).toHaveBeenCalledTimes(2);
  });

  it('does NOT free the period when the confirm fails after the send, and counts it sent', async () => {
    atCronHour('2026-11-01');
    db.failWrite = (_path, data) => data.status === 'sent';
    const first = await run();
    expect(first.emails).toEqual({ sent: 1, skipped: 0, errors: 0 });
    expect(ledger('user-a_monthly_2026-10')?.status).toBe('sending');
    db.failWrite = null;
    await run();
    expect(buildAndSendMock).toHaveBeenCalledTimes(1);
  });
});
