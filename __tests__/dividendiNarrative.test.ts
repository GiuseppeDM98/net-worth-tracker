/**
 * Tests for lib/utils/dividendiNarrative.ts — the words of Cashflow › Dividendi: the verdict
 * that answers «quanto rendono i miei flussi?» and the reading line of every tile.
 *
 * Pure; chartService's Firebase chain is mocked exactly like __tests__/cashflowNarrative.test.ts.
 * Expectations are written the way the screen prints them (it-IT), with the no-break space
 * before "€" flattened to a plain space for readability.
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

import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import type {
  CoverageMonth,
  DividendNetComparison,
  DpsGrowthSummary,
  TotalReturnSummary,
  DividendPeriodSummary,
  DividendReliability,
  PayerRanking,
  PaymentsInventory,
  UpcomingPayment,
  YearlyIncomeSummary,
  YieldSummary,
} from '@/lib/utils/dividendAnalytics';
import {
  buildDividendiVerdict,
  describeDividendPeriod,
  describeComparisonLabel,
  describeConcentration,
  describeDpsGrowth,
  describeTotalReturn,
  describeMonthlyWindow,
  describeNetIncome,
  describePayerRanking,
  describePaymentsCount,
  describePaymentsInventory,
  describePeriodEyebrow,
  describeReliability,
  describeReliabilityWindow,
  describeYearlyFooter,
  describeYearlyIncome,
  describeYield,
  describeYieldFooter,
  type DividendiVerdictInput,
} from '@/lib/utils/dividendiNarrative';

const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(/ /g, ' ') : null);

const NOW = new Date(2026, 7, 23, 12); // 23 agosto 2026

const SUMMARY: DividendPeriodSummary = {
  net: 3116,
  gross: 3998,
  tax: 882,
  count: 12,
  averageMonthlyNet: 389.5,
};

const COMPARISON: DividendNetComparison = { current: 3116, previous: 2640, deltaPct: 0.1803 };

const YIELD: YieldSummary = {
  yocGross: 4.61,
  yocNet: 3.59,
  currentYieldGross: 3.42,
  spread: 1.19,
  dpsMedianGrowth: 5.4,
  ttmGross: 5720,
  costBasis: 124000,
  coverage: 7,
};

const NEXT: UpcomingPayment = {
  id: 'd1',
  assetId: 'a-eni',
  assetTicker: 'ENI',
  assetName: 'Eni SpA',
  paymentDate: new Date(2026, 8, 15, 12),
  net: 268,
  isProvisional: false,
};

const VERDICT_INPUT: DividendiVerdictInput = {
  period: 'year',
  now: NOW,
  summary: SUMMARY,
  comparison: COMPARISON,
  payerCount: 7,
  yieldSummary: YIELD,
  next: NEXT,
  upcomingNet: 712,
};

// ─── The period as a grammatical subject ──────────────────────────────────────

describe('describeDividendPeriod', () => {
  it('names the current month with the euphonic d before a vowel', () => {
    expect(describeDividendPeriod('month', NOW)).toEqual({ subject: 'Agosto', inPeriod: 'ad agosto' });
  });

  it('names a consonant month without it', () => {
    expect(describeDividendPeriod('month', new Date(2026, 4, 3, 12))).toEqual({
      subject: 'Maggio',
      inPeriod: 'a maggio',
    });
  });

  it('names the current year', () => {
    expect(describeDividendPeriod('year', NOW)).toEqual({ subject: 'Il 2026', inPeriod: 'nel 2026' });
  });

  it('names the trailing window and the whole history', () => {
    expect(describeDividendPeriod('rolling12', NOW).inPeriod).toBe('negli ultimi 12 mesi');
    expect(describeDividendPeriod('all', NOW).inPeriod).toBe('da sempre');
  });
});

describe('describeComparisonLabel', () => {
  it('names the previous month by name', () => {
    expect(describeComparisonLabel('month', NOW)).toBe('luglio');
  });

  it('compares a running year with the SAME months of the previous year', () => {
    expect(describeComparisonLabel('year', NOW)).toBe('gen–ago 2025');
  });

  it('names the twelve months before a trailing window', () => {
    expect(describeComparisonLabel('rolling12', NOW)).toBe('i 12 mesi prima');
  });

  it('has no predecessor for the whole history', () => {
    expect(describeComparisonLabel('all', NOW)).toBeNull();
  });
});

describe('describePeriodEyebrow', () => {
  it('names the period after the tile question', () => {
    expect(describePeriodEyebrow('year', NOW)).toBe('Incasso netto · 2026');
    expect(describePeriodEyebrow('month', NOW)).toBe('Incasso netto · agosto');
    expect(describePeriodEyebrow('rolling12', NOW)).toBe('Incasso netto · ultimi 12 mesi');
    expect(describePeriodEyebrow('all', NOW)).toBe('Incasso netto · storico');
  });
});

// ─── Verdict ──────────────────────────────────────────────────────────────────

describe('buildDividendiVerdict', () => {
  it('calls a growing flow growing, and states every clause it has', () => {
    const verdict = buildDividendiVerdict(VERDICT_INPUT);
    expect(verdict.headline).toBe('Il flusso di dividendi cresce.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      'Nel 2026 hai incassato 3116 € netti, +18,0% su gen–ago 2025, da 7 strumenti; rendono il 4,6% lordo sul costo. Il prossimo stacco è ENI il 15 settembre.'
    );
  });

  it('calls a falling flow a fall, and warns without alarming', () => {
    const verdict = buildDividendiVerdict({
      ...VERDICT_INPUT,
      comparison: { current: 2100, previous: 2640, deltaPct: -0.2045 },
      summary: { ...SUMMARY, net: 2100 },
    });
    expect(verdict.headline).toBe('Il flusso di dividendi è in calo.');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toContain('−20,5% su gen–ago 2025');
  });

  it('narrates a delta that PRINTS as zero as no change', () => {
    const verdict = buildDividendiVerdict({
      ...VERDICT_INPUT,
      comparison: { current: 3116, previous: 3115, deltaPct: 0.000321 },
    });
    expect(verdict.headline).toBe('Il flusso di dividendi tiene.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toContain('invariato su gen–ago 2025');
  });

  it('drops the comparison entirely when there is no comparable predecessor', () => {
    const verdict = buildDividendiVerdict({
      ...VERDICT_INPUT,
      period: 'all',
      comparison: { current: 3116, previous: 0, deltaPct: null },
    });
    expect(verdict.headline).toBe('Il portafoglio produce reddito.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).not.toContain('su gen');
    expect(plain(verdict.sentence)).not.toContain('invariato');
    expect(plain(verdict.sentence)).toContain('Da sempre hai incassato 3116 € netti da 7 strumenti');
  });

  it('drops the yield clause rather than printing a placeholder', () => {
    const verdict = buildDividendiVerdict({ ...VERDICT_INPUT, yieldSummary: null });
    expect(plain(verdict.sentence)).not.toContain('sul costo');
    expect(plain(verdict.sentence)).not.toContain('N/D');
  });

  it('drops the next-payment clause when nothing is announced', () => {
    const verdict = buildDividendiVerdict({ ...VERDICT_INPUT, next: null, upcomingNet: 0 });
    expect(plain(verdict.sentence)).not.toContain('prossimo stacco');
  });

  it('says nothing came in, and names what is coming', () => {
    const verdict = buildDividendiVerdict({
      ...VERDICT_INPUT,
      summary: { net: 0, gross: 0, tax: 0, count: 0, averageMonthlyNet: 0 },
      comparison: { current: 0, previous: 2640, deltaPct: null },
      payerCount: 0,
      yieldSummary: null,
    });
    expect(verdict.headline).toBe('Nessun dividendo nel 2026, ma qualcosa è in arrivo.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe('Nessun pagamento incassato: 712 € sono annunciati, il prossimo è ENI il 15 settembre.');
  });

  it('drops the announced total when the period holds none, and still names what comes next', () => {
    // The figure beside the hero is the PERIOD's announced money; the "next payment" clause is
    // the portfolio's, and it carries its own date, so the two can differ without contradicting.
    const verdict = buildDividendiVerdict({
      ...VERDICT_INPUT,
      summary: { net: 0, gross: 0, tax: 0, count: 0, averageMonthlyNet: 0 },
      comparison: { current: 0, previous: 2640, deltaPct: null },
      payerCount: 0,
      yieldSummary: null,
      upcomingNet: 0,
    });
    expect(verdict.headline).toBe('Nessun dividendo nel 2026, ma qualcosa è in arrivo.');
    expect(plain(verdict.sentence)).toBe('Nessun pagamento incassato nel 2026; il prossimo stacco è ENI il 15 settembre.');
  });

  it('says nothing came in and nothing is announced', () => {
    const verdict = buildDividendiVerdict({
      ...VERDICT_INPUT,
      summary: { net: 0, gross: 0, tax: 0, count: 0, averageMonthlyNet: 0 },
      comparison: { current: 0, previous: 0, deltaPct: null },
      payerCount: 0,
      yieldSummary: null,
      next: null,
      upcomingNet: 0,
    });
    expect(verdict.headline).toBe('Nessun dividendo nel 2026.');
    expect(plain(verdict.sentence)).toBe('Nessun pagamento incassato e nessuno annunciato.');
  });

  it('names a payment landing next year with its year', () => {
    const verdict = buildDividendiVerdict({
      ...VERDICT_INPUT,
      next: { ...NEXT, paymentDate: new Date(2027, 0, 12, 12) },
    });
    expect(plain(verdict.sentence)).toContain('Il prossimo stacco è ENI il 12 gennaio 2027.');
  });
});

// ─── Tile readings ────────────────────────────────────────────────────────────

describe('describeNetIncome', () => {
  it('states gross, withholding and the monthly average', () => {
    expect(plain(describeNetIncome(SUMMARY, 8))).toBe('Lordo 3998 €, ritenute 882 €: in media 390 € al mese.');
  });

  it('drops the average over a single month — it would repeat the hero', () => {
    expect(plain(describeNetIncome(SUMMARY, 1))).toBe('Lordo 3998 €, ritenute 882 €.');
  });

  it('says nothing when nothing came in', () => {
    expect(describeNetIncome({ net: 0, gross: 0, tax: 0, count: 0, averageMonthlyNet: 0 }, 8)).toBeNull();
  });
});

describe('describeReliability', () => {
  const RELIABILITY: DividendReliability = {
    monthsWithIncome: 7,
    monthsInWindow: 8,
    coveragePct: 0.875,
    topPayerSharePct: 0.341,
    topPayerTicker: 'ENI',
    concentrationHhi: 0.208,
    payerCount: 7,
  };

  it('names the single dry month', () => {
    expect(plain(describeReliability(RELIABILITY, ['febbraio']))).toBe(
      'Hai incassato in 7 mesi su 8: solo a febbraio non è arrivato niente.'
    );
  });

  it('lists two or three dry months', () => {
    const r = { ...RELIABILITY, monthsWithIncome: 5 };
    expect(plain(describeReliability(r, ['febbraio', 'aprile', 'agosto']))).toBe(
      'Hai incassato in 5 mesi su 8: a febbraio, ad aprile e ad agosto non è arrivato niente.'
    );
  });

  it('counts them instead of listing them when the names are unavailable', () => {
    expect(plain(describeReliability({ ...RELIABILITY, monthsWithIncome: 5 }, []))).toBe(
      'Hai incassato in 5 mesi su 8.'
    );
  });

  it('says every month paid', () => {
    expect(plain(describeReliability({ ...RELIABILITY, monthsWithIncome: 8, coveragePct: 1 }, []))).toBe(
      'Hai incassato in tutti gli 8 mesi del periodo.'
    );
  });

  it('says nothing when nothing was measured', () => {
    expect(describeReliability({ ...RELIABILITY, payerCount: 0, monthsWithIncome: 0 }, [])).toBeNull();
  });
});

describe('describeConcentration', () => {
  const RELIABILITY: DividendReliability = {
    monthsWithIncome: 7,
    monthsInWindow: 8,
    coveragePct: 0.875,
    topPayerSharePct: 0.341,
    topPayerTicker: 'ENI',
    concentrationHhi: 0.208,
    payerCount: 7,
  };

  it('bands the HHI and names the top payer plus the top three', () => {
    expect(plain(describeConcentration(RELIABILITY, 70.4))).toBe(
      'Concentrazione moderata: ENI vale il 34% del netto, i primi tre il 70%.'
    );
  });

  it('does not claim a top three that does not exist', () => {
    expect(plain(describeConcentration({ ...RELIABILITY, payerCount: 2, concentrationHhi: 0.52 }, null))).toBe(
      'Concentrazione alta: ENI vale il 34% del netto.'
    );
  });

  it('calls a single payer what it is', () => {
    expect(
      plain(describeConcentration({ ...RELIABILITY, payerCount: 1, topPayerSharePct: 1, concentrationHhi: 1 }, null))
    ).toBe('Tutto il flusso arriva da ENI.');
  });
});

describe('describeYield', () => {
  it('states the base and reads the spread as the entry price being worth something', () => {
    expect(plain(describeYield(YIELD))).toBe(
      'Sul costo di quanto detieni oggi rendi il 4,6% lordo, contro il 3,4% sul valore di mercato: il prezzo d’ingresso vale 1,2 punti.'
    );
  });

  it('reads a negative spread honestly', () => {
    expect(plain(describeYield({ ...YIELD, currentYieldGross: 5.01, spread: -0.4 }))).toContain(
      'oggi comprare renderebbe 0,4 punti in più'
    );
  });

  it('drops the market-yield clause when it cannot be measured', () => {
    expect(plain(describeYield({ ...YIELD, currentYieldGross: null, spread: null }))).toBe(
      'Sul costo di quanto detieni oggi rendi il 4,6% lordo.'
    );
  });

  it('says nothing without a yield on cost', () => {
    expect(describeYield({ ...YIELD, yocGross: null })).toBeNull();
  });
});

describe('describeYieldFooter', () => {
  it('states the coverage and that the window never follows the period', () => {
    expect(plain(describeYieldFooter(YIELD))).toBe(
      'Su 7 strumenti con costo medio, ancora in portafoglio. La finestra è sempre gli ultimi 12 mesi: non segue il periodo scelto.'
    );
  });
});

describe('describePayerRanking', () => {
  const RANKING: PayerRanking = {
    rows: [
      { key: 'a-eni', label: 'ENI', amount: 1062, percentage: 34.1 },
      { key: 'a-btp', label: 'BTP Italia Nv30', amount: 618, percentage: 19.8 },
    ],
    remainder: { label: 'Altri 5 strumenti', amount: 1436, percentage: 46.1 },
    total: 3116,
    payerCount: 7,
    top: { assetId: 'a-eni', assetTicker: 'ENI', assetName: 'Eni SpA', net: 1062, count: 4 },
  };

  it('counts the payers and names the biggest with its payment count', () => {
    expect(plain(describePayerRanking(RANKING, 'nel 2026'))).toBe(
      '7 strumenti hanno pagato nel 2026; ENI ha pagato di più, 1062 € in 4 stacchi.'
    );
  });

  it('uses the singular for one payment', () => {
    expect(
      plain(describePayerRanking({ ...RANKING, top: { ...RANKING.top!, count: 1 } }, 'nel 2026'))
    ).toContain('1062 € in 1 stacco.');
  });

  it('does not rank a single payer against itself', () => {
    expect(
      plain(
        describePayerRanking(
          { ...RANKING, rows: [RANKING.rows[0]], remainder: null, payerCount: 1, total: 1062 },
          'nel 2026'
        )
      )
    ).toBe('Ha pagato un solo strumento nel 2026: ENI, 1062 € in 4 stacchi.');
  });

  it('says nothing when nobody paid', () => {
    expect(describePayerRanking({ rows: [], remainder: null, total: 0, payerCount: 0, top: null }, 'nel 2026')).toBeNull();
  });
});

describe('describeYearlyIncome', () => {
  const SUMMARY_YEARS: YearlyIncomeSummary = {
    years: [
      { year: 2022, gross: 880, net: 690, ongoing: false },
      { year: 2023, gross: 1810, net: 1420, ongoing: false },
      { year: 2024, gross: 3200, net: 2510, ongoing: false },
      { year: 2025, gross: 5070, net: 3980, ongoing: false },
      { year: 2026, gross: 3998, net: 3116, ongoing: true },
    ],
    closedCount: 4,
    average: 2150,
    best: { year: 2025, gross: 5070, net: 3980, ongoing: false },
    worst: { year: 2022, gross: 880, net: 690, ongoing: false },
    ongoing: { year: 2026, gross: 3998, net: 3116, ongoing: true },
  };

  it('averages the CLOSED years only and names the best', () => {
    expect(plain(describeYearlyIncome(SUMMARY_YEARS))).toBe(
      'In media 2150 € netti l’anno sui 4 anni chiusi; il migliore è stato il 2025 (3980 €).'
    );
  });

  it('says when the running year has already passed the best closed one', () => {
    const passed = { ...SUMMARY_YEARS, ongoing: { year: 2026, gross: 5400, net: 4200, ongoing: true } };
    expect(plain(describeYearlyIncome(passed))).toBe(
      'In media 2150 € netti l’anno sui 4 anni chiusi; il 2026 ha già superato il 2025 (3980 €).'
    );
  });

  it('does not average a single closed year', () => {
    expect(
      plain(
        describeYearlyIncome({
          ...SUMMARY_YEARS,
          years: SUMMARY_YEARS.years.slice(3),
          closedCount: 1,
          average: 3980,
          worst: SUMMARY_YEARS.best,
        })
      )
    ).toBe('Un solo anno chiuso, il 2025: 3980 € netti.');
  });

  it('does not rank a year against nothing — it says why there is no comparison', () => {
    expect(
      plain(
        describeYearlyIncome({
          years: [SUMMARY_YEARS.years[4]],
          closedCount: 0,
          average: null,
          best: null,
          worst: null,
          ongoing: SUMMARY_YEARS.ongoing,
        })
      )
    ).toBe('Il 2026 è il primo anno con dividendi: non c’è ancora un anno chiuso da confrontare.');
  });
});

describe('describeYearlyFooter', () => {
  it('says the running year is drawn but not ranked', () => {
    expect(
      plain(
        describeYearlyFooter({
          years: [],
          closedCount: 4,
          average: 2150,
          best: null,
          worst: null,
          ongoing: { year: 2026, gross: 3998, net: 3116, ongoing: true },
        })
      )
    ).toBe('La tratteggiata è la media dei 4 anni chiusi. Il 2026 è ancora in corso: non entra nel confronto.');
  });

  it('drops the running-year clause once every year on the chart has closed', () => {
    expect(
      plain(
        describeYearlyFooter({ years: [], closedCount: 4, average: 2150, best: null, worst: null, ongoing: null })
      )
    ).toBe('La tratteggiata è la media dei 4 anni chiusi.');
  });
});

describe('describePaymentsInventory', () => {
  const INVENTORY: PaymentsInventory = {
    total: 15,
    receivedCount: 12,
    receivedNet: 3116,
    announcedCount: 3,
    announcedNet: 712,
    largest: { label: 'BTP Italia Nv30', net: 618, dividendType: 'coupon' },
  };

  it('keeps received and announced apart, and names the largest row', () => {
    expect(plain(describePaymentsInventory(INVENTORY))).toBe(
      '15 voci: 12 incassate (3116 €) e 3 annunciate (712 €); la più grande è la cedola BTP Italia Nv30 (618 €).'
    );
  });

  it('does not introduce an ordinary dividend as a type — the list is already dividends', () => {
    expect(
      plain(describePaymentsInventory({ ...INVENTORY, largest: { label: 'ORNI', net: 888, dividendType: 'ordinary' } }))
    ).toContain('la più grande è ORNI (888 €)');
  });

  it('gives every other type its own article, elision included', () => {
    const largest = (dividendType: PaymentsInventory['largest']) =>
      plain(describePaymentsInventory({ ...INVENTORY, largest: dividendType }));
    expect(largest({ label: 'X', net: 10, dividendType: 'interim' })).toContain("è l'acconto X");
    expect(largest({ label: 'X', net: 10, dividendType: 'finalPremium' })).toContain('è il premio finale X');
    expect(largest({ label: 'X', net: 10, dividendType: 'extraordinary' })).toContain('è il dividendo straordinario X');
  });

  it('drops the announced clause when nothing is announced', () => {
    expect(plain(describePaymentsInventory({ ...INVENTORY, total: 12, announcedCount: 0, announcedNet: 0 }))).toBe(
      '12 voci incassate (3116 €); la più grande è la cedola BTP Italia Nv30 (618 €).'
    );
  });

  it('says nothing for an empty list', () => {
    expect(
      describePaymentsInventory({
        total: 0,
        receivedCount: 0,
        receivedNet: 0,
        announcedCount: 0,
        announcedNet: 0,
        largest: null,
      })
    ).toBeNull();
  });
});

describe('describePaymentsCount', () => {
  it('counts the rows, and says how many of how many while narrowed', () => {
    expect(plain(describePaymentsCount(15, 15))).toBe('15 voci');
    expect(plain(describePaymentsCount(4, 15))).toBe('4 di 15 voci');
    expect(plain(describePaymentsCount(0, 0))).toBe('nessuna voce');
  });
});

describe('describeMonthlyWindow', () => {
  it('names the window the bars actually cover', () => {
    expect(plain(describeMonthlyWindow('month', 6))).toBe('Ultimi 6 mesi');
    expect(plain(describeMonthlyWindow('year', 8))).toBe('Mese per mese');
    expect(plain(describeMonthlyWindow('rolling12', 12))).toBe('Ultimi 12 mesi');
    expect(plain(describeMonthlyWindow('all', 12))).toBe('Ultimi 12 mesi');
  });
});

// A coverage strip is a shape, not a sentence: the only thing the narrative owns is the
// names of the dry months it feeds describeReliability.
describe('dry-month names', () => {
  it('are the months the strip marks as unpaid', () => {
    const months: CoverageMonth[] = [
      { key: '2026-1', year: 2026, month: 1, label: 'gen', net: 96, paid: true },
      { key: '2026-2', year: 2026, month: 2, label: 'feb', net: 0, paid: false },
    ];
    expect(months.filter((m) => !m.paid).map((m) => m.month)).toEqual([2]);
  });
});

describe('describeDpsGrowth', () => {
  const GROWTH: DpsGrowthSummary = {
    coverage: 5,
    median: 5.4,
    best: { assetTicker: 'ISP', latestYoyGrowth: 10.3 },
    years: [2022, 2023, 2024, 2025, 2026],
    ongoingYear: 2026,
  };

  it('states the median and names the leader on the last CLOSED year', () => {
    expect(plain(describeDpsGrowth(GROWTH))).toBe(
      'Su 5 strumenti con storico il dividendo per azione cresce del 5,4% l’anno (mediana); ISP è il migliore, +10,3% sull’ultimo anno chiuso.'
    );
  });

  it('says a shrinking dividend is shrinking', () => {
    expect(plain(describeDpsGrowth({ ...GROWTH, median: -3.2, best: null }))).toBe(
      'Su 5 strumenti con storico il dividendo per azione cala del 3,2% l’anno (mediana).'
    );
  });

  it('says nothing when nothing can be compared year over year', () => {
    expect(describeDpsGrowth({ ...GROWTH, median: null })).toBeNull();
  });
});

describe('describeTotalReturn', () => {
  const RETURN: TotalReturnSummary = {
    count: 7,
    average: 25.6,
    best: { assetTicker: 'VWCE', totalReturnPercentage: 62.4 },
    worst: { assetTicker: 'AGGH', totalReturnPercentage: -3.1 },
    negativeCount: 1,
  };

  it('calls the lone loser "il solo sotto zero"', () => {
    expect(plain(describeTotalReturn(RETURN))).toBe(
      'In media +25,6% sul capitale investito; VWCE è il migliore (+62,4%), AGGH il solo sotto zero (−3,1%).'
    );
  });

  it('calls it "il peggiore" when it is not below zero at all', () => {
    expect(
      plain(describeTotalReturn({ ...RETURN, worst: { assetTicker: 'AGGH', totalReturnPercentage: 4.2 }, negativeCount: 0 }))
    ).toContain('AGGH il peggiore (+4,2%)');
  });

  it('does not rank one row against itself', () => {
    expect(plain(describeTotalReturn({ ...RETURN, count: 1 }))).toBe('In media +25,6% sul capitale investito.');
  });

  it('says nothing with no rows', () => {
    expect(describeTotalReturn({ ...RETURN, count: 0 })).toBeNull();
  });
});

describe('describeReliabilityWindow', () => {
  it('agrees with the number in front of it', () => {
    expect(plain(describeReliabilityWindow(1))).toBe('1 mese');
    expect(plain(describeReliabilityWindow(8))).toBe('8 mesi');
  });
});

describe('describeYield — a spread that prints as zero is not a spread', () => {
  it('drops the clause when the two yields round to the same figure', () => {
    const flat = plain(describeYield({ ...YIELD, yocGross: 0.65, currentYieldGross: 0.66, spread: -0.01 }));
    expect(flat).not.toContain('punti');
    expect(flat).toBe('Sul costo di quanto detieni oggi rendi lo 0,7% lordo, contro lo 0,7% sul valore di mercato.');
  });

  it('still states a spread that survives rounding', () => {
    expect(plain(describeYield(YIELD))).toContain('il prezzo d’ingresso vale 1,2 punti');
  });
});

describe('describeYearlyIncome — a first year with nothing to compare it to', () => {
  it('says why there is no comparison instead of leaving a bare bar', () => {
    expect(
      plain(
        describeYearlyIncome({
          years: [{ year: 2026, gross: 100, net: 80, ongoing: true }],
          closedCount: 0,
          average: null,
          best: null,
          worst: null,
          ongoing: { year: 2026, gross: 100, net: 80, ongoing: true },
        })
      )
    ).toBe('Il 2026 è il primo anno con dividendi: non c’è ancora un anno chiuso da confrontare.');
  });

  it('says nothing at all when there is not even a running year', () => {
    expect(
      describeYearlyIncome({ years: [], closedCount: 0, average: null, best: null, worst: null, ongoing: null })
    ).toBeNull();
  });
});
