/**
 * Tests for lib/utils/performanceSummary.ts — the pure layer behind the Rendimenti
 * redesign's hero. Covers the verdict (B1), the benchmark delta, return consistency
 * read from the heatmap (B2), and the current drawdown status (B3).
 */

import { describe, it, expect, vi } from 'vitest';

// The strip's identity test builds the verdict, whose module reaches chartService's Firebase chain: mocked as in performanceNarrative.test.ts.
vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({ invalidateDashboardOverviewSummary: vi.fn() }));
vi.mock('firebase/firestore', () => ({ doc: vi.fn(), getDoc: vi.fn(), setDoc: vi.fn(), deleteField: vi.fn() }));
import type {
  MonthlyReturnHeatmapData,
  UnderwaterDrawdownData,
} from '@/types/performance';
import type { AssetTransaction, AssetTransactionsMeta } from '@/types/assetTransactions';
import {
  summarizePerformance,
  computeBenchmarkDelta,
  computeReturnConsistency,
  computeDrawdownStatus,
  deannualizeReturn,
  PERFORMANCE_SECTION_IDS,
  RENDIMENTO_BENCHMARK_CHIP_BLOCK,
  RENDIMENTO_HERO_BLOCK,
  resolveHeroReturn,
  inMonths,
  resolveCompanionReturnChip,
  resolveRealizedGainsState,
  selectPerformanceStrip,
  summarizeCapitalEntered,
  type PerformanceStripInput,
} from '@/lib/utils/performanceSummary';
import { buildPerformanceVerdict, resolveBenchmarkGap, shortBenchmarkName, type PerformanceVerdictInput } from '@/lib/utils/performanceNarrative';
import { narrativeToText } from '@/lib/utils/narrative';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { formatStripFigure, liftedBlocks, validateStrip, type StripFigure } from '@/lib/utils/verdictStrip';

// ---------------------------------------------------------------------------
// summarizePerformance (B1)
// ---------------------------------------------------------------------------

describe('summarizePerformance', () => {
  it('should report neutral / insufficient when TWR is null', () => {
    const v = summarizePerformance({ timeWeightedReturn: null, sharpeRatio: 1.5, riskFreeRate: 3 });
    expect(v.tone).toBe('neutral');
  });

  it('should rate strong when Sharpe is excellent and return beats risk-free', () => {
    const v = summarizePerformance({ timeWeightedReturn: 12, sharpeRatio: 2.3, riskFreeRate: 3 });
    expect(v.tone).toBe('strong');
    expect(v.headline).toBe('Eccellente');
  });

  it('should rate solid when Sharpe is good and return beats risk-free', () => {
    const v = summarizePerformance({ timeWeightedReturn: 8, sharpeRatio: 1.3, riskFreeRate: 3 });
    expect(v.tone).toBe('solid');
  });

  it('should rate fragile when return is positive but Sharpe is low', () => {
    const v = summarizePerformance({ timeWeightedReturn: 4, sharpeRatio: 0.4, riskFreeRate: 3 });
    expect(v.tone).toBe('fragile');
  });

  it('should rate weak when Sharpe is negative', () => {
    const v = summarizePerformance({ timeWeightedReturn: -2, sharpeRatio: -0.5, riskFreeRate: 3 });
    expect(v.tone).toBe('weak');
  });

  it('should fall back to excess-return sign when Sharpe is null', () => {
    expect(summarizePerformance({ timeWeightedReturn: 6, sharpeRatio: null, riskFreeRate: 3 }).tone).toBe('solid');
    expect(summarizePerformance({ timeWeightedReturn: 2, sharpeRatio: null, riskFreeRate: 3 }).tone).toBe('fragile');
    expect(summarizePerformance({ timeWeightedReturn: -1, sharpeRatio: null, riskFreeRate: 3 }).tone).toBe('weak');
  });
});

// ---------------------------------------------------------------------------
// computeBenchmarkDelta
// ---------------------------------------------------------------------------

describe('computeBenchmarkDelta', () => {
  it('should return the signed gap in percentage points', () => {
    expect(computeBenchmarkDelta(7.2, 6)).toBeCloseTo(1.2, 5);
    expect(computeBenchmarkDelta(5, 8)).toBeCloseTo(-3, 5);
  });

  it('should return null when either side is missing', () => {
    expect(computeBenchmarkDelta(null, 6)).toBeNull();
    expect(computeBenchmarkDelta(7, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeReturnConsistency (B2)
// ---------------------------------------------------------------------------

describe('computeReturnConsistency', () => {
  const heatmap: MonthlyReturnHeatmapData[] = [
    {
      year: 2025,
      months: [
        { month: 1, return: 3.5 },
        { month: 2, return: -1.2 },
        { month: 3, return: null }, // no data — skipped
        { month: 4, return: 0 }, // flat — counted as non-positive
        { month: 5, return: 8.1 },
      ],
    },
  ];

  it('should count positive months and skip null months', () => {
    const c = computeReturnConsistency(heatmap);
    expect(c.totalMonths).toBe(4); // null skipped
    expect(c.positiveMonths).toBe(2); // 3.5 and 8.1; flat 0 not positive
    expect(c.positiveShare).toBeCloseTo(50, 5);
  });

  it('should surface the best and worst month with labels', () => {
    const c = computeReturnConsistency(heatmap);
    expect(c.best).toEqual({ label: 'Mag 25', year: 2025, month: 5, return: 8.1 });
    expect(c.worst).toEqual({ label: 'Feb 25', year: 2025, month: 2, return: -1.2 });
  });

  it('should handle an empty heatmap', () => {
    expect(computeReturnConsistency([])).toEqual({
      positiveMonths: 0,
      totalMonths: 0,
      positiveShare: null,
      best: null,
      worst: null,
    });
  });

  it('withholds the share on a sample too small to express one', () => {
    // Un mese solo darebbe 0% o 100% secchi: sembra una statistica, non lo è. I conteggi restano —
    // sono fatti — e la striscia mostra "1/1 mesi positivi" senza percentuale.
    const single: MonthlyReturnHeatmapData[] = [
      { year: 2026, months: [{ month: 1, return: 2.4 }] },
    ];
    const c = computeReturnConsistency(single);

    expect(c.totalMonths).toBe(1);
    expect(c.positiveMonths).toBe(1);
    expect(c.positiveShare).toBeNull();
    // Con un mese solo, migliore e peggiore sono lo stesso mese: chi renderizza deve mostrarlo una volta.
    expect(c.best).toEqual(c.worst);
  });

  it('reports the share from the third month on', () => {
    const three: MonthlyReturnHeatmapData[] = [
      {
        year: 2026,
        months: [
          { month: 1, return: 2.4 },
          { month: 2, return: -1 },
          { month: 3, return: 1 },
        ],
      },
    ];
    expect(computeReturnConsistency(three).positiveShare).toBeCloseTo(66.667, 3);
  });
});

// ---------------------------------------------------------------------------
// computeDrawdownStatus (B3)
// ---------------------------------------------------------------------------

describe('computeDrawdownStatus', () => {
  const u = (drawdown: number): UnderwaterDrawdownData => ({
    date: '01/25',
    drawdown,
    year: 2025,
    month: 1,
  });

  it('should report the latest drawdown as the current distance from peak', () => {
    const s = computeDrawdownStatus([u(0), u(-5), u(-3.2)]);
    expect(s).not.toBeNull();
    expect(s!.current).toBeCloseTo(-3.2, 5);
    expect(s!.atPeak).toBe(false);
  });

  it('should report atPeak when the latest point is ~0', () => {
    const s = computeDrawdownStatus([u(-5), u(0)]);
    expect(s!.atPeak).toBe(true);
  });

  it('should return null for an empty series', () => {
    expect(computeDrawdownStatus([])).toBeNull();
  });
});

describe('resolveHeroReturn', () => {
  // A7: annualizzare su pochi mesi trasforma una misura in una previsione. Sotto l'anno l'hero
  // mostra il rendimento del periodo, con l'etichetta che dice quale dei due sta guardando
  // (la soglia era 6 mesi fino al 2026-09-20: un YTD di nove mesi stampava «+16,0%» a 54px).

  it('keeps the annualized figure from a year on', () => {
    const result = resolveHeroReturn(12.68, 12);

    expect(result.value).toBe(12.68);
    expect(result.isPeriodReturn).toBe(false);
    expect(result.label).toBe('annualizzato');
  });

  it('states the period return on the year-to-date of nine months', () => {
    const result = resolveHeroReturn(12.0, 9);

    expect(result.isPeriodReturn).toBe(true);
    expect(result.value!).toBeCloseTo(8.87, 1);
    expect(result.label).toBe('nei 9 mesi');
    // One month short of a year is still a period; the year itself is not.
    expect(resolveHeroReturn(12.0, 11).isPeriodReturn).toBe(true);
  });

  it('de-annualizes below the threshold and says so', () => {
    // Un +4% in due mesi annualizza a 1,04^6 − 1 = 26,5319%: è quel numero che l'hero mostrava,
    // una previsione a dodici mesi ricavata da due. Sotto soglia torna a dire +4%.
    const result = resolveHeroReturn(26.5319, 2);

    expect(result.isPeriodReturn).toBe(true);
    expect(result.value!).toBeCloseTo(4, 4);
    expect(result.label).toBe('nei 2 mesi');
  });

  it('uses the singular label for a single month', () => {
    expect(resolveHeroReturn(12.68, 1).label).toBe('nel mese');
  });

  it('says «negli» before 8 and 11 months — the vowel-initial counts below a year — and the strip cell inherits it', () => {
    // Seen red on 2026-10-14 with the label fixed on «nei» («nei 8 mesi», «nei 11 mesi»).
    expect(resolveHeroReturn(16.0, 8).label).toBe('negli 8 mesi');
    expect(resolveHeroReturn(16.0, 11).label).toBe('negli 11 mesi');
    expect(resolveHeroReturn(16.0, 9).label).toBe('nei 9 mesi');
    expect(inMonths(2)).toBe('nei');
    expect(inMonths(8)).toBe('negli');
    const cell = selectPerformanceStrip({ heroReturn: resolveHeroReturn(16.0, 8), benchmarkGap: null, benchmarkShortName: '60/40', benchmarkLoading: false, hasAttribution: true })[0];
    expect(cell.label).toBe('Rendimento negli 8 mesi');
  });

  it('is the exact inverse of the annualization, so nothing is invented', () => {
    const annualized = 15.93;
    const months = 3;
    const result = resolveHeroReturn(annualized, months);

    // Ri-annualizzando si torna al punto di partenza.
    const reAnnualized = (Math.pow(1 + result.value! / 100, 12 / months) - 1) * 100;
    expect(reAnnualized).toBeCloseTo(annualized, 6);
  });

  it('handles a negative short-period return', () => {
    const result = resolveHeroReturn(-30, 3);

    expect(result.isPeriodReturn).toBe(true);
    expect(result.value!).toBeLessThan(0);
    expect(result.value!).toBeGreaterThan(-30); // la perdita di periodo è meno profonda dell'annualizzata
  });

  it('passes a missing return through without inventing a label', () => {
    const result = resolveHeroReturn(null, 2);

    expect(result.value).toBeNull();
    expect(result.isPeriodReturn).toBe(false);
  });
});

describe('deannualizeReturn / resolveCompanionReturnChip', () => {
  it('is the exact inverse of the annualisation, and the step the hero takes below a year', () => {
    // +20% a year over 36 months is +72,8% cumulative (a «Storico» window of three years).
    expect(deannualizeReturn(20.0, 36)).toBeCloseTo(72.8, 1);
    expect(deannualizeReturn(12, 12)).toBeCloseTo(12, 9);
    expect(deannualizeReturn(26.5319, 2)).toBeCloseTo(resolveHeroReturn(26.5319, 2).value!, 9);
  });

  it('offers the OTHER basis: cumulative beside an annualised hero, annualised beside a period hero', () => {
    const annualised = resolveHeroReturn(20.0, 36);
    expect(resolveCompanionReturnChip(20.0, 36, annualised)).toEqual({ value: expect.closeTo(72.8, 1), label: 'cumulato in 36 mesi' });
    // Nine months: the hero is what happened, the chip is the rate per year.
    expect(resolveCompanionReturnChip(12.0, 9, resolveHeroReturn(12.0, 9))).toEqual({ value: 12.0, label: 'annualizzato' });
    expect(resolveCompanionReturnChip(12.0, 6, resolveHeroReturn(12.0, 6))).toEqual({ value: 12.0, label: 'annualizzato' });
  });

  it('prints no chip where it would extrapolate or repeat the hero', () => {
    // Below six months not even a 12px chip annualises.
    expect(resolveCompanionReturnChip(26.5319, 2, resolveHeroReturn(26.5319, 2))).toBeNull();
    expect(resolveCompanionReturnChip(26.5319, 5, resolveHeroReturn(26.5319, 5))).toBeNull();
    // Over exactly twelve months the two figures coincide.
    expect(resolveCompanionReturnChip(12.63, 12, resolveHeroReturn(12.63, 12))).toBeNull();
    expect(resolveCompanionReturnChip(null, 9, resolveHeroReturn(null, 9))).toBeNull();
    expect(resolveCompanionReturnChip(11.47, 0, resolveHeroReturn(11.47, 36))).toBeNull();
  });
});

describe('summarizeCapitalEntered', () => {
  const month = (m: number, flows: { net?: number; portfolio?: number | null; pension?: number }) => ({
    date: new Date(2026, m - 1, 1),
    income: 0,
    expenses: 0,
    dividendIncome: 0,
    netCashFlow: flows.net ?? 0,
    ...(flows.portfolio !== undefined ? { portfolioFlow: flows.portfolio } : {}),
    ...(flows.pension !== undefined ? { pensionFlow: flows.pension } : {}),
  });

  it('splits what the formulas neutralised by channel, and a measured month never adds the savings too', () => {
    const summary = summarizeCapitalEntered(
      [month(1, { net: 900 }), month(2, { net: 500, portfolio: 1200 }), month(3, { net: 400, portfolio: 0, pension: 31852 })],
      3,
    );

    expect(summary.channels).toEqual([
      { key: 'measured', amount: 1200, months: 2 },
      { key: 'cashflow', amount: 900, months: 1 },
      { key: 'pension', amount: 31852, months: 1 },
    ]);
    expect(summary.total).toBe(33952);
  });

  it('adds up ON SCREEN: the total is the sum of the rounded channels, not the rounded sum', () => {
    // 100,4 + 200,4 + 300,4 = 601,2 → 601; the printed rows give 100 + 200 + 300 = 600.
    const summary = summarizeCapitalEntered([month(1, { net: 100.4 }), month(2, { portfolio: 200.4, pension: 300.4 })], 2);

    expect(summary.total).toBe(summary.channels.reduce((sum, channel) => sum + channel.amount, 0));
    expect(summary.total).toBe(600);
  });

  it('with the whole net worth as the base there is one channel, the cashflow, over every month — quiet months included', () => {
    // March has no row in the series (nothing moved): it is still a month the cashflow covered.
    const summary = summarizeCapitalEntered([month(1, { net: 900 }), month(2, { net: -300 })], 3);

    expect(summary.channels).toEqual([{ key: 'cashflow', amount: 600, months: 3 }]);
  });

  it('drops a channel that carried no month, and a null portfolio flow is NOT a measured month', () => {
    const summary = summarizeCapitalEntered([month(1, { net: 250, portfolio: null })], 1);

    expect(summary.channels).toEqual([{ key: 'cashflow', amount: 250, months: 1 }]);
  });
});

// ---------------------------------------------------------------------------
// The phone composition (2026-10-14): the strip and the Plusvalenze state
// ---------------------------------------------------------------------------
//
// Seen red, one at a time, the day they were written: (1) the identity — the cell with
// `decimals: 2` («+2,09%» against the sentence's «+2,1%»), then with an ASCII «-» on a loss;
// (2) the return cell fixed on `rend-attribuzione` whatever `hasAttribution`; (3) `failed` read
// from `data` alone (an error with no document read as «not migrated»); (4) `absent` decided on
// `!!meta.data` (a migrated ledger with no closed sale read as `ready`); (5) an error WITH a
// document read from `isError` alone (`failed` over a document already held).

describe('selectPerformanceStrip', () => {
  const plain = (text: string) => text.replace(/[  ]/g, ' ');
  const cellText = (figure: StripFigure) => plain(narrativeToText([formatStripFigure(figure)!]));
  const sections = [...Object.values(PERFORMANCE_SECTION_IDS).filter((id) => id !== PERFORMANCE_SECTION_IDS.twr), VERDICT_REST_SECTION];

  const fourMonths: PerformanceVerdictInput = {
    period: 'YTD',
    nominalPeriodStart: { year: 2026, month: 1 },
    startDate: new Date(2026, 0, 1, 12),
    endDate: new Date(2026, 3, 30, 12),
    numberOfMonths: 4,
    heroReturn: resolveHeroReturn(6.4, 4),
    annualizedReturn: 6.4,
    quality: { tone: 'solid', headline: 'Solido', detail: '' },
    sharpeRatio: 1.08,
    benchmark: { name: 'Portafoglio 60/40', annualized: 5.2 },
    drawdown: null,
    consistency: { positiveMonths: 3, totalMonths: 4, positiveShare: 75, best: null, worst: null },
  };

  function stripOf(input: PerformanceVerdictInput, overrides: Partial<PerformanceStripInput> = {}): StripFigure[] {
    return selectPerformanceStrip({
      heroReturn: input.heroReturn,
      benchmarkGap: resolveBenchmarkGap(input),
      benchmarkShortName: shortBenchmarkName(input.benchmark?.name ?? 'Portafoglio 60/40'),
      benchmarkLoading: false,
      hasAttribution: true,
      ...overrides,
    });
  }

  it('reads two cells — the return on its basis, the gap on the same basis — that open the rows and pass the strip rules', () => {
    const strip = stripOf(fourMonths);
    expect(strip.map((figure) => figure.label)).toEqual(['Rendimento nei 4 mesi', 'Sul 60/40']);
    expect(strip.map((figure) => figure.opens)).toEqual([PERFORMANCE_SECTION_IDS.attribuzione, PERFORMANCE_SECTION_IDS.benchmark]);
    expect(strip.map((figure) => figure.lifts)).toEqual([
      { section: PERFORMANCE_SECTION_IDS.twr, block: RENDIMENTO_HERO_BLOCK },
      { section: PERFORMANCE_SECTION_IDS.twr, block: RENDIMENTO_BENCHMARK_CHIP_BLOCK },
    ]);
    expect(validateStrip(strip, sections)).toEqual([]);
    // Below a year the cell is the PERIOD's return, never the annualised 6,4%; the gap is the period's too (0,4, not 1,2).
    expect(cellText(strip[0])).toBe('+2,1%');
    expect(cellText(strip[1])).toBe('+0,4 pt');
    expect(stripOf({ ...fourMonths, heroReturn: resolveHeroReturn(7.3, 12), annualizedReturn: 7.3, numberOfMonths: 12 })[0].label).toBe('Rendimento annualizzato');
  });

  it('prints the return exactly as the verdict prints it, built from the SAME heroReturn', () => {
    const strip = stripOf(fourMonths);
    const sentence = plain(narrativeToText(buildPerformanceVerdict(fourMonths).sentence));
    expect(sentence).toContain(cellText(strip[0]));
    expect(sentence).toContain('0,4 punti sopra');

    // A loss (−9,5% a year is −3,3% over four months): the typographic «−» on both sides, coloured as a loss.
    const losing: PerformanceVerdictInput = { ...fourMonths, heroReturn: resolveHeroReturn(-9.5, 4), annualizedReturn: -9.5, quality: { tone: 'weak', headline: 'Negativo', detail: '' } };
    const lossStrip = stripOf(losing);
    expect(cellText(lossStrip[0])).toBe('−3,3%');
    expect(plain(narrativeToText(buildPerformanceVerdict(losing).sentence))).toContain('Perde −3,3% nei 4 mesi (TWR)');
    expect(formatStripFigure(lossStrip[0])!.sign).toBe('negative');
    expect(formatStripFigure(lossStrip[1])!.sign).toBe('negative');
  });

  it('says why a cell has no figure, never a zero', () => {
    const notYet = stripOf({ ...fourMonths, heroReturn: resolveHeroReturn(null, 4), annualizedReturn: null, benchmark: null }, { benchmarkLoading: true });
    expect(notYet[0]).toMatchObject({ value: null, reason: 'non ancora misurabile' });
    expect(notYet[1]).toMatchObject({ value: null, reason: 'in arrivo' });
    expect(stripOf({ ...fourMonths, benchmark: null })[1]).toMatchObject({ value: null, reason: 'modello non disponibile' });
    expect(validateStrip(notYet, sections)).toEqual([]);
    // A cell without a figure lifts nothing: the «in arrivo» chip stays in the tile.
    expect(liftedBlocks(notYet, PERFORMANCE_SECTION_IDS.twr)).toEqual([]);
    expect(liftedBlocks(stripOf(fourMonths), PERFORMANCE_SECTION_IDS.twr)).toEqual([RENDIMENTO_HERO_BLOCK, RENDIMENTO_BENCHMARK_CHIP_BLOCK]);
  });

  it('opens Capitale e mercato when no month of the window has a per-instrument breakdown', () => {
    expect(stripOf(fourMonths, { hasAttribution: false })[0].opens).toBe(PERFORMANCE_SECTION_IDS.capitale);
  });
});

describe('resolveRealizedGainsState', () => {
  const meta = { userId: 'u', migratedAt: new Date(2026, 0, 5, 12), baselineDate: new Date(2026, 0, 5, 12), migratedAssetCount: 2 } as AssetTransactionsMeta;
  const trade = (type: 'buy' | 'sell', quantity: number, price: number, month: number): AssetTransaction => ({
    id: `${type}-${quantity}`,
    userId: 'u',
    assetId: 'etf',
    type,
    date: new Date(2026, month - 1, 10, 12),
    quantity,
    pricePerUnit: price,
    priceEur: price,
    fees: 0,
    createdAt: new Date(2026, month - 1, 10, 12),
    updatedAt: new Date(2026, month - 1, 10, 12),
  });
  const closedSale = [trade('buy', 10, 100, 2), trade('sell', 4, 120, 3)];

  it('a meta whose read failed with no document to show is `failed`', () => {
    expect(resolveRealizedGainsState({ meta: { isError: true, data: undefined }, trades: closedSale })).toBe('failed');
  });

  it('a ledger never migrated, or with no closed sale, is `absent` — and so is a meta not read yet', () => {
    expect(resolveRealizedGainsState({ meta: { isError: false, data: null }, trades: closedSale })).toBe('absent');
    // Still in flight: nothing to show and nothing failed (a `failed` read from `data` alone would say so here).
    expect(resolveRealizedGainsState({ meta: { isError: false, data: undefined }, trades: closedSale })).toBe('absent');
    expect(resolveRealizedGainsState({ meta: { isError: false, data: meta }, trades: [trade('buy', 10, 100, 2)] })).toBe('absent');
    expect(resolveRealizedGainsState({ meta: { isError: false, data: meta }, trades: [] })).toBe('absent');
  });

  it('a reread that fails over a document already held stays `ready`: the meta decides no figure of the verdict', () => {
    expect(resolveRealizedGainsState({ meta: { isError: true, data: meta }, trades: closedSale })).toBe('ready');
    expect(resolveRealizedGainsState({ meta: { isError: false, data: meta }, trades: closedSale })).toBe('ready');
  });
});
