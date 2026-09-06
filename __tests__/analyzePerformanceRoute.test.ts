import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

vi.mock('server-only', () => ({}));

// The route refuses to run without a key, before it ever reaches the SDK.
vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key';
});

vi.mock('@/lib/server/apiAuth', () => ({
  requireFirebaseAuth: vi.fn(async () => ({ uid: 'user-1' })),
  assertCanAccessAccount: vi.fn(async () => undefined),
  getApiAuthErrorResponse: vi.fn(() => null),
}));

vi.mock('@/lib/server/rateLimit', () => ({
  checkRateLimit: vi.fn(() => ({ allowed: true })),
}));

import { POST } from '@/app/api/ai/analyze-performance/route';

const OVERLOADED_MESSAGE = 'I server AI sono temporaneamente sovraccarichi. Riprova tra qualche secondo.';

// The envelope the API returns on a 529, exactly as the SDK receives it.
const OVERLOADED_ENVELOPE = {
  type: 'error',
  error: { type: 'overloaded_error', message: 'Overloaded' },
};

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost/api/ai/analyze-performance', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify({
      userId: 'user-1',
      timePeriod: '1Y',
      metrics: {
        startDate: '2025-01-01T12:00:00.000Z',
        endDate: '2025-12-31T12:00:00.000Z',
        startNetWorth: 100000,
        endNetWorth: 110000,
        netCashFlow: 5000,
        roi: 5,
        cagr: 5,
        timeWeightedReturn: 5,
        moneyWeightedReturn: 5,
        volatility: 8,
        sharpeRatio: 0.6,
        maxDrawdown: -4,
        maxDrawdownDate: '2025-04-30T12:00:00.000Z',
        drawdownDuration: 2,
        recoveryTime: 1,
        numberOfMonths: 12,
        currentYield: 2,
        currentYieldNet: 1.5,
        yocGross: 2.2,
        yocNet: 1.7,
      },
    }),
  });
}

/**
 * Posts one analysis whose upstream call rejects with `failure`. The SDK client is built at
 * module load, so the rejection is injected on the shared `Messages.prototype.create`.
 */
async function postWithUpstreamFailure(failure: unknown) {
  vi.spyOn(Anthropic.Messages.prototype, 'create').mockRejectedValue(failure);
  const response = await POST(buildRequest());
  return { status: response.status, body: await response.json() };
}

describe('POST /api/ai/analyze-performance upstream failures', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('answers 503 «sovraccarichi» on the real SDK overload error', async () => {
    // Regression: with sdk 0.110 the inner type lives on `error.type` and `error.error` is
    // the whole envelope, so a read of `error.error.type` saw 'error' and fell through to 500.
    const sdkError = Anthropic.APIError.generate(529, OVERLOADED_ENVELOPE, 'Overloaded', new Headers());

    const { status, body } = await postWithUpstreamFailure(sdkError);

    expect(status).toBe(503);
    expect(body).toEqual({ error: OVERLOADED_MESSAGE, retryable: true });
  });

  it('answers 503 «sovraccarichi» on the raw envelope shape the mocks throw', async () => {
    const rawEnvelope = { error: { type: 'overloaded_error', message: 'Overloaded' } };

    const { status, body } = await postWithUpstreamFailure(rawEnvelope);

    expect(status).toBe(503);
    expect(body).toEqual({ error: OVERLOADED_MESSAGE, retryable: true });
  });

  it('reports the inner body message of any other SDK failure', async () => {
    const sdkError = Anthropic.APIError.generate(
      500,
      { type: 'error', error: { type: 'api_error', message: 'Boom' } },
      undefined,
      new Headers()
    );

    const { status, body } = await postWithUpstreamFailure(sdkError);

    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Errore nella chiamata AI: Boom', retryable: false });
  });
});
