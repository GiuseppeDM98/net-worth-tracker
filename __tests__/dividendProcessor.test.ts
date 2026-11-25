import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

const {
  scrapeDividendsByIsinMock,
  createDividendMock,
  isDuplicateDividendMock,
  createExpenseFromDividendMock,
  updateDividendMock,
  deleteDividendMock,
  getDividendByIdMock,
  reconvertAtPaymentDayMock,
} = vi.hoisted(() => ({
  scrapeDividendsByIsinMock: vi.fn(),
  createDividendMock: vi.fn(),
  isDuplicateDividendMock: vi.fn(),
  createExpenseFromDividendMock: vi.fn(),
  updateDividendMock: vi.fn(),
  deleteDividendMock: vi.fn(),
  getDividendByIdMock: vi.fn(),
  // The record as it is, unless a test converts it again (an EUR record is never touched).
  reconvertAtPaymentDayMock: vi.fn(async (dividend: Dividend) => dividend),
}));

// Per-collection doc/query mocks — filled per-test in adminDb mock
const collectionMocks: Record<string, unknown> = {};

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
  updateDividend: updateDividendMock,
  deleteDividend: deleteDividendMock,
  getDividendById: getDividendByIdMock,
  reconvertAtPaymentDay: reconvertAtPaymentDayMock,
}));

vi.mock('@/lib/services/dividendIncomeService', () => ({
  createExpenseFromDividend: createExpenseFromDividendMock,
}));

// Partial: the entitlement rule reads the Italian day through the real getItalyDateIso.
vi.mock('@/lib/utils/dateHelpers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/utils/dateHelpers')>()),
  isDateOnOrAfter: vi.fn(() => true),
}));

// The ledger, read once per user per phase (2026-11-23): empty unless a test gives the trades.
vi.mock('@/lib/server/assetAdminRepository', () => ({
  getAssetTransactionsAdmin: vi.fn(async () => []),
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
import { Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getFollowingCouponDate } from '@/lib/utils/couponUtils';
import { getAssetTransactionsAdmin } from '@/lib/server/assetAdminRepository';
import type { AssetTransaction, AssetTransactionType } from '@/types/assetTransactions';
import type { Dividend } from '@/types/dividend';

// Helper: create a minimal Firestore-like QueryDocumentSnapshot
function makeUserDoc(id: string) {
  return { id } as unknown as QueryDocumentSnapshot;
}

function makeQuerySnapshot(docs: unknown[]) {
  return { docs, empty: docs.length === 0, size: docs.length };
}

function makeAssetDoc(data: Record<string, unknown>) {
  return {
    exists: true,
    id: data.id,
    data: () => ({ createdAt: { toDate: () => new Date('2020-01-01') }, ...data }),
  };
}

function makeDocRef(docData: unknown) {
  return { get: vi.fn().mockResolvedValue(docData) };
}

function makeCollection(queryResult: unknown) {
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

  function makeDividendDoc(overrides: Record<string, unknown>) {
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
  const futureDate = new Date('2026-12-15T00:00:00.000Z');

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
    vi.mocked(getFollowingCouponDate).mockReturnValue(null);

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('skips when the upcoming coupon already exists (idempotency)', async () => {
    // The next coupon is in the future and already stored → chain healed, nothing to do.
    vi.mocked(getFollowingCouponDate).mockReturnValue(futureDate);
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
    vi.mocked(getFollowingCouponDate).mockReturnValue(futureDate);
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
    vi.mocked(getFollowingCouponDate).mockReturnValue(futureDate);
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

// ────────────────────────────────────────────────────────────────────────────
// The ledger decides the quantity (2026-11-23): what was held at the ex-date
// ────────────────────────────────────────────────────────────────────────────
describe('the cron reads the quantity held at the ex-date', () => {
  const DAY_MS = 86_400_000;
  const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS);
  let seq = 0;
  function trade(type: AssetTransactionType, date: Date, quantity: number, assetId = 'a1'): AssetTransaction {
    seq += 1;
    const createdAt = new Date('2020-01-01T12:00:00Z');
    return { id: `t${seq}`, userId: 'u1', assetId, type, date, quantity, pricePerUnit: 10, priceEur: 10, createdAt, updatedAt: createdAt };
  }
  const givenLedger = (trades: AssetTransaction[]) =>
    vi.mocked(getAssetTransactionsAdmin).mockImplementation(async () => trades);

  const stock = { id: 'a1', ticker: 'ALFA', isin: 'IT0000000001', assetClass: 'equity', type: 'stock', averageCost: 10 };
  const todayStart = Timestamp.fromDate(new Date('2026-06-10T00:00:00.000Z'));
  const todayEnd = Timestamp.fromDate(new Date('2026-06-10T23:59:59.999Z'));
  const lookbackStart = Timestamp.fromDate(new Date('2025-06-05T00:00:00.000Z'));
  const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.mocked(getAssetTransactionsAdmin).mockImplementation(async () => []));

  function configureIncomeCategory() {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ dividendIncomeCategoryId: 'cat-1' }) })),
    };
    collectionMocks['expenseCategories'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ name: 'Dividendi', subCategories: [] }) })),
    };
  }

  function dueAutoDividend() {
    return {
      id: 'div-1',
      data: () => ({
        assetId: 'a1', assetTicker: 'ALFA', assetName: 'Alfa', currency: 'EUR', dividendType: 'ordinary',
        isAutoGenerated: true, quantity: 100, dividendPerShare: 0.5, grossAmount: 50, taxAmount: 13, netAmount: 37,
        exDate: { toDate: () => at('2026-06-01') },
        paymentDate: { toDate: () => new Date('2026-06-10T08:00:00.000Z') },
        createdAt: { toDate: () => at('2026-05-01') }, updatedAt: { toDate: () => at('2026-05-01') },
      }),
    };
  }

  function couponOf(paidOn: Date) {
    return {
      id: 'coup-1',
      data: () => ({
        assetId: 'a1', assetTicker: 'BTP', assetName: 'BTP Alfa', currency: 'EUR', dividendType: 'coupon',
        isAutoGenerated: true, paymentDate: { toDate: () => paidOn },
      }),
    };
  }

  function bondAsset() {
    const assetDocData = {
      exists: true,
      data: () => ({
        quantity: 1000, isin: 'IT0000000002', taxRate: 12.5,
        bondDetails: {
          couponRate: 5, couponFrequency: 'semiannual', nominalValue: 1,
          maturityDate: { toDate: () => at('2032-03-10') }, issueDate: { toDate: () => at('2020-03-10') },
        },
      }),
    };
    collectionMocks['assets'] = { doc: vi.fn(() => ({ get: vi.fn().mockResolvedValue(assetDocData) })) };
  }

  // Red when the `canBeOwedSince` skip is dropped.
  it('does not ask Borsa Italiana for an instrument sold out before the window', async () => {
    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc({ ...stock, quantity: 0 })]));
    givenLedger([trade('buy', daysAgo(120), 100), trade('sell', daysAgo(90), 100)]);

    const result = await runDividendScraping([makeUserDoc('u1')], daysAgo(60));

    expect(scrapeDividendsByIsinMock).not.toHaveBeenCalled();
    expect(result.assetsScraped).toBe(0);
  });

  // Red when `entitledQuantity` is replaced by `asset.quantity`.
  it('creates a scraped dividend on the quantity held before its ex-date, and none where nothing was held', async () => {
    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc({ ...stock, quantity: 150 })]));
    givenLedger([trade('buy', daysAgo(30), 100), trade('buy', daysAgo(5), 50)]);
    scrapeDividendsByIsinMock.mockResolvedValue([
      { exDate: daysAgo(10), paymentDate: daysAgo(3), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'ordinary' },
      { exDate: daysAgo(40), paymentDate: daysAgo(35), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'ordinary' },
    ]);
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('div-new');

    const result = await runDividendScraping([makeUserDoc('u1')], daysAgo(60));

    expect(createDividendMock).toHaveBeenCalledOnce();
    const created = createDividendMock.mock.calls[0][1];
    expect(created.quantity).toBe(100);
    expect(created.grossAmount).toBeCloseTo(50, 9);
    expect(result.newDividends).toBe(1);
  });

  // Red when `runExpenseCreation` skips the entitlement verdict.
  it('on the payment day deletes a record not held at its ex-date, with no income', async () => {
    configureIncomeCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([dueAutoDividend()]));
    givenLedger([trade('buy', at('2026-05-01'), 100), trade('sell', at('2026-05-20'), 100)]);

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(deleteDividendMock).toHaveBeenCalledWith('div-1');
    expect(createExpenseFromDividendMock).not.toHaveBeenCalled();
    expect(result.processedCount).toBe(0);
  });

  it('on the payment day corrects a stale record first and cashes the one read back', async () => {
    configureIncomeCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([dueAutoDividend()]));
    givenLedger([trade('buy', at('2026-05-01'), 100), trade('sell', at('2026-05-20'), 40)]);
    getDividendByIdMock.mockResolvedValue({
      id: 'div-1', userId: 'u1', assetId: 'a1', assetTicker: 'ALFA', assetName: 'Alfa', currency: 'USD',
      dividendType: 'ordinary', isAutoGenerated: true, quantity: 60, dividendPerShare: 0.5,
      grossAmount: 30, taxAmount: 7.8, netAmount: 22.2, netAmountEur: 20,
      exDate: at('2026-06-01'), paymentDate: new Date('2026-06-10T08:00:00.000Z'), createdAt: at('2026-05-01'), updatedAt: at('2026-06-10'),
    });
    createExpenseFromDividendMock.mockResolvedValue('exp-1');

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(updateDividendMock).toHaveBeenCalledOnce();
    const [id, updates] = updateDividendMock.mock.calls[0];
    expect(id).toBe('div-1');
    expect(updates).toMatchObject({ quantity: 60, currency: 'EUR' });
    expect(updates.grossAmount).toBeCloseTo(30, 9);
    expect(updates.netAmount).toBeCloseTo(22.2, 9);
    expect(createExpenseFromDividendMock.mock.calls[0][0]).toMatchObject({ quantity: 60, netAmountEur: 20 });
    expect(result.processedDividends[0].amount).toBe(20);
  });

  // Red when the step-over at quantity 0 becomes a `break`.
  it('steps over a past coupon date at quantity 0 and creates the first future one owed', async () => {
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([couponOf(at('2025-12-15'))]));
    bondAsset();
    givenLedger([trade('buy', at('2025-01-10'), 1000), trade('sell', at('2026-02-02'), 1000), trade('buy', at('2026-04-01'), 500)]);
    vi.mocked(getFollowingCouponDate).mockReturnValueOnce(at('2026-03-10')).mockReturnValueOnce(at('2026-09-10'));
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('next-coupon');

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).toHaveBeenCalledOnce();
    const created = createDividendMock.mock.calls[0][1];
    expect(created.paymentDate).toEqual(at('2026-09-10'));
    expect(created.quantity).toBe(500);
    expect(result.scheduled).toBe(1);
  });

  it('creates nothing for a future coupon at quantity 0, and the walk ends there', async () => {
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([couponOf(new Date('2026-06-10T08:00:00.000Z'))]));
    bondAsset();
    givenLedger([trade('buy', at('2025-01-10'), 1000), trade('sell', at('2026-05-04'), 1000)]);
    vi.mocked(getFollowingCouponDate).mockReturnValue(at('2026-12-15'));
    isDuplicateDividendMock.mockResolvedValue(false);

    const result = await runNextCouponScheduling([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createDividendMock).not.toHaveBeenCalled();
    expect(getFollowingCouponDate).toHaveBeenCalledOnce();
    expect(result.scheduled).toBe(0);
  });

  // Red when a rejected ledger read falls back to `[]`.
  it('skips, in every phase, the user whose ledger cannot be read, and counts the error', async () => {
    vi.mocked(getAssetTransactionsAdmin).mockImplementation(async (userId: string) => {
      if (userId === 'u1') throw new Error('Failed to fetch asset transactions');
      return [];
    });
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const users = [makeUserDoc('u1'), makeUserDoc('u2')];

    collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc({ ...stock, quantity: 100 })]));
    scrapeDividendsByIsinMock.mockResolvedValue([]);
    const scraping = await runDividendScraping(users, daysAgo(60));

    configureIncomeCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([dueAutoDividend()]));
    createExpenseFromDividendMock.mockResolvedValue('exp-1');
    const income = await runExpenseCreation(users, todayStart, todayEnd, lookbackStart);

    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([couponOf(new Date('2026-06-10T08:00:00.000Z'))]));
    bondAsset();
    vi.mocked(getFollowingCouponDate).mockReturnValue(at('2026-12-15'));
    isDuplicateDividendMock.mockResolvedValue(false);
    createDividendMock.mockResolvedValue('next-coupon');
    const coupons = await runNextCouponScheduling(users, todayStart, todayEnd, lookbackStart);
    quiet.mockRestore();

    expect(scrapeDividendsByIsinMock).toHaveBeenCalledOnce();
    expect(scraping.errors).toBe(1);
    expect(createExpenseFromDividendMock).toHaveBeenCalledOnce();
    expect(income.processedDividends.map((p) => p.userId)).toEqual(['u2']);
    expect(income.errorCount).toBe(1);
    expect(createDividendMock).toHaveBeenCalledOnce();
    expect(coupons.errors).toBe(1);
  });
});

describe('a foreign dividend on its payment day, and the scrape at the instrument’s rate (2026-11-23)', () => {
  const todayStart = Timestamp.fromDate(new Date('2026-06-10T00:00:00.000Z'));
  const todayEnd = Timestamp.fromDate(new Date('2026-06-10T23:59:59.999Z'));
  const lookbackStart = Timestamp.fromDate(new Date('2025-06-05T00:00:00.000Z'));
  const at = (iso: string) => new Date(`${iso}T12:00:00.000Z`);
  const PAID_TODAY = new Date('2026-06-10T08:00:00.000Z');

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    reconvertAtPaymentDayMock.mockImplementation(async (dividend) => dividend);
    vi.mocked(getAssetTransactionsAdmin).mockImplementation(async () => []);
  });

  function configureIncomeCategory() {
    collectionMocks['assetAllocationTargets'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ dividendIncomeCategoryId: 'cat-1' }) })),
    };
    collectionMocks['expenseCategories'] = {
      doc: vi.fn(() => makeDocRef({ exists: true, data: () => ({ name: 'Dividendi', subCategories: [] }) })),
    };
  }

  /** 10 units at 0,50 USD, 15% abroad and 26% in Italy, paid today. */
  function usdDividend(overrides: Record<string, unknown> = {}) {
    return {
      id: 'div-usd',
      data: () => ({
        assetId: 'a1', assetTicker: 'ALFA', assetName: 'Azione Alfa', currency: 'USD', dividendType: 'ordinary',
        isAutoGenerated: false, quantity: 10, dividendPerShare: 0.5, grossAmount: 5, taxAmount: 1.855, netAmount: 3.145,
        foreignTaxAmount: 0.75, foreignTaxAmountEur: 0.68, grossAmountEur: 4.5, taxAmountEur: 1.67, netAmountEur: 2.83,
        exchangeRate: 0.9, fxSource: 'ecb-latest',
        exDate: { toDate: () => at('2026-06-01') }, paymentDate: { toDate: () => PAID_TODAY },
        createdAt: { toDate: () => at('2026-05-01') }, updatedAt: { toDate: () => at('2026-05-01') },
        ...overrides,
      }),
    };
  }

  const convertAt = (rate: number) => async (dividend: Dividend) => ({
    ...dividend,
    exchangeRate: rate,
    fxSource: 'ecb' as const,
    netAmountEur: Math.round(dividend.netAmount * rate * 100) / 100,
  });

  // Red when the stored record's credit and source are not carried into the pass.
  it('hands the payment-day re-conversion a record that carries its credit and its source', async () => {
    configureIncomeCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([usdDividend({ settledNetEur: 2.88, fxSource: 'statement' })]));
    createExpenseFromDividendMock.mockResolvedValue('exp-1');

    await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(reconvertAtPaymentDayMock).toHaveBeenCalledOnce();
    expect(reconvertAtPaymentDayMock.mock.calls[0][0]).toMatchObject({ settledNetEur: 2.88, fxSource: 'statement', foreignTaxAmount: 0.75 });
  });

  // Red when the pass skips reconvertAtPaymentDay.
  it('builds the income of a record at the latest rate from the one converted at the payment day', async () => {
    configureIncomeCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([usdDividend()]));
    reconvertAtPaymentDayMock.mockImplementation(convertAt(0.95));
    createExpenseFromDividendMock.mockResolvedValue('exp-1');

    const result = await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(createExpenseFromDividendMock.mock.calls[0][0]).toMatchObject({ exchangeRate: 0.95, netAmountEur: 2.99 });
    expect(result.processedDividends[0].amount).toBe(2.99);
  });

  // Red when the income is built from the copy read before the ledger's update.
  it('cashes a USD record the ledger halved on the halved euro net', async () => {
    configureIncomeCategory();
    collectionMocks['dividends'] = makeCollection(makeQuerySnapshot([usdDividend({ isAutoGenerated: true })]));
    vi.mocked(getAssetTransactionsAdmin).mockImplementation(async () => [
      { id: 't1', userId: 'u1', assetId: 'a1', type: 'buy', date: at('2026-05-01'), quantity: 10, pricePerUnit: 10, priceEur: 10, createdAt: at('2026-05-01'), updatedAt: at('2026-05-01') },
      { id: 't2', userId: 'u1', assetId: 'a1', type: 'sell', date: at('2026-05-20'), quantity: 5, pricePerUnit: 10, priceEur: 10, createdAt: at('2026-05-20'), updatedAt: at('2026-05-20') },
    ] as AssetTransaction[]);
    getDividendByIdMock.mockResolvedValue({
      id: 'div-usd', userId: 'u1', assetId: 'a1', assetTicker: 'ALFA', assetName: 'Azione Alfa', currency: 'USD',
      dividendType: 'ordinary', isAutoGenerated: true, quantity: 5, dividendPerShare: 0.5,
      grossAmount: 2.5, taxAmount: 0.9275, netAmount: 1.5725, foreignTaxAmount: 0.375, netAmountEur: 1.42, fxSource: 'ecb-latest',
      exDate: at('2026-06-01'), paymentDate: PAID_TODAY, createdAt: at('2026-05-01'), updatedAt: at('2026-06-10'),
    });
    reconvertAtPaymentDayMock.mockImplementation(convertAt(0.95));
    createExpenseFromDividendMock.mockResolvedValue('exp-1');

    await runExpenseCreation([makeUserDoc('u1')], todayStart, todayEnd, lookbackStart);

    expect(updateDividendMock.mock.calls[0][1].foreignTaxAmount).toBeCloseTo(0.375, 9);
    expect(createExpenseFromDividendMock.mock.calls[0][0]).toMatchObject({ quantity: 5, netAmountEur: 1.49 });
  });

  // Red when the scrape taxes a fixed `grossAmount * 0.26` (P2).
  it('taxes a scraped dividend at the instrument’s rate: its own, else 26%, and 0 stays 0', async () => {
    const created: Array<{ grossAmount: number; taxAmount: number }> = [];
    createDividendMock.mockImplementation(async (_uid: string, data: { grossAmount: number; taxAmount: number }) => {
      created.push(data);
      return 'div-new';
    });
    isDuplicateDividendMock.mockResolvedValue(false);
    const exDate = new Date(Date.now() - 5 * 86_400_000);
    scrapeDividendsByIsinMock.mockResolvedValue([
      { exDate, paymentDate: new Date(), dividendPerShare: 0.5, currency: 'EUR', dividendType: 'ordinary' },
    ]);

    for (const taxRate of [12.5, undefined, 0]) {
      const asset = { id: 'a1', ticker: 'ALFA', isin: 'IT0000000001', assetClass: 'equity', type: 'stock', quantity: 100, taxRate };
      collectionMocks['assets'] = makeCollection(makeQuerySnapshot([makeAssetDoc(asset)]));
      await runDividendScraping([makeUserDoc('u1')], new Date(Date.now() - 60 * 86_400_000));
    }

    expect(created.map((d) => d.taxAmount / d.grossAmount)).toEqual([0.125, 0.26, 0]);
  });
});
