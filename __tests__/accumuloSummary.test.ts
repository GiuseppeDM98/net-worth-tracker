/**
 * Tests for lib/utils/accumuloSummary.ts — the five states of the Accumulo tab's verdict (RV3, PT4)
 * and the clause the Bilanciamento verdict borrows (RV2).
 */
import { describe, it, expect } from 'vitest';
import { narrativeToText } from '@/lib/utils/narrative';
import {
  ACCUMULO_SECTION_IDS,
  buildAccumuloVerdict,
  resolveAccumuloSections,
  resolveAccumuloVerdictInput,
  selectAccumuloStrip,
  stepTrajectoryCursor,
  summarizePacMonth,
} from '@/lib/utils/accumuloSummary';
import { ACCUMULO_CLOSED_ASIDES, describeAccumuloClosedAnswers } from '@/lib/utils/accumulationNarrative';
import { formatStripFigure, validateStrip } from '@/lib/utils/verdictStrip';
import { VERDICT_REST_SECTION } from '@/lib/utils/mobileSections';
import type { ClassTrajectoryPoint } from '@/lib/utils/accumulationPlanUtils';
import type { AccumulationPlan, InstallmentLine } from '@/types/accumulationPlan';

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

const base = { currentIndex: 3, sourceCashEur: 36500, hasModel: false, lineStates: {}, draftTotalEur: 0, reentry: '' };

describe('buildAccumuloVerdict', () => {
  it('no plan, with and without a model', () => {
    const without = buildAccumuloVerdict({ ...base, plan: undefined });
    expect(without.headline).toBe('Nessun piano di accumulo aperto.');
    expect(without.tone).toBe('neutral');
    expect(flat(narrativeToText(without.sentence))).toBe('Nei conti di liquidità hai 36.500 €: un piano li spende in rate mensili verso i pesi che scegli.');
    const withModel = buildAccumuloVerdict({ ...base, plan: undefined, hasModel: true });
    expect(flat(narrativeToText(withModel.sentence))).toContain('verso il portafoglio modello');
  });

  it('draft', () => {
    const verdict = buildAccumuloVerdict({ ...base, plan: plan({ status: 'draft', startMonth: '2026-11' }), draftTotalEur: 38496 });
    expect(flat(verdict.headline)).toBe('Bozza pronta: 12 rate da 3208 € da novembre.');
    expect(narrativeToText(verdict.sentence)).toBe('Attivala per fissare il calendario.');
    expect(verdict.tone).toBe('neutral');
  });

  it('active, one executed and one to confirm', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 800), line('c', 700), line('d', 634)]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p, lineStates: { '3:b': 'toConfirm' } });
    expect(flat(verdict.headline)).toBe('Rata di ottobre: 3134 € in 4 acquisti, 1 registrato e 1 da confermare.');
    expect(flat(narrativeToText(verdict.sentence))).toMatch(/^Rata 3 di 12, investiti finora .* su .*\.$/);
    expect(verdict.tone).toBe('neutral');
  });

  it('active, everything registered closes the month in the positive tone', () => {
    const p = activePlan([line('a', 1000, 'executed'), line('b', 2134, 'executed')]);
    const verdict = buildAccumuloVerdict({ ...base, plan: p });
    expect(flat(verdict.headline)).toBe('Rata di ottobre: 3134 € in 2 acquisti, tutti registrati.');
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
    const p = activePlan([line('a', 1000), line('b', 800), line('c', 700), line('d', 634)]);
    expect(summarizePacMonth(p, 3)).toEqual({ monthTotalEur: 3134, instrumentCount: 4, monthLabel: 'ottobre', allClosed: false });
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

describe('stepTrajectoryCursor (PT6)', () => {
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
  equity: { currentPct: 63.3, targetPct: 60, outOfBand: true },
  bonds: { currentPct: 27.4, targetPct: 30, outOfBand: true },
  cash: { currentPct: 9.3, targetPct: 10, outOfBand: false },
});

function activeInput(reentry = 'Nella banda: Azioni da novembre.') {
  const p = activePlan([line('a', 1000, 'executed'), line('b', 2134)]);
  return resolveAccumuloVerdictInput({ ...base, plan: p, reentry });
}

describe('selectAccumuloStrip', () => {
  it('should read the figures the verdict prints: the installment and the invested amount', () => {
    const input = activeInput();
    const verdict = buildAccumuloVerdict({ ...base, plan: activePlan([line('a', 1000, 'executed'), line('b', 2134)]), reentry: 'Nella banda: Azioni da novembre.' });
    const [rata, investito] = selectAccumuloStrip({ verdictInput: input, trajectory: OUT_OF_BAND, currentIndex: 3 });

    expect(rata.label).toBe('Rata di ottobre');
    expect(flat(formatStripFigure(rata)!.text)).toBe('3134 €');
    expect(flat(verdict.headline)).toContain('3134 €');
    expect(investito.label).toBe('Investito');
    expect(flat(narrativeToText(verdict.sentence))).toContain(`investiti finora ${flat(formatStripFigure(investito)!.text)} su`);
  });

  it('should name the class farthest out of its band at the cursor month, in points, neutral', () => {
    const cells = selectAccumuloStrip({ verdictInput: activeInput(), trajectory: OUT_OF_BAND, currentIndex: 3 });
    const farthest = cells[2];

    expect(farthest.label).toBe('Azioni sopra');
    expect(flat(formatStripFigure(farthest)!.text)).toBe('3,3 pp');
    expect(farthest.tone).toBe('neutral');
  });

  it('should say «tutte in soglia» when every class is inside its band', () => {
    const inside = trajectoryWith({ equity: { currentPct: 60.4, targetPct: 60, outOfBand: false }, bonds: { currentPct: 29.6, targetPct: 30, outOfBand: false } });
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
    const draft = resolveAccumuloVerdictInput({ ...base, plan: plan({ status: 'draft' }), draftTotalEur: 38496 });
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
});
