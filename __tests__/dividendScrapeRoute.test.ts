import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { AssetTransaction } from '@/types/assetTransactions';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/server/apiAuth', () => ({
  requireFirebaseAuth: vi.fn(async () => ({ uid: 'user-1' })),
  assertCanAccessAccount: vi.fn(async () => undefined),
  getApiAuthErrorResponse: vi.fn(() => null),
}));

const { assetData, otherDocs, trades, createDividendMock, scrapeMock, getDividendByIdMock, createExpenseMock } = vi.hoisted(() => ({
  assetData: { current: {} as Record<string, unknown> },
  otherDocs: { current: {} as Record<string, Record<string, unknown>> },
  getDividendByIdMock: vi.fn(async () => null as unknown),
  createExpenseMock: vi.fn(async () => 'exp-1'),
  trades: { current: [] as unknown[] },
  createDividendMock: vi.fn(async () => 'div-new'),
  scrapeMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn((id: string) => ({
        get: vi.fn(async () =>
          name === 'assets'
            ? { exists: true, id, data: () => assetData.current }
            : otherDocs.current[name]
              ? { exists: true, id, data: () => otherDocs.current[name] }
              : { exists: false, id, data: () => undefined }
        ),
      })),
    })),
  },
}));

vi.mock('@/lib/server/assetAdminRepository', () => ({
  getAssetTransactionsForAssetAdmin: vi.fn(async () => trades.current),
}));

vi.mock('@/lib/services/dividendService', () => ({
  createDividend: createDividendMock,
  isDuplicateDividend: vi.fn(async () => false),
  getDividendById: getDividendByIdMock,
}));

vi.mock('@/lib/services/borsaItalianaScraperService', () => ({ scrapeDividendsByIsin: scrapeMock }));
vi.mock('@/lib/services/dividendIncomeService', () => ({ createExpenseFromDividend: createExpenseMock }));

import { POST } from '@/app/api/dividends/scrape/route';

const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function trade(id: string, type: 'buy' | 'sell', iso: string, quantity: number): AssetTransaction {
  return {
    id, userId: 'user-1', assetId: 'a1', type, date: at(iso), quantity, pricePerUnit: 10, priceEur: 10,
    createdAt: at('2026-01-01'), updatedAt: at('2026-01-01'),
  } as AssetTransaction;
}

function buildRequest(): NextRequest {
  return new NextRequest('http://localhost/api/dividends/scrape', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify({ userId: 'user-1', assetId: 'a1' }),
  });
}

describe('POST /api/dividends/scrape — the quantity held at the ex-date (2026-11-23)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    otherDocs.current = {};
    assetData.current = {
      userId: 'user-1', ticker: 'ALFA', name: 'Alfa', isin: 'IT0000000001', type: 'stock', assetClass: 'equity',
      quantity: 0, averageCost: 10, createdAt: { toDate: () => at('2026-01-01') },
    };
    trades.current = [trade('t1', 'buy', '2026-01-15', 100), trade('t2', 'sell', '2026-03-10', 100)];
    scrapeMock.mockResolvedValue([
      { exDate: at('2026-03-05'), paymentDate: at('2026-03-12'), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'ordinary' },
      { exDate: at('2026-03-20'), paymentDate: at('2026-03-27'), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'ordinary' },
    ]);
  });

  // Red when the route keeps `asset.quantity`.
  it('on a sold-out asset creates the dividend held at its ex-date and counts the other as notHeld', async () => {
    const response = await POST(buildRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(createDividendMock).toHaveBeenCalledOnce();
    const created = (createDividendMock.mock.calls[0] as unknown[])[1] as { quantity: number; grossAmount: number };
    expect(created.quantity).toBe(100);
    expect(created.grossAmount).toBeCloseTo(50, 9);
    expect(body).toMatchObject({ created: 1, notHeld: 1 });
  });

  it('cashes a dividend paid today in Italy, even stored at UTC midnight (2026-11-24)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-12-14T23:30:00.000Z')); // 00:30 of 15/12 in Italy
    assetData.current = { ...assetData.current, quantity: 10 };
    trades.current = [];
    otherDocs.current = {
      assetAllocationTargets: { dividendIncomeCategoryId: 'cat-1' },
      expenseCategories: { name: 'Dividendi', subCategories: [] },
    };
    getDividendByIdMock.mockResolvedValue({ id: 'div-new' });
    scrapeMock.mockResolvedValue([
      { exDate: at('2026-12-01'), paymentDate: new Date('2026-12-15T00:00:00.000Z'), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'ordinary' },
    ]);

    await POST(buildRequest());
    vi.useRealTimers();

    expect(createExpenseMock).toHaveBeenCalledOnce();
  });
});
