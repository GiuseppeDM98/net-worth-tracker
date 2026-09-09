/**
 * Tests for lib/utils/whatIfNarrative.ts — the words of FIRE › What If: the verdict that answers
 * «cosa cambia se…?» with its tone taken from the delta, and the reading line of every tile.
 *
 * Same mocking as the other `*Narrative.test.ts`: chartService's it-IT percentage formatter
 * drags the Firebase chain in, which is mocked away. Every phrasing is pinned here; a missing
 * input drops its clause instead of printing a placeholder (The Narrative Honesty Rule), and an
 * unchanged figure is said unchanged rather than dressed as a delta.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteField: vi.fn(),
}));

import {
  buildDeltaRows,
  buildWhatIfVerdict,
  describeBeforeAfter,
  describeBeforeAfterAside,
  describeBeforeAfterFooter,
  describeDelta,
  describeDeltaFooter,
  describeEvent,
  describeEventFooter,
  describeSensitivity,
  SENSITIVITY_ASIDE,
  SENSITIVITY_FOOTER,
} from '@/lib/utils/whatIfNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';
import type { MetricPair, SensitivityReading, WhatIfDivergence, WhatIfEvent, WhatIfSummary, WhatIfTimeline } from '@/lib/utils/whatIfSummary';

/** Flattens the no-break space `Intl` puts before € so expectations read like the screen. */
const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');

const pair = (before: number, after: number): MetricPair => ({ before, after, delta: after - before });

function makeTimeline(overrides: Partial<WhatIfTimeline> = {}): WhatIfTimeline {
  return {
    yearsBefore: 7,
    yearsAfter: 8,
    calendarBefore: 2033,
    calendarAfter: 2034,
    deltaYears: 1,
    reachedBefore: false,
    reachedAfter: false,
    horizonYears: 50,
    horizonCalendarYear: 2076,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<WhatIfSummary> = {}): WhatIfSummary {
  return {
    timeline: makeTimeline(),
    netWorth: pair(412_500, 380_700),
    fireNumber: pair(690_000, 690_000),
    progressPct: pair(59.78, 55.17),
    monthlyIncome: pair(1_375, 1_269),
    coast: { numberToday: pair(428_000, 428_000), gap: pair(15_500, 47_300), reachedBefore: false, reachedAfter: false, retirementAge: 60 },
    isBridge: false,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<WhatIfEvent> = {}): WhatIfEvent {
  return {
    kind: 'jobLoss',
    isEmpty: false,
    months: 12,
    lostAnnualIncome: 31_800,
    lostShareOfIncomePct: 63.86,
    lumpSum: 0,
    savingsDelta: 0,
    expensesDelta: 0,
    netWorthDelta: -31_800,
    netWorthAfter: 380_700,
    savingsAfter: 22_200,
    expensesAfter: 27_600,
    ...overrides,
  };
}

const jobLossVerdict = () => buildWhatIfVerdict({ hasBaseline: true, event: makeEvent(), summary: makeSummary() });

describe('buildWhatIfVerdict', () => {
  it('should say the FIRE slips, name the event without its categories and give every delta with its bounds', () => {
    const verdict = jobLossVerdict();

    expect(verdict.headline).toBe('Il FIRE slitta di 1 anno.');
    expect(verdict.tone).toBe('negative');
    expect(plain(verdict.sentence)).toBe(
      "Con 12 mesi senza 31.800 € l'anno di entrate (il 64% del reddito) il patrimonio FIRE scende di 31.800 € (da 412.500 € a 380.700 €), il FIRE passa dal 2033 al 2034 e il reddito passivo sostenibile cala di 106 € al mese (da 1375 € a 1269 €). Sul Coast FIRE ti mancano 47.300 € invece di 15.500 €.",
    );
  });

  it('should colour the deltas by sign and leave the years and the bounds uncoloured', () => {
    const { sentence } = jobLossVerdict();
    const signed = sentence.filter((segment) => segment.sign);

    expect(signed.map((segment) => [segment.text.replace(/ /g, ' '), segment.sign])).toEqual([
      ['31.800 €', 'negative'],
      ['106 €', 'negative'],
    ]);
    expect(sentence.find((segment) => segment.text === '2034')?.sign).toBeUndefined();
  });

  it('should drop the income share when the household income is unknown and say «1 mese» in the singular', () => {
    const verdict = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent({ months: 1, lostShareOfIncomePct: null }), summary: makeSummary() });

    expect(plain(verdict.sentence)).toMatch(/^Con 1 mese senza 31\.800 € l'anno di entrate il patrimonio FIRE/);
  });

  it('should say the FIRE comes closer after a windfall, with the gain coloured and the Coast target crossed', () => {
    const verdict = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ kind: 'windfall', lumpSum: 50_000, netWorthDelta: 50_000, netWorthAfter: 462_500 }),
      summary: makeSummary({
        timeline: makeTimeline({ yearsAfter: 5, calendarAfter: 2031, deltaYears: -2 }),
        netWorth: pair(412_500, 462_500),
        monthlyIncome: pair(1_375, 1_542),
        coast: { numberToday: pair(428_000, 428_000), gap: pair(15_500, 0), reachedBefore: false, reachedAfter: true, retirementAge: 60 },
      }),
    });

    expect(verdict.headline).toBe('Il FIRE si avvicina di 2 anni.');
    expect(verdict.tone).toBe('positive');
    expect(plain(verdict.sentence)).toBe(
      "Con un'entrata una tantum di 50.000 € il patrimonio FIRE sale di 50.000 € (da 412.500 € a 462.500 €), il FIRE passa dal 2033 al 2031 e il reddito passivo sostenibile sale di 167 € al mese (da 1375 € a 1542 €). Sul Coast FIRE superi il numero di oggi (428.000 €).",
    );
    expect(verdict.sentence.find((segment) => segment.text.includes('50.000') && segment.sign)?.sign).toBe('positive');
  });

  it('should name the FIRE number instead of the capital when only the cashflow changes', () => {
    const verdict = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ kind: 'cashflowChange', savingsDelta: -6_000, expensesDelta: 3_000, netWorthDelta: 0, netWorthAfter: 412_500, savingsAfter: 16_200, expensesAfter: 30_600 }),
      summary: makeSummary({
        timeline: makeTimeline({ yearsAfter: 9, calendarAfter: 2035, deltaYears: 2 }),
        netWorth: pair(412_500, 412_500),
        fireNumber: pair(690_000, 765_000),
        monthlyIncome: pair(1_375, 1_375),
        coast: { numberToday: pair(428_000, 474_500), gap: pair(15_500, 62_000), reachedBefore: false, reachedAfter: false, retirementAge: 60 },
      }),
    });

    expect(verdict.headline).toBe('Il FIRE slitta di 2 anni.');
    expect(plain(verdict.sentence)).toBe(
      "Con 6000 € l'anno di risparmio in meno e 3000 € di spese in più il numero FIRE sale di 75.000 € (da 690.000 € a 765.000 €) e il FIRE passa dal 2033 al 2035. Sul Coast FIRE il numero di oggi passa da 428.000 € a 474.500 € e ti mancano 62.000 € invece di 15.500 €.",
    );
    // A higher FIRE number is a loss.
    expect(verdict.sentence.find((segment) => segment.text.includes('75.000'))?.sign).toBe('negative');
  });

  it('should keep a neutral tone when the year does not move', () => {
    const verdict = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ months: 3, netWorthDelta: -7_950, netWorthAfter: 404_550 }),
      summary: makeSummary({ timeline: makeTimeline({ yearsAfter: 7, calendarAfter: 2033, deltaYears: 0 }), netWorth: pair(412_500, 404_550), monthlyIncome: pair(1_375, 1_349) }),
    });

    expect(verdict.headline).toBe('Il FIRE resta nel 2033.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toContain(', il FIRE resta nel 2033 e il reddito passivo');
  });

  it('should say the FIRE leaves the horizon, comes back into it, or stays beyond it', () => {
    const leaves = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent(), summary: makeSummary({ timeline: makeTimeline({ yearsAfter: null, calendarAfter: null, deltaYears: null }) }) });
    expect(leaves.headline).toBe("Il FIRE esce dall'orizzonte.");
    expect(leaves.tone).toBe('negative');
    expect(plain(leaves.sentence)).toContain(', il FIRE non arriva più entro il 2076 e ');

    const returns = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ kind: 'windfall', lumpSum: 200_000, netWorthDelta: 200_000, netWorthAfter: 612_500 }),
      summary: makeSummary({ timeline: makeTimeline({ yearsBefore: null, calendarBefore: null, yearsAfter: 34, calendarAfter: 2060, deltaYears: null }), netWorth: pair(412_500, 612_500), monthlyIncome: pair(1_375, 2_042) }),
    });
    expect(returns.headline).toBe("Il FIRE rientra nell'orizzonte.");
    expect(returns.tone).toBe('positive');
    expect(plain(returns.sentence)).toContain(', il FIRE arriva nel 2060 e ');

    const stays = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent(), summary: makeSummary({ timeline: makeTimeline({ yearsBefore: null, calendarBefore: null, yearsAfter: null, calendarAfter: null, deltaYears: null }) }) });
    expect(stays.headline).toBe('Il FIRE resta oltre i 50 anni.');
    expect(stays.tone).toBe('neutral');
    expect(plain(stays.sentence)).toContain(', il FIRE non arriva entro il 2076 né prima né dopo e ');
  });

  it('should handle a target already reached on either side', () => {
    const reached = makeTimeline({ yearsBefore: 0, calendarBefore: 2026, yearsAfter: 0, calendarAfter: 2026, deltaYears: 0, reachedBefore: true, reachedAfter: true });
    const keeps = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent(), summary: makeSummary({ timeline: reached, netWorth: pair(720_000, 688_200), monthlyIncome: pair(2_400, 2_294), fireNumber: pair(600_000, 600_000) }) });
    expect(keeps.headline).toBe("Resti FIRE anche dopo l'evento.");
    expect(keeps.tone).toBe('positive');
    expect(plain(keeps.sentence)).toContain(', resti sopra il numero FIRE di 600.000 € e ');

    const loses = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ kind: 'majorPurchase', lumpSum: 200_000, netWorthDelta: -200_000, netWorthAfter: 520_000 }),
      summary: makeSummary({ timeline: makeTimeline({ yearsBefore: 0, calendarBefore: 2026, reachedBefore: true, yearsAfter: 3, calendarAfter: 2029, deltaYears: 3 }), netWorth: pair(720_000, 520_000), fireNumber: pair(600_000, 600_000), monthlyIncome: pair(2_400, 1_733) }),
    });
    expect(loses.headline).toBe("L'evento ti toglie il FIRE.");
    expect(loses.tone).toBe('negative');
    expect(plain(loses.sentence)).toContain(', il FIRE tornerebbe nel 2029 e ');

    const losesForGood = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ kind: 'majorPurchase', lumpSum: 700_000, netWorthDelta: -700_000, netWorthAfter: 20_000 }),
      summary: makeSummary({ timeline: makeTimeline({ yearsBefore: 0, calendarBefore: 2026, reachedBefore: true, yearsAfter: null, calendarAfter: null, deltaYears: null }), netWorth: pair(720_000, 20_000), fireNumber: pair(600_000, 600_000), monthlyIncome: pair(2_400, 67) }),
    });
    expect(plain(losesForGood.sentence)).toContain(', il FIRE non tornerebbe entro il 2076 e ');

    const gains = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ kind: 'windfall', lumpSum: 300_000, netWorthDelta: 300_000, netWorthAfter: 712_500 }),
      summary: makeSummary({ timeline: makeTimeline({ yearsAfter: 0, calendarAfter: 2026, deltaYears: -7, reachedAfter: true }), netWorth: pair(412_500, 712_500), monthlyIncome: pair(1_375, 2_375) }),
    });
    expect(gains.headline).toBe("Con l'evento sei FIRE.");
    expect(gains.tone).toBe('positive');
    expect(plain(gains.sentence)).toContain(', superi il numero FIRE di 690.000 € già oggi e ');
  });

  it('should say when the Coast does not change, when it is kept and when it is lost', () => {
    const unchanged = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent({ kind: 'cashflowChange', savingsDelta: -6_000, netWorthDelta: 0, netWorthAfter: 412_500, savingsAfter: 16_200 }),
      summary: makeSummary({ netWorth: pair(412_500, 412_500), monthlyIncome: pair(1_375, 1_375), coast: { numberToday: pair(428_000, 428_000), gap: pair(15_500, 15_500), reachedBefore: false, reachedAfter: false, retirementAge: 60 } }),
    });
    expect(plain(unchanged.sentence)).toMatch(/ Il Coast FIRE non cambia\.$/);

    const kept = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent(),
      summary: makeSummary({ coast: { numberToday: pair(300_000, 300_000), gap: pair(0, 0), reachedBefore: true, reachedAfter: true, retirementAge: 60 } }),
    });
    expect(plain(kept.sentence)).toMatch(/ Resti sopra il numero Coast FIRE di oggi \(300\.000 €\)\.$/);

    const lost = buildWhatIfVerdict({
      hasBaseline: true,
      event: makeEvent(),
      summary: makeSummary({ coast: { numberToday: pair(400_000, 400_000), gap: pair(0, 20_000), reachedBefore: true, reachedAfter: false, retirementAge: 60 } }),
    });
    expect(plain(lost.sentence)).toMatch(/ Sul Coast FIRE perdi il traguardo: ti mancano 20\.000 €\.$/);
  });

  it('should drop the Coast sentence without a Coast configuration and name the bridge when it is on', () => {
    const noCoast = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent(), summary: makeSummary({ coast: null }) });
    expect(plain(noCoast.sentence)).toMatch(/\(da 1375 € a 1269 €\)\.$/);

    const bridged = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent(), summary: makeSummary({ coast: null, isBridge: true }) });
    expect(plain(bridged.sentence)).toMatch(/\. Numeri con il modello ponte: il fondo pensione rientra allo sblocco\.$/);
  });

  it('should ask for an event when the perturbation is empty, and say what the plan is today', () => {
    const empty = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent({ isEmpty: true, months: 0, netWorthDelta: 0 }), summary: makeSummary({ timeline: makeTimeline({ yearsAfter: 7, calendarAfter: 2033, deltaYears: 0 }) }) });
    expect(empty.headline).toBe('Nessun evento da simulare.');
    expect(empty.tone).toBe('neutral');
    expect(plain(empty.sentence)).toBe('Il piano resta quello di oggi: FIRE nel 2033. Scegli un evento e inserisci un importo.');

    const reached = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent({ isEmpty: true }), summary: makeSummary({ timeline: makeTimeline({ yearsBefore: 0, calendarBefore: 2026, reachedBefore: true, yearsAfter: 0, calendarAfter: 2026, reachedAfter: true, deltaYears: 0 }) }) });
    expect(plain(reached.sentence)).toBe('Il piano resta quello di oggi: sei già FIRE. Scegli un evento e inserisci un importo.');

    const beyond = buildWhatIfVerdict({ hasBaseline: true, event: makeEvent({ isEmpty: true }), summary: makeSummary({ timeline: makeTimeline({ yearsBefore: null, calendarBefore: null, yearsAfter: null, calendarAfter: null, deltaYears: null }) }) });
    expect(plain(beyond.sentence)).toBe('Il piano resta quello di oggi: FIRE oltre i 50 anni. Scegli un evento e inserisci un importo.');
  });

  it('should say what is missing when there is no baseline', () => {
    const verdict = buildWhatIfVerdict({ hasBaseline: false, event: null, summary: null });

    expect(verdict.headline).toBe('What If non calcolabile.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe("Servono un patrimonio FIRE positivo e spese registrate nel Cashflow: l'evento si applica al piano di oggi.");
  });
});

describe('describeBeforeAfter', () => {
  const divergence: WhatIfDivergence = { calendarYear: 2033, before: 854_600, after: 803_400, gapThen: -51_200 };

  it('should give both years and the two capitals at the FIRE year of today, with the compounded hit', () => {
    expect(plain(describeBeforeAfter(makeSummary(), divergence))).toBe(
      "Oggi il FIRE arriva nel 2033, dopo l'evento nel 2034. Nel 2033 il piano di oggi ha 854.600 €, quello dopo l'evento 803.400 €: i 31.800 € persi oggi sono 51.200 € di distanza allora.",
    );
  });

  it('should read a gain as an advantage and a cashflow-only change as a plain distance', () => {
    const gain = makeSummary({ timeline: makeTimeline({ yearsAfter: 5, calendarAfter: 2031, deltaYears: -2 }), netWorth: pair(412_500, 462_500) });
    expect(plain(describeBeforeAfter(gain, { calendarYear: 2033, before: 854_600, after: 935_000, gapThen: 80_400 }))).toBe(
      "Oggi il FIRE arriva nel 2033, dopo l'evento nel 2031. Nel 2033 il piano di oggi ha 854.600 €, quello dopo l'evento 935.000 €: i 50.000 € in più di oggi sono 80.400 € di vantaggio allora.",
    );

    const cashflow = makeSummary({ netWorth: pair(412_500, 412_500) });
    expect(plain(describeBeforeAfter(cashflow, { calendarYear: 2033, before: 854_600, after: 800_000, gapThen: -54_600 }))).toBe(
      "Oggi il FIRE arriva nel 2033, dopo l'evento nel 2034. Nel 2033 il piano di oggi ha 854.600 €, quello dopo l'evento 800.000 € (54.600 € di distanza).",
    );
  });

  it('should drop the divergence clause without one and phrase every timeline case', () => {
    expect(plain(describeBeforeAfter(makeSummary({ timeline: makeTimeline({ yearsAfter: 7, calendarAfter: 2033, deltaYears: 0 }) }), null))).toBe("Il FIRE resta nel 2033 anche dopo l'evento.");
    expect(plain(describeBeforeAfter(makeSummary({ timeline: makeTimeline({ yearsAfter: null, calendarAfter: null, deltaYears: null }) }), null))).toBe(
      "Oggi il FIRE arriva nel 2033; dopo l'evento non arriva entro il 2076.",
    );
    expect(plain(describeBeforeAfter(makeSummary({ timeline: makeTimeline({ yearsBefore: null, calendarBefore: null, yearsAfter: 34, calendarAfter: 2060, deltaYears: null }) }), null))).toBe(
      "Oggi il FIRE non arriva entro il 2076; dopo l'evento arriva nel 2060.",
    );
    expect(plain(describeBeforeAfter(makeSummary({ timeline: makeTimeline({ yearsBefore: null, calendarBefore: null, yearsAfter: null, calendarAfter: null, deltaYears: null }) }), null))).toBe(
      "Il FIRE non arriva entro il 2076, né oggi né dopo l'evento.",
    );
    expect(plain(describeBeforeAfter(makeSummary({ timeline: makeTimeline({ yearsBefore: 0, calendarBefore: 2026, reachedBefore: true, yearsAfter: 0, calendarAfter: 2026, reachedAfter: true, deltaYears: 0 }) }), null))).toBe(
      "Sei già FIRE oggi e lo resti dopo l'evento.",
    );
    expect(plain(describeBeforeAfter(makeSummary({ timeline: makeTimeline({ yearsBefore: 0, calendarBefore: 2026, reachedBefore: true, yearsAfter: 3, calendarAfter: 2029, deltaYears: 3 }) }), null))).toBe(
      "Sei già FIRE oggi; dopo l'evento il FIRE tornerebbe nel 2029.",
    );
    expect(plain(describeBeforeAfter(makeSummary({ timeline: makeTimeline({ yearsAfter: 0, calendarAfter: 2026, reachedAfter: true, deltaYears: -7 }) }), null))).toBe(
      "Oggi il FIRE arriva nel 2033; con l'evento lo superi già oggi.",
    );
  });

  it('should name the base scenario in the aside and the step in the footer only when it is on the plot', () => {
    expect(describeBeforeAfterAside({ growthRate: 7, inflationRate: 2.5 })).toBe('scenario base · crescita 7% · inflazione 2,5%');

    const footer = describeBeforeAfterFooter({ isBridge: false, unlockCalendarYear: null, lastProjectedYear: 2045 });
    expect(plain(footer)).toBe(
      "Entrambe le traiettorie corrono sullo scenario base e fermano il risparmio al FIRE; la linea tratteggiata è il numero FIRE, che cresce con l'inflazione. L'evento è applicato oggi, poi il piano è lo stesso.",
    );
    expect(plain(describeBeforeAfterFooter({ isBridge: true, unlockCalendarYear: 2036, lastProjectedYear: 2045 }))).toMatch(/ Il gradino nel 2036 è il fondo pensione che rientra\.$/);
    expect(plain(describeBeforeAfterFooter({ isBridge: true, unlockCalendarYear: 2050, lastProjectedYear: 2045 }))).not.toContain('gradino');
  });
});

describe('describeDelta and buildDeltaRows', () => {
  it('should list what changes and what does not', () => {
    expect(plain(describeDelta(makeSummary()))).toBe("Cambiano il patrimonio, l'anno e il reddito passivo; il numero FIRE non cambia.");
    expect(plain(describeDelta(makeSummary({ netWorth: pair(412_500, 412_500), monthlyIncome: pair(1_375, 1_375), fireNumber: pair(690_000, 765_000) })))).toBe(
      "Cambiano il numero FIRE e l'anno; il patrimonio e il reddito passivo non cambiano.",
    );
    expect(plain(describeDelta(makeSummary({ timeline: makeTimeline({ yearsAfter: 7, calendarAfter: 2033, deltaYears: 0 }), monthlyIncome: pair(1_375, 1_375) })))).toBe(
      "Cambia solo il patrimonio; il numero FIRE, l'anno e il reddito passivo non cambiano.",
    );
    expect(plain(describeDelta(makeSummary({ timeline: makeTimeline({ yearsAfter: 7, calendarAfter: 2033, deltaYears: 0 }), netWorth: pair(412_500, 412_500), monthlyIncome: pair(1_375, 1_375) })))).toBe(
      "Nessuna riga cambia: l'evento non tocca il piano.",
    );
    expect(plain(describeDelta(makeSummary({ fireNumber: pair(690_000, 700_000) })))).toBe('Cambiano tutte e quattro le righe.');
  });

  it('should count a year that leaves the horizon or a target that is lost as a change', () => {
    expect(plain(describeDelta(makeSummary({ timeline: makeTimeline({ yearsAfter: null, calendarAfter: null, deltaYears: null }) })))).toContain("l'anno");
    expect(plain(describeDelta(makeSummary({ timeline: makeTimeline({ yearsBefore: 0, calendarBefore: 2026, reachedBefore: true, yearsAfter: 3, calendarAfter: 2029, deltaYears: 3 }) })))).toContain("l'anno");
  });

  it('should build the rows with formatted bounds, a signed change and the sign by the direction that is good', () => {
    const rows = buildDeltaRows(makeSummary());
    const flat = rows.fire.map((row) => [row.key, row.label, row.before.replace(/ /g, ' '), row.after.replace(/ /g, ' '), row.change.replace(/ /g, ' '), row.sign]);

    expect(flat).toEqual([
      ['year', 'Anno del FIRE', '2033', '2034', '+1 anno', 'negative'],
      ['netWorth', 'Patrimonio FIRE', '412.500 €', '380.700 €', '−31.800 €', 'negative'],
      ['fireNumber', 'Numero FIRE', '690.000 €', '690.000 €', 'invariato', null],
      ['progress', 'Progresso verso FI', '59,8%', '55,2%', '−4,6 punti', 'negative'],
      ['monthlyIncome', 'Reddito passivo al mese', '1375 €', '1269 €', '−106 €', 'negative'],
    ]);
    expect(rows.coast!.map((row) => [row.key, row.label, row.before.replace(/ /g, ' '), row.after.replace(/ /g, ' '), row.change.replace(/ /g, ' '), row.sign])).toEqual([
      ['coastNumber', 'Numero Coast oggi', '428.000 €', '428.000 €', 'invariato', null],
      ['coastGap', 'Mancano al Coast', '15.500 €', '47.300 €', '+31.800 €', 'negative'],
    ]);
  });

  it('should print a reached target, a year beyond the horizon and a gain in years', () => {
    const rows = buildDeltaRows(
      makeSummary({
        timeline: makeTimeline({ yearsBefore: 0, calendarBefore: 2026, reachedBefore: true, yearsAfter: null, calendarAfter: null, deltaYears: null }),
        fireNumber: pair(690_000, 600_000),
        coast: { numberToday: pair(428_000, 428_000), gap: pair(0, 20_000), reachedBefore: true, reachedAfter: false, retirementAge: 60 },
      }),
    );
    const year = rows.fire.find((row) => row.key === 'year')!;
    expect([year.before, year.after, year.change, year.sign]).toEqual(['Raggiunto', 'Oltre 50 anni', '', null]);
    const number = rows.fire.find((row) => row.key === 'fireNumber')!;
    expect([number.change.replace(/ /g, ' '), number.sign]).toEqual(['−90.000 €', 'positive']);
    const gap = rows.coast!.find((row) => row.key === 'coastGap')!;
    expect([gap.before, gap.after.replace(/ /g, ' ')]).toEqual(['Raggiunto', '20.000 €']);

    const closer = buildDeltaRows(makeSummary({ timeline: makeTimeline({ yearsAfter: 5, calendarAfter: 2031, deltaYears: -2 }) })).fire[0];
    expect([closer.change, closer.sign]).toEqual(['−2 anni', 'positive']);
    expect(buildDeltaRows(makeSummary({ coast: null })).coast).toBeNull();
  });

  it('should explain the colours in the footer and where the Coast reads from', () => {
    expect(plain(describeDeltaFooter(true))).toBe(
      'Verde e rosso seguono il verso buono di ogni riga: un anno in più è una perdita, un numero FIRE più basso un guadagno. Il Coast legge l\'età e le pensioni salvate in Coast FIRE.',
    );
    expect(plain(describeDeltaFooter(false))).toMatch(/ Imposta la tua età in Coast FIRE per vedere l'impatto anche lì\.$/);
  });
});

describe('describeEvent and describeEventFooter', () => {
  it('should state each event in the household-agnostic terms the pure layer knows', () => {
    expect(plain(describeEvent(makeEvent()))).toBe("Perdita di lavoro: 12 mesi senza 31.800 € l'anno di entrate, il 64% del reddito. Il patrimonio perde 31.800 €.");
    expect(plain(describeEvent(makeEvent({ months: 1, lostShareOfIncomePct: null, netWorthDelta: -2_650, netWorthAfter: 409_850 })))).toBe(
      "Perdita di lavoro: 1 mese senza 31.800 € l'anno di entrate. Il patrimonio perde 2650 €.",
    );
    expect(plain(describeEvent(makeEvent({ kind: 'majorPurchase', lumpSum: 30_000, netWorthDelta: -30_000, netWorthAfter: 382_500 })))).toBe(
      'Acquisto importante: 30.000 € escono oggi dal patrimonio, che scende a 382.500 €.',
    );
    expect(plain(describeEvent(makeEvent({ kind: 'windfall', lumpSum: 50_000, netWorthDelta: 50_000, netWorthAfter: 462_500 })))).toBe(
      'Entrata straordinaria: 50.000 € entrano oggi nel patrimonio, che sale a 462.500 €.',
    );
    expect(plain(describeEvent(makeEvent({ kind: 'cashflowChange', savingsDelta: -6_000, expensesDelta: 3_000, netWorthDelta: 0, savingsAfter: 16_200, expensesAfter: 30_600 })))).toBe(
      "Da oggi risparmi 6000 € l'anno in meno e spendi 3000 € in più: il risparmio passa a 16.200 € e le spese a 30.600 € l'anno.",
    );
    expect(plain(describeEvent(makeEvent({ kind: 'cashflowChange', savingsDelta: 2_000, expensesDelta: 0, netWorthDelta: 0, savingsAfter: 24_200 })))).toBe(
      "Da oggi risparmi 2000 € l'anno in più: il risparmio passa a 24.200 € l'anno.",
    );
  });

  it('should ask for the input when the event is empty', () => {
    expect(plain(describeEvent(makeEvent({ isEmpty: true, months: 0 })))).toBe('Perdita di lavoro: indica i mesi senza reddito e le entrate che vengono a mancare.');
    expect(plain(describeEvent(makeEvent({ kind: 'majorPurchase', isEmpty: true })))).toBe("Acquisto importante: inserisci l'importo che esce dal patrimonio.");
    expect(plain(describeEvent(makeEvent({ kind: 'windfall', isEmpty: true })))).toBe("Entrata straordinaria: inserisci l'importo che entra nel patrimonio.");
    expect(plain(describeEvent(makeEvent({ kind: 'cashflowChange', isEmpty: true })))).toBe('Variazione di risparmio e spese: inserisci quanto cambia ogni anno, in più o in meno.');
  });

  it('should explain the job-loss rule in the footer and name the cashflow year', () => {
    expect(plain(describeEventFooter({ kind: 'jobLoss', referenceYear: 2025, isAnnualized: false }))).toBe(
      'Il reddito che resta copre prima le spese: dal portafoglio esce solo la parte scoperta. Dati del cashflow 2025.',
    );
    expect(plain(describeEventFooter({ kind: 'windfall', referenceYear: 2026, isAnnualized: true }))).toBe(
      "L'evento è applicato oggi e non viene salvato: è un'esplorazione. Dati del cashflow 2026, annualizzati.",
    );
    expect(plain(describeEventFooter({ kind: 'windfall', referenceYear: null, isAnnualized: false }))).toBe("L'evento è applicato oggi e non viene salvato: è un'esplorazione.");
  });
});

describe('describeSensitivity', () => {
  const reading: SensitivityReading = {
    baselineExpenses: 27_600,
    baselineSavings: 22_200,
    baselineYears: 7,
    lessSpending: { annualExpenses: 24_840, years: 5 },
    moreSaving: { annualSavings: 27_750, label: '+25%', years: 6 },
  };

  it('should give the baseline years and the two neighbouring cells', () => {
    expect(plain(describeSensitivity(reading))).toBe(
      'Con 27.600 € di spese e 22.200 € di risparmio il FIRE arriva in 7 anni; spendendo il 10% in meno ci arrivi in 5, risparmiando il 25% in più in 6.',
    );
  });

  it('should say the singular year, a horizon never reached and an absolute savings column', () => {
    expect(plain(describeSensitivity({ ...reading, baselineYears: 1, lessSpending: { annualExpenses: 24_840, years: 1 } }))).toContain('arriva in 1 anno; spendendo il 10% in meno ci arrivi in 1,');
    expect(plain(describeSensitivity({ ...reading, baselineYears: null, lessSpending: { annualExpenses: 24_840, years: null } }))).toBe(
      'Con 27.600 € di spese e 22.200 € di risparmio il FIRE non arriva entro 50 anni; spendendo il 10% in meno nemmeno, risparmiando il 25% in più ci arrivi in 6.',
    );
    expect(plain(describeSensitivity({ ...reading, baselineSavings: 0, moreSaving: { annualSavings: 5_000, label: '€5k', years: 9 } }))).toBe(
      "Con 27.600 € di spese e nessun risparmio il FIRE arriva in 7 anni; spendendo il 10% in meno ci arrivi in 5, risparmiando 5000 € l'anno in 9.",
    );
  });

  it('should keep the aside and the footer as constants', () => {
    expect(SENSITIVITY_ASIDE).toBe('anni al FIRE · scenario base · piano di oggi');
    expect(plain(SENSITIVITY_FOOTER)).toBe(
      "Ogni cella è lo scenario base con quelle spese e quel risparmio, dal patrimonio di oggi. La cella con il bordo è il piano di oggi; le tinte dicono se ci arrivi prima o dopo. La matrice non applica l'evento: misura quanto conta un'abitudine, non un colpo.",
    );
  });
});
