import { describe, it, expect } from 'vitest';
import {
  summarizeFundToday,
  summarizeLedger,
  summarizePensionMembers,
  summarizeVersato,
  type PensionSummaryInput,
} from '@/lib/utils/pensionSummary';
import type { Asset, FamilyMember, MonthlySnapshot } from '@/types/assets';
import type { ContributionSource, PensionContribution } from '@/types/pension';

/**
 * The fixture mirrors `scripts/seedPensionE2E.mts` (one fund, one member, the three June
 * contributions recorded in July) plus one August contribution from a cash account, so the
 * month effect is not zero and the ledger has a source account to name. Every figure below is
 * derived by hand from these inputs — see the comments on each expectation.
 */

const NOW = new Date(2026, 7, 26, 12, 0, 0);

function fund(id: string, name: string, value: number, familyMemberId?: string): Asset {
  return {
    id,
    userId: 'user-1',
    name,
    ticker: '',
    type: 'pensionFund',
    assetClass: 'equity',
    quantity: value,
    currentPrice: 1,
    currency: 'EUR',
    isLiquid: false,
    allocationRole: 'frozen',
    pensionFundDetails: familyMemberId ? { provider: name, familyMemberId } : { provider: name },
    lastPriceUpdate: new Date(2026, 7, 12),
    createdAt: new Date(2025, 10, 1),
    updatedAt: new Date(2026, 7, 12),
  } as Asset;
}

function cash(id: string, name: string): Asset {
  return {
    id,
    userId: 'user-1',
    name,
    ticker: '',
    type: 'cash',
    assetClass: 'cash',
    quantity: 5_000,
    currentPrice: 1,
    currency: 'EUR',
    isLiquid: true,
    lastPriceUpdate: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  } as Asset;
}

function snapshot(year: number, month: number, values: Record<string, number>): MonthlySnapshot {
  const byAsset = Object.entries(values).map(([assetId, value]) => ({
    assetId,
    ticker: '',
    name: assetId,
    quantity: value,
    price: 1,
    totalValue: value,
  }));
  const total = byAsset.reduce((sum, row) => sum + row.totalValue, 0);
  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth: total,
    liquidNetWorth: 0,
    illiquidNetWorth: total,
    byAssetClass: {},
    byAsset,
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  } as MonthlySnapshot;
}

function contribution(
  id: string,
  assetId: string,
  source: ContributionSource,
  amount: number,
  date: Date,
  taxYear: number,
  createdAt: Date = date,
  extra: Partial<PensionContribution> = {}
): PensionContribution {
  return {
    id,
    userId: 'user-1',
    assetId,
    source,
    amount,
    date,
    taxYear,
    deductible: source !== 'tfr',
    createdAt,
    ...extra,
  };
}

const FUND = fund('fund-1', 'Fondo Cometa', 31_450, 'm1');
const CASH = cash('cash-1', 'Conto BancoPosta');
const MARIO: FamilyMember = {
  id: 'm1',
  name: 'Mario',
  grossAnnualIncome: 38_000,
  isFirstEmploymentPost2007: true,
  firstEmploymentYear: 2015,
};

const CONTRIBUTIONS: PensionContribution[] = [
  contribution('c-2025-vol', 'fund-1', 'voluntary', 1_000, new Date(2025, 10, 15), 2025),
  contribution('c-tfr', 'fund-1', 'tfr', 534.88, new Date(2026, 5, 30), 2026, new Date(2026, 6, 5)),
  contribution('c-emp', 'fund-1', 'employer', 134.11, new Date(2026, 5, 30), 2026, new Date(2026, 6, 5)),
  contribution('c-vol-jun', 'fund-1', 'voluntary', 152.02, new Date(2026, 5, 30), 2026, new Date(2026, 6, 5)),
  contribution('c-vol-aug', 'fund-1', 'voluntary', 500, new Date(2026, 7, 10), 2026, new Date(2026, 7, 10), {
    sourceCashAssetId: 'cash-1',
    linkedExpenseId: 'exp-1',
  }),
];

/** Nov 2025 → Jul 2026; August is NOT snapshotted, so the live overlay closes the series. */
const SNAPSHOTS: MonthlySnapshot[] = [
  snapshot(2025, 11, { 'fund-1': 27_900 }),
  snapshot(2025, 12, { 'fund-1': 28_150 }),
  snapshot(2026, 1, { 'fund-1': 28_400 }),
  snapshot(2026, 2, { 'fund-1': 28_300 }),
  snapshot(2026, 3, { 'fund-1': 28_650 }),
  snapshot(2026, 4, { 'fund-1': 28_900 }),
  snapshot(2026, 5, { 'fund-1': 29_250 }),
  snapshot(2026, 6, { 'fund-1': 29_500 }),
  snapshot(2026, 7, { 'fund-1': 30_650 }),
];

/** A flat 35% marginal rate: the saving is then exactly 35% of what is deducted. */
const taxOf = (income: number) => income * 0.35;
const valueOf = (asset: Asset) => asset.quantity * asset.currentPrice;

const INPUT: PensionSummaryInput = {
  funds: [FUND],
  assets: [FUND, CASH],
  familyMembers: [MARIO],
  contributions: CONTRIBUTIONS,
  snapshots: SNAPSHOTS,
  now: NOW,
  taxYear: 2026,
  taxOf,
  valueOf,
};

describe('summarizeFundToday', () => {
  it('reads the live value, every contribution ever recorded and the month the tracking started', () => {
    const today = summarizeFundToday(INPUT);

    expect(today.value).toBe(31_450);
    expect(today.fundCount).toBe(1);
    expect(today.fundNames).toEqual(['Fondo Cometa']);
    // 1000 + 534,88 + 134,11 + 152,02 + 500
    expect(today.contributionsAllTime).toBeCloseTo(2_321.01, 2);
    expect(today.firstContributionMonth).toBe('2025-11');
    expect(today.lastUpdated).toEqual(new Date(2026, 7, 12));
  });

  it('closes the series on the live value (the Panoramica rule) and keeps it chronological', () => {
    const today = summarizeFundToday(INPUT);

    expect(today.series).toHaveLength(10);
    expect(today.series[0]).toEqual({ year: 2025, month: 11, value: 27_900 });
    expect(today.series[9]).toEqual({ year: 2026, month: 8, value: 31_450 });
  });

  it('measures this month as the Panoramica digest does: Δvalue − contributions recorded since the previous snapshot', () => {
    const today = summarizeFundToday(INPUT);

    // 31.450 − 30.650 (July) − 500 recorded in August.
    expect(today.monthEffect).toBeCloseTo(300, 2);
    expect(today.monthEffectPct).toBeCloseTo((300 / 30_650) * 100, 4);
    expect(today.monthPaidIn).toBe(500);
  });

  it('has no month effect without the previous month snapshot or before the tracked window', () => {
    const noJuly = summarizeFundToday({ ...INPUT, snapshots: SNAPSHOTS.filter((s) => s.month !== 7) });
    expect(noJuly.monthEffect).toBeNull();

    // The window starts in August: July's snapshot is not inside it.
    const lateStart = summarizeFundToday({ ...INPUT, configuredStartMonth: '2026-08' });
    expect(lateStart.monthEffect).toBeNull();
  });

  it('is honest with an account that recorded nothing', () => {
    const today = summarizeFundToday({ ...INPUT, contributions: [], snapshots: [] });

    expect(today.contributionsAllTime).toBe(0);
    expect(today.firstContributionMonth).toBeNull();
    expect(today.monthEffect).toBeNull();
    // The live overlay alone: one point, the fund's value today.
    expect(today.series).toEqual([{ year: 2026, month: 8, value: 31_450 }]);
  });
});

describe('summarizePensionMembers', () => {
  it('builds one block per member with the member-filtered return and tax recap', () => {
    const [block] = summarizePensionMembers(INPUT);

    expect(block.kind).toBe('member');
    expect(block.name).toBe('Mario');
    expect(block.fundNames).toEqual(['Fondo Cometa']);
    expect(block.value).toBe(31_450);
    expect(block.returnState).toBe('measured');
    expect(block.windowStart).toBe('2025-11');

    const result = block.return!;
    expect(result.windowStart).toBe('2025-11');
    expect(result.windowEnd).toBe('2026-08');
    expect(result.monthsCovered).toBe(9);
    // Contributions after the opening month: 534,88 + 134,11 + 152,02 + 500 (the 2025 one is in the opening value).
    expect(result.contributions.total).toBeCloseTo(1_321.01, 2);
    expect(result.marketGain).toBeCloseTo(31_450 - 27_900 - 1_321.01, 2);
    // (29.500/27.900) × (29.828,99/29.500) × (30.950/30.650) − 1
    expect(result.twr).toBeCloseTo(7.96, 1);
    expect(result.annualizedTwr).toBeCloseTo(10.75, 1);
    // (2.228,99 + 134,11) / (27.900 + 652,02 + 534,88)
    expect(result.personalReturn).toBeCloseTo(8.12, 1);
  });

  it('computes the tax recap on the member’s own contributions of the axis year', () => {
    const [block] = summarizePensionMembers(INPUT);
    const tax = block.tax!;

    expect(tax.taxYear).toBe(2026);
    expect(tax.ral).toBe(38_000);
    expect(tax.voluntary).toBeCloseTo(652.02, 2);
    expect(tax.employer).toBeCloseTo(134.11, 2);
    expect(tax.tfr).toBeCloseTo(534.88, 2);
    expect(tax.deductible).toBeCloseTo(786.13, 2);
    expect(tax.deducted).toBeCloseTo(786.13, 2);
    expect(tax.ordinaryCeiling).toBe(5_300);
    // Eligible worker in the usage window: the extra cap of 2026 is available on top.
    expect(tax.extraAvailable).toBe(2_650);
    expect(tax.effectiveCeiling).toBe(7_950);
    expect(tax.remaining).toBeCloseTo(7_950 - 786.13, 2);
    expect(tax.taxSaving).toBeCloseTo(786.13 * 0.35, 2);
    expect(tax.showPlafond).toBe(true);
    expect(tax.employerInYear).toBeCloseTo(134.11, 2);
  });

  it('follows the axis year: 2025 has the single voluntary contribution and no employer share', () => {
    const [block] = summarizePensionMembers({ ...INPUT, taxYear: 2025 });
    const tax = block.tax!;

    expect(tax.taxYear).toBe(2025);
    expect(tax.deductible).toBe(1_000);
    expect(tax.employerInYear).toBe(0);
    expect(tax.tfr).toBe(0);
    expect(tax.ordinaryCeiling).toBeCloseTo(5_164.57, 2);
    // The return is NOT on the axis: same window as on 2026.
    expect(block.return?.windowStart).toBe('2025-11');
  });

  it('leaves the tax saving null without a RAL and the recap still computed', () => {
    const [block] = summarizePensionMembers({ ...INPUT, familyMembers: [{ ...MARIO, grossAnnualIncome: undefined }] });

    expect(block.tax?.ral).toBeNull();
    expect(block.tax?.taxSaving).toBeNull();
    expect(block.tax?.deducted).toBeCloseTo(786.13, 2);
  });

  it('gives an unassigned fund its own block, without a tax recap, and never folds it into a member', () => {
    const orphan = fund('fund-2', 'PIP Vita', 5_000);
    const blocks = summarizePensionMembers({ ...INPUT, funds: [FUND, orphan], assets: [FUND, orphan, CASH] });

    expect(blocks).toHaveLength(2);
    expect(blocks[0].name).toBe('Mario');
    expect(blocks[0].value).toBe(31_450);
    expect(blocks[1].kind).toBe('unassigned');
    expect(blocks[1].name).toBeNull();
    expect(blocks[1].fundNames).toEqual(['PIP Vita']);
    expect(blocks[1].value).toBe(5_000);
    expect(blocks[1].tax).toBeNull();
    // No contribution on that fund: nothing to measure yet.
    expect(blocks[1].returnState).toBe('no-contributions');
    expect(blocks[1].return).toBeNull();
  });

  it('names the degraded states of the return', () => {
    // Idle: two equal values after the window opens and nothing recorded since.
    const idle = summarizePensionMembers({
      ...INPUT,
      contributions: [CONTRIBUTIONS[0]],
      snapshots: [snapshot(2025, 11, { 'fund-1': 27_900 }), snapshot(2025, 12, { 'fund-1': 27_900 })],
      funds: [fund('fund-1', 'Fondo Cometa', 27_900, 'm1')],
    });
    expect(idle[0].returnState).toBe('idle');

    // Suspicious: +10% a month for four months with no contribution recorded inside the window.
    const suspicious = summarizePensionMembers({
      ...INPUT,
      configuredStartMonth: '2026-01',
      contributions: [],
      snapshots: [1, 2, 3, 4].map((m) => snapshot(2026, m, { 'fund-1': 10_000 + (m - 1) * 1_000 })),
      funds: [fund('fund-1', 'Fondo Cometa', 13_000, 'm1')],
    });
    expect(suspicious[0].returnState).toBe('suspicious');

    // One point only: the window opens this month.
    const onePoint = summarizePensionMembers({ ...INPUT, configuredStartMonth: '2026-08', snapshots: [] });
    expect(onePoint[0].returnState).toBe('one-point');
    expect(onePoint[0].return).toBeNull();
  });

  it('reads more contributions than growth as «contradictory», and lets it win over «suspicious»', () => {
    // Five months of contributions recorded on one day, so valueEffectMonth attributes them all to
    // August: the window reads them as market on the way up, then subtracts 2.250 € from a month
    // worth 2.270 € (PR #323's case on round figures).
    const recorded = new Date(2026, 7, 28);
    const backfilled = [
      contribution('b1', 'fund-1', 'tfr', 400, new Date(2026, 3, 15), 2026, recorded),
      contribution('b2', 'fund-1', 'employer', 350, new Date(2026, 3, 15), 2026, recorded),
      contribution('b3', 'fund-1', 'tfr', 200, new Date(2026, 4, 15), 2026, recorded),
      contribution('b4', 'fund-1', 'employer', 175, new Date(2026, 4, 15), 2026, recorded),
      contribution('b5', 'fund-1', 'tfr', 200, new Date(2026, 5, 15), 2026, recorded),
      contribution('b6', 'fund-1', 'employer', 175, new Date(2026, 5, 15), 2026, recorded),
      contribution('b7', 'fund-1', 'tfr', 200, new Date(2026, 6, 15), 2026, recorded),
      contribution('b8', 'fund-1', 'employer', 175, new Date(2026, 6, 15), 2026, recorded),
      contribution('b9', 'fund-1', 'tfr', 200, new Date(2026, 7, 15), 2026, recorded),
      contribution('b10', 'fund-1', 'employer', 175, new Date(2026, 7, 15), 2026, recorded),
    ];
    const contradictory = summarizePensionMembers({
      ...INPUT,
      configuredStartMonth: '2026-04',
      contributions: backfilled,
      snapshots: [
        snapshot(2026, 4, { 'fund-1': 750 }),
        snapshot(2026, 5, { 'fund-1': 1_125 }),
        snapshot(2026, 6, { 'fund-1': 1_500 }),
        snapshot(2026, 7, { 'fund-1': 1_875 }),
        snapshot(2026, 8, { 'fund-1': 2_270 }),
      ],
      funds: [fund('fund-1', 'Fondo Cometa', 2_270, 'm1')],
    });
    expect(contradictory[0].returnState).toBe('contradictory');
    expect(contradictory[0].return?.isCoverageContradictory).toBe(true);

    // The overlap: two non-positive months (index negative, then positive again) and a recovery
    // that annualizes far past the suspicious threshold — both flags true, the contradiction wins.
    const overlap = summarizePensionMembers({
      ...INPUT,
      configuredStartMonth: '2026-01',
      contributions: [
        contribution('o1', 'fund-1', 'voluntary', 600, new Date(2026, 1, 10), 2026),
        contribution('o2', 'fund-1', 'voluntary', 300, new Date(2026, 2, 10), 2026),
      ],
      snapshots: [
        snapshot(2026, 1, { 'fund-1': 1_000 }),
        snapshot(2026, 2, { 'fund-1': 500 }), // net of 600 paid in: −100
        snapshot(2026, 3, { 'fund-1': 250 }), // net of 300 paid in: −50
        snapshot(2026, 4, { 'fund-1': 50_000 }),
      ],
      funds: [fund('fund-1', 'Fondo Cometa', 50_000, 'm1')],
    });
    expect(overlap[0].return?.isCoverageSuspicious).toBe(true);
    expect(overlap[0].return?.isCoverageContradictory).toBe(true);
    expect(overlap[0].returnState).toBe('contradictory');
  });
});

describe('summarizeVersato', () => {
  it('ranks the natures of the axis year, largest first, with their share of the year', () => {
    const versato = summarizeVersato(CONTRIBUTIONS, 2026);

    expect(versato.year).toBe(2026);
    expect(versato.total).toBeCloseTo(1_321.01, 2);
    expect(versato.rows.map((r) => r.nature)).toEqual(['voluntary', 'tfr', 'employer']);
    expect(versato.rows[0].amount).toBeCloseTo(652.02, 2);
    expect(versato.rows[0].percentage).toBeCloseTo((652.02 / 1_321.01) * 100, 4);
    expect(versato.rows[0].deductible).toBe(true);
    expect(versato.rows[1].deductible).toBe(false);
    expect(versato.previousYear).toBe(2025);
    expect(versato.previousYearTotal).toBe(1_000);
    expect(versato.previousYearSingleNature).toBe('voluntary');
  });

  it('drops the natures with nothing paid and has no previous year when none was recorded', () => {
    const versato = summarizeVersato(CONTRIBUTIONS, 2025);

    expect(versato.rows.map((r) => r.nature)).toEqual(['voluntary']);
    expect(versato.previousYear).toBeNull();
    expect(versato.previousYearTotal).toBeNull();
  });

  it('is empty, not zero, for a year with nothing recorded', () => {
    const versato = summarizeVersato(CONTRIBUTIONS, 2024);
    expect(versato.total).toBe(0);
    expect(versato.rows).toEqual([]);
  });
});

describe('summarizeLedger', () => {
  it('lists the axis year newest first, naming the fund, the source account and the recording month', () => {
    const ledger = summarizeLedger(CONTRIBUTIONS, [FUND], [FUND, CASH], 2026);

    expect(ledger.year).toBe(2026);
    expect(ledger.count).toBe(4);
    expect(ledger.rows.map((r) => r.id)).toEqual(['c-vol-aug', 'c-tfr', 'c-emp', 'c-vol-jun']);

    const latest = ledger.latest!;
    expect(latest.id).toBe('c-vol-aug');
    expect(latest.fundName).toBe('Fondo Cometa');
    expect(latest.sourceAccountName).toBe('Conto BancoPosta');
    expect(latest.recordedInLaterMonth).toBe(false);
    expect(latest.isStraddling).toBe(false);

    const tfr = ledger.rows[1];
    expect(tfr.recordedInLaterMonth).toBe(true);
    expect(tfr.recordedOn).toEqual(new Date(2026, 6, 5));
    expect(tfr.sourceAccountName).toBeNull();
  });

  it('flags a January payment filed under the previous tax year', () => {
    const straddling = contribution('c-jan', 'fund-1', 'voluntary', 200, new Date(2026, 0, 10), 2025);
    const ledger = summarizeLedger([...CONTRIBUTIONS, straddling], [FUND], [FUND, CASH], 2025);

    expect(ledger.count).toBe(2);
    expect(ledger.rows[0].id).toBe('c-jan');
    expect(ledger.rows[0].isStraddling).toBe(true);
  });

  it('is empty for a year with nothing recorded', () => {
    const ledger = summarizeLedger(CONTRIBUTIONS, [FUND], [FUND, CASH], 2024);
    expect(ledger.count).toBe(0);
    expect(ledger.latest).toBeNull();
  });
});
