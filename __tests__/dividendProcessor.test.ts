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
  // Phase 3 now resolves the coupon via the shared pure layer; mock its output.
  resolveCoupon: vi.fn(() => ({
    perShare: 2.5,
    fixedAnnualRate: 5,
    inflationPeriodRate: null,
    isProvisional: false,
  })),
  buildCouponNote: vi.fn(() => 'Cedola annuale — tasso annuo 5%'),
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

  // Fixed Italian-day window so eligibility checks are deterministic.
  const todayStart = Timestamp.fromDate(new Date('2026-06-10T00:00:00.000Z'));
  const todayEnd = Timestamp.fromDate(new Date('2026-06-10T23:59:59.999Z'));
  const lookbackStart = Timestamp.fromDate(new Date('2025-06-05T00:00:00.000Z'));

  const dueTodayInstant = () => new Date('2026-06-10T08:00:00.000Z');
  const pastInstant = () => new Date('2026-06-08T08:00:00.000Z');

  function configureUserCategory() {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ dividendIncomeCategoryId: 'cat-1' }) })),
    };
    collectionMocks['expenseCategories'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ name: 'Dividendi', subCategories: [] }) })),
    };
  }

  function makeDividendDoc(overrides: Record<string, any>) {
    return {
      id: overrides.id ?? 'div-1',
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
        exDate: { toDate: dueTodayInstant },
        paymentDate: { toDate: dueTodayInstant },
        createdAt: { toDate: dueTodayInstant },
        updatedAt: { toDate: dueTodayInstant },
        ...overrides,
      }),
    };
  }

  it('skips dividends that already have an expenseId (idempotency)', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeDividendDoc({ expenseId: 'existing-expense' })])
    );

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it('skips users without dividendIncomeCategoryId configured', async () => {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({}) })), // no category
    };

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it('creates expense for a dividend due today', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([makeDividendDoc({})]));
    createExpenseFromDividendMock.mockResolvedValue('new-expense-id');

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).toHaveBeenCalledOnce();
    expect(result.processedCount).toBe(1);
    expect(result.processedDividends[0].expenseId).toBe('new-expense-id');
  });

  it('catches up an auto-generated coupon whose payment date already passed', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([
        makeDividendDoc({
          dividendType: 'coupon',
          isAutoGenerated: true,
          paymentDate: { toDate: pastInstant },
          exDate: { toDate: pastInstant },
        }),
      ])
    );
    createExpenseFromDividendMock.mockResolvedValue('catchup-expense-id');

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).toHaveBeenCalledOnce();
    expect(result.processedCount).toBe(1);
  });

  it('does not back-date a past equity dividend without an expense', async () => {
    configureUserCategory();
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([
        makeDividendDoc({
          dividendType: 'dividend',
          isAutoGenerated: false,
          paymentDate: { toDate: pastInstant },
          exDate: { toDate: pastInstant },
        }),
      ])
    );

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// Phase 3: runNextCouponScheduling
// ────────────────────────────────────────────────────────────────────────────
describe('runNextCouponScheduling', () => {
  beforeEach(() => vi.clearAllMocks());

  const todayStart = Timestamp.fromDate(new Date('2026-06-10T00:00:00.000Z'));
  const todayEnd = Timestamp.fromDate(new Date('2026-06-10T23:59:59.999Z'));
  const lookbackStart = Timestamp.fromDate(new Date('2025-06-05T00:00:00.000Z'));
  // A date safely after todayEnd, used as the next upcoming coupon.
  const futureDate = new Date('2026-12-10T00:00:00.000Z');

  function makeCouponDoc(paymentToDate: () => Date) {
    return {
      id: 'coup-1',
      data: () => ({
        assetId: 'asset-1',
        assetTicker: 'BTP',
        assetName: 'BTP 2032',
        currency: 'EUR',
        dividendType: 'coupon',
        isAutoGenerated: true,
        paymentDate: { toDate: paymentToDate },
      }),
    };
  }

  function makeBondAsset(maturity: Date) {
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
          maturityDate: { toDate: () => maturity },
          issueDate: { toDate: () => new Date('2010-01-01') },
        },
      }),
    };
    collectionMocks['assets'] = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue(assetDocData) })) };
  }

  it('skips scheduling when bond has matured (getFollowingCouponDate returns null)', async () => {
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-10T00:00:00.000Z'))])
    );
    makeBondAsset(new Date('2020-01-01')); // already matured
    (getFollowingCouponDate as any).mockReturnValue(null);

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips when the upcoming coupon already exists (idempotency)', async () => {
    // The next coupon is in the future and already stored → chain healed, nothing to do.
    (getFollowingCouponDate as any).mockReturnValue(futureDate);
    isDuplicateDividendMock.mockResolvedValue(true);
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-10T00:00:00.000Z'))])
    );
    makeBondAsset(new Date('2032-03-10'));

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.skipped).toBe(1);
    expect(result.scheduled).toBe(0);
  });

  it('schedules the next coupon for a coupon paid today', async () => {
    (getFollowingCouponDate as any).mockReturnValue(futureDate);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('next-coupon-id');
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-10T08:00:00.000Z'))])
    );
    makeBondAsset(new Date('2032-03-10'));

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).toHaveBeenCalledOnce();
    expect(result.scheduled).toBe(1);
    expect(result.skipped).toBe(0);
  });

  it('heals the chain from a coupon whose payment date already passed', async () => {
    // A coupon dated a few days ago was never advanced; its successor (future)
    // is missing and must be created so the bond has an upcoming coupon again.
    (getFollowingCouponDate as any).mockReturnValue(futureDate);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('healed-coupon-id');
    collectionMocks['dividends'] = makeCollection(
      makeQuerySnapshot([makeCouponDoc(() => new Date('2026-06-07T00:00:00.000Z'))])
    );
    makeBondAsset(new Date('2032-03-10'));

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).toHaveBeenCalledOnce();
    expect(result.scheduled).toBe(1);
  });
});
