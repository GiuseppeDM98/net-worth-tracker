import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: null }, db: {} }));

// Hoisted Resend mock — must use a proper function constructor to allow `new Resend()`
const { resendSendMock } = vi.hoisted(() => ({
  resendSendMock: vi.fn().mockResolvedValue({ data: {}, error: null }),
}));
vi.mock('resend', () => {
  class ResendMock {
    emails = { send: resendSendMock };
    constructor(_apiKey?: string) {}
  }
  return { Resend: ResendMock };
});

// Per-collection query chains — filled per-test
const collectionMocks: Record<string, any> = {};

// Build a reusable chainable query builder for the adminDb mock.
// The real service uses: .where().where().where().limit().get() (3 conditions)
// and:                   .where().where().get() (2 conditions for expenses/dividends).
function buildQueryMock(name: string) {
  const terminal = () => ({
    get: vi.fn().mockImplementation(() =>
      Promise.resolve(collectionMocks[name] ?? { empty: true, docs: [] })
    ),
  });
  // A node in the chain returns itself for further .where() calls plus limit/get
  function chainNode(): any {
    return {
      where: () => chainNode(),
      limit: () => terminal(),
      get: vi.fn().mockImplementation(() =>
        Promise.resolve(collectionMocks[name] ?? { empty: true, docs: [] })
      ),
    };
  }
  return chainNode();
}

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      doc: () => ({ get: vi.fn() }),
      where: () => buildQueryMock(name),
    }),
  },
  adminAuth: { verifyIdToken: vi.fn() },
}));

vi.mock('@/lib/utils/dateHelpers', async () => {
  const actual = await vi.importActual<typeof import('@/lib/utils/dateHelpers')>(
    '@/lib/utils/dateHelpers'
  );
  return { ...actual };
});

import {
  isLastDayOfMonthItaly,
  buildMonthlyEmailData,
  generateEmailHtml,
  sendMonthlyEmail,
  type MonthlyEmailData,
} from '@/lib/server/monthlyEmailService';

// ─── isLastDayOfMonthItaly ────────────────────────────────────────────────────

describe('isLastDayOfMonthItaly', () => {
  it('returns true on January 31', () => {
    // UTC midnight Jan 31 — still Jan 31 in Italy (UTC+1)
    expect(isLastDayOfMonthItaly(new Date('2025-01-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on January 30', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-01-30T10:00:00Z'))).toBe(false);
  });

  it('returns true on December 31', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-12-31T10:00:00Z'))).toBe(true);
  });

  it('returns false on December 30', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-12-30T10:00:00Z'))).toBe(false);
  });

  it('returns true on April 30 (30-day month)', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-04-30T10:00:00Z'))).toBe(true);
  });

  it('returns false on April 29', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-04-29T10:00:00Z'))).toBe(false);
  });

  it('returns true on Feb 28 in non-leap year', () => {
    expect(isLastDayOfMonthItaly(new Date('2025-02-28T10:00:00Z'))).toBe(true);
  });

  it('returns true on Feb 29 in leap year', () => {
    expect(isLastDayOfMonthItaly(new Date('2024-02-29T10:00:00Z'))).toBe(true);
  });

  it('returns false on Feb 28 in leap year', () => {
    expect(isLastDayOfMonthItaly(new Date('2024-02-28T10:00:00Z'))).toBe(false);
  });
});

// ─── generateEmailHtml ────────────────────────────────────────────────────────

describe('generateEmailHtml', () => {
  const sampleData: MonthlyEmailData = {
    year: 2025,
    month: 3,
    currentNetWorth: 150000,
    previousNetWorth: 145000,
    netWorthDelta: 5000,
    netWorthDeltaPct: 3.45,
    liquidNetWorth: 30000,
    byAssetClass: { equity: 90000, bonds: 40000, cash: 20000 },
    totalIncome: 3500,
    totalExpenses: 2000,
    topExpenseCategories: [
      { name: 'Alimentari', amount: 800 },
      { name: 'Trasporti', amount: 600 },
    ],
    dividendTotal: 450,
    dividendCount: 3,
  };

  it('contains Italian month name', () => {
    const html = generateEmailHtml(sampleData);
    expect(html).toContain('Marzo 2025');
  });

  it('contains positive delta arrow ▲', () => {
    const html = generateEmailHtml(sampleData);
    expect(html).toContain('▲');
  });

  it('contains negative delta arrow ▼ for loss', () => {
    const lossData: MonthlyEmailData = { ...sampleData, netWorthDelta: -3000, netWorthDeltaPct: -2 };
    const html = generateEmailHtml(lossData);
    expect(html).toContain('▼');
  });

  it('shows top expense categories', () => {
    const html = generateEmailHtml(sampleData);
    expect(html).toContain('Alimentari');
    expect(html).toContain('Trasporti');
  });

  it('shows dividend section when dividendCount > 0', () => {
    const html = generateEmailHtml(sampleData);
    expect(html).toContain('Dividendi');
  });

  it('omits dividend section when dividendCount === 0', () => {
    const noDivData: MonthlyEmailData = { ...sampleData, dividendCount: 0, dividendTotal: 0 };
    const html = generateEmailHtml(noDivData);
    expect(html).not.toContain('Dividendi');
  });

  it('handles zero expenses (no top categories section)', () => {
    const noExpData: MonthlyEmailData = {
      ...sampleData,
      totalExpenses: 0,
      topExpenseCategories: [],
    };
    const html = generateEmailHtml(noExpData);
    // top categories table should not appear when list is empty
    expect(html).not.toContain('Top Categorie di Spesa');
  });
});

// ─── buildMonthlyEmailData ────────────────────────────────────────────────────

describe('buildMonthlyEmailData', () => {
  beforeEach(() => {
    // Reset all collection mocks
    Object.keys(collectionMocks).forEach((k) => delete collectionMocks[k]);
  });

  it('returns null when no current snapshot exists', async () => {
    collectionMocks['monthly-snapshots'] = { empty: true, docs: [] };
    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result).toBeNull();
  });

  it('returns aggregated data when snapshot exists', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [
        {
          data: () => ({
            totalNetWorth: 150000,
            liquidNetWorth: 30000,
            byAssetClass: { equity: 120000, cash: 30000 },
          }),
        },
      ],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = { docs: [] };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result).not.toBeNull();
    expect(result!.currentNetWorth).toBe(150000);
    expect(result!.liquidNetWorth).toBe(30000);
  });

  it('sums income and expense amounts correctly', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = {
      docs: [
        { data: () => ({ amount: 3000, categoryName: 'Stipendio', categoryId: 'cat1' }) },
        { data: () => ({ amount: -500, categoryName: 'Alimentari', categoryId: 'cat2' }) },
        { data: () => ({ amount: -300, categoryName: 'Trasporti', categoryId: 'cat3' }) },
      ],
    };
    collectionMocks['dividends'] = { docs: [] };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.totalIncome).toBe(3000);
    expect(result!.totalExpenses).toBe(800);
    expect(result!.topExpenseCategories).toHaveLength(2);
    expect(result!.topExpenseCategories[0].name).toBe('Alimentari');
  });

  it('sums dividend grossAmountEur', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = {
      docs: [
        { data: () => ({ grossAmountEur: 200 }) },
        { data: () => ({ grossAmountEur: 150 }) },
      ],
    };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.dividendTotal).toBeCloseTo(350);
    expect(result!.dividendCount).toBe(2);
  });

  it('uses grossAmount when grossAmountEur is absent', async () => {
    collectionMocks['monthly-snapshots'] = {
      empty: false,
      docs: [{ data: () => ({ totalNetWorth: 100, liquidNetWorth: 50, byAssetClass: {} }) }],
    };
    collectionMocks['expenses'] = { docs: [] };
    collectionMocks['dividends'] = {
      docs: [{ data: () => ({ grossAmount: 100 }) }],
    };

    const result = await buildMonthlyEmailData('user-1', 2025, 3);
    expect(result!.dividendTotal).toBe(100);
  });
});

// ─── sendMonthlyEmail ─────────────────────────────────────────────────────────

describe('sendMonthlyEmail', () => {
  beforeEach(() => {
    resendSendMock.mockResolvedValue({ data: {}, error: null });
  });

  const sampleData: MonthlyEmailData = {
    year: 2025,
    month: 4,
    currentNetWorth: 100000,
    previousNetWorth: 95000,
    netWorthDelta: 5000,
    netWorthDeltaPct: 5.26,
    liquidNetWorth: 20000,
    byAssetClass: {},
    totalIncome: 0,
    totalExpenses: 0,
    topExpenseCategories: [],
    dividendTotal: 0,
    dividendCount: 0,
  };

  it('calls Resend with correct subject and recipients', async () => {
    await sendMonthlyEmail(['a@b.com', 'c@d.com'], sampleData);
    expect(resendSendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['a@b.com', 'c@d.com'],
        subject: expect.stringContaining('Aprile 2025'),
      })
    );
  });

  it('throws when Resend returns an error', async () => {
    resendSendMock.mockResolvedValue({ data: null, error: { message: 'rate limited' } });
    await expect(sendMonthlyEmail(['a@b.com'], sampleData)).rejects.toThrow('Resend error');
  });
});
