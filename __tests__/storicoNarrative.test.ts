/**
 * Tests for lib/utils/storicoNarrative.ts — the words of Storico: the verdict answering «come
 * sono arrivato qui?» and the reading line of every tile. Same mocking as
 * patrimonioNarrative.test.ts: the module needs chartService's it-IT percentage formatter, whose
 * Firebase chain is mocked away. Every phrasing is pinned here; a missing input drops its clause.
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

import type { DoublingMilestone, DoublingTimeSummary } from '@/types/assets';
import type { CompositionSeries } from '@/lib/utils/historyComposition';
import type { GrowthPace, GrowthSummary, MonthlyMoves } from '@/lib/utils/storicoSummary';
import {
  buildStoricoVerdict,
  describeComposition,
  describeDoublings,
  describeDrivers,
  describeEvolution,
  describeEvolutionAside,
  describeLabor,
  describeLaborTaxes,
  describeLaborWindow,
  describeOtherIncome,
  describeMonthBreakdown,
  describeMonthlyDrivers,
  describeNotes,
  describePreviousMonthShort,
  describeEmptySelection,
  describeStoricoHeader,
  describeYearlyVariation,
  formatDurationLong,
  formatDurationShort,
  formatPeriodMonth,
  type StoricoVerdictInput,
} from '@/lib/utils/storicoNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

// Intl 'it-IT' puts a no-break space before "€"; expectations are written as the screen prints them.
const plain = (narrative: Narrative | null) => (narrative ? narrativeToText(narrative).replace(/ /g, ' ') : null);

const GROWTH: GrowthSummary = {
  first: { year: 2019, month: 9, value: 74000 },
  latest: { year: 2026, month: 7, value: 248900 },
  snapshotCount: 83,
  monthsElapsed: 82,
  delta: 174900,
  growthPct: 236.35,
  cagr: 19.4,
};
const MOVES: MonthlyMoves = {
  best: { year: 2024, month: 3, value: 191240, delta: 9840 },
  worst: { year: 2020, month: 3, value: 73900, delta: -8300 },
  risingMonths: 68,
  measuredMonths: 82,
};
const PACE: GrowthPace = { trailingDelta: 34000, trailingPct: 15.8, trailingMonthly: 34000 / 12, lifetimeMonthly: 25600 / 12, verdict: 'accelerating' };
const FULL: StoricoVerdictInput = { growth: GROWTH, moves: MOVES, pace: PACE, lastDoubling: { year: 2022, month: 10 } };

describe('buildStoricoVerdict — headline and tone', () => {
  it('should call a faster last year accelerating', () => {
    const verdict = buildStoricoVerdict(FULL);
    expect(verdict.headline).toBe('Il patrimonio è cresciuto, e sta accelerando.');
    expect(verdict.tone).toBe('positive');
  });

  it('should call the steady, slowing and losing paces by name', () => {
    expect(buildStoricoVerdict({ ...FULL, pace: { ...PACE, verdict: 'steady' } }).headline).toBe('Il patrimonio cresce al ritmo di sempre.');
    expect(buildStoricoVerdict({ ...FULL, pace: { ...PACE, verdict: 'slowing' } }).headline).toBe('Il patrimonio è cresciuto, ma ha rallentato.');
    const losing = buildStoricoVerdict({ ...FULL, pace: { trailingDelta: -3200, trailingPct: -1.3, trailingMonthly: -3200 / 12, lifetimeMonthly: 2000, verdict: 'losing' } });
    expect(losing.headline).toBe("Il patrimonio è cresciuto, ma nell'ultimo anno ha perso.");
    expect(losing.tone).toBe('warning');
  });

  it('should state only the growth when the pace cannot be judged', () => {
    const verdict = buildStoricoVerdict({ ...FULL, pace: { trailingDelta: null, trailingPct: null, trailingMonthly: null, lifetimeMonthly: 2000, verdict: null } });
    expect(verdict.headline).toBe('Il patrimonio è cresciuto dal primo snapshot.');
    expect(verdict.tone).toBe('positive');
  });

  it('should say when the patrimonio is below its starting point, or exactly there', () => {
    const below = buildStoricoVerdict({ ...FULL, growth: { ...GROWTH, delta: -3000, growthPct: -4.05, cagr: null } });
    expect(below.headline).toBe('Il patrimonio è sotto il punto di partenza.');
    expect(below.tone).toBe('negative');
    const flat = buildStoricoVerdict({ ...FULL, growth: { ...GROWTH, delta: 0, growthPct: 0, cagr: 0 } });
    expect(flat.headline).toBe("Il patrimonio è dov'era al primo snapshot.");
    expect(flat.tone).toBe('neutral');
  });

  it('should open the history with a single snapshot, or with none', () => {
    const one = buildStoricoVerdict({
      growth: { ...GROWTH, latest: GROWTH.first, snapshotCount: 1, monthsElapsed: 0, delta: 0, growthPct: 0, cagr: null },
      moves: { best: null, worst: null, risingMonths: 0, measuredMonths: 0 },
      pace: { trailingDelta: null, trailingPct: null, trailingMonthly: null, lifetimeMonthly: null, verdict: null },
      lastDoubling: null,
    });
    expect(one.headline).toBe('Lo storico comincia da settembre 2019.');
    expect(one.tone).toBe('neutral');
    expect(plain(one.sentence)).toBe('Un solo snapshot (74.000 €): la crescita si misura dal secondo.');

    const none = buildStoricoVerdict({ growth: null, moves: { best: null, worst: null, risingMonths: 0, measuredMonths: 0 }, pace: { trailingDelta: null, trailingPct: null, trailingMonthly: null, lifetimeMonthly: null, verdict: null }, lastDoubling: null });
    expect(none.headline).toBe('Lo storico comincia con il primo snapshot.');
    expect(none.tone).toBe('neutral');
  });
});

describe('buildStoricoVerdict — the sentence', () => {
  it('should carry the growth, the CAGR named as wealth growth, the best month, the last doubling and the pace', () => {
    expect(plain(buildStoricoVerdict(FULL).sentence)).toBe(
      "Dal primo snapshot (settembre 2019) il patrimonio è cresciuto di 174.900 € (+236,4%, il 19,4% l'anno, versamenti inclusi): il mese migliore è stato marzo 2024 (+9840 €), l'ultimo raddoppio ad ottobre 2022. Nell'ultimo anno è salito di 34.000 €, sopra la media di 25.600 € l'anno.",
    );
  });

  it('should colour the growth and the best month by sign and set the CAGR in mono', () => {
    const { sentence } = buildStoricoVerdict(FULL);
    const growthFigure = sentence.find((s) => s.text.replace(/ /g, ' ') === '174.900 €');
    expect(growthFigure).toMatchObject({ mono: true, sign: 'positive' });
    expect(sentence.find((s) => s.text === "19,4%")).toMatchObject({ mono: true });
    expect(sentence.find((s) => s.text === "19,4%")?.sign).toBeUndefined();
  });

  it('should elide the article before a vowel-initial CAGR', () => {
    expect(plain(buildStoricoVerdict({ ...FULL, growth: { ...GROWTH, cagr: 8.06 } }).sentence)).toContain("l'8,1% l'anno");
  });

  it('should drop the CAGR below a year and the best month or the doubling when absent', () => {
    const verdict = buildStoricoVerdict({
      growth: { ...GROWTH, first: { year: 2026, month: 1, value: 200000 }, monthsElapsed: 6, snapshotCount: 7, delta: 48900, growthPct: 24.45, cagr: null },
      moves: { best: null, worst: null, risingMonths: 0, measuredMonths: 0 },
      pace: { trailingDelta: null, trailingPct: null, trailingMonthly: null, lifetimeMonthly: 8150, verdict: null },
      lastDoubling: null,
    });
    expect(plain(verdict.sentence)).toBe('Dal primo snapshot (gennaio 2026) il patrimonio è cresciuto di 48.900 € (+24,5%).');
  });

  it('should keep the best month without a doubling, and the doubling without a best month', () => {
    expect(plain(buildStoricoVerdict({ ...FULL, lastDoubling: null, pace: { ...PACE, trailingDelta: null, trailingMonthly: null, verdict: null } }).sentence)).toBe(
      "Dal primo snapshot (settembre 2019) il patrimonio è cresciuto di 174.900 € (+236,4%, il 19,4% l'anno, versamenti inclusi): il mese migliore è stato marzo 2024 (+9840 €).",
    );
    expect(plain(buildStoricoVerdict({ ...FULL, moves: { ...MOVES, best: null }, pace: { ...PACE, trailingDelta: null, trailingMonthly: null, verdict: null } }).sentence)).toBe(
      "Dal primo snapshot (settembre 2019) il patrimonio è cresciuto di 174.900 € (+236,4%, il 19,4% l'anno, versamenti inclusi): l'ultimo raddoppio ad ottobre 2022.",
    );
  });

  it('should say the last year without a comparison when the history is too short to judge it', () => {
    const verdict = buildStoricoVerdict({ ...FULL, pace: { trailingDelta: 12000, trailingPct: 6, trailingMonthly: 1000, lifetimeMonthly: 900, verdict: null } });
    expect(plain(verdict.sentence)).toContain("Nell'ultimo anno è salito di 12.000 €.");
    expect(plain(verdict.sentence)).not.toContain('media');
  });

  it('should compare against the average in the three judged paces', () => {
    expect(plain(buildStoricoVerdict({ ...FULL, pace: { ...PACE, verdict: 'steady' } }).sentence)).toContain("in linea con la media di 25.600 € l'anno.");
    expect(plain(buildStoricoVerdict({ ...FULL, pace: { ...PACE, verdict: 'slowing' } }).sentence)).toContain("sotto la media di 25.600 € l'anno.");
    expect(plain(buildStoricoVerdict({ ...FULL, pace: { trailingDelta: -3200, trailingPct: -1.3, trailingMonthly: -3200 / 12, lifetimeMonthly: 2000, verdict: 'losing' } }).sentence)).toContain("Nell'ultimo anno ha perso 3200 €.");
  });

  it('should not compare the last year against a negative lifetime average', () => {
    const verdict = buildStoricoVerdict({
      ...FULL,
      growth: { ...GROWTH, delta: -20000, growthPct: -20, cagr: -7.2 },
      pace: { trailingDelta: 20000, trailingPct: 33.3, trailingMonthly: 20000 / 12, lifetimeMonthly: -555.56, verdict: 'accelerating' },
      lastDoubling: null,
    });
    expect(verdict.headline).toBe('Il patrimonio è sotto il punto di partenza.');
    expect(plain(verdict.sentence)).toContain("Nell'ultimo anno è salito di 20.000 €.");
    expect(plain(verdict.sentence)).not.toContain('media');
  });

  it('should say «sceso» with a negative percentage when below the start', () => {
    const verdict = buildStoricoVerdict({ ...FULL, growth: { ...GROWTH, delta: -3000, growthPct: -4.05, cagr: -1.2 }, lastDoubling: null });
    expect(plain(verdict.sentence)).toContain('il patrimonio è sceso di 3000 € (−4,1%, −1,2% l\'anno, versamenti inclusi)');
    expect(verdict.sentence.find((s) => s.text.replace(/ /g, ' ') === '3000 €')).toMatchObject({ sign: 'negative' });
  });

  it('should drop the percentage when the first snapshot was not positive', () => {
    const verdict = buildStoricoVerdict({ ...FULL, growth: { ...GROWTH, growthPct: null, cagr: null }, moves: { ...MOVES, best: null }, lastDoubling: null, pace: { ...PACE, trailingDelta: null, trailingMonthly: null, verdict: null } });
    expect(plain(verdict.sentence)).toBe('Dal primo snapshot (settembre 2019) il patrimonio è cresciuto di 174.900 €.');
  });
});

describe('describeEvolution', () => {
  const ath = { peak: { year: 2026, month: 7, value: 248900 }, isAtHigh: true, gap: 0, gapPct: 0 };

  it('should name the record, the rising months and the worst month', () => {
    expect(plain(describeEvolution({ ath, moves: MOVES }))).toBe('Al massimo storico: 68 mesi su 82 in crescita, il peggiore marzo 2020 (−8300 €).');
  });

  it('should measure the distance from an earlier peak', () => {
    const below = { peak: { year: 2026, month: 3, value: 251900 }, isAtHigh: false, gap: -3000, gapPct: -1.19 };
    expect(plain(describeEvolution({ ath: below, moves: MOVES }))).toBe('3000 € (1,2%) sotto il massimo di marzo 2026: 68 mesi su 82 in crescita, il peggiore marzo 2020 (−8300 €).');
  });

  it('should say when no month fell, and give no reading on a single snapshot', () => {
    expect(plain(describeEvolution({ ath, moves: { ...MOVES, worst: null, risingMonths: 5, measuredMonths: 5 } }))).toBe('Al massimo storico: 5 mesi su 5 in crescita, nessun mese in calo.');
    expect(describeEvolution({ ath, moves: { best: null, worst: null, risingMonths: 0, measuredMonths: 0 } })).toBeNull();
    expect(describeEvolution({ ath: null, moves: MOVES })).toBeNull();
  });
});

describe('describeDoublings', () => {
  const completed = (n: number, year: number, month: number, months: number, threshold?: number): DoublingMilestone => ({
    milestoneNumber: n,
    startValue: 74000,
    endValue: threshold ?? 149600,
    startDate: { year: 2019, month: 9 },
    endDate: { year, month },
    durationMonths: months,
    periodLabel: '09/19 - 10/22',
    isComplete: true,
    milestoneType: threshold ? 'threshold' : 'geometric',
    thresholdValue: threshold,
  });
  const inProgress = (n: number, pct: number, threshold?: number): DoublingMilestone => ({
    milestoneNumber: n,
    startValue: 149600,
    endValue: threshold ?? 299200,
    startDate: { year: 2022, month: 10 },
    endDate: { year: 2026, month: 7 },
    durationMonths: 45,
    periodLabel: '10/22 - 07/26 - In corso',
    isComplete: false,
    progressPercentage: pct,
    milestoneType: threshold ? 'threshold' : 'geometric',
    thresholdValue: threshold,
  });
  const summary = (milestones: DoublingMilestone[], current: DoublingMilestone | null): DoublingTimeSummary => ({
    milestones,
    fastestDoubling: milestones[0] ?? null,
    averageMonths: milestones.length ? milestones.reduce((s, m) => s + m.durationMonths, 0) / milestones.length : null,
    totalDoublings: milestones.length,
    currentDoublingInProgress: current,
  });
  const projection = { target: 299200, remaining: 50300, monthlyPace: 2833, monthsToTarget: 18, eta: { year: 2028, month: 1 } };

  it('should count the doublings, date the last one and project the next at the last year\'s pace', () => {
    expect(plain(describeDoublings({ summary: summary([completed(1, 2022, 10, 37)], inProgress(2, 66.4)), mode: 'geometric', projection }))).toBe(
      "Raddoppiato una volta, ad ottobre 2022 in 3 anni e 1 mese; il prossimo raddoppio è al 66% e al ritmo dell'ultimo anno arriva a gennaio 2028.",
    );
    expect(plain(describeDoublings({ summary: summary([completed(1, 2021, 8, 23), completed(2, 2024, 11, 39)], inProgress(3, 17.5)), mode: 'geometric', projection }))).toContain(
      "Raddoppiato 2 volte, l'ultima a novembre 2024 in 3 anni e 3 mesi;",
    );
  });

  it('should drop the projection clause without a projection, and the progress without a milestone in progress', () => {
    expect(plain(describeDoublings({ summary: summary([completed(1, 2022, 10, 37)], inProgress(2, 66.4)), mode: 'geometric', projection: null }))).toBe(
      'Raddoppiato una volta, ad ottobre 2022 in 3 anni e 1 mese; il prossimo raddoppio è al 66%.',
    );
    expect(plain(describeDoublings({ summary: summary([completed(1, 2022, 10, 37)], null), mode: 'geometric', projection: null }))).toBe(
      'Raddoppiato una volta, ad ottobre 2022 in 3 anni e 1 mese.',
    );
  });

  it('should not print a negative progress: below the start the sentence says so', () => {
    expect(plain(describeDoublings({ summary: summary([completed(1, 2022, 10, 37)], inProgress(2, -10)), mode: 'geometric', projection: null }))).toBe(
      'Raddoppiato una volta, ad ottobre 2022 in 3 anni e 1 mese; il prossimo raddoppio è sotto il punto di partenza.',
    );
    expect(plain(describeDoublings({ summary: summary([], inProgress(1, 0)), mode: 'geometric', projection: null }))).toBe('Nessun raddoppio ancora: il primo non è ancora iniziato.');
    // The article follows the printed percentage: «all'8%», «al 66%».
    expect(plain(describeDoublings({ summary: summary([], inProgress(1, 8.2)), mode: 'geometric', projection: null }))).toBe("Nessun raddoppio ancora: il primo è all'8%.");
  });

  it('should say when no doubling is done yet', () => {
    expect(plain(describeDoublings({ summary: summary([], inProgress(1, 45)), mode: 'geometric', projection }))).toBe(
      "Nessun raddoppio ancora: il primo è al 45% e al ritmo dell'ultimo anno arriva a gennaio 2028.",
    );
    expect(plain(describeDoublings({ summary: summary([], null), mode: 'geometric', projection: null }))).toBe('Nessun raddoppio ancora.');
  });

  it('should speak of thresholds in the other mode, naming the amounts', () => {
    const s = summary([completed(1, 2021, 3, 18, 100000), completed(2, 2025, 2, 47, 200000)], inProgress(3, 16, 500000));
    expect(plain(describeDoublings({ summary: s, mode: 'threshold', projection: { ...projection, target: 500000 } }))).toBe(
      "Superati 2 traguardi, l'ultimo (200.000 €) a febbraio 2025 in 3 anni e 11 mesi; il prossimo (500.000 €) è al 16% e al ritmo dell'ultimo anno arriva a gennaio 2028.",
    );
    expect(plain(describeDoublings({ summary: summary([completed(1, 2021, 3, 18, 100000)], null), mode: 'threshold', projection: null }))).toBe(
      'Superato un traguardo (100.000 €) a marzo 2021 in 1 anno e 6 mesi.',
    );
    expect(plain(describeDoublings({ summary: summary([], null), mode: 'threshold', projection: null }))).toBe('Nessun traguardo ancora.');
  });
});

describe('describeComposition', () => {
  const series = (breakdown: CompositionSeries['breakdown']): CompositionSeries => ({ bands: [], rows: [], breakdown, latestTotalEur: 248900, latestPeriodLabel: 'Luglio 2026' });
  const ASSET_CLASS = series([
    { key: 'equity', label: 'Azioni', colorIndex: 0, valueEur: 141900, sharePct: 57.0, deltaPp: 2.4 },
    { key: 'bonds', label: 'Obbligazioni', colorIndex: 1, valueEur: 42300, sharePct: 17.0, deltaPp: -1.1 },
    { key: 'cash', label: 'Liquidità', colorIndex: 4, valueEur: 28600, sharePct: 11.5, deltaPp: -1.8 },
    { key: 'pension', label: 'Previdenza', colorIndex: 8, valueEur: 18700, sharePct: 7.5, deltaPp: 0.6 },
  ]);

  it('should name the two largest classes and the pension band', () => {
    expect(plain(describeComposition(ASSET_CLASS, 'assetClass'))).toBe('Le azioni pesano il 57,0% del patrimonio (+2,4 pp in un anno) e le obbligazioni il 17,0%; la Previdenza è il 7,5%.');
  });

  it('should drop the drift without a year-earlier month and the pension clause without a fund', () => {
    const noDrift = series([
      { key: 'realestate', label: 'Immobili', colorIndex: 3, valueEur: 180000, sharePct: 60, deltaPp: null },
      { key: 'cash', label: 'Liquidità', colorIndex: 4, valueEur: 120000, sharePct: 40, deltaPp: null },
    ]);
    expect(plain(describeComposition(noDrift, 'assetClass'))).toBe('Gli immobili pesano il 60,0% del patrimonio e la liquidità il 40,0%.');
  });

  it('should handle one band, a pension band among the largest two, and no data', () => {
    expect(plain(describeComposition(series([{ key: 'equity', label: 'Azioni', colorIndex: 0, valueEur: 100, sharePct: 100, deltaPp: 0 }]), 'assetClass'))).toBe('Le azioni pesano il 100,0% del patrimonio (0,0 pp in un anno).');
    const pensionSecond = series([
      { key: 'equity', label: 'Azioni', colorIndex: 0, valueEur: 60, sharePct: 60, deltaPp: null },
      { key: 'pension', label: 'Previdenza', colorIndex: 8, valueEur: 40, sharePct: 40, deltaPp: null },
    ]);
    expect(plain(describeComposition(pensionSecond, 'assetClass'))).toBe('Le azioni pesano il 60,0% del patrimonio e la Previdenza il 40,0%.');
    expect(describeComposition(series([]), 'assetClass')).toBeNull();
  });

  it('should read the liquidity cut as liquid versus illiquid, naming a residual', () => {
    const liquidity = series([
      { key: 'liquid', label: 'Liquido', colorIndex: 0, valueEur: 177200, sharePct: 71.2, deltaPp: 1.2 },
      { key: 'illiquid', label: 'Illiquido', colorIndex: 2, valueEur: 71700, sharePct: 28.8, deltaPp: -1.2 },
    ]);
    expect(plain(describeComposition(liquidity, 'liquidity'))).toBe('Il 71,2% del patrimonio è liquido (+1,2 pp in un anno), il 28,8% illiquido.');
    const withResidual = series([
      { key: 'liquid', label: 'Liquido', colorIndex: 0, valueEur: 80, sharePct: 80, deltaPp: null },
      { key: 'illiquid', label: 'Illiquido', colorIndex: 2, valueEur: 18, sharePct: 18, deltaPp: null },
      { key: 'residual', label: 'Non attribuito', colorIndex: null, valueEur: 2, sharePct: 2, deltaPp: null },
    ]);
    expect(plain(describeComposition(withResidual, 'liquidity'))).toBe("L'80,0% del patrimonio è liquido, il 18,0% illiquido; il 2,0% non è attribuito.");
  });
});

describe('describeDrivers', () => {
  const row = (year: string, netSavings: number, investmentGrowth: number, growthPct: number | null = null) => ({ year, netSavings, investmentGrowth, netWorthGrowth: netSavings + investmentGrowth, growthPct, latest: { year: Number(year), month: 12 } });

  it("should split the year's growth between savings and the market, with the shares and the growth in percent", () => {
    expect(plain(describeDrivers({ row: { ...row('2026', 14100, 7300), latest: { year: 2026, month: 8 } }, isRunning: true }))).toBe('Da gennaio ad agosto 2026 il patrimonio è cresciuto di 21.400 €: 14.100 € dal risparmio (66%) e 7300 € dal mercato (34%).');
    expect(plain(describeDrivers({ row: row('2025', 22800, 6900), isRunning: false }))).toBe('Nel 2025 il patrimonio è cresciuto di 29.700 €: 22.800 € dal risparmio (77%) e 6900 € dal mercato (23%).');
    // The growth in percent of the baseline when the baseline is positive; the shares always sum to 100.
    expect(plain(describeDrivers({ row: row('2025', 23678, 21288, 18.2), isRunning: false }))).toBe('Nel 2025 il patrimonio è cresciuto di 44.966 € (+18,2%): 23.678 € dal risparmio (53%) e 21.288 € dal mercato (47%).');
  });

  it('should name the window a running year is measured on (The Same-Basis Rule)', () => {
    expect(plain(describeDrivers({ row: { ...row('2026', 14100, 7300), baseline: { year: 2026, month: 3 }, latest: { year: 2026, month: 7 } }, isRunning: true }))).toBe('Da aprile a luglio 2026 il patrimonio è cresciuto di 21.400 €: 14.100 € dal risparmio (66%) e 7300 € dal mercato (34%).');
    expect(plain(describeDrivers({ row: { ...row('2026', 14100, 7300), baseline: { year: 2025, month: 12 }, latest: { year: 2026, month: 8 } }, isRunning: true }))).toContain('Da gennaio ad agosto 2026');
    expect(plain(describeDrivers({ row: { ...row('2026', 1400, 730), baseline: { year: 2026, month: 7 }, latest: { year: 2026, month: 8 } }, isRunning: true }))).toContain('Ad agosto 2026 il patrimonio');
  });

  it('should blame a negative market or negative savings in words, never as a share', () => {
    expect(plain(describeDrivers({ row: row('2024', 12000, -1000, 5.5), isRunning: false }))).toBe('Nel 2024 il patrimonio è cresciuto di 11.000 € (+5,5%): 12.000 € dal risparmio, mentre il mercato ha tolto 1000 €.');
    expect(plain(describeDrivers({ row: row('2024', -3000, 7200), isRunning: false }))).toBe('Nel 2024 il patrimonio è cresciuto di 4200 €: 7200 € dal mercato, ma hai speso 3000 € più di quanto hai incassato.');
    expect(plain(describeDrivers({ row: row('2022', 9000, -14000), isRunning: false }))).toBe('Nel 2022 il patrimonio è sceso di 5000 €: 9000 € dal risparmio, mentre il mercato ha tolto 14.000 €.');
    expect(plain(describeDrivers({ row: row('2022', -3000, -2000), isRunning: false }))).toBe('Nel 2022 il patrimonio è sceso di 5000 €: il mercato ha tolto 2000 € e hai speso 3000 € più di quanto hai incassato.');
  });

  it('should give no reading without a year', () => {
    expect(describeDrivers(null)).toBeNull();
  });
});

describe('describeMonthBreakdown', () => {
  const breakdown = {
    month: { key: '2026-7', year: 2026, month: 7, label: 'Luglio 2026' },
    previous: { key: '2026-6', year: 2026, month: 6, label: 'Giugno 2026' },
    total: 248900,
    instrumentCount: 11,
    rows: [],
    change: { delta: 4800, priceEffect: 4930, quantityEffect: -130 },
    departed: [],
  };

  it('should state the month\'s value and attribute the change to prices and quantities', () => {
    expect(plain(describeMonthBreakdown(breakdown))).toBe('A luglio 2026 il portafoglio valeva 248.900 € su 11 strumenti: +4800 € su giugno, di cui +4930 € dai prezzi e −130 € dalle quantità (acquisti, vendite e versamenti).');
    // A flow is neither a gain nor a loss: the quantity effect carries its sign in the text, never a colour.
    const quantity = describeMonthBreakdown(breakdown)!.find((s) => s.text.replace(/\u00a0/g, ' ') === '−130 €');
    expect(quantity).toMatchObject({ mono: true });
    expect(quantity?.sign).toBeUndefined();
    // A printed zero has neither sign nor colour.
    const zero = describeMonthBreakdown({ ...breakdown, change: { delta: 4930, priceEffect: 4930, quantityEffect: 0 } })!;
    expect(plain(zero)).toContain('e 0 € dalle quantità');
    expect(plain(describeMonthBreakdown({ ...breakdown, change: { delta: 4930.2, priceEffect: 4930.4, quantityEffect: -0.2 } }))).toContain('e 0 € dalle quantità');
  });

  it('should name the previous month with its year when it differs, and use «ad» before a vowel', () => {
    const b = { ...breakdown, month: { key: '2026-1', year: 2026, month: 1, label: 'Gennaio 2026' }, previous: { key: '2025-12', year: 2025, month: 12, label: 'Dicembre 2025' } };
    expect(plain(describeMonthBreakdown(b))).toContain('A gennaio 2026 il portafoglio valeva 248.900 € su 11 strumenti: +4800 € su dicembre 2025,');
    const aug = { ...breakdown, month: { key: '2026-8', year: 2026, month: 8, label: 'Agosto 2026' } };
    expect(plain(describeMonthBreakdown(aug))).toContain('Ad agosto 2026 il portafoglio');
  });

  it('should name the previous month for the Δ column and read an absent selection', () => {
    expect(describePreviousMonthShort(breakdown)).toBe('giu');
    expect(describePreviousMonthShort({ ...breakdown, previous: { key: '2025-12', year: 2025, month: 12, label: 'Dicembre 2025' } })).toBe('dic 2025');
    expect(describePreviousMonthShort({ ...breakdown, previous: null })).toBeNull();
    expect(describePreviousMonthShort(null)).toBeNull();
    expect(plain(describeEmptySelection({ year: 2026, month: 8 }))).toBe("Nessuno degli strumenti selezionati è presente ad agosto 2026; l'andamento qui sotto li segue negli altri mesi.");
  });

  it('should say it is the first month with a breakdown when nothing precedes it', () => {
    expect(plain(describeMonthBreakdown({ ...breakdown, previous: null, change: null, instrumentCount: 1 }))).toBe('A luglio 2026 il portafoglio valeva 248.900 € su 1 strumento; è il primo mese con il dettaglio.');
    expect(describeMonthBreakdown(null)).toBeNull();
  });
});

describe('Dettaglio readings', () => {
  it('should name the best closed year and the running one', () => {
    const rows = [
      { year: '2024', variation: 29600, variationPercentage: 17.6 },
      { year: '2025', variation: 29700, variationPercentage: 15.0 },
      { year: '2026', variation: 21400, variationPercentage: 9.4 },
    ];
    expect(plain(describeYearlyVariation(rows, 2026))).toBe("Il 2025 è stato l'anno migliore (+29.700 €, +15,0%); il 2026 è a +21.400 € da gennaio.");
    expect(plain(describeYearlyVariation(rows.slice(0, 2), 2026))).toBe("Il 2025 è stato l'anno migliore (+29.700 €, +15,0%).");
    expect(plain(describeYearlyVariation(rows.slice(2), 2026))).toBe('Il 2026 è a +21.400 € da gennaio.');
    expect(plain(describeYearlyVariation([{ ...rows[2], baseline: { year: 2026, month: 3 } }], 2026))).toBe('Il 2026 è a +21.400 € da aprile.');
    expect(plain(describeYearlyVariation([{ year: '2024', variation: -2000, variationPercentage: -1.5 }], 2026))).toBe('Nessun anno chiuso in crescita; il peggiore è stato il 2024 (−2000 €).');
    expect(describeYearlyVariation([], 2026)).toBeNull();
  });

  it('should count the months with savings and the months the market took from', () => {
    const rows = [
      { year: 2026, month: 1, netSavings: 2200, investmentGrowth: 1100 },
      { year: 2026, month: 2, netSavings: 1900, investmentGrowth: -1400 },
      { year: 2026, month: 3, netSavings: 0, investmentGrowth: 2600 },
      { year: 2026, month: 4, netSavings: 2100, investmentGrowth: -800 },
    ];
    expect(plain(describeMonthlyDrivers(rows))).toBe('Hai risparmiato in 3 mesi su 4; il mercato ha tolto in 2 mesi, al massimo −1400 € a febbraio 2026.');
    expect(plain(describeMonthlyDrivers(rows.map((r) => ({ ...r, netSavings: 100, investmentGrowth: 5 }))))).toBe('Il risparmio non è mai mancato (4 mesi su 4); il mercato non ha mai tolto.');
    expect(describeMonthlyDrivers([])).toBeNull();
  });

  const LABOR = {
    startYear: 2025,
    since: { year: 2025, month: 1 },
    until: { year: 2026, month: 6 },
    totalLaborIncome: 78400,
    totalSavedFromWork: 36900,
    totalExpensesSum: -41500,
    otherIncome: 6500,
    otherIncomeByCategory: [
      { categoryId: 'd', name: 'Dividendi', amount: 4100 },
      { categoryId: 'a', name: 'Affitti', amount: 2400 },
    ],
    netWorthGrowth: 57600,
    totalInvestmentGrowthGross: 14200,
    totalInvestmentGrowthNet: 11900,
    coverage: 78400 / 41500,
  };

  it('should lead the labor recap with the coverage, then the two amounts and the market', () => {
    expect(plain(describeLabor(LABOR))).toBe('Da gennaio 2025 a giugno 2026 il lavoro ha coperto il 189% delle spese: 78.400 € guadagnati lavorando contro 41.500 € spesi; il mercato ha aggiunto 14.200 €.');
    expect(plain(describeLabor({ ...LABOR, totalInvestmentGrowthGross: -3000, totalInvestmentGrowthNet: -3000 }))).toBe('Da gennaio 2025 a giugno 2026 il lavoro ha coperto il 189% delle spese: 78.400 € guadagnati lavorando contro 41.500 € spesi; il mercato ha tolto 3000 €.');
    // No ratio without both sides: the sentence names what is missing instead.
    expect(plain(describeLabor({ ...LABOR, totalExpensesSum: 0, totalSavedFromWork: 78400, coverage: null }))).toBe('Da gennaio 2025 a giugno 2026 hai guadagnato 78.400 € lavorando e non risulta nessuna spesa; il mercato ha aggiunto 14.200 €.');
    expect(plain(describeLabor({ ...LABOR, totalLaborIncome: 0, totalSavedFromWork: -41500, coverage: null }))).toBe('Da gennaio 2025 a giugno 2026 non risulta reddito nelle categorie «reddito da lavoro» e hai speso 41.500 €; il mercato ha aggiunto 14.200 €.');
  });

  it('should name the recap window by its months, the closing month always said', () => {
    expect(describeLaborWindow(LABOR)).toBe('Da gennaio 2025 a giugno 2026');
    expect(describeLaborWindow({ since: { year: 2026, month: 1 }, until: { year: 2026, month: 8 } })).toBe('Da gennaio ad agosto 2026');
    expect(describeLaborWindow({ since: { year: 2026, month: 8 }, until: { year: 2026, month: 8 } })).toBe('Ad agosto 2026');
  });

  it('should caption the other income by category, three named, and say when there is none', () => {
    // A caption is a plain string, so the no-break space before € is flattened here, as `plain` does for a Narrative.
    const flat = (text: string) => text.replace(/ /g, ' ');
    expect(flat(describeOtherIncome(LABOR.otherIncomeByCategory))).toBe('Dividendi 4100 € · Affitti 2400 €');
    const five = ['A', 'B', 'C', 'D', 'E'].map((name, i) => ({ categoryId: name, name, amount: 500 - i }));
    expect(flat(describeOtherIncome(five))).toBe('A 500 € · B 499 € · C 498 € e altre 2');
    expect(flat(describeOtherIncome(five.slice(0, 4)))).toBe("A 500 € · B 499 € · C 498 € e un'altra");
    expect(describeOtherIncome([])).toBe('nessuna entrata fuori dalle categorie «reddito da lavoro»');
  });

  it('should put the estimated taxes in a footer sentence, and none when nothing is estimated', () => {
    expect(plain(describeLaborTaxes(LABOR))).toBe('Al netto di 2300 € di tasse stimate sulle plusvalenze latenti, il mercato vale +11.900 €.');
    // Taxes are estimated on every latent gain, so a positive gross can be a negative net: the minus is in the figure.
    expect(plain(describeLaborTaxes({ totalInvestmentGrowthGross: 1200, totalInvestmentGrowthNet: -300 }))).toBe('Al netto di 1500 € di tasse stimate sulle plusvalenze latenti, il mercato vale −300 €.');
    expect(describeLaborTaxes({ totalInvestmentGrowthGross: 1200, totalInvestmentGrowthNet: 1200 })).toBeNull();
  });

  it('should count the notes', () => {
    expect(plain(describeNotes(4, 83, { year: 2025, month: 2 }))).toBe("4 note su 83 rilevazioni; l'ultima a febbraio 2025.");
    expect(plain(describeNotes(1, 83, { year: 2024, month: 3 }))).toBe('Una nota su 83 rilevazioni, a marzo 2024.');
    expect(plain(describeNotes(0, 83, null))).toBe('Nessuna nota: segna qui un evento che spiega un salto del grafico.');
  });
});

describe('formatting helpers', () => {
  it('should spell durations in years and months', () => {
    expect(formatDurationLong(37)).toBe('3 anni e 1 mese');
    expect(formatDurationLong(12)).toBe('1 anno');
    expect(formatDurationLong(24)).toBe('2 anni');
    expect(formatDurationLong(5)).toBe('5 mesi');
    expect(formatDurationLong(1)).toBe('1 mese');
    expect(formatDurationLong(18)).toBe('1 anno e 6 mesi');
    expect(formatDurationLong(0)).toBe('meno di un mese');
    expect(formatDurationShort(37)).toBe('3a 1m');
    expect(formatDurationShort(24)).toBe('2a');
    expect(formatDurationShort(5)).toBe('5m');
  });

  it('should print a period month in Italian and the header window', () => {
    expect(formatPeriodMonth({ year: 2022, month: 10 })).toBe('ottobre 2022');
    expect(describeStoricoHeader(GROWTH)).toBe('dal set 2019 · 83 rilevazioni');
    expect(describeStoricoHeader({ ...GROWTH, snapshotCount: 1 })).toBe('set 2019 · 1 rilevazione');
    expect(describeStoricoHeader(null)).toBeUndefined();
    expect(describeEvolutionAside(GROWTH)).toBe('set 2019 → lug 2026');
  });
});
