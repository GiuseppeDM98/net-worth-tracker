/**
 * Contract test for POST /api/broker/scalable/read.
 *
 * The route once answered `{ plan }` for `holdings` and `overview` while the client read
 * `res.holdings` / `res.overview`. Both keys arrived `undefined`, and the client defaulted
 * them to `[]` / `null`: the preview showed ZERO positions and NO cash while reporting a
 * successful sync. Nothing else caught it, so the response shape is pinned here per command —
 * one command, one parsed payload, under its own key.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  runScalableReadCommand: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: {} }));
vi.mock('@/lib/server/apiAuth', () => ({
  requireFirebaseAuth: vi.fn(async () => ({ uid: 'owner-1' })),
  assertCanAccessAccount: vi.fn(async () => undefined),
  getApiAuthErrorResponse: vi.fn(() => null),
}));
vi.mock('@/lib/server/scalableCli', () => ({
  runScalableReadCommand: mocks.runScalableReadCommand,
  ScalableCliError: class ScalableCliError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

const HOLDINGS_STDOUT = JSON.stringify({
  ok: true,
  data: { result: { items: [{ isin: 'IE00B3VTMJ91', name: 'Bond', quantity: 10, price: 115.85 }] } },
});
const OVERVIEW_STDOUT = JSON.stringify({
  ok: true,
  data: { result: { valuation: { securities: 138626.79, crypto: 0, total: 138746.79 } } },
});
const OVERNIGHT_STDOUT = JSON.stringify({
  ok: true,
  data: {
    account: { display_name: 'Deposito non vincolato', is_active: true },
    result: { balance: 59201.61, interest_rate: 0.026 },
  },
});

function request(command: string): NextRequest {
  return new NextRequest('http://localhost/api/broker/scalable/read', {
    method: 'POST',
    body: JSON.stringify({ ownerId: 'owner-1', command }),
  });
}

async function post(command: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import('@/app/api/broker/scalable/read/route');
  const response = await POST(request(command));
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe('POST /api/broker/scalable/read', () => {
  beforeEach(() => {
    mocks.runScalableReadCommand.mockReset();
  });

  it('answers `holdings` with the parsed rows under `holdings`, not a plan', async () => {
    mocks.runScalableReadCommand.mockResolvedValue(HOLDINGS_STDOUT);
    const { status, body } = await post('holdings');
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('plan');
    expect(Array.isArray(body.holdings)).toBe(true);
    expect(body.holdings).toHaveLength(1);
  });

  it('answers `overview` with the parsed totals under `overview`, not a plan', async () => {
    mocks.runScalableReadCommand.mockResolvedValue(OVERVIEW_STDOUT);
    const { status, body } = await post('overview');
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('plan');
    expect(body.overview).toMatchObject({ valuation: 138746.79, securitiesValuation: 138626.79 });
  });

  it('answers `overnight` with the parsed deposit under `overnight`', async () => {
    mocks.runScalableReadCommand.mockResolvedValue(OVERNIGHT_STDOUT);
    const { status, body } = await post('overnight');
    expect(status).toBe(200);
    expect(body).not.toHaveProperty('plan');
    expect(body.overnight).toMatchObject({ balance: 59201.61, interestRate: 0.026 });
  });

  it('runs only the whitelisted command for the requested verb', async () => {
    mocks.runScalableReadCommand.mockResolvedValue(OVERNIGHT_STDOUT);
    await post('overnight');
    expect(mocks.runScalableReadCommand).toHaveBeenCalledWith('overnight');
  });

  it('rejects an unknown command with 400', async () => {
    const { status } = await post('sell-everything');
    expect(status).toBe(400);
    expect(mocks.runScalableReadCommand).not.toHaveBeenCalled();
  });
});
