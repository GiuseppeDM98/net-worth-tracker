/**
 * Tests for lib/utils/pdfNarrative.ts — the PDF's cover verdict and its seven section readings.
 *
 * Like `emailNarrative`, this module carries no Firebase chain: no mocks at the top of the file
 * is part of what is being asserted.
 */

import { describe, expect, it } from 'vitest';

import {
  buildReportVerdict,
  describePortfolioSection,
  describeAllocationSection,
  describeHistorySection,
  describeCashflowSection,
  describePerformanceSection,
  describeFireSection,
  describeSummarySection,
  reportScopeLabel,
  cashflowScopeLine,
  pdfSafeText,
  PDF_SECTION_TITLES,
} from '@/lib/utils/pdfNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import type { AllocationData, CashflowData, FireData, HistoryData, PerformanceData, PortfolioData, SummaryData } from '@/types/pdf';

const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');

describe('reportScopeLabel', () => {
  const now = new Date(2026, 8, 1);

  it('names the window in sentence case', () => {
    expect(reportScopeLabel('total', undefined, undefined, now)).toBe('Report totale');
    expect(reportScopeLabel('yearly', 2025, undefined, now)).toBe('Report annuale · 2025');
    expect(reportScopeLabel('monthly', 2026, 3, now)).toBe('Report mensile · Marzo 2026');
  });

  it('falls back to today when no period was picked', () => {
    expect(reportScopeLabel('monthly', undefined, undefined, now)).toBe('Report mensile · Settembre 2026');
  });
});

describe('PDF_SECTION_TITLES', () => {
  it('names every section in Italian, as the app’s navigation does', () => {
    // The report used to mix "Portfolio Assets" and "FIRE Calculator" with "Entrate e Uscite".
    expect(Object.values(PDF_SECTION_TITLES)).toEqual([
      'Patrimonio', 'Allocazione', 'Storico', 'Cashflow', 'Rendimenti', 'FIRE', 'Riepilogo',
    ]);
  });
});

describe('buildReportVerdict', () => {
  const portfolio = { totalValue: 312480, assets: new Array(24).fill(null) } as unknown as PortfolioData;

  it('opens on the growth when the Storico section supplies one', () => {
    const verdict = buildReportVerdict({
      portfolio,
      history: { totalGrowth: 12.44, totalGrowthAbsolute: 34580 },
      timeFilter: 'total',
    });
    expect(verdict.headline).toBe('Il patrimonio è cresciuto del 12,4% da quando lo registri.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Oggi vale 312.480 € su 24 strumenti. La variazione del periodo vale +34.580 €.',
    );
  });

  it('names the window the export actually covers', () => {
    expect(
      buildReportVerdict({ portfolio, history: { totalGrowth: 3, totalGrowthAbsolute: 900 }, timeFilter: 'monthly' })
        .headline,
    ).toContain('nel mese');
    expect(
      buildReportVerdict({ portfolio, history: { totalGrowth: 3, totalGrowthAbsolute: 900 }, timeFilter: 'yearly' })
        .headline,
    ).toContain('nell’anno');
  });

  it('states a fall as a fall', () => {
    const verdict = buildReportVerdict({
      portfolio,
      history: { totalGrowth: -4.2, totalGrowthAbsolute: -13700 },
      timeFilter: 'total',
    });
    expect(verdict.headline).toBe('Il patrimonio è sceso del 4,2% da quando lo registri.');
    expect(verdict.tone).toBe('negative');
  });

  it('claims no growth when the Storico section was not selected', () => {
    // Narrative Honesty: the growth figure has exactly one source, and without it the cover
    // states the position instead of inventing a trend.
    const verdict = buildReportVerdict({ portfolio, timeFilter: 'total' });
    expect(verdict.headline).toBe('Il patrimonio, come si presenta oggi.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Oggi vale 312.480 € su 24 strumenti.');
  });

  it('falls back to the summary when the Patrimonio section is absent too', () => {
    const verdict = buildReportVerdict({
      summary: { totalNetWorth: 90000, assetCount: 1 } as SummaryData,
    });
    expect(plain(verdict.sentence)).toBe('Oggi vale 90.000 € su 1 strumento.');
  });

  it('still says something when no section can supply a figure', () => {
    expect(plain(buildReportVerdict({}).sentence)).toBe(
      'Le sezioni che seguono riportano i dati alla data di generazione.',
    );
  });
});

describe('describePortfolioSection', () => {
  const base: PortfolioData = {
    assets: [],
    totalValue: 312480,
    liquidValue: 250480,
    illiquidValue: 62000,
    weightedTER: 0.19,
    totalUnrealizedGains: 38940,
    totalUnrealizedGainsPercent: 14.24,
    annualCost: 476,
  };

  it('states the value, the liquid share and the unrealised gain', () => {
    expect(plain(describePortfolioSection(base))).toBe(
      'Il patrimonio vale 312.480 €. L’80,2% è liquidabile entro pochi giorni; ' +
        'il guadagno non realizzato è +38.940 €, il +14,24% su quanto hai versato.',
    );
  });

  it('drops the gain clause when there is nothing unrealised', () => {
    const reading = plain(describePortfolioSection({ ...base, totalUnrealizedGains: 0 }));
    expect(reading).not.toContain('non realizzato');
  });

  it('divides by nothing when the portfolio is empty', () => {
    const reading = plain(describePortfolioSection({ ...base, totalValue: 0, liquidValue: 0, totalUnrealizedGains: 0 }));
    expect(reading).toBe('Il patrimonio vale 0 €.');
    expect(reading).not.toContain('NaN');
  });
});

describe('describeAllocationSection', () => {
  const drifted: AllocationData = {
    hasTargets: true,
    rebalancingNeeded: true,
    rebalancingActions: [
      { assetClass: 'equity', action: 'sell', amount: 4000 },
      { assetClass: 'bonds', action: 'buy', amount: 4000 },
    ],
    byAssetClass: [
      { assetClass: 'equity', displayName: 'Azioni', currentValue: 168400, currentPercent: 53.9, targetPercent: 50, differencePercent: 3.9 },
      { assetClass: 'bonds', displayName: 'Obbligazioni', currentValue: 54900, currentPercent: 17.6, targetPercent: 20, differencePercent: -2.4 },
    ],
  };

  it('names the widest gap and what it would take to close it', () => {
    expect(plain(describeAllocationSection(drifted))).toBe(
      'Lo scarto più grande è su azioni, +3,9% rispetto al bersaglio; 2 operazioni riporterebbero il portafoglio in banda.',
    );
  });

  it('says so plainly when the plan is met', () => {
    expect(plain(describeAllocationSection({ ...drifted, rebalancingNeeded: false }))).toBe(
      'Il portafoglio è allineato al piano: nessuna classe richiede un intervento.',
    );
  });

  it('refuses to judge a drift when there is no plan to drift from', () => {
    const reading = plain(describeAllocationSection({ ...drifted, hasTargets: false }));
    expect(reading).toContain('Nessun obiettivo di allocazione è impostato');
    expect(reading).not.toContain('bersaglio;');
  });
});

describe('pdfSafeText', () => {
  it('converts the typographic minus, which a standard PDF font cannot encode', () => {
    // react-pdf drops it silently: «−620 €» printed as «620 €», the same figure with the
    // opposite meaning. Caught only by reading a rendered PDF.
    expect(pdfSafeText('−620 €')).toBe('-620 €');
    expect(pdfSafeText('«+» troppo, «−» manca')).toBe('«+» troppo, «-» manca');
  });

  it('leaves alone everything WinAnsi can encode', () => {
    const encodable = 'L’allocazione · 25,0× — gen–ago «così» è 312.480 €';
    expect(pdfSafeText(encodable)).toBe(encodable);
  });
});

describe('describeHistorySection', () => {
  const evolution = [
    { date: '2023-01', totalNetWorth: 90000, liquidNetWorth: 60000, illiquidNetWorth: 30000 },
    { date: '2026-08', totalNetWorth: 312480, liquidNetWorth: 250480, illiquidNetWorth: 62000 },
  ];

  it('measures ONE window: the endpoints of the series it is describing', () => {
    // `totalGrowth` here is the whole-history figure (90.000 → 312.480), a DIFFERENT window
    // from the one tabulated. The reading must ignore it rather than mix the two.
    expect(
      plain(
        describeHistorySection({
          netWorthEvolution: [
            { date: '2026-03', totalNetWorth: 289400, liquidNetWorth: 227400, illiquidNetWorth: 62000 },
            { date: '2026-08', totalNetWorth: 312480, liquidNetWorth: 250480, illiquidNetWorth: 62000 },
          ],
          assetClassEvolution: [],
          yoyComparison: [],
          totalGrowth: 247.2,
          totalGrowthAbsolute: 222480,
        } as unknown as HistoryData),
      ),
    ).toBe('Su 2 snapshot il patrimonio è passato da 289.400 € a 312.480 €: +23.080 €, il +8,0%.');
  });

  it('measures the full window when that is what the series covers', () => {
    expect(
      plain(
        describeHistorySection({
          netWorthEvolution: evolution,
          assetClassEvolution: [],
          yoyComparison: [],
        } as unknown as HistoryData),
      ),
    ).toBe('Su 2 snapshot il patrimonio è passato da 90.000 € a 312.480 €: +222.480 €, il +247,2%.');
  });

  it('drops the percentage when there is no base to compute it on', () => {
    const reading = plain(
      describeHistorySection({
        netWorthEvolution: [
          { date: '2026-01', totalNetWorth: 0, liquidNetWorth: 0, illiquidNetWorth: 0 },
          { date: '2026-08', totalNetWorth: 4000, liquidNetWorth: 4000, illiquidNetWorth: 0 },
        ],
        assetClassEvolution: [],
        yoyComparison: [],
      } as unknown as HistoryData),
    );
    expect(reading).toBe('Su 2 snapshot il patrimonio è passato da 0 € a 4000 €: +4000 €.');
    expect(reading).not.toContain('Infinity');
  });

  it('names the absence when there is no history at all', () => {
    expect(
      plain(describeHistorySection({ netWorthEvolution: [], assetClassEvolution: [], yoyComparison: [] } as unknown as HistoryData)),
    ).toBe('Non ci sono ancora snapshot da cui ricostruire uno storico.');
  });

  it('refuses to call one snapshot a trend', () => {
    expect(
      plain(
        describeHistorySection({
          netWorthEvolution: [evolution[0]],
          assetClassEvolution: [],
          yoyComparison: [],
        } as unknown as HistoryData),
      ),
    ).toBe('È registrato un solo snapshot, 90.000 €: uno solo non basta per misurare una crescita.');
  });
});

describe('describeCashflowSection', () => {
  const base: CashflowData = {
    totalIncome: 84620,
    totalExpenses: 63140,
    netCashflow: 21480,
    incomeToExpenseRatio: 1.34,
    byCategory: [],
    monthlyTrend: [],
    numberOfMonthsTracked: 20,
    averageMonthlySavings: 1074,
    windowMonths: ['2025-01', '2026-08'],
    historyFloorYear: 2025,
  };

  it('reads the saving, the pace and the ratio', () => {
    expect(plain(describeCashflowSection(base))).toBe(
      'Hai messo da parte 21.480 € su 20 mesi, in media 1074 € al mese: per ogni euro speso ne sono entrati 1,34.',
    );
  });

  it('never prints a negative "messo da parte"', () => {
    const reading = plain(describeCashflowSection({ ...base, netCashflow: -2000, incomeToExpenseRatio: 0.9 }));
    expect(reading).toContain('Sono usciti 2000 € più di quanto è entrato');
    expect(reading).not.toContain('messo da parte');
  });

  it('names an empty window', () => {
    expect(plain(describeCashflowSection({ ...base, totalIncome: 0, totalExpenses: 0 }))).toBe(
      'Nessun movimento di cassa è registrato in questa finestra.',
    );
  });
});

describe('describePerformanceSection', () => {
  it('leads on the metric the app itself calls recommended', () => {
    expect(
      plain(
        describePerformanceSection({
          periodLabel: 'Storico Totale',
          metrics: { timeWeightedReturn: 8.41, cagr: 7.9 },
        } as PerformanceData),
      ),
    ).toBe('Il rendimento time-weighted del periodo è +8,41% su Storico Totale, pari al +7,90% annualizzato.');
  });

  it('says it is not calculable rather than printing a zero', () => {
    expect(
      plain(describePerformanceSection({ periodLabel: 'YTD 2026', metrics: { timeWeightedReturn: null } } as PerformanceData)),
    ).toBe('Il rendimento non è calcolabile su questa finestra.');
  });
});

describe('describeFireSection', () => {
  const base: FireData = {
    fireNumber: 789000,
    currentNetWorth: 312480,
    progressToFI: 39.6,
    annualExpenses: 31560,
    annualIncome: 50000,
    monthlyAllowance: 2630,
    dailyAllowance: 86,
    safeWithdrawalRate: 4,
    yearsOfExpensesCovered: 9.9,
  };

  it('states the target, the rate and what is left', () => {
    expect(plain(describeFireSection(base))).toBe(
      'Il numero FIRE è 789.000 € al 4,0% di prelievo: sei al 39,6%. Mancano 476.520 €.',
    );
  });

  it('says the goal is reached instead of printing a negative remainder', () => {
    expect(plain(describeFireSection({ ...base, currentNetWorth: 800000, progressToFI: 101.4 }))).toContain(
      'Il traguardo è raggiunto.',
    );
  });

  it('refuses the figure when there is no expense estimate behind it', () => {
    expect(plain(describeFireSection({ ...base, fireNumber: 0 }))).toContain('non è calcolabile');
  });
});

describe('describeSummarySection', () => {
  it('closes the report on the two figures that judge it', () => {
    expect(
      plain(
        describeSummarySection({
          allocationScore: 92,
          incomeToExpenseRatio: 1.34,
          fireProgress: 39.6,
        } as SummaryData),
      ),
    ).toBe('L’allocazione è a 92 su 100 dal bersaglio e per ogni euro speso ne entrano 1,34. Alla FIRE manca il 60,4% del percorso.');
  });
});

describe('cashflowScopeLine', () => {
  it('declares the floor a Totale export applies, because "Totale" is not "everything"', () => {
    expect(cashflowScopeLine(['gen 2025', 'ago 2026'], 2025)).toBe(
      'gen 2025 – ago 2026 · 2 mesi · da 2025, l’anno da cui lo storico è attendibile',
    );
  });

  it('omits the floor clause on a window that has none', () => {
    expect(cashflowScopeLine(['gen 2026', 'ago 2026'], null)).toBe('gen 2026 – ago 2026 · 2 mesi');
  });

  it('names an empty window instead of printing a dash range', () => {
    expect(cashflowScopeLine([], null)).toBe('nessun mese registrato · 0 mesi');
  });

  it('takes the count from the tracked months, not from the labels it was handed', () => {
    expect(cashflowScopeLine(['gen 2025', 'ago 2026'], null, 20)).toBe('gen 2025 – ago 2026 · 20 mesi');
  });
});
