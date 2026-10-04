import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `getAllPerformanceData(userId, forceRefresh, inputs?)` — the inputs already read by the caller
 * (2026-10-04: Rendimenti reads each collection once, through the app's hooks, and hands them over)
 * against the service reading them itself (the PDF's exercise script, any caller without them), and
 * `resolveYieldPeriods`, the dividend windows derived BEFORE the metrics exist.
 *
 * The fixture keeps a house out of the base (`allocationRole: 'excluded'`), so the assets are an
 * input the numbers depend on: seen red on 2026-10-04 by handing `assets: []` inside the inputs —
 * the house stays in, every net worth and return moves, the equivalence fails.
 */

const { getDocMock, setDocMock, readers } = vi.hoisted(() => ({
  getDocMock: vi.fn(),
  setDocMock: vi.fn(),
  readers: {
    getUserSnapshots: vi.fn(),
    getSettings: vi.fn(),
    getAllAssets: vi.fn(),
    getPensionContributions: vi.fn(),
    getAssetTransactions: vi.fn(),
    getExpensesByDateRange: vi.fn(),
  },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, collection: string, id: string) => ({ collection, id }),
  getDoc: getDocMock,
  setDoc: setDocMock,
  Timestamp: {
    fromDate: (date: Date) => ({ toDate: () => date }),
    now: () => ({ toDate: () => new Date() }),
  },
}));
vi.mock('@/lib/services/snapshotService', () => ({ getUserSnapshots: readers.getUserSnapshots }));
vi.mock('@/lib/services/assetAllocationService', () => ({ getSettings: readers.getSettings }));
vi.mock('@/lib/services/assetService', () => ({ getAllAssets: readers.getAllAssets }));
vi.mock('@/lib/services/pensionContributionService', () => ({ getPensionContributions: readers.getPensionContributions }));
vi.mock('@/lib/services/assetTransactionService', () => ({ getAssetTransactions: readers.getAssetTransactions }));
vi.mock('@/lib/services/expenseService', () => ({ getExpensesByDateRange: readers.getExpensesByDateRange }));

import { getAllPerformanceData, resolvePerformanceSetup, resolveYieldPeriods, type PerformanceInputs } from '@/lib/services/performanceService';
import type { Asset, AssetAllocationSettings, MonthlySnapshot } from '@/types/assets';
import type { Expense } from '@/types/expenses';
import type { PerformanceData } from '@/types/performance';

const UID = 'u1';
const NOW = new Date(2026, 9, 4, 12);

const ASSETS = [
  { id: 'etf', type: 'etf', name: 'Un ETF', ticker: 'ETF', quantity: 100, currentPrice: 120 },
  { id: 'casa', type: 'realestate', name: 'Casa', ticker: '', quantity: 1, currentPrice: 200_000, allocationRole: 'excluded' },
] as unknown as Asset[];

/** Sixteen months, June 2025 → September 2026: the ETF grows 1% a month, the house stands still. */
const SNAPSHOTS: MonthlySnapshot[] = Array.from({ length: 16 }, (_, index) => {
  const year = 2025 + Math.floor((index + 5) / 12);
  const month = ((index + 5) % 12) + 1;
  const etfValue = Math.round(10_000 * 1.01 ** index * 100) / 100;
  return {
    userId: UID,
    year,
    month,
    totalNetWorth: etfValue + 200_000,
    liquidNetWorth: etfValue,
    illiquidNetWorth: 200_000,
    byAssetClass: {},
    assetAllocation: {},
    byAsset: [
      { assetId: 'etf', ticker: 'ETF', name: 'Un ETF', quantity: 100, price: etfValue / 100, totalValue: etfValue },
      { assetId: 'casa', ticker: '', name: 'Casa', quantity: 1, price: 200_000, totalValue: 200_000 },
    ],
    createdAt: new Date(year, month - 1, 28),
  } as unknown as MonthlySnapshot;
});

const SETTINGS = { riskFreeRate: 2, dividendIncomeCategoryId: 'dividendi' } as unknown as AssetAllocationSettings;

const EXPENSES = [
  { id: 'e1', userId: UID, type: 'income', amount: 2000, categoryId: 'stipendio', date: new Date(2026, 2, 10, 12) },
  { id: 'e2', userId: UID, type: 'variable', amount: -800, categoryId: 'spesa', date: new Date(2026, 2, 12, 12) },
  { id: 'e3', userId: UID, type: 'income', amount: 50, categoryId: 'dividendi', date: new Date(2026, 5, 3, 12) },
] as unknown as Expense[];

const INPUTS: PerformanceInputs = { snapshots: SNAPSHOTS, settings: SETTINGS, assets: ASSETS, contributions: [], trades: [] };

/** Everything but the instant the payload was built. */
function comparable(data: PerformanceData) {
  return { ...data, lastUpdated: null };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  getDocMock.mockResolvedValue({ exists: () => false });
  setDocMock.mockResolvedValue(undefined);
  readers.getUserSnapshots.mockResolvedValue(SNAPSHOTS);
  readers.getSettings.mockResolvedValue(SETTINGS);
  readers.getAllAssets.mockResolvedValue(ASSETS);
  readers.getPensionContributions.mockResolvedValue([]);
  readers.getAssetTransactions.mockResolvedValue([]);
  readers.getExpensesByDateRange.mockResolvedValue(EXPENSES);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('getAllPerformanceData with the inputs already read', () => {
  it('should compute the same payload as when it reads them itself, without reading them', async () => {
    const readHere = await getAllPerformanceData(UID);
    const inputReads = [readers.getUserSnapshots, readers.getSettings, readers.getAllAssets, readers.getPensionContributions, readers.getAssetTransactions];
    for (const reader of inputReads) expect(reader).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    getDocMock.mockResolvedValue({ exists: () => false });
    readers.getExpensesByDateRange.mockResolvedValue(EXPENSES);
    const handedOver = await getAllPerformanceData(UID, false, INPUTS);

    expect(comparable(handedOver)).toEqual(comparable(readHere));
    for (const reader of inputReads) expect(reader).not.toHaveBeenCalled();
    // What is left to read: the cache document, and the expenses on a miss.
    expect(getDocMock).toHaveBeenCalledTimes(1);
    expect(readers.getExpensesByDateRange).toHaveBeenCalledTimes(1);
  });

  it('should measure the base the inputs describe: the excluded house is out', async () => {
    const data = await getAllPerformanceData(UID, false, INPUTS);

    // Positive anchor for the equivalence above: the figures depend on the assets handed over.
    expect(data.allTime.hasInsufficientData).toBe(false);
    expect(data.allTime.startNetWorth).toBe(10_000);
    expect(data.allTime.endNetWorth).toBeCloseTo(10_000 * 1.01 ** 15, 2);
  });

  it('should write the cache under the key the page names its query by', async () => {
    await getAllPerformanceData(UID, false, INPUTS);

    expect(setDocMock).toHaveBeenCalledTimes(1);
    expect(setDocMock.mock.calls[0][1].cacheKey).toBe(resolvePerformanceSetup(INPUTS).cacheKey);
  });
});

describe('resolveYieldPeriods', () => {
  it('should derive, before the metrics exist, the very windows the metrics will carry', async () => {
    const { base } = resolvePerformanceSetup(INPUTS);
    const data = await getAllPerformanceData(UID, false, INPUTS);

    const periods = resolveYieldPeriods(base.snapshots, NOW);

    expect(periods.map((period) => period.key)).toEqual(['ytd', 'oneYear', 'threeYear', 'fiveYear', 'allTime']);
    for (const period of periods) {
      const metrics = data[period.key as 'ytd' | 'oneYear' | 'threeYear' | 'fiveYear' | 'allTime'];
      expect({ startDate: period.startDate, dividendEndDate: period.dividendEndDate, numberOfMonths: period.numberOfMonths }, period.key).toEqual({
        startDate: metrics.startDate,
        dividendEndDate: metrics.dividendEndDate,
        numberOfMonths: metrics.numberOfMonths,
      });
    }
    // Not five copies of one window: the year to date opens in January, the whole history in July 2025.
    expect(periods[0].startDate).toEqual(new Date(2026, 0, 1));
    expect(periods[0].numberOfMonths).toBe(9);
    expect(periods[4].startDate).toEqual(new Date(2025, 6, 1));
    expect(periods[4].numberOfMonths).toBe(15);
  });

  it('should cap the dividend window at today when the last snapshot is the current month', () => {
    const midSeptember = new Date(2026, 8, 15, 9);

    const [ytd] = resolveYieldPeriods(SNAPSHOTS, midSeptember);

    expect(ytd.dividendEndDate).toEqual(midSeptember);
  });

  it('should leave out a period with nothing to measure', () => {
    // One snapshot in the year: the year to date has no pair, the others reach back to 2025.
    const untilJanuary = SNAPSHOTS.filter((snapshot) => snapshot.year === 2025);

    const keys = resolveYieldPeriods([...untilJanuary, SNAPSHOTS[8]], new Date(2026, 1, 20)).map((period) => period.key);

    expect(resolveYieldPeriods([], NOW)).toEqual([]);
    expect(resolveYieldPeriods([SNAPSHOTS[0]], NOW)).toEqual([]);
    expect(keys).toContain('allTime');
  });

  it('should not reorder the list it is handed', () => {
    const reversed = [...SNAPSHOTS].reverse();
    const before = reversed.map((snapshot) => `${snapshot.year}-${snapshot.month}`);

    resolveYieldPeriods(reversed, NOW);

    expect(reversed.map((snapshot) => `${snapshot.year}-${snapshot.month}`)).toEqual(before);
  });
});
