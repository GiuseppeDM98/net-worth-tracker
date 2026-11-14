/**
 * Tests for lib/utils/overviewSummary.ts — the Panoramica's model for the phone composition
 * (since 2026-10-11): the strip's three cells, the identity between a cell and the verdict's
 * sentence, `verdictNamesMarket`, the rows' closed asides, the two ratios of the Cashflow tile.
 * The Firebase chain behind chartService's formatter is mocked away as in overviewNarrative.test.ts.
 *
 * Falsified on 2026-10-11, one at a time: the identity went red with «Questo mese» without
 * `decimals` («+3000 €» against the sentence's «+3000,00 €») and with the savings rate passed
 * unrounded (−12,5 → «−13%» from `Intl`, «−12%» in the sentence); `verdictNamesMarket` went red on
 * the net-loss sale with the body replaced by `input.marketEffect !== null` — the comparison with
 * the regex pins the definition, the hard-coded booleans per case carry the proof; the asides went
 * red (in the retirement, the same day) with Sintesi's aside replaced by «giorno 11 di 31».
 *
 * Falsified on 2026-10-16, one at a time, on `describeOverviewClosedAnswers` (the closed rows'
 * answers): without the Composizione comparison → the «Asset principali» test red; the one-category
 * branch dropped → the answers and the category tests red; «quasi tutto» decided on the raw value
 * → red; `formatPercentageIt(share)` with Intl's hyphen → the negative share red; Costi answered
 * without TER or stamp duty → the null test red; the projection without the calendar's rows → the
 * answers and the projection tests red; Costi answering with the strip's «+3000,00 €» → the
 * Lifted-Figure test red.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('@/lib/utils/authFetch', () => ({ authenticatedFetch: vi.fn() }));
vi.mock('@/lib/services/dashboardOverviewInvalidation', () => ({
  invalidateDashboardOverviewSummary: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  annualPortfolioCostTotal,
  buildOverviewVerdict,
  liquidityShare,
  narrativeToText,
  projectCashflowMonthEnd,
  resolveLivedCashflow,
  type OverviewVerdictInput,
} from '@/lib/utils/overviewNarrative';
import type { Narrative } from '@/lib/utils/narrative';
import {
  describeOverviewAsides,
  describeOverviewClosedAnswers,
  monthCoverageRatio,
  monthSavingsRate,
  OVERVIEW_PATRIMONIO_ID,
  OVERVIEW_SECTION_IDS,
  selectOverviewStrip,
  verdictNamesMarket,
} from '@/lib/utils/overviewSummary';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import { formatStripFigure, liftedBlocks, validateStrip, type StripFigure } from '@/lib/utils/verdictStrip';
import type { DashboardOverviewExpenseStats, DashboardOverviewPayload } from '@/types/dashboardOverview';

const plain = (text: string) => text.replace(/[  ]/g, ' ');
const cellText = (figure: StripFigure) => plain(narrativeToText([formatStripFigure(figure)!]));

/** Round, invented figures: income 4000 with nothing scheduled, expenses 2000 of which 350 in the calendar. */
const STATS: DashboardOverviewExpenseStats = {
  currentMonth: { income: 4000, expenses: 2000, net: 2000, expensesScheduled: 350, incomeScheduled: 0 },
  previousMonth: { income: 4000, expenses: 3500, net: 500 },
  delta: { income: 0, expenses: -42.9, net: 300 },
  topExpenseCategories: [{ category: 'Casa', categoryKey: 'casa', expenseType: 'fixed', amount: 900, percentage: 45 }],
  topIncomeCategories: [{ category: 'Stipendio', categoryKey: 'stipendio', expenseType: 'income', amount: 4000, percentage: 100 }],
};

function makeOverview(overrides: Partial<DashboardOverviewPayload> = {}): DashboardOverviewPayload {
  return {
    metrics: {
      totalValue: 190000,
      liquidNetWorth: 150000,
      illiquidNetWorth: 40000,
      cashNetWorth: 20000,
      liquidInvestmentsNetWorth: 130000,
      netTotal: 185000,
      liquidNetTotal: 145000,
      unrealizedGains: 20000,
      estimatedTaxes: 5000,
      liquidEstimatedTaxes: 5000,
      portfolioTER: 0.2,
      annualPortfolioCost: 300,
      annualStampDuty: 380,
    },
    variations: { monthly: { value: 3000, percentage: 1.6 }, yearly: { value: 25000, percentage: 15 } },
    expenseStats: STATS,
    charts: {
      assetClassData: [{ name: 'Azioni', value: 130000, percentage: 68.4, color: '#000', assetClass: 'equity' }],
      assetData: [],
      liquidityData: [],
    },
    flags: { assetCount: 3, hasCostBasisTracking: true, hasTERTracking: true, hasStampDuty: true, currentMonthSnapshotExists: false },
    freshness: { source: 'live_recompute', updatedAt: '2026-10-11T08:00:00.000Z', computedAt: '2026-10-11T08:00:00.000Z', sourceVersion: 19, stale: false },
    topAssets: [{ id: 'a', name: 'VWCE', assetType: 'etf', assetClass: 'equity', totalValue: 130000, portfolioPercent: 68.4, returnPercent: 12 }],
    marketEffect: 2000,
    topMovers: [{ assetClass: 'equity', label: 'Azioni', delta: 1500 }],
    goalProgressList: [{ goalId: 'g', goalName: 'Casa', goalColor: '#000', currentValue: 40000, targetAmount: 100000, progressPercentage: 40 }],
    ...overrides,
  };
}

/** The verdict's input the way `app/dashboard/page.tsx` builds it from the payload. */
function verdictInput(overview: DashboardOverviewPayload, month = 10): OverviewVerdictInput {
  const cashflow = resolveLivedCashflow(overview.expenseStats);
  return {
    month,
    totalValue: overview.metrics.totalValue,
    monthlyVariation: overview.variations.monthly,
    yearlyVariation: overview.variations.yearly,
    isNewATH: overview.ath?.isNewATH ?? false,
    savingsRate: cashflow ? cashflow.savingsRate : monthSavingsRate(overview.expenseStats),
    cashflow,
    marketEffect: overview.marketEffect ?? null,
    topMover: overview.topMovers?.[0] ?? null,
    sales: overview.monthSales ?? null,
  };
}

const ROW_IDS = Object.values(OVERVIEW_SECTION_IDS);

describe('selectOverviewStrip', () => {
  const overview = makeOverview();
  const strip = selectOverviewStrip(overview);

  it('reads three cells — the month, the year, what was saved so far — and passes the strip rules', () => {
    expect(strip.map((figure) => figure.label)).toEqual(['Questo mese', 'Da inizio anno', 'Messo da parte finora']);
    expect(strip.map((figure) => figure.opens)).toEqual([VERDICT_REST_SECTION, OVERVIEW_PATRIMONIO_ID, OVERVIEW_SECTION_IDS.cashflow]);
    expect(validateStrip(strip, [...ROW_IDS, OVERVIEW_PATRIMONIO_ID, VERDICT_REST_SECTION])).toEqual([]);
    // Without «Il perché» (the cut cancelled by a binding clause) the first cell's target is one the
    // controller does not know — `validateStrip` says so, and the PAGE answers it: `handleStripOpen`
    // puts the focus on the verdict's box instead (app/dashboard/page.tsx). Written in the retirement
    // of 2026-10-11, where this line was a copy of the one above.
    expect(validateStrip(strip, [...ROW_IDS, OVERVIEW_PATRIMONIO_ID])).toEqual([`«Questo mese» opens an unknown section «${VERDICT_REST_SECTION}»`]);
  });

  it('lifts the two chips of THE tile, and nothing of the Cashflow tile', () => {
    expect(liftedBlocks(strip, OVERVIEW_PATRIMONIO_ID)).toEqual(['monthly', 'yearly']);
    expect(liftedBlocks(strip, OVERVIEW_SECTION_IDS.cashflow)).toEqual([]);
  });

  it('prints every cell EXACTLY as the verdict prints it (two decimals for the euro and the percentage, the rate whole)', () => {
    const sentence = plain(narrativeToText(buildOverviewVerdict(verdictInput(overview)).sentence));
    expect(cellText(strip[0])).toBe('+3000,00 €');
    expect(cellText(strip[1])).toBe('+15,00%');
    // 4000 − 1650 lived = 2350 → 58,75% → «59%» in both.
    expect(cellText(strip[2])).toBe('59%');
    for (const figure of strip) expect(sentence).toContain(cellText(figure));
  });

  it('keeps the identity at a savings rate of −12,5 (rounded once, by the sentence\'s rule) and at a zero variation', () => {
    // income 4000 lived, expenses 4500 → −12,5%: `Math.round` gives −12 as the sentence; `Intl` alone would give −13.
    const overspent = makeOverview({
      expenseStats: { ...STATS, currentMonth: { income: 4000, expenses: 4500, net: -500, expensesScheduled: 0, incomeScheduled: 0 } },
      variations: { monthly: { value: -0.004, percentage: 0 }, yearly: { value: 0, percentage: 0 } },
    });
    const strip = selectOverviewStrip(overspent);
    const sentence = plain(narrativeToText(buildOverviewVerdict(verdictInput(overspent)).sentence));
    expect(cellText(strip[2])).toBe('−12%');
    expect(sentence).toContain('il −12% delle entrate');
    expect(cellText(strip[0])).toBe('0,00 €');
    expect(cellText(strip[1])).toBe('0,00%');
    for (const figure of strip) expect(sentence).toContain(cellText(figure));
  });

  // The savings floor (owner, 2026-11-12): ① nothing in, 500 € out; ② 3 € in, 500 € out; ③ 2000 €
  // in, 2600 € out (−30%), with 1500 € of spending and 2600 € of income still in the calendar.
  describe('«Messo da parte finora» below the savings floor', () => {
    const withLived = (income: number, spending: number) =>
      makeOverview({
        expenseStats: {
          ...STATS,
          currentMonth: { income: income + 2600, expenses: spending + 1500, net: income + 2600 - spending - 1500, expensesScheduled: 1500, incomeScheduled: 2600 },
        },
      });

    it('has no value without income so far (S1)', () => {
      expect(selectOverviewStrip(withLived(0, 500))[2]).toMatchObject({ value: null, reason: 'nessuna entrata finora' });
    });

    it('prints a deficit beyond the floor in signed euros, the text of the sentence (S2)', () => {
      const overview = withLived(3, 500);
      const cell = selectOverviewStrip(overview)[2];
      expect(cellText(cell)).toBe('−497 €');
      expect(plain(narrativeToText(buildOverviewVerdict(verdictInput(overview)).sentence))).toContain(cellText(cell));
    });

    it('keeps a true −30% as a rate (S3)', () => {
      const overview = withLived(2000, 2600);
      const cell = selectOverviewStrip(overview)[2];
      expect(cellText(cell)).toBe('−30%');
      expect(plain(narrativeToText(buildOverviewVerdict(verdictInput(overview)).sentence))).toContain(cellText(cell));
    });

    it('says the deficit in words on a payload without the calendar, whose sentence has no clause', () => {
      const olderPayload = makeOverview({ expenseStats: { ...STATS, currentMonth: { income: 3, expenses: 500, net: -497, expensesScheduled: 0 } } });
      expect(selectOverviewStrip(olderPayload)[2]).toMatchObject({ value: null, reason: 'spese oltre le entrate' });
      expect(plain(narrativeToText(buildOverviewVerdict(verdictInput(olderPayload)).sentence))).not.toContain('delle entrate');
    });
  });

  it('says why a figure is missing, never a zero', () => {
    const noSnapshots = selectOverviewStrip(makeOverview({ variations: { monthly: null, yearly: null } }));
    expect(noSnapshots[0]).toMatchObject({ value: null, reason: 'nessuno snapshot prima di questo mese' });
    expect(noSnapshots[1]).toMatchObject({ value: null, reason: "nessuno snapshot da cui contare l'anno" });

    // No income so far (the salary still in the calendar): the lived reading exists and has no rate.
    const salaryTomorrow = selectOverviewStrip(
      makeOverview({ expenseStats: { ...STATS, currentMonth: { income: 2456, expenses: 300, net: 2156, expensesScheduled: 0, incomeScheduled: 2456 } } }),
    );
    expect(salaryTomorrow[2]).toMatchObject({ value: null, reason: 'nessuna entrata finora' });

    // A payload without `incomeScheduled` (or without stats): the whole month, and no income in it.
    const olderPayload = selectOverviewStrip(
      makeOverview({ expenseStats: { ...STATS, currentMonth: { income: 0, expenses: 300, net: -300, expensesScheduled: 0 } } }),
    );
    expect(olderPayload[2]).toMatchObject({ value: null, reason: 'nessuna entrata nel mese' });
    expect(selectOverviewStrip(makeOverview({ expenseStats: null }))[2]).toMatchObject({ value: null, reason: 'nessuna entrata nel mese' });
  });

  it('is empty when every figure is missing', () => {
    expect(selectOverviewStrip(makeOverview({ variations: { monthly: null, yearly: null }, expenseStats: null }))).toEqual([]);
  });
});

describe('verdictNamesMarket', () => {
  const namesIt = (input: OverviewVerdictInput) => /mercato/.test(narrativeToText(buildOverviewVerdict(input).sentence));
  const cases: Array<[string, OverviewVerdictInput, boolean]> = [
    ['a month with a market effect and a driver', verdictInput(makeOverview()), true],
    ['no market effect', verdictInput(makeOverview({ marketEffect: null, topMovers: [] })), false],
    // The driver clause does not need the variation: «sul mercato hanno spinto…» still names it.
    ['no monthly variation', verdictInput(makeOverview({ variations: { monthly: null, yearly: { value: 25000, percentage: 15 } } })), true],
    ['an unknown class and no split', verdictInput(makeOverview({ topMovers: [{ assetClass: 'structuredNotes', label: 'Note', delta: 500 }], marketEffect: null })), false],
    [
      'a taxed sale with the split',
      verdictInput(
        makeOverview({
          topMovers: [],
          monthSales: { proceeds: 10000, realizedGain: 2000, estimatedTax: 520, instruments: [{ id: 'a', name: 'A', proceeds: 10000, realizedGain: 2000, estimatedTax: 520 }], brokenLedgers: 0 },
        }),
      ),
      true,
    ],
    [
      'a sale with a net loss and a tax above zero: no split, no counterfactual, no driver',
      verdictInput(
        makeOverview({
          topMovers: [],
          monthSales: {
            proceeds: 10000,
            realizedGain: -500,
            estimatedTax: 260,
            instruments: [
              { id: 'a', name: 'A', proceeds: 6000, realizedGain: 1000, estimatedTax: 260 },
              { id: 'b', name: 'B', proceeds: 4000, realizedGain: -1500, estimatedTax: 0 },
            ],
            brokenLedgers: 0,
          },
        }),
      ),
      false,
    ],
  ];

  it.each(cases)('agrees with the sentence: %s', (_name, input, expected) => {
    expect(namesIt(input)).toBe(expected);
    expect(verdictNamesMarket(input)).toBe(expected);
  });
});

describe('describeOverviewAsides', () => {
  it('says in words what each closed row holds, without a figure', () => {
    const asides = describeOverviewAsides(makeOverview());
    expect(asides).toEqual({
      [OVERVIEW_SECTION_IDS.sintesi]: 'cosa è liquidabile',
      [OVERVIEW_SECTION_IDS.cashflow]: 'entrate, spese e fine mese',
      [OVERVIEW_SECTION_IDS.composizione]: 'per asset class',
      [OVERVIEW_SECTION_IDS.costi]: 'stima annua',
      [OVERVIEW_SECTION_IDS.obiettivo]: 'in corso',
      [OVERVIEW_SECTION_IDS.spese]: 'le prime del mese',
      [OVERVIEW_SECTION_IDS.entrate]: 'le prime del mese',
      [OVERVIEW_SECTION_IDS.asset]: 'valore, peso, rendimento',
      [OVERVIEW_SECTION_IDS.intestatari]: 'quote per persona',
    });
    for (const aside of Object.values(asides)) expect(aside).not.toMatch(/\d|€/);
  });

  it('says what is missing when a tile has nothing to show', () => {
    const asides = describeOverviewAsides(
      makeOverview({
        expenseStats: null,
        charts: { assetClassData: [], assetData: [], liquidityData: [] },
        topAssets: [],
        goalProgressList: [{ goalId: 'g', goalName: 'Casa', goalColor: '#000', currentValue: 100000, targetAmount: 100000, progressPercentage: 100 }],
      }),
    );
    expect(asides[OVERVIEW_SECTION_IDS.cashflow]).toBe('nessun dato questo mese');
    expect(asides[OVERVIEW_SECTION_IDS.composizione]).toBe('nessun asset');
    expect(asides[OVERVIEW_SECTION_IDS.obiettivo]).toBe('raggiunto');
    expect(asides[OVERVIEW_SECTION_IDS.spese]).toBe('nessuna spesa questo mese');
    expect(asides[OVERVIEW_SECTION_IDS.entrate]).toBe('nessuna entrata questo mese');
    expect(asides[OVERVIEW_SECTION_IDS.asset]).toBe('nessun asset in portafoglio');
    // Stats present but a month with no rows of one kind.
    const noIncome = describeOverviewAsides(makeOverview({ expenseStats: { ...STATS, topIncomeCategories: [] } }));
    expect(noIncome[OVERVIEW_SECTION_IDS.entrate]).toBe('nessuna entrata questo mese');
  });
});

describe('the Cashflow tile\'s ratios (the whole month)', () => {
  it('reads the savings rate and the coverage on the whole month, null without a denominator', () => {
    expect(monthSavingsRate(STATS)).toBe(50);
    expect(monthCoverageRatio(STATS)).toBe(2);
    expect(monthSavingsRate({ ...STATS, currentMonth: { ...STATS.currentMonth, income: 0 } })).toBeNull();
    expect(monthCoverageRatio({ ...STATS, currentMonth: { ...STATS.currentMonth, expenses: 0 } })).toBeNull();
    expect(monthSavingsRate(null)).toBeNull();
    expect(monthCoverageRatio(undefined)).toBeNull();
  });
});

describe('describeOverviewClosedAnswers (the landscape index)', () => {
  /** Day 15 of 30: the Cashflow projection is (2000 − 350) / 15 × 30 + 350 = 3650 €. */
  const CALENDAR = { dayOfMonth: 15, daysInMonth: 30 };
  const text = (answer: Narrative | null) => (answer === null ? null : plain(narrativeToText(answer)).trim());
  /** The fixture with a top asset whose weight is not Composizione's first share. */
  const overview = () => makeOverview({ topAssets: [{ id: 'a', name: 'VWCE', assetType: 'etf', assetClass: 'equity', totalValue: 76000, portfolioPercent: 40, returnPercent: 12 }] });

  it('answers every row with words and at most one figure, as the tile prints it', () => {
    const answers = describeOverviewClosedAnswers(overview(), CALENDAR);
    expect(Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, text(answer)]))).toEqual({
      [OVERVIEW_SECTION_IDS.sintesi]: 'liquidabile 78,9%',
      [OVERVIEW_SECTION_IDS.cashflow]: 'a fine mese ~3650 €',
      [OVERVIEW_SECTION_IDS.composizione]: 'Azioni 68,4%',
      [OVERVIEW_SECTION_IDS.costi]: 'costo annuo 680 €',
      [OVERVIEW_SECTION_IDS.obiettivo]: 'Casa 40%',
      [OVERVIEW_SECTION_IDS.spese]: 'tutto in Casa',
      [OVERVIEW_SECTION_IDS.entrate]: 'tutto da Stipendio',
      [OVERVIEW_SECTION_IDS.asset]: 'VWCE 40,0%',
      // No held asset names a person on this fixture: the Intestatari row does not exist.
      [OVERVIEW_SECTION_IDS.intestatari]: null,
    });
    for (const answer of Object.values(answers)) {
      if (!answer) continue;
      expect(answer.filter((segment) => segment.mono).length).toBeLessThanOrEqual(1);
      // None of these figures is a gain or a loss: no sign colour.
      expect(answer.some((segment) => segment.sign)).toBe(false);
      expect(text(answer)!.length).toBeLessThanOrEqual(22);
    }
  });

  // «Intestatari» (2026-10-17): the largest owner and the share its row prints, a figure no other row carries.
  it('answers the Intestatari row with the largest owner, as the payload carries it', () => {
    const withOwners = makeOverview({
      ownership: {
        rows: [
          { key: 'marco', kind: 'member', memberId: 'marco', label: 'Marco', value: 120000, sharePct: 53.3, costValue: 100000, costSharePct: 48.8, assetCount: 2 },
          { key: 'common', kind: 'common', memberId: null, label: 'In comune', value: 105000, sharePct: 46.7, costValue: 105000, costSharePct: 51.2, assetCount: 3 },
        ],
        total: 225000,
        costTotal: 205000,
        assetCount: 5,
        hasOwners: true,
        reassign: [],
        withoutCostBasis: [],
      },
    });
    expect(text(describeOverviewClosedAnswers(withOwners, CALENDAR)[OVERVIEW_SECTION_IDS.intestatari])).toBe('Marco 53%');
  });

  it('never repeats a figure the strip prints (The Lifted-Figure Rule)', () => {
    const o = overview();
    const stripTexts = selectOverviewStrip(o).filter((cell) => cell.value !== null).map(cellText);
    for (const answer of Object.values(describeOverviewClosedAnswers(o, CALENDAR))) {
      const figure = answer?.find((segment) => segment.mono);
      if (figure) expect(stripTexts).not.toContain(plain(figure.text));
    }
  });

  it('keeps «Asset principali» on its scope when its weight prints Composizione\'s figure', () => {
    // The default fixture: VWCE is the only equity, 68,4% in both rows.
    expect(describeOverviewClosedAnswers(makeOverview(), CALENDAR)[OVERVIEW_SECTION_IDS.asset]).toBeNull();
    // 68,44 and 68,4 print the same: the rule is on the printed text, not the value.
    const near = makeOverview({ topAssets: [{ id: 'a', name: 'VWCE', assetType: 'etf', assetClass: 'equity', totalValue: 130000, portfolioPercent: 68.44, returnPercent: 12 }] });
    expect(describeOverviewClosedAnswers(near, CALENDAR)[OVERVIEW_SECTION_IDS.asset]).toBeNull();
  });

  it('is null where the tile has nothing to show', () => {
    const empty = describeOverviewClosedAnswers(
      makeOverview({
        metrics: { ...makeOverview().metrics, totalValue: 0 },
        expenseStats: null,
        charts: { assetClassData: [], assetData: [], liquidityData: [] },
        flags: { assetCount: 0, hasCostBasisTracking: false, hasTERTracking: false, hasStampDuty: false, currentMonthSnapshotExists: false },
        topAssets: [],
        goalProgressList: [],
      }),
      CALENDAR,
    );
    for (const id of ROW_IDS) expect(empty[id]).toBeNull();
    // A calendar not yet started: the tile shows no projection, the row no answer.
    expect(describeOverviewClosedAnswers(makeOverview(), { dayOfMonth: 0, daysInMonth: 30 })[OVERVIEW_SECTION_IDS.cashflow]).toBeNull();
    // A first class at zero, and stats with no rows of one kind.
    const zero = makeOverview({ charts: { assetClassData: [{ name: 'Azioni', value: 0, percentage: 0, color: '#000', assetClass: 'equity' }], assetData: [], liquidityData: [] } });
    expect(describeOverviewClosedAnswers(zero, CALENDAR)[OVERVIEW_SECTION_IDS.composizione]).toBeNull();
    const noIncome = describeOverviewClosedAnswers(makeOverview({ expenseStats: { ...STATS, topIncomeCategories: [] } }), CALENDAR);
    expect(noIncome[OVERVIEW_SECTION_IDS.entrate]).toBeNull();
  });

  it('names the first category with its rounded share, «quasi tutto» when it rounds to 100 beside others', () => {
    const rows = (first: number) => [
      { category: 'Auto', categoryKey: 'auto', expenseType: 'variable' as const, amount: first * 20, percentage: first },
      { category: 'Casa', categoryKey: 'casa', expenseType: 'fixed' as const, amount: 100, percentage: 100 - first },
    ];
    const answer = (first: number) =>
      text(describeOverviewClosedAnswers(makeOverview({ expenseStats: { ...STATS, topExpenseCategories: rows(first) } }), CALENDAR)[OVERVIEW_SECTION_IDS.spese]);
    expect(answer(28.6)).toBe('Auto 29%');
    expect(answer(99.6)).toBe('quasi tutto in Auto');
    const income = (first: number) =>
      text(
        describeOverviewClosedAnswers(
          makeOverview({
            expenseStats: {
              ...STATS,
              topIncomeCategories: [
                { category: 'Stipendio', categoryKey: 'stipendio', expenseType: 'income', amount: first * 40, percentage: first },
                { category: 'Affitto', categoryKey: 'affitto', expenseType: 'income', amount: (100 - first) * 40, percentage: 100 - first },
              ],
            },
          }),
          CALENDAR,
        )[OVERVIEW_SECTION_IDS.entrate],
      );
    expect(income(80)).toBe('Stipendio 80%');
    expect(income(99.6)).toBe('quasi tutto da Stipendio');
  });

  it('prints a negative liquid share with the typographic minus', () => {
    const debts = makeOverview({ metrics: { ...makeOverview().metrics, cashNetWorth: -30000, liquidInvestmentsNetWorth: 10000 } });
    expect(text(describeOverviewClosedAnswers(debts, CALENDAR)[OVERVIEW_SECTION_IDS.sintesi])).toBe('liquidabile −10,5%');
  });

  it('reads the projection and the annual cost from the tiles\' own functions', () => {
    expect(projectCashflowMonthEnd(STATS.currentMonth, 15, 30)).toBe(3650);
    expect(projectCashflowMonthEnd(STATS.currentMonth, 0, 30)).toBeNull();
    expect(annualPortfolioCostTotal({ annualPortfolioCost: 300, annualStampDuty: 380 })).toBe(680);
    expect(liquidityShare(20000, 130000, 0)).toBeNull();
  });
});
