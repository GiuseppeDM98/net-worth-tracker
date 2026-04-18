import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const {
  scrapeDividendsByIsinMock,
  createDividendMock,
  isDuplicateDividendMock,
  createExpenseFromDividendMock,
} = vi.hoisted(() => ({
  scrapeDividendsByIsinMock: vi.fn(),
  createDividendMock: vi.fn(),
  isDuplicateDividendMock: vi.fn(),
  createExpenseFromDividendMock: vi.fn(),
}));

// Per-collection doc/query mocks — filled per-test in adminDb mock
const collectionMocks: Record<string, any> = {};

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (collectionMocks[name]) return collectionMocks[name];
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

vi.mock('@/lib/services/borsaItalianaScraperService', () => ({
  scrapeDividendsByIsin: scrapeDividendsByIsinMock,
}));

vi.mock('@/lib/services/dividendService', () => ({
  createDividend: createDividendMock,
  isDuplicateDividend: isDuplicateDividendMock,
}));

vi.mock('@/lib/services/dividendIncomeService', () => ({
  createExpenseFromDividend: createExpenseFromDividendMock,
}));

vi.mock('@/lib/utils/dateHelpers', () => ({
  isDateOnOrAfter: vi.fn(() => true),
}));

vi.mock('@/lib/utils/couponUtils', () => ({
  getFollowingCouponDate: vi.fn(),
  calculateCouponPerShare: vi.fn(() => 2.5),
  getApplicableCouponRate: vi.fn(() => 5),
}));

import {
  runDividendScraping,
  runExpenseCreation,
  runNextCouponScheduling,
} from '@/lib/server/dividendProcessor';
import { Timestamp } from 'firebase-admin/firestore';
import { getFollowingCouponDate } from '@/lib/utils/couponUtils';

// Helper: create a minimal Firestore-like QueryDocumentSnapshot
function makeUserDoc(id: string) {
  return { id } as any;
}

function makeQuerySnapshot(docs: any[]) {
  return { docs, empty: docs.length === 0, size: docs.length };
}

function makeAssetDoc(data: Record<string, any>) {
  return {
    exists: true,
    id: data.id,
    data: () => ({ createdAt: { toDate: () => new Date('2020-01-01') }, ...data }),
  };
}

function makeDocRef(docData: any) {
  return { get: vi.fn().mockResolvedValue(docData) };
}

function makeCollection(queryResult: any) {
  const chain = {
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    get: vi.fn().mockResolvedValue(queryResult),
  };
  return chain;
}

// ────────────────────────────────────────────────────────────────────────────
// Phase 1: runDividendScraping
// ────────────────────────────────────────────────────────────────────────────
describe('runDividendScraping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('skips assets without ISIN', async () => {
    const assetWithoutIsin = {
      id: 'a1',
      ticker: 'NONAME',
      isin: '',
      assetClass: 'equity',
      quantity: 10,
      type: 'stock',
    };

    collectionMocks['assets'] = makeCollection(
      makeQuerySnapshot([makeAssetDoc(assetWithoutIsin)])
    );

    const result = await runDividendScraping([makeUserDoc('u1')], new Date());

    expect(scrapeDividendsByIsinMock).not.toHaveBeenCalled();
    expect(result.assetsScraped).toBe(0);
    expect(result.newDividends).toBe(0);
  });

  it('skips duplicate dividends', async () => {
    const asset = {
      id: 'a1',
      ticker: 'ENI',
      isin: 'IT0003132476',
      assetClass: 'equity',
      quantity: 100,
      type: 'stock',
      averageCost: 12,
    };

    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc(asset)]));

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 10);
    const exDate = new Date();

    scrapeDividendsByIsinMock.mockResolvedValue([
      { exDate, paymentDate: new Date(), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'dividend' },
    ]);
    isDuplicateDividendMock.mockResolvedValue(true); // already exists

    const result = await runDividendScraping([makeUserDoc('u1')], sixtyDaysAgo);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.newDividends).toBe(0);
    expect(result.assetsScraped).toBe(1); // asset was scraped, just no new entry
  });

  it('creates dividend entry for non-duplicate', async () => {
    const asset = {
      id: 'a1',
      ticker: 'ENI',
      isin: 'IT0003132476',
      assetClass: 'equity',
      quantity: 100,
      type: 'stock',
      averageCost: 12,
    };

    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc(asset)]));

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 10);
    const exDate = new Date();

    scrapeDividendsByIsinMock.mockResolvedValue([
      { exDate, paymentDate: new Date(), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'dividend' },
    ]);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('div-1');

    const result = await runDividendScraping([makeUserDoc('u1')], sixtyDaysAgo);

    expect(createDividendMock).toHaveBeenCalledOnce();
    expect(result.newDividends).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 2: runExpenseCreation
// ────────────────────────────────────────────────────────────────────────────
describe('runExpenseCreation', () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStart = Timestamp.fromDate(new Date());
  const todayEnd = Timestamp.fromDate(new Date());

  it('skips dividends that already have an expenseId (idempotency)', async () => {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ dividendIncomeCategoryId: 'cat-1' }) })),
    };
    collectionMocks['expenseCategories'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ name: 'Dividendi', subCategories: [] }) })),
    };

    const dividendWithExpense = {
      id: 'div-1',
      data: () => ({ expenseId: 'existing-expense', assetTicker: 'ENI', paymentDate: { toDate: () => new Date() } }),
    };
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([dividendWithExpense]));

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it('skips users without dividendIncomeCategoryId configured', async () => {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({}) })), // no category
    };

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it('creates expense for dividend without expenseId', async () => {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ dividendIncomeCategoryId: 'cat-1' }) })),
    };
    collectionMocks['expenseCategories'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ name: 'Dividendi', subCategories: [] }) })),
    };

    const dividendDoc = {
      id: 'div-1',
      data: () => ({
        assetTicker: 'ENI',
        assetName: 'Eni',
        assetId: 'a1',
        isin: 'IT0003',
        currency: 'EUR',
        dividendType: 'dividend',
        grossAmount: 50,
        taxAmount: 13,
        netAmount: 37,
        dividendPerShare: 0.5,
        quantity: 100,
        exDate: { toDate: () => new Date() },
        paymentDate: { toDate: () => new Date() },
        createdAt: { toDate: () => new Date() },
        updatedAt: { toDate: () => new Date() },
        // no expenseId
      }),
    };
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([dividendDoc]));
    createExpenseFromDividendMock.mockResolvedValue('new-expense-id');

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd);

    expect(createExpenseFromDividendMock).toHaveBeenCalledOnce();
    expect(result.processedCount).toBe(1);
    expect(result.processedDividends[0].expenseId).toBe('new-expense-id');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: runNextCouponScheduling
// ────────────────────────────────────────────────────────────────────────────
describe('runNextCouponScheduling', () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStart = Timestamp.fromDate(new Date());
  const todayEnd = Timestamp.fromDate(new Date());

  it('skips scheduling when bond has matured (getFollowingCouponDate returns null)', async () => {
    const couponDoc = {
      id: 'coup-1',
      data: () => ({
        assetId: 'asset-1',
        assetTicker: 'BTP',
        assetName: 'BTP 2025',
        currency: 'EUR',
        paymentDate: { toDate: () => new Date(), instanceof: () => false },
      }),
    };
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([couponDoc]));

    const maturityDate = new Date('2020-01-01'); // already matured
    const assetDocData = {
      exists: true,
      data: () => ({
        quantity: 1000,
        isin: 'IT0001',
        taxRate: 12.5,
        bondDetails: {
          couponRate: 5,
          couponFrequency: 'annual',
          nominalValue: 1,
          maturityDate: { toDate: () => maturityDate, instanceof: () => false },
          issueDate: { toDate: () => new Date('2010-01-01'), instanceof: () => false },
        },
      }),
    };
    collectionMocks['assets'] = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue(assetDocData) })) };

    (getFollowingCouponDate as any).mockReturnValue(null); // matured

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips when next coupon already exists (idempotency)', async () => {
    const nextDate = new Date('2025-07-01');
    (getFollowingCouponDate as any).mockReturnValue(nextDate);
    isDuplicateDividendMock.mockResolvedValue(true);

    const couponDoc = {
      id: 'coup-1',
      data: () => ({
        assetId: 'asset-1',
        assetTicker: 'BTP',
        assetName: 'BTP 2025',
        currency: 'EUR',
        paymentDate: { toDate: () => new Date() },
      }),
    };
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([couponDoc]));

    const assetDocData = {
      exists: true,
      data: () => ({
        quantity: 1000,
        isin: 'IT0001',
        taxRate: 12.5,
        bondDetails: {
          couponRate: 5,
          couponFrequency: 'annual',
          nominalValue: 1,
          maturityDate: { toDate: () => new Date('2030-01-01') },
          issueDate: { toDate: () => new Date('2010-01-01') },
        },
      }),
    };
    collectionMocks['assets'] = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue(assetDocData) })) };

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.scheduled).toBe(0);
  });
});
