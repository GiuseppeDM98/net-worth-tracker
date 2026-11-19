/**
 * Tests for lib/utils/accumuloSummary.ts — the five states of the Accumulo tab's verdict
 * and the clause the Bilanciamento verdict borrows.
 */
import { describe, it, expect } from 'vitest';
import { narrativeToText } from '@/lib/utils/narrative';
import {
  ACCUMULO_SECTION_IDS,
  buildAccumuloVerdict,
  resolveAccumuloSections,
  resolveAccumuloVerdictInput,
  selectAccumuloStrip,
  listSaleSteps,
  stepTrajectoryCursor,
  summarizeDraftTotal,
  summarizePacMonth,
  summarizeBuyingInstalments,
  listRefillSaleMonths,
} from '@/lib/utils/accumuloSummary';
import { ACCUMULO_CLOSED_ASIDES, describeAccumuloClosedAnswers } from '@/lib/utils/accumulationNarrative';
import { formatStripFigure, validateStrip } from '@/lib/utils/verdictStrip';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import type { ClassTrajectoryPoint, PlanDeps } from '@/lib/utils/accumulationPlanUtils';
import type { AccumulationPlan, InstallmentLine, PlanDisposal } from '@/types/accumulationPlan';
import type { Asset } from '@/types/assets';
import { unitPriceEur } from '@/lib/utils/costBasisEur';

const flat = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');

function line(positionId: string, amount: number, status: InstallmentLine['status'] = 'planned'): InstallmentLine {
  return { positionId, assetId: positionId, plannedQuantity: 10, priceEurAtPlan: amount / 10, plannedAmountEur: amount, status };
}

function plan(overrides: Partial<AccumulationPlan> = {}): AccumulationPlan {
  return {
    id: 'p',
    userId: 'u',
    name: 'Piano',
    status: 'active',
    startMonth: '2026-08',
    months: 12,
    liquidity: { sourceCashAssetIds: [], reserveEur: 0, monthlyInflowEur: 0 },
    positions: [],
    disposals: [],
    installments: [],
    createdAt: new Date('2026-07-01T12:00:00'),
    updatedAt: new Date('2026-07-01T12:00:00'),
    ...overrides,
  } as AccumulationPlan;
}

/** 12 installments from 2026-08; installment 3 (ottobre) has four lines. */
function activePlan(lines: InstallmentLine[]): AccumulationPlan {
  const installments = Array.from({ length: 12 }, (_, k) => ({
    index: k + 1,
    month: `2026-${String(8 + k > 12 ? 8 + k - 12 : 8 + k).padStart(2, '0')}` as `${number}-${number}`,
    lines: k + 1 === 3 ? lines : [line('a', 1000, 'executed')],
    carryInEur: {},
  }));
  return plan({ installments });
}

const base = { currentIndex: 3, sourceCashEur: 40000, reserveEur: 0, hasModel: false, lineStates: {}, draftTotalEur: 0, reentry: '', today: new Date('2026-11-12T12:00:00') };

describe('buildAccumuloVerdict', () => {
  it('no plan', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: undefined });
    expect(verdict.headline).toBe('Nessun piano di accumulo aperto.');
    expect(verdict.tone).toBe('neutral');
    expect(flat(narrativeToText(verdict.sentence))).toBe('Nei conti di liquidità hai 40.000 €: un piano li spende in rate mensili verso i pesi che scegli.');
  });

  it('no plan, with a saved model: the plan would spend toward it', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: undefined, hasModel: true });
    expect(flat(narrativeToText(verdict.sentence))).toBe('Nei conti di liquidità hai 40.000 €: un piano li spende in rate mensili verso il portafoglio modello.');
  });

  // The allocation's cash quota is not spendable (owner, 2026-11-17). Seen red with the gross cash printed.
  it("no plan, with the allocation's cash quota: what is beyond it", () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: undefined, reserveEur: 10000 });
    expect(flat(narrativeToText(verdict.sentence))).toBe(
      "Oltre la quota di liquidità dell'allocazione (10.000 €), nella liquidità hai 30.000 €: un piano li spende in rate mensili verso i pesi che scegli.",
    );
  });

  it('no plan, the cash within the quota: the inflows refill it first', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: undefined, sourceCashEur: 8000, reserveEur: 10000 });
    expect(flat(narrativeToText(verdict.sentence))).toBe(
      "Nella liquidità hai 8000 €, entro la quota dell'allocazione (10.000 €): le entrate mensili la riportano alla quota prima che un piano compri.",
    );
  });

  it('draft', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: plan({ status: 'draft', startMonth: '2026-11' }), draftTotalEur: 36000 });
    expect(flat(verdict.headline)).toBe('Bozza pronta: 12 rate da 3000 € da novembre.');
    expect(narrativeToText(verdict.sentence)).toBe('Attivala per fissare il calendario.');
    expect(verdict.tone).toBe('neutral');
  });

  it('active, one executed and one to confirm', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 800), line('c', 700), line('d', 500)]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p, lineStates: { '3:b': 'toConfirm' } });
    expect(flat(verdict.headline)).toBe('Rata di ottobre: 3000 € in 4 acquisti, 1 registrato e 1 da confermare.');
    expect(flat(narrativeToText(verdict.sentence))).toMatch(/^Rata 3 di 12, investiti finora .* su .*\.$/);
    expect(verdict.tone).toBe('neutral');
  });

  it('active, everything registered closes the month in the positive tone', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 2000, 'executed')]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p });
    expect(flat(verdict.headline)).toBe('Rata di ottobre: 3000 € in 2 acquisti, tutti registrati.');
    expect(verdict.tone).toBe('positive');
  });

  it('active, a late line adds «, 1 in ritardo» and warns', () => {
    const installments = activePlan([line('a', 1000)]).installments;
    installments[0] = { ...installments[0], lines: [line('z', 500)] };
    const verdict = buildAccumuloVerdict({ ...base, plan: plan({ installments }) });
    expect(verdict.headline).toContain(', 1 in ritardo.');
    expect(verdict.tone).toBe('warning');
  });

  it('appends the re-entry sentence', () => {
    const p = activePlan([line('a', 1000)]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p, reentry: 'Tutte le classi sono già in banda.' });
    expect(flat(narrativeToText(verdict.sentence))).toMatch(/\. Tutte le classi sono già in banda\.$/);
  });

  it('done', () => {
    const p = activePlan([line('a', 1000, 'executed')]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p, currentIndex: 14 });
    expect(verdict.headline).toMatch(/^Piano concluso: investiti .* su .*\.$/);
    expect(verdict.tone).toBe('positive');
    expect(narrativeToText(verdict.sentence)).toBe('Chiudilo per aprirne un altro.');
  });
});

describe('summarizePacMonth', () => {
  it('sums the open installment and counts its positions', () => {
    const p = activePlan([line('a', 1000), line('b', 800), line('c', 700), line('d', 500)]);
    expect(summarizePacMonth(p, 3)).toEqual({ monthTotalEur: 3000, instrumentCount: 4, monthLabel: 'ottobre', allClosed: false });
  });

  it('skipped lines do not count, a closed month says so', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 800, 'skipped')]);
    expect(summarizePacMonth(p, 3)).toEqual({ monthTotalEur: 1000, instrumentCount: 1, monthLabel: 'ottobre', allClosed: true });
  });

  it('is null without an active plan', () => {
    expect(summarizePacMonth(undefined, 3)).toBeNull();
    expect(summarizePacMonth(plan({ status: 'draft' }), 1)).toBeNull();
  });
});

describe('stepTrajectoryCursor', () => {
  it('moves one month with the arrows and stops at 0 and N', () => {
    expect(stepTrajectoryCursor(3, 'ArrowRight', 13)).toBe(4);
    expect(stepTrajectoryCursor(3, 'ArrowLeft', 13)).toBe(2);
    expect(stepTrajectoryCursor(0, 'ArrowLeft', 13)).toBe(0);
    expect(stepTrajectoryCursor(12, 'ArrowRight', 13)).toBe(12);
    expect(stepTrajectoryCursor(5, 'Home', 13)).toBe(0);
    expect(stepTrajectoryCursor(5, 'End', 13)).toBe(12);
  });

  it('ignores any other key', () => {
    expect(stepTrajectoryCursor(3, 'a', 13)).toBeNull();
  });
});

// ─── The phone composition (2026-10-18) ───────────────────────────────────────

/** The trajectory of an active plan: today at `index`, one projected point after. */
function trajectoryWith(rows: Record<string, { currentPct: number; targetPct: number; outOfBand: boolean }>): ClassTrajectoryPoint[] {
  const byClass = Object.fromEntries(Object.entries(rows).map(([key, row]) => [key, { ...row, driftPp: row.currentPct - row.targetPct }]));
  return [
    { index: 3, month: '2026-10', source: 'measured', byClass },
    { index: 4, month: '2026-11', source: 'projected', byClass: Object.fromEntries(Object.entries(byClass).map(([key, row]) => [key, { ...row, outOfBand: false }])) },
  ] as ClassTrajectoryPoint[];
}

const OUT_OF_BAND = trajectoryWith({
  equity: { currentPct: 64, targetPct: 60, outOfBand: true },
  bonds: { currentPct: 27, targetPct: 30, outOfBand: true },
  cash: { currentPct: 9, targetPct: 10, outOfBand: false },
});

function activeInput(reentry = 'Nella banda: Azioni da novembre.') {
  const p = activePlan([line('a', 1000, 'executed'), line('b', 2000)]);
  return resolveAccumuloVerdictInput({ ...base, plan: p, reentry });
}

describe('selectAccumuloStrip', () => {
  it('should read the figures the verdict prints: the installment and the invested amount', () => {
    const input = activeInput();
    const verdict = buildAccumuloVerdict({ ...base, plan: activePlan([line('a', 1000, 'executed'), line('b', 2000)]), reentry: 'Nella banda: Azioni da novembre.' });
    const [rata, investito] = selectAccumuloStrip({ verdictInput: input, trajectory: OUT_OF_BAND, currentIndex: 3 });

    expect(rata.label).toBe('Rata di ottobre');
    expect(flat(formatStripFigure(rata)!.text)).toBe('3000 €');
    expect(flat(verdict.headline)).toContain('3000 €');
    expect(investito.label).toBe('Investito');
    expect(flat(narrativeToText(verdict.sentence))).toContain(`investiti finora ${flat(formatStripFigure(investito)!.text)} su`);
  });

  it('should name the class farthest out of its band at the cursor month, in points, neutral', () => {
    const cells = selectAccumuloStrip({ verdictInput: activeInput(), trajectory: OUT_OF_BAND, currentIndex: 3 });
    const farthest = cells[2];

    expect(farthest.label).toBe('Azioni sopra');
    expect(flat(formatStripFigure(farthest)!.text)).toBe('4,0 pp');
    expect(farthest.tone).toBe('neutral');
  });

  it('should say «tutte in soglia» when every class is inside its band', () => {
    const inside = trajectoryWith({ equity: { currentPct: 60.5, targetPct: 60, outOfBand: false }, bonds: { currentPct: 29.5, targetPct: 30, outOfBand: false } });
    const cell = selectAccumuloStrip({ verdictInput: activeInput(), trajectory: inside, currentIndex: 3 })[2];

    expect(cell.value).toBeNull();
    expect(cell.reason).toBe('tutte in soglia');
  });

  it('should open three different sections: the tile, the chart row and the verdict rest', () => {
    const cells = selectAccumuloStrip({ verdictInput: activeInput(), trajectory: OUT_OF_BAND, currentIndex: 3 });

    expect(cells.map((cell) => cell.opens)).toEqual([ACCUMULO_SECTION_IDS.mese, ACCUMULO_SECTION_IDS.classi, VERDICT_REST_SECTION]);
    expect(validateStrip(cells, [...Object.values(ACCUMULO_SECTION_IDS), VERDICT_REST_SECTION])).toEqual([]);
    expect(cells.every((cell) => cell.lifts === undefined)).toBe(true);
  });

  it('should draw only the installment without a trajectory (nowhere for «Investito» to open)', () => {
    const cells = selectAccumuloStrip({ verdictInput: activeInput(''), trajectory: [], currentIndex: 3 });

    expect(cells.map((cell) => cell.label)).toEqual(['Rata di ottobre']);
  });

  it('should draw no cell outside the active state', () => {
    const none = resolveAccumuloVerdictInput({ ...base, plan: undefined });
    const draft = resolveAccumuloVerdictInput({ ...base, plan: plan({ status: 'draft' }), draftTotalEur: 36000 });
    const done = resolveAccumuloVerdictInput({ ...base, plan: activePlan([line('a', 1000, 'executed')]), currentIndex: 14 });

    for (const input of [none, draft, done]) expect(selectAccumuloStrip({ verdictInput: input, trajectory: OUT_OF_BAND, currentIndex: 3 })).toEqual([]);
  });
});

describe('the verdict of the active state below desktop:', () => {
  it('should cut after the first sentence and put the band re-entry behind «Il perché»', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: activePlan([line('a', 1000)]), reentry: 'Nella banda: Azioni da novembre.' });

    expect(verdict.leadLength).toBe(5);
    expect(verdict.restLabel).toBe('il rientro nella banda');
    expect(flat(narrativeToText(verdict.sentence.slice(0, verdict.leadLength)))).toMatch(/^Rata 3 di 12, investiti finora .* su .*\.$/);
  });

  it('should not cut a verdict with no re-entry sentence, nor a draft, a finished plan or the empty state', () => {
    const states = [
      buildAccumuloVerdict({ ...base, plan: activePlan([line('a', 1000)]) }),
      buildAccumuloVerdict({ ...base, plan: plan({ status: 'draft' }), draftTotalEur: 100 }),
      buildAccumuloVerdict({ ...base, plan: activePlan([line('a', 1000, 'executed')]), currentIndex: 14 }),
      buildAccumuloVerdict({ ...base, plan: undefined }),
    ];

    for (const verdict of states) expect(verdict.leadLength).toBeUndefined();
  });
});

describe('resolveAccumuloSections', () => {
  const ids = (input: Parameters<typeof resolveAccumuloSections>[0]) => resolveAccumuloSections(input).map((section) => section.id);

  it('should list the rows in the DOM order, the subset on the page', () => {
    expect(ids({ hasClasses: true, hasClosedPlans: true, modelFailed: false })).toEqual(['acc-modello', 'acc-classi', 'acc-criteri', 'acc-conclusi']);
    expect(ids({ hasClasses: false, hasClosedPlans: false, modelFailed: false })).toEqual(['acc-modello', 'acc-criteri']);
  });

  it('should flag the model row when its read failed, and no other', () => {
    const failed = resolveAccumuloSections({ hasClasses: true, hasClosedPlans: true, modelFailed: true });

    expect(failed.filter((section) => section.failed).map((section) => section.id)).toEqual(['acc-modello']);
  });

  it('should never put THE tile among the rows', () => {
    expect(ids({ hasClasses: true, hasClosedPlans: true, modelFailed: false })).not.toContain(ACCUMULO_SECTION_IDS.mese);
  });
});

describe('the closed rows words', () => {
  it('should say each aside in words, with no figure', () => {
    for (const aside of Object.values(ACCUMULO_CLOSED_ASIDES)) expect(aside).not.toMatch(/\d/);
  });

  it('should answer in the landscape index with at most one figure, or nothing', () => {
    const answers = describeAccumuloClosedAnswers({
      modelDifferenceCount: 3,
      classRows: [
        { outOfBandNow: true, reentryMonth: '2026-11' },
        { outOfBandNow: true, reentryMonth: '2027-01' },
      ],
      planStartMonth: '2026-08',
      criteriaCount: 2,
      lastClosedMonth: '2026-06',
    });
    const text = (id: string) => narrativeToText(answers[id] ?? []);

    expect(text('acc-modello')).toBe('differisce su 3 strumenti');
    expect(text('acc-classi')).toBe('rientro a gennaio');
    expect(text('acc-criteri')).toBe('2 criteri');
    expect(text('acc-conclusi')).toBe('ultimo a giugno');
  });

  it('should answer nothing where the row has nothing to add', () => {
    const answers = describeAccumuloClosedAnswers({ modelDifferenceCount: null, classRows: [{ outOfBandNow: true }], planStartMonth: null, criteriaCount: 0, lastClosedMonth: null });

    expect(Object.values(answers).every((answer) => answer === null)).toBe(true);
  });

  it('should say «allineato al piano» with no difference', () => {
    const answers = describeAccumuloClosedAnswers({ modelDifferenceCount: 0, classRows: [], planStartMonth: null, criteriaCount: 0, lastClosedMonth: null });

    expect(narrativeToText(answers['acc-modello'] ?? [])).toBe('allineato al piano');
  });

  // A stale model keeps its row's words («superato») in landscape too (2026-11-12). Seen red without the check.
  it('should answer nothing for a stale model, so the row reads «superato»', () => {
    const answers = describeAccumuloClosedAnswers({ modelDifferenceCount: 3, modelStale: true, classRows: [], planStartMonth: null, criteriaCount: 0, lastClosedMonth: null });

    expect(answers['acc-modello']).toBeNull();
  });
});

describe('a plan whose first month is in the future (2026-11-12)', () => {
  /** An active plan of 6 instalments from `startMonth`; the first buys 500 € of «a» and `b` € of «b», «c» at 0 shares. */
  function scheduled(startMonth: string, b = 250): AccumulationPlan {
    const first = [line('a', 500), line('b', b), { ...line('c', 0), plannedQuantity: 0 }];
    return plan({ startMonth, months: 6, installments: [{ index: 1, month: startMonth, lines: first, carryInEur: {} }] });
  }

  // Seen red returning `active` for index 0: the headline read «Rata di aprile…».
  it('index 0 is the scheduled state, the first instalment in cents', () => {
    expect(resolveAccumuloVerdictInput({ ...base, plan: scheduled('2027-04', 250.5), currentIndex: 0 })).toEqual({
      state: 'scheduled', startMonth: '2027-04', firstMonth: '2027-04', months: 6, lineCount: 2, firstInstalmentEur: 750.5, todayYear: 2026,
    });
  });

  it('names the month with its preposition, the year only when it is not this year', () => {
    const later = buildAccumuloVerdict({ ...base, plan: scheduled('2027-04'), currentIndex: 0 });
    expect(flat(later.headline)).toBe('Il piano parte ad aprile 2027: prima rata di 750 € in 2 acquisti.');
    expect(narrativeToText(later.sentence)).toBe('6 rate; fino ad allora non c’è nulla da comprare.');
    expect(later.tone).toBe('neutral');
    expect(later.leadLength).toBeUndefined();
    const soon = buildAccumuloVerdict({ ...base, plan: scheduled('2026-12'), currentIndex: 0 });
    expect(flat(soon.headline)).toBe('Il piano parte a dicembre: prima rata di 750 € in 2 acquisti.');
  });

  it('draws no strip', () => {
    const verdictInput = resolveAccumuloVerdictInput({ ...base, plan: scheduled('2027-04'), currentIndex: 0 });
    expect(selectAccumuloStrip({ verdictInput, trajectory: [], currentIndex: 0 })).toEqual([]);
  });
});

// The months whose inflows refill the reserve buy nothing (owner, 2026-11-17): the verdict says so and
// names the first instalment; a draft counts only the months that buy. Seen red reading «0 € in 0 acquisti».
describe('the refill months', () => {
  const months = (spec: Array<InstallmentLine[]>) =>
    spec.map((lines, k) => ({ index: k + 1, month: `2027-0${k + 1}` as `${number}-${number}`, lines, carryInEur: {} }));
  const refilling = plan({
    startMonth: '2027-01', months: 4,
    liquidity: { sourceCashAssetIds: ['c'], reserveEur: 10000, monthlyInflowEur: 1000 },
    baseline: { capturedAt: new Date(0), positionValuesEur: {}, pricesEur: {}, sourceCashEur: 8000 } as never,
    installments: months([[], [], [line('a', 1000)], [line('a', 1000)]]),
  });
  const january = new Date('2027-01-12T12:00:00');

  it('an empty month while the reserve refills', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: refilling, currentIndex: 1, today: january });
    expect(flat(verdict.headline)).toBe('A gennaio le entrate riportano la liquidità alla riserva: la prima rata è a marzo.');
    expect(flat(narrativeToText(verdict.sentence))).toBe('Rata 1 di 4: fino ad allora non c’è nulla da comprare.');
    expect(verdict.tone).toBe('neutral');
  });

  it('an empty month for another reason names the next instalment', () => {
    const noRefill = plan({ ...refilling, baseline: { capturedAt: new Date(0), positionValuesEur: {}, pricesEur: {}, sourceCashEur: 20000 } as never });
    const verdict = buildAccumuloVerdict({ ...base, plan: noRefill, currentIndex: 2, today: january });
    expect(flat(verdict.headline)).toBe('Niente da comprare a febbraio: la prossima rata è a marzo.');
  });

  it('a plan before its start names the first month that buys', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: refilling, currentIndex: 0, today: new Date('2026-11-12T12:00:00') });
    expect(flat(verdict.headline)).toBe('Il piano parte a gennaio 2027: prima rata di 1000 € in 1 acquisto, a marzo 2027.');
  });

  it('a draft spreads its total over the months that buy, from the first of them', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: plan({ status: 'draft', startMonth: '2027-01', months: 12 }), draftTotalEur: 10000, draftRefillMonths: 2 });
    expect(flat(verdict.headline)).toBe('Bozza pronta: 10 rate da 1000 € da marzo.');
  });
});

// The verdict reads the whole cash class against the quota (owner, 2026-11-17): the accounts plus a
// money-market fund. Seen red printing the accounts alone against the quota.
describe('no plan, cash held outside the accounts', () => {
  it('names the whole cash class against the quota', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: undefined, sourceCashEur: 9000, reserveEur: 29000, otherCashEur: 21000 });
    expect(flat(narrativeToText(verdict.sentence))).toBe(
      "Nella liquidità hai 30.000 €, entro la quota dell'allocazione (50.000 €): le entrate mensili la riportano alla quota prima che un piano compri.",
    );
  });
  it('beyond the quota', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: undefined, sourceCashEur: 30000, reserveEur: 29000, otherCashEur: 21000 });
    expect(flat(narrativeToText(verdict.sentence))).toBe(
      "Oltre la quota di liquidità dell'allocazione (50.000 €), nella liquidità hai 1000 €: un piano li spende in rate mensili verso i pesi che scegli.",
    );
  });
});

﻿// A later sale makes the instalments differ (2026-11-19): the draft names its first one, and one sentence per
// month a sale raises the instalment. Invented figures: 12 months from 2027-01, 500 € a month, 1.200 € above
// the reserve, 2.400 € sold in month 1 and 6.000 € in month 7 → six instalments of 800 €, then six of 1.800 €.
describe('a draft with a later sale', () => {
  const deps: PlanDeps = { valueOf: (a) => a.quantity * unitPriceEur(a), priceOf: (a) => unitPriceEur(a) };
  const asset = (id: string, extra: Partial<Asset>): Asset =>
    ({ id, userId: 'u', ticker: id, name: id, type: 'etf', assetClass: 'equity', currency: 'EUR', quantity: 0, currentPrice: 1,
      lastPriceUpdate: new Date(0), createdAt: new Date(0), updatedAt: new Date(0), ...extra }) as Asset;
  const assets = [asset('conto', { type: 'cash', assetClass: 'cash', quantity: 1, currentPrice: 11200 }), asset('etf-uno', {})];
  const sales: PlanDisposal[] = [
    { assetId: 'fondo-x', estimatedProceedsEur: 2400, status: 'planned' },
    { assetId: 'fondo-y', monthIndex: 7, estimatedProceedsEur: 6000, status: 'planned' },
  ];
  const draftPlan = (disposals: PlanDisposal[]) => plan({
    status: 'draft', startMonth: '2027-01', months: 12, disposals,
    liquidity: { sourceCashAssetIds: ['conto'], reserveEur: 10000, monthlyInflowEur: 500 },
    positions: [{ id: 'p1', label: 'ETF-UNO', targetPercentage: 100, memberAssetIds: ['etf-uno'], buyAssetId: 'etf-uno' }],
  });

  // Mutation that turns it red: `firstEur` read from the even division.
  it('names the first instalment; without a later sale the headline is the even one', () => {
    const summary = summarizeDraftTotal(draftPlan(sales), assets, deps);
    expect(summary.firstEur).toBeCloseTo(800, 6);
    const verdict = buildAccumuloVerdict({ ...base, plan: draftPlan(sales), draftTotalEur: summary.totalEur, draftRefillMonths: summary.refillMonths, draftFirstEur: summary.firstEur });
    expect(flat(verdict.headline)).toBe('Bozza pronta: 12 rate da gennaio, la prima di 800 €.');

    const even = summarizeDraftTotal(draftPlan([sales[0]]), assets, deps);
    expect(even.firstEur).toBeNull();
    const evenVerdict = buildAccumuloVerdict({ ...base, plan: draftPlan([sales[0]]), draftTotalEur: even.totalEur, draftRefillMonths: even.refillMonths, draftFirstEur: even.firstEur });
    expect(flat(evenVerdict.headline)).toBe('Bozza pronta: 12 rate da 800 € da gennaio.');
  });

  const instalments = (euros: number[], firstIndex = 1) =>
    euros.map((eur, k) => ({
      index: firstIndex + k,
      month: `2027-${String(firstIndex + k).padStart(2, '0')}` as `${number}-${number}`,
      lines: eur > 0 ? [line('p1', eur)] : [],
      carryInEur: {},
    }));
  const nameOf = (id: string) => ({ 'fondo-x': 'Fondo X', 'fondo-y': 'Fondo Y', 'fondo-z': 'Fondo Z' } as Record<string, string>)[id] ?? id;
  const STEPPED = [800, 800, 800, 800, 800, 800, 1800, 1800, 1800, 1800, 1800, 1800];

  // Mutation that turns it red: every open sale's month listed.
  it('listSaleSteps: one entry per month a later sale raises the instalment', () => {
    const both: PlanDisposal[] = [...sales, { assetId: 'fondo-z', monthIndex: 7, estimatedProceedsEur: 100, status: 'planned' }];
    expect(listSaleSteps({ installments: instalments(STEPPED), disposals: both, firstIndex: 1, nameOf })).toEqual([
      { month: '2027-07', instalmentEur: 1800, names: ['Fondo Y', 'Fondo Z'] },
    ]);
    // A revision from the 4th instalment: installments[0] is plan month 4.
    expect(listSaleSteps({ installments: instalments(STEPPED.slice(3), 4), disposals: sales, firstIndex: 4, nameOf })).toEqual([
      { month: '2027-07', instalmentEur: 1800, names: ['Fondo Y'] },
    ]);
  });

  it('listSaleSteps: no entry for a sale the refill took whole, a month-1 sale or a closed one', () => {
    expect(listSaleSteps({ installments: instalments(new Array(12).fill(0)), disposals: sales, firstIndex: 1, nameOf })).toEqual([]);
    expect(listSaleSteps({ installments: instalments(new Array(12).fill(800)), disposals: [sales[0]], firstIndex: 1, nameOf })).toEqual([]);
    expect(listSaleSteps({ installments: instalments(STEPPED), disposals: [{ ...sales[1], status: 'skipped' }], firstIndex: 1, nameOf })).toEqual([]);
  });
});

﻿
// The step 3 reading and the side panel count the months that buy (owner, 2026-11-19), and the reserve note names
// the sales that refill it with the inflows.
describe('the months that buy, after a refill', () => {
  const months = (euros: number[], firstIndex = 1) =>
    euros.map((eur, k) => ({
      index: firstIndex + k,
      month: `2027-${String(firstIndex + k).padStart(2, '0')}` as `${number}-${number}`,
      lines: eur > 0 ? [{ positionId: 'p1', assetId: 'p1', plannedQuantity: 1, priceEurAtPlan: eur, plannedAmountEur: eur, status: 'planned' as const }] : [],
      carryInEur: {},
    }));

  // Mutation that turns it red: the average over every month, the zeros included.
  it('summarizeBuyingInstalments: count, first and average over the months that buy', () => {
    expect(summarizeBuyingInstalments(months([0, 0, 1500, 1000, 1000, 1500]), 2)).toEqual({
      count: 4, firstEur: 1500, firstMonth: '2027-03', averageEur: 1250,
    });
    expect(summarizeBuyingInstalments(months([0, 0, 0]), 3)).toBeNull();
  });

  // Mutation that turns it red: a sale after the first buying month listed.
  it('listRefillSaleMonths: the open sales that land by the first month that buys', () => {
    const disposals: PlanDisposal[] = [
      { assetId: 'a', monthIndex: 1, estimatedProceedsEur: 100, status: 'planned' },
      { assetId: 'b', monthIndex: 3, estimatedProceedsEur: 9000, status: 'planned' },
      { assetId: 'c', monthIndex: 3, estimatedProceedsEur: 500, status: 'planned' },
      { assetId: 'd', monthIndex: 5, estimatedProceedsEur: 800, status: 'planned' },
      { assetId: 'e', monthIndex: 2, estimatedProceedsEur: 800, status: 'skipped' },
    ];
    expect(listRefillSaleMonths({ disposals, startMonth: '2027-01', firstIndex: 1, refillMonths: 2 })).toEqual(['2027-03', '2027-03']);
    expect(listRefillSaleMonths({ disposals, startMonth: '2027-01', firstIndex: 1, refillMonths: 0 })).toEqual([]);
    // A revision from the 3rd instalment: plan month 5 is the first that buys after two refill months.
    expect(listRefillSaleMonths({ disposals, startMonth: '2027-01', firstIndex: 3, refillMonths: 2 })).toEqual(['2027-05']);
  });
});
