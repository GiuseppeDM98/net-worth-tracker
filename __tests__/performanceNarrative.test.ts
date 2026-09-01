/**
 * Tests for lib/utils/performanceNarrative.ts — the words of Rendimenti: the verdict that
 * answers «quanto rende il portafoglio, e rispetto a cosa?» and the reading line of every tile.
 *
 * Pure; chartService's Firebase chain is mocked exactly like __tests__/dividendiNarrative.test.ts.
 * Expectations are written the way the screen prints them (it-IT), with the no-break space
 * before "€" (plain in the browser, narrow under Node's ICU) flattened to a plain space.
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
import type { PerformanceBaseOptions } from '@/lib/utils/performanceBase';
import type {
  BenchmarkRanking,
  DrawdownStory,
  RealizedGainsSummary,
  ReturnConsistency,
} from '@/lib/utils/performanceSummary';
import {
  describeAnalysisBase,
  buildPerformanceVerdict,
  describeBenchmarkRanking,
  describeCapitalAndMarket,
  describeConsistency,
  describeContributions,
  describeDrawdownDetail,
  describeGrowthOfHundred,
  describeMeasurementBase,
  describePerformancePeriod,
  describePeriodAside,
  describeRealizedGains,
  describeRisk,
  describeReturnMetrics,
  describeYields,
  resolveBenchmarkGap,
  signedPercent,
  type PerformanceVerdictInput,
} from '@/lib/utils/performanceNarrative';

const flat = (text: string) => text.replace(/[  ]/g, ' ');
const plain = (narrative: Narrative | null) => (narrative ? flat(narrativeToText(narrative)) : null);

const ONE_YEAR = {
  period: '1Y' as const,
  nominalPeriodStart: { year: 2025, month: 8 },
  startDate: new Date(2025, 7, 1, 12),
  endDate: new Date(2026, 6, 31, 12),
  numberOfMonths: 12,
};

const TODAY = { endMonth: { year: 2026, month: 7 }, endsAtLatest: true };

const drawdownRecovered: DrawdownStory = {
  value: -4.1,
  peak: { year: 2026, month: 2 },
  trough: { year: 2026, month: 3 },
  recovery: { year: 2026, month: 5 },
  monthsToRecover: 2,
  durationMonths: 3,
};

const consistency: ReturnConsistency = {
  positiveMonths: 9,
  totalMonths: 12,
  positiveShare: 75,
  best: { label: 'Apr 26', year: 2026, month: 4, return: 3.1 },
  worst: { label: 'Mar 26', year: 2026, month: 3, return: -3.0 },
};

const baseInput: PerformanceVerdictInput = {
  ...ONE_YEAR,
  heroReturn: { value: 7.3, isPeriodReturn: false, label: 'annualizzato' },
  annualizedReturn: 7.3,
  quality: { tone: 'solid', headline: 'Solido', detail: '' },
  sharpeRatio: 1.08,
  benchmark: { name: 'Portafoglio 60/40', annualized: 6.1 },
  drawdown: drawdownRecovered,
  consistency,
};

// ─── The period as a grammatical subject ──────────────────────────────────────

describe('describePerformancePeriod', () => {
  it('names a full window by its nominal length', () => {
    expect(describePerformancePeriod(ONE_YEAR).subject).toBe("Nell'ultimo anno");
    expect(describePerformancePeriod({ ...ONE_YEAR, period: '3Y', numberOfMonths: 36 }).subject).toBe('Negli ultimi 3 anni');
    expect(describePerformancePeriod({ ...ONE_YEAR, period: '5Y', numberOfMonths: 60 }).subject).toBe('Negli ultimi 5 anni');
    expect(describePerformancePeriod({ ...ONE_YEAR, period: 'ALL' }).subject).toBe('Da sempre');
    expect(describePerformancePeriod({ ...ONE_YEAR, period: 'CUSTOM' }).subject).toBe('Nel periodo scelto');
  });

  it('names the months actually measured when the history is shorter than the window', () => {
    expect(describePerformancePeriod({ ...ONE_YEAR, period: '3Y', numberOfMonths: 14 }).subject).toBe('Negli ultimi 14 mesi');
    expect(describePerformancePeriod({ ...ONE_YEAR, period: '3Y', numberOfMonths: 24 }).subject).toBe('Negli ultimi 2 anni');
    expect(describePerformancePeriod({ ...ONE_YEAR, period: '1Y', numberOfMonths: 7 }).subject).toBe('Negli ultimi 7 mesi');
    expect(describePerformancePeriod({ ...ONE_YEAR, period: '1Y', numberOfMonths: 1 }).subject).toBe("Nell'ultimo mese");
  });

  it('says from which month a year-to-date really starts', () => {
    const ytd = { ...ONE_YEAR, period: 'YTD' as const, nominalPeriodStart: { year: 2026, month: 1 }, startDate: new Date(2026, 0, 1, 12), numberOfMonths: 7 };
    expect(describePerformancePeriod(ytd).subject).toBe('Da inizio anno');
    expect(describePerformancePeriod({ ...ytd, startDate: new Date(2026, 3, 1, 12), numberOfMonths: 4 }).subject).toBe('Da aprile');
  });
});

describe('describePeriodAside', () => {
  it('states the window as the tile aside', () => {
    expect(describePeriodAside(ONE_YEAR)).toBe('1 anno · ago 2025 – lug 2026');
    expect(describePeriodAside({ ...ONE_YEAR, period: 'YTD', numberOfMonths: 7, startDate: new Date(2026, 0, 1, 12) })).toBe('YTD · gen – lug 2026');
    expect(describePeriodAside({ ...ONE_YEAR, period: 'CUSTOM' })).toBe('Personalizzato · ago 2025 – lug 2026');
  });
});

describe('signedPercent', () => {
  it('signs on the printed figure: a rounded zero carries no sign', () => {
    expect(signedPercent(7.34)).toBe('+7,3%');
    expect(signedPercent(-4.06)).toBe('−4,1%');
    expect(signedPercent(-0.04)).toBe('0,0%');
    expect(signedPercent(0.04)).toBe('0,0%');
  });
});

// ─── Verdict ──────────────────────────────────────────────────────────────────

describe('buildPerformanceVerdict', () => {
  it('beats the benchmark: positive tone, the full sentence', () => {
    const v = buildPerformanceVerdict(baseInput);
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende più del 60/40.");
    expect(v.tone).toBe('positive');
    expect(plain(v.sentence)).toBe(
      'Rende +7,3% annualizzato (TWR), 1,2 punti sopra il Portafoglio 60/40, con uno Sharpe di 1,08; il drawdown massimo è stato −4,1% a marzo, recuperato in 2 mesi; 9 mesi su 12 positivi.',
    );
  });

  it('trails the benchmark: the headline says so and the dot is neutral', () => {
    const v = buildPerformanceVerdict({ ...baseInput, benchmark: { name: 'Portafoglio 60/40', annualized: 8.1 } });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende, ma meno del 60/40.");
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toContain('0,8 punti sotto il Portafoglio 60/40');
  });

  it('in line with the benchmark when the gap rounds to zero', () => {
    const v = buildPerformanceVerdict({ ...baseInput, benchmark: { name: 'Portafoglio 60/40', annualized: 7.26 } });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende quanto il 60/40.");
    expect(plain(v.sentence)).toContain('in linea con il Portafoglio 60/40');
  });

  it('elides the article before a model whose name starts with a vowel', () => {
    const v = buildPerformanceVerdict({ ...baseInput, benchmark: { name: 'All Weather', annualized: 6.1 } });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende più dell'All Weather.");
  });

  it('drops the benchmark clause when the benchmark is not available yet', () => {
    const v = buildPerformanceVerdict({ ...baseInput, benchmark: null });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende bene.");
    expect(plain(v.sentence)).toBe(
      'Rende +7,3% annualizzato (TWR), con uno Sharpe di 1,08; il drawdown massimo è stato −4,1% a marzo, recuperato in 2 mesi; 9 mesi su 12 positivi.',
    );
  });

  it('a fragile quality warns that the risk weighs', () => {
    const v = buildPerformanceVerdict({ ...baseInput, quality: { tone: 'fragile', headline: 'Fragile', detail: '' }, sharpeRatio: 0.4 });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende, ma il rischio pesa.");
    expect(v.tone).toBe('warning');
  });

  it('a fragile quality without a Sharpe is below the risk-free rate', () => {
    const v = buildPerformanceVerdict({ ...baseInput, quality: { tone: 'fragile', headline: 'Modesto', detail: '' }, sharpeRatio: null });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende, ma meno del tasso privo di rischio.");
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).not.toContain('Sharpe');
  });

  it('a weak quality with a loss says the portfolio loses', () => {
    const v = buildPerformanceVerdict({
      ...baseInput,
      heroReturn: { value: -3.2, isPeriodReturn: false, label: 'annualizzato' },
      annualizedReturn: -3.2,
      quality: { tone: 'weak', headline: 'Negativo', detail: '' },
      sharpeRatio: -0.6,
    });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio perde.");
    expect(v.tone).toBe('negative');
    expect(plain(v.sentence)).toContain('Perde −3,2% annualizzato (TWR), 9,3 punti sotto il Portafoglio 60/40');
  });

  it('a weak quality with a gain does not pay for the risk', () => {
    const v = buildPerformanceVerdict({ ...baseInput, heroReturn: { value: 1.1, isPeriodReturn: false, label: 'annualizzato' }, annualizedReturn: 1.1, quality: { tone: 'weak', headline: 'Debole', detail: '' }, sharpeRatio: -0.2 });
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio rende, ma non compensa il rischio.");
    expect(v.tone).toBe('negative');
  });

  it('a return that prints as zero is neither a gain nor a loss', () => {
    const v = buildPerformanceVerdict({ ...baseInput, heroReturn: { value: -0.04, isPeriodReturn: false, label: 'annualizzato' }, annualizedReturn: -0.04, quality: { tone: 'weak', headline: 'Negativo', detail: '' }, benchmark: null });
    expect(plain(v.sentence)).toContain('Rende 0,0% annualizzato (TWR)');
    expect(v.headline).toBe("Nell'ultimo anno il portafoglio perde.");
  });

  it('too few months: a neutral verdict and no figures', () => {
    const v = buildPerformanceVerdict({
      ...baseInput,
      heroReturn: { value: null, isPeriodReturn: false, label: 'annualizzato' },
      annualizedReturn: null,
      quality: { tone: 'neutral', headline: 'Dati insufficienti', detail: '' },
      sharpeRatio: null,
      benchmark: null,
      drawdown: null,
      consistency: { positiveMonths: 0, totalMonths: 0, positiveShare: null, best: null, worst: null },
    });
    expect(v.headline).toBe('Servono più mesi per giudicare il rendimento.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe('Il periodo non ha ancora un rendimento misurabile; il verdetto arriva con i prossimi snapshot mensili.');
  });

  it('below six months the figure is the period return and the gap is on the same basis', () => {
    const input: PerformanceVerdictInput = {
      ...baseInput,
      period: 'YTD',
      nominalPeriodStart: { year: 2026, month: 1 },
      startDate: new Date(2026, 0, 1, 12),
      endDate: new Date(2026, 3, 30, 12),
      numberOfMonths: 4,
      heroReturn: { value: 2.09, isPeriodReturn: true, label: 'nei 4 mesi' },
      annualizedReturn: 6.4,
      benchmark: { name: 'Portafoglio 60/40', annualized: 5.2 },
      consistency: { ...consistency, positiveMonths: 3, totalMonths: 4, positiveShare: 75 },
    };
    // 6,4% and 5,2% a year are 2,09% and 1,71% over four months: the honest gap is 0,4 points, not 1,2.
    expect(resolveBenchmarkGap(input)).toBeCloseTo(0.38, 1);
    const v = buildPerformanceVerdict(input);
    expect(v.headline).toBe('Da inizio anno il portafoglio rende più del 60/40.');
    expect(plain(v.sentence)).toContain('Rende +2,1% nei 4 mesi (TWR), 0,4 punti sopra il Portafoglio 60/40');
  });

  it('an unrecovered drawdown is named as such, with the year when the window spans more than a year', () => {
    const v = buildPerformanceVerdict({
      ...baseInput,
      period: '3Y',
      numberOfMonths: 36,
      startDate: new Date(2023, 7, 1, 12),
      drawdown: { value: -12.4, peak: { year: 2024, month: 9 }, trough: { year: 2025, month: 4 }, recovery: null, monthsToRecover: null, durationMonths: 15 },
    });
    expect(plain(v.sentence)).toContain('il drawdown massimo è stato −12,4% ad aprile 2025, non ancora recuperato');
  });

  it('a portfolio that never fell says so instead of inventing a drawdown', () => {
    const v = buildPerformanceVerdict({ ...baseInput, drawdown: null });
    expect(plain(v.sentence)).toContain('mai sotto il massimo del periodo; 9 mesi su 12 positivi.');
  });

  it('one point is singular', () => {
    const v = buildPerformanceVerdict({ ...baseInput, benchmark: { name: 'Portafoglio 60/40', annualized: 6.28 } });
    expect(plain(v.sentence)).toContain('1 punto sopra il Portafoglio 60/40');
  });
});

// ─── Tile readings ────────────────────────────────────────────────────────────

describe('describeGrowthOfHundred', () => {
  it('reads 100 € at the base month against today, for both series', () => {
    const r = describeGrowthOfHundred({ baseMonth: { year: 2025, month: 7 }, end: TODAY, portfolioEnd: 107.3, benchmarkEnd: 106.1, benchmarkName: 'Portafoglio 60/40' });
    expect(plain(r)).toBe('100 € a fine luglio 2025 oggi valgono 107,3 €; nel Portafoglio 60/40 varrebbero 106,1 €.');
  });

  it('names the closing month when the window does not end at the latest snapshot', () => {
    const r = describeGrowthOfHundred({ baseMonth: { year: 2023, month: 12 }, end: { endMonth: { year: 2024, month: 12 }, endsAtLatest: false }, portfolioEnd: 107.3, benchmarkEnd: null, benchmarkName: 'All Weather' });
    expect(plain(r)).toBe('100 € a fine dicembre 2023 a fine dicembre 2024 valgono 107,3 €.');
  });

  it('drops the benchmark clause without a benchmark and colours a loss', () => {
    const r = describeGrowthOfHundred({ baseMonth: { year: 2025, month: 12 }, end: TODAY, portfolioEnd: 96.4, benchmarkEnd: null, benchmarkName: 'Portafoglio 60/40' });
    expect(plain(r)).toBe('100 € a fine dicembre 2025 oggi valgono 96,4 €.');
    expect(r.find((s) => flat(s.text) === '96,4 €')?.sign).toBe('negative');
  });

  it('elides «nel» before a vowel', () => {
    const r = describeGrowthOfHundred({ baseMonth: { year: 2025, month: 7 }, end: TODAY, portfolioEnd: 107.3, benchmarkEnd: 106.1, benchmarkName: 'All Weather' });
    expect(plain(r)).toContain("nell'All Weather varrebbero");
  });
});

describe('describeRisk', () => {
  it('reads volatility and the Sharpe band', () => {
    expect(plain(describeRisk({ volatility: 4.9, sharpeRatio: 1.08, monthsMeasured: 12 }))).toBe('Volatilità del 4,9% annua e Sharpe di 1,08: il rischio è pagato.');
    expect(plain(describeRisk({ volatility: 11.2, sharpeRatio: 0.4, monthsMeasured: 12 }))).toBe("Volatilità dell'11,2% annua e Sharpe di 0,40: il rendimento paga poco il rischio.");
    expect(plain(describeRisk({ volatility: 8.0, sharpeRatio: -0.3, monthsMeasured: 12 }))).toBe("Volatilità dell'8,0% annua e Sharpe di −0,30: sotto il tasso privo di rischio.");
    expect(plain(describeRisk({ volatility: 18.2, sharpeRatio: -0.3, monthsMeasured: 12 }))).toBe('Volatilità del 18,2% annua e Sharpe di −0,30: sotto il tasso privo di rischio.');
  });

  it('reads the volatility alone when the Sharpe is missing', () => {
    expect(plain(describeRisk({ volatility: 4.9, sharpeRatio: null, monthsMeasured: 12 }))).toBe('Volatilità del 4,9% annua.');
  });

  it('states the three-month floor instead of a number', () => {
    expect(plain(describeRisk({ volatility: null, sharpeRatio: null, monthsMeasured: 2 }))).toBe('Con 2 mesi misurati la volatilità non si calcola: servono almeno 3.');
    expect(plain(describeRisk({ volatility: null, sharpeRatio: null, monthsMeasured: 1 }))).toBe('Con 1 mese misurato la volatilità non si calcola: servono almeno 3.');
  });
});

describe('describeConsistency', () => {
  it('counts the months and names the best and the worst', () => {
    expect(plain(describeConsistency(consistency))).toBe('9 mesi su 12 positivi (75%); il migliore aprile 2026 (+3,1%), il peggiore marzo 2026 (−3,0%).');
  });

  it('omits the share on a sample too small to express one, and names a single month once', () => {
    const one: ReturnConsistency = { positiveMonths: 1, totalMonths: 1, positiveShare: null, best: { label: 'Lug 26', year: 2026, month: 7, return: 1.2 }, worst: { label: 'Lug 26', year: 2026, month: 7, return: 1.2 } };
    expect(plain(describeConsistency(one))).toBe('1 mese su 1 positivo; luglio 2026 (+1,2%).');
    const two: ReturnConsistency = { positiveMonths: 1, totalMonths: 2, positiveShare: null, best: { label: 'Lug 26', year: 2026, month: 7, return: 1.2 }, worst: { label: 'Giu 26', year: 2026, month: 6, return: -0.5 } };
    expect(plain(describeConsistency(two))).toBe('1 mese su 2 positivo; il migliore luglio 2026 (+1,2%), il peggiore giugno 2026 (−0,5%).');
  });

  it('a month that prints as zero carries no sign', () => {
    const c: ReturnConsistency = { ...consistency, positiveMonths: 0, worst: { label: 'Mar 26', year: 2026, month: 3, return: -0.02 } };
    expect(plain(describeConsistency(c))).toBe('0 mesi su 12 positivi (75%); il migliore aprile 2026 (+3,1%), il peggiore marzo 2026 (0,0%).');
  });

  it('says so when no month is measured', () => {
    expect(plain(describeConsistency({ positiveMonths: 0, totalMonths: 0, positiveShare: null, best: null, worst: null }))).toBe('Nessun mese misurato nel periodo.');
  });
});

describe('describeContributions', () => {
  it('sets the ledger beside the cashflow', () => {
    const r = describeContributions({ invested: { investedEur: 16700, divestedEur: 2500, netInvestedEur: 14200 }, netCashFlow: 11850 });
    expect(plain(r)).toBe('Hai investito 14.200 € dal registro, a fronte di 11.850 € messi da parte.');
  });

  it('says when the cashflow is negative and when the ledger sold more than it bought', () => {
    expect(plain(describeContributions({ invested: { investedEur: 1000, divestedEur: 4000, netInvestedEur: -3000 }, netCashFlow: -2300 }))).toBe('Hai disinvestito 3000 € dal registro, mentre dal cashflow sono usciti 2300 € più di quanto è entrato.');
    expect(plain(describeContributions({ invested: { investedEur: 5000, divestedEur: 0, netInvestedEur: 5000 }, netCashFlow: -900 }))).toBe('Hai investito 5000 € dal registro, mentre dal cashflow sono usciti 900 € più di quanto è entrato.');
  });

  it('without a ledger it reads the cashflow alone', () => {
    expect(plain(describeContributions({ invested: null, netCashFlow: 11850 }))).toBe('Dal cashflow hai messo da parte 11.850 € nel periodo; il registro operazioni non è attivo.');
    expect(plain(describeContributions({ invested: null, netCashFlow: -2300 }))).toBe('Dal cashflow sono usciti 2300 € più di quanto è entrato nel periodo; il registro operazioni non è attivo.');
  });
});

describe('describeBenchmarkRanking', () => {
  const ranking: BenchmarkRanking = {
    rows: [
      { id: 'buffett-90-10', name: '90/10 Buffett', annualized: 9.4, delta: -2.1, lastMonth: { year: 2026, month: 7 } },
      { id: '60-40', name: 'Portafoglio 60/40', annualized: 6.1, delta: 1.2, lastMonth: { year: 2026, month: 7 } },
      { id: 'acwi', name: '100% ACWI', annualized: 5.7, delta: 1.6, lastMonth: { year: 2026, month: 7 } },
    ],
    beaten: 2,
    tied: 0,
    measured: 3,
  };

  it('counts the beaten models and names the ones that did better', () => {
    expect(plain(describeBenchmarkRanking(ranking))).toBe('Batte 2 portafogli modello su 3; solo il 90/10 Buffett ha reso di più.');
  });

  it('one beaten model is singular and names the two above it, with the elided article', () => {
    const one: BenchmarkRanking = {
      rows: [
        { id: 'all-weather', name: 'All Weather', annualized: 9.4, delta: -2.1, lastMonth: null },
        { id: '60-40', name: 'Portafoglio 60/40', annualized: 8.1, delta: -0.8, lastMonth: null },
        { id: 'acwi', name: '100% ACWI', annualized: 5.7, delta: 1.6, lastMonth: null },
      ],
      beaten: 1,
      tied: 0,
      measured: 3,
    };
    expect(plain(describeBenchmarkRanking(one))).toBe("Batte 1 portafoglio modello su 3; l'All Weather e il Portafoglio 60/40 hanno reso di più.");
  });

  it('beats them all, or none', () => {
    expect(plain(describeBenchmarkRanking({ ...ranking, rows: ranking.rows.map((r) => ({ ...r, delta: 1 })), beaten: 3 }))).toBe('Batte tutti e 3 i portafogli modello.');
    expect(plain(describeBenchmarkRanking({ ...ranking, rows: ranking.rows.map((r) => ({ ...r, delta: -1 })), beaten: 0 }))).toBe('Nessun portafoglio modello ha reso meno; il migliore è il 90/10 Buffett.');
  });

  it('a gap that prints as zero is a tie, named as such', () => {
    const tied: BenchmarkRanking = { ...ranking, rows: [ranking.rows[0], { ...ranking.rows[1], delta: 0.04 }, ranking.rows[2]], beaten: 1, tied: 1 };
    expect(plain(describeBenchmarkRanking(tied))).toBe('Batte 1 portafoglio modello su 3, alla pari con il Portafoglio 60/40; solo il 90/10 Buffett ha reso di più.');
  });

  it('is null while nothing is measured, or while the portfolio has no return to compare', () => {
    expect(describeBenchmarkRanking({ rows: [], beaten: 0, tied: 0, measured: 0 })).toBeNull();
    expect(describeBenchmarkRanking({ rows: [{ id: 'a', name: 'All Weather', annualized: 4, delta: null, lastMonth: null }], beaten: 0, tied: 0, measured: 1 })).toBeNull();
  });
});

describe('describeRealizedGains', () => {
  const summary: RealizedGainsSummary = { total: 3745, years: [{ year: 2026, amount: -412 }, { year: 2025, amount: 2845 }, { year: 2024, amount: 1312 }] };

  it('states the total and the running year', () => {
    expect(plain(describeRealizedGains(summary, 2026))).toBe('Dal registro operazioni hai realizzato +3745 € in totale; il 2026 chiude per ora in perdita (−412 €).');
  });

  it('names the best closed year when the running year has no sells', () => {
    expect(plain(describeRealizedGains({ total: 4157, years: summary.years.slice(1) }, 2026))).toBe("Dal registro operazioni hai realizzato +4157 € in totale; l'anno migliore è il 2025 (+2845 €).");
  });

  it('calls a losing best year the least heavy, not the best', () => {
    expect(plain(describeRealizedGains({ total: -900, years: [{ year: 2025, amount: -300 }, { year: 2024, amount: -600 }] }, 2026))).toBe('Dal registro operazioni hai realizzato −900 € in totale; tutti gli anni in perdita, il meno pesante il 2025 (−300 €).');
  });
});

describe('describeCapitalAndMarket', () => {
  it('splits today into paid-in capital and market', () => {
    expect(plain(describeCapitalAndMarket({ netWorth: 199600, investedBase: 186500, returns: 13100 }, TODAY))).toBe('Dei 199.600 € di oggi, 186.500 € sono capitale immesso e 13.100 € rendimento del mercato.');
  });

  it('says when the market took away', () => {
    expect(plain(describeCapitalAndMarket({ netWorth: 180000, investedBase: 183200, returns: -3200 }, TODAY))).toBe('Dei 180.000 € di oggi, 183.200 € sono capitale immesso: il mercato ha tolto 3200 €.');
  });

  it('names the closing month of a window that does not end today', () => {
    expect(plain(describeCapitalAndMarket({ netWorth: 180000, investedBase: 170000, returns: 10000 }, { endMonth: { year: 2024, month: 12 }, endsAtLatest: false }))).toBe('Dei 180.000 € a fine dicembre 2024, 170.000 € sono capitale immesso e 10.000 € rendimento del mercato.');
  });

  it('picks the plural article on the leading group of the printed amount', () => {
    expect(plain(describeCapitalAndMarket({ netWorth: 8000, investedBase: 7500, returns: 500 }, TODAY))).toMatch(/^Degli 8000 €/);
    expect(plain(describeCapitalAndMarket({ netWorth: 18000, investedBase: 17000, returns: 1000 }, TODAY))).toMatch(/^Dei 18\.000 €/);
    expect(plain(describeCapitalAndMarket({ netWorth: 1500, investedBase: 1400, returns: 100 }, TODAY))).toMatch(/^Dei 1500 €/);
    expect(plain(describeCapitalAndMarket({ netWorth: 80000, investedBase: 70000, returns: 10000 }, TODAY))).toMatch(/^Degli 80\.000 €/);
  });
});

describe('describeMeasurementBase', () => {
  const both: PerformanceBaseOptions = { includePensionFunds: false, includeExcludedAssets: false };
  it('names what is left out of the base', () => {
    expect(describeMeasurementBase(both)).toBe("Base: portafoglio gestito, al netto di fondo pensione e immobili esclusi dall'allocazione.");
    expect(describeMeasurementBase({ includePensionFunds: true, includeExcludedAssets: false })).toBe("Base: portafoglio gestito, al netto di immobili esclusi dall'allocazione.");
    expect(describeMeasurementBase({ includePensionFunds: true, includeExcludedAssets: true })).toBe('Base: patrimonio totale, fondo pensione e immobili inclusi.');
  });
});

// ─── Dettaglio readings ───────────────────────────────────────────────────────

describe('describeReturnMetrics / describeDrawdownDetail / describeYields', () => {
  it('reads ROI and CAGR beside the TWR', () => {
    expect(plain(describeReturnMetrics({ roi: 9.8, cagr: 7.6, moneyWeightedReturn: 8.9 }))).toBe("ROI del 9,8% nel periodo e CAGR del 7,6%; il tuo timing ha reso l'8,9% (IRR).");
    expect(plain(describeReturnMetrics({ roi: null, cagr: null, moneyWeightedReturn: null }))).toBe('ROI, CAGR e IRR non sono calcolabili su questo periodo.');
    expect(plain(describeReturnMetrics({ roi: null, cagr: null, moneyWeightedReturn: 2.3 }))).toBe('Il tuo timing ha reso il 2,3% (IRR).');
  });

  it('never elides an article onto a minus: a negative value takes a direction word', () => {
    expect(plain(describeReturnMetrics({ roi: -8.1, cagr: -0.4, moneyWeightedReturn: -2.3 }))).toBe("ROI negativo dell'8,1% nel periodo e CAGR negativo dello 0,4%; il tuo timing ha perso il 2,3% (IRR).");
  });

  it('tells the drawdown story in months', () => {
    expect(plain(describeDrawdownDetail(drawdownRecovered))).toBe('Dal picco di febbraio 2026 alla valle di marzo 2026, poi 2 mesi di risalita fino a maggio 2026.');
    expect(plain(describeDrawdownDetail({ ...drawdownRecovered, recovery: { year: 2026, month: 4 }, monthsToRecover: 1 }))).toBe('Dal picco di febbraio 2026 alla valle di marzo 2026, poi 1 mese di risalita fino ad aprile 2026.');
    expect(plain(describeDrawdownDetail({ ...drawdownRecovered, recovery: null, monthsToRecover: null, durationMonths: 5 }))).toBe('Dal picco di febbraio 2026 alla valle di marzo 2026; il recupero non è ancora arrivato.');
    expect(plain(describeDrawdownDetail(null))).toBe('Il portafoglio non è mai sceso sotto un massimo nel periodo.');
  });

  it('reads the yields on cost and on price', () => {
    expect(plain(describeYields({ yocNet: 3.1, currentYieldNet: 2.6 }))).toBe('I dividendi rendono il 3,1% netto sul costo e il 2,6% sul prezzo di oggi.');
    expect(plain(describeYields({ yocNet: 18.2, currentYieldNet: 2.6 }))).toBe('I dividendi rendono il 18,2% netto sul costo e il 2,6% sul prezzo di oggi.');
    expect(plain(describeYields({ yocNet: 3.1, currentYieldNet: null }))).toBe('I dividendi rendono il 3,1% netto sul costo.');
    expect(plain(describeYields({ yocNet: null, currentYieldNet: 2.6 }))).toBe('I dividendi rendono il 2,6% netto sul prezzo di oggi; nessun costo medio per lo YOC.');
    expect(describeYields({ yocNet: null, currentYieldNet: null })).toBeNull();
  });
});

describe('describeAnalysisBase', () => {
  it('names the window and what was paid into it', () => {
    expect(plain(describeAnalysisBase({ monthsMeasured: 31, netCashFlow: 18400 }))).toBe(
      '31 mesi di storico, con 18.400 € versati nel periodo.',
    );
  });

  it('says «prelevati» when the flows went the other way', () => {
    expect(plain(describeAnalysisBase({ monthsMeasured: 12, netCashFlow: -5000 }))).toBe(
      '12 mesi di storico, con 5000 € prelevati nel periodo.',
    );
  });

  it('drops the contribution clause when nothing moved', () => {
    expect(plain(describeAnalysisBase({ monthsMeasured: 6, netCashFlow: 0 }))).toBe('6 mesi di storico.');
    expect(plain(describeAnalysisBase({ monthsMeasured: 6, netCashFlow: null }))).toBe('6 mesi di storico.');
  });

  it('agrees in number on a single month', () => {
    expect(plain(describeAnalysisBase({ monthsMeasured: 1, netCashFlow: null }))).toBe('1 mese di storico.');
  });
});
