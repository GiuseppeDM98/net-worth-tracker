/**
 * «Invia ora» (POST /api/user/monthly-email/send): the last CLOSED period on the Italian day, never the
 * month in progress; a manual send recorded in the ledger with `manual: true`; an unknown period or the
 * demo account refused before any read; a ledger that fails after the send still answers success.
 *
 * The email and the ledger are mocked: nothing here sends or calls the model.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const { verifyIdTokenMock, getSettingsAdminMock, buildAndSendMock, confirmMock } = vi.hoisted(() => ({
  verifyIdTokenMock: vi.fn(),
  getSettingsAdminMock: vi.fn(),
  buildAndSendMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { verifyIdToken: verifyIdTokenMock }, adminDb: {} }));
vi.mock('@/lib/server/monthlyEmailService', () => ({
  getSettingsAdmin: getSettingsAdminMock,
  buildAndSendForPeriod: buildAndSendMock,
}));
vi.mock('@/lib/server/emailDeliveries', () => ({ confirmEmailDelivery: confirmMock }));

type RouteHandler = (request: NextRequest) => Promise<Response>;
const RECIPIENTS = ['census@example.com'];
let POST: RouteHandler;

beforeAll(async () => {
  ({ POST } = await import('@/app/api/user/monthly-email/send/route'));
}, 60_000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // 15 November 2026, evening in Rome.
  vi.setSystemTime(new Date('2026-11-15T19:30:00Z'));
  vi.stubEnv('NEXT_PUBLIC_DEMO_USER_ID', 'demo-user');
  verifyIdTokenMock.mockResolvedValue({ uid: 'user-a' });
  getSettingsAdminMock.mockResolvedValue({
    monthlyEmailEnabled: true,
    yearlyEmailEnabled: true,
    monthlyEmailRecipients: RECIPIENTS,
  });
  buildAndSendMock.mockResolvedValue(true);
  confirmMock.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

function send(body?: unknown) {
  return POST(
    new NextRequest('http://localhost/api/user/monthly-email/send', {
      method: 'POST',
      headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

describe('«Invia ora» sends the last closed period', () => {
  it('sends October for monthly on 15 November, and records it as manual', async () => {
    const response = await send({ periodType: 'monthly' });
    expect(response.status).toBe(200);
    expect(buildAndSendMock).toHaveBeenCalledWith('user-a', RECIPIENTS, 'monthly', 2026, 10);
    expect(confirmMock).toHaveBeenCalledWith('user-a', 'monthly', '2026-10', expect.any(Date), true);
  });

  it('sends 2025 for yearly on 15 November, and records it as manual', async () => {
    const response = await send({ periodType: 'yearly' });
    expect(response.status).toBe(200);
    expect(buildAndSendMock).toHaveBeenCalledWith('user-a', RECIPIENTS, 'yearly', 2025, 12);
    expect(confirmMock).toHaveBeenCalledWith('user-a', 'yearly', '2025', expect.any(Date), true);
  });

  it('reads no periodType as monthly', async () => {
    const response = await send();
    expect(response.status).toBe(200);
    expect(buildAndSendMock).toHaveBeenCalledWith('user-a', RECIPIENTS, 'monthly', 2026, 10);
  });

  it('still answers success when the ledger fails after the send', async () => {
    confirmMock.mockRejectedValueOnce(new Error('Firestore down'));
    const response = await send({ periodType: 'monthly' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });
});

describe('«Invia ora» refuses before any read', () => {
  it.each(['weekly-budget', 'quarterly', 'semiannual'])('answers 400 to periodType %s', async (periodType) => {
    const response = await send({ periodType });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'periodType non valido' });
    expect(getSettingsAdminMock).not.toHaveBeenCalled();
    expect(buildAndSendMock).not.toHaveBeenCalled();
  });

  it('answers 403 to the demo account', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'demo-user' });
    const response = await send({ periodType: 'monthly' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Non disponibile in demo' });
    expect(getSettingsAdminMock).not.toHaveBeenCalled();
  });
});

// The `error` text is the toast the page shows: Italian, never the route's English.
describe('«Invia ora» says why in Italian', () => {
  it('names the period that is off', async () => {
    getSettingsAdminMock.mockResolvedValue({ monthlyEmailEnabled: false, yearlyEmailEnabled: false, monthlyEmailRecipients: RECIPIENTS });
    expect(await (await send({ periodType: 'monthly' })).json()).toEqual({ error: "L'email mensile non è attiva" });
    expect(await (await send({ periodType: 'yearly' })).json()).toEqual({ error: "L'email annuale non è attiva" });
    expect(buildAndSendMock).not.toHaveBeenCalled();
  });

  it('says there is no recipient', async () => {
    getSettingsAdminMock.mockResolvedValue({ monthlyEmailEnabled: true, monthlyEmailRecipients: [] });
    const response = await send({ periodType: 'monthly' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Nessun destinatario configurato' });
  });

  it('says the period has no snapshot, and records nothing', async () => {
    buildAndSendMock.mockResolvedValue(false);
    const response = await send({ periodType: 'yearly' });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Nessuno snapshot per questo periodo: salvane uno prima' });
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('says the send failed', async () => {
    buildAndSendMock.mockRejectedValue(new Error('Resend down'));
    const response = await send({ periodType: 'monthly' });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: 'Invio non riuscito' });
  });
});
