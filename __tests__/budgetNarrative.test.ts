/**
 * Tests for lib/utils/budgetNarrative.ts — the words of Cashflow › Budget: the verdict that
 * answers «sto rispettando il budget?» and the reading line of every tile. Pure; chartService's
 * Firebase chain is mocked exactly like __tests__/cashflowNarrative.test.ts does. Expectations
 * are written the way the screen prints them (nbsp flattened, four-digit amounts ungrouped).
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
import type { BudgetAlert, BudgetItem, BudgetRiskSummary } from '@/types/budget';
import type { BudgetAllocationValidation } from '@/lib/utils/budgetUtils';
import type { AnnualBudgetSummary, CeilingSummary, IncomeTargetSummary, SpendingHistory } from '@/lib/utils/budgetSummary';
import {
  buildBudgetVerdict,
  describeAlerts,
  describeAlertsAside,
  describeAlertsFooter,
  describeAllocation,
  describeAnnualAside,
  describeAnnualBudgets,
  describeBudgetCounts,
  describeCeiling,
  describeCeilingAside,
  describeCeilingSetting,
  describeDailyCaption,
  describeHistory,
  describeOverCaption,
  describeProjectionCaption,
  describeIncomeTargets,
  describeRisk,
  dayRef,
} from '@/lib/utils/budgetNarrative';

const plain = (n: Narrative | null) => (n ? narrativeToText(n).replace(/ /g, ' ') : null);

const NOW = new Date(2026, 7, 22, 12);

function ceiling(overrides: Partial<CeilingSummary> = {}): CeilingSummary {
  return {
    ceiling: 4000,
    spent: 2910,
    spentToDate: 2910,
    scheduled: 0,
    usedPct: 72.75,
    calendarPct: (22 / 31) * 100,
    calendar: { dayOfMonth: 22, daysInMonth: 31, daysLeft: 9, canForecast: true },
    projection: 4100.45,
    remaining: 1090,
    dailyAllowance: 1090 / 9,
    exceeded: false,
    overBy: 0,
    crossedOn: null,
    projectedCrossingDay: null,
    dailyPace: 2910 / 22,
    sustainablePace: 4000 / 31,
    ...overrides,
  };
}

function risk(overrides: Partial<BudgetRiskSummary> = {}): BudgetRiskSummary {
  return {
    atRisk: [
      { key: 'r', label: 'Ristoranti', projectedTotal: 373, budgetAmount: 300, overBy: 73 },
      { key: 't', label: 'Trasporti', projectedTotal: 437, budgetAmount: 400, overBy: 37 },
      { key: 'a', label: 'Alimentari', projectedTotal: 634, budgetAmount: 600, overBy: 34 },
    ],
    evaluated: 12,
    canForecast: true,
    ...overrides,
  };
}

describe('buildBudgetVerdict', () => {
  it('warns when the pace lands over the ceiling, naming the days left and the overrun', () => {
    const v = buildBudgetVerdict({ ceiling: ceiling(), risk: risk(), hasItems: true, now: NOW });
    expect(v.headline).toBe('Agosto rischia di sforare il tetto.');
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).toBe(
      'A 9 giorni dalla fine del mese hai usato il 73% del tetto (2910 € su 4000 €): al ritmo attuale chiudi a 4100 €, 100 € oltre.',
    );
  });

  it('holds when the pace stays under the ceiling', () => {
    const v = buildBudgetVerdict({ ceiling: ceiling({ spent: 2480, spentToDate: 2480, usedPct: 62, projection: 3494.5, remaining: 1520 }), risk: risk({ atRisk: [] }), hasItems: true, now: NOW });
    expect(v.headline).toBe('Il budget di agosto tiene.');
    expect(v.tone).toBe('positive');
    expect(plain(v.sentence)).toBe(
      'A 9 giorni dalla fine del mese hai usato il 62% del tetto (2480 € su 4000 €): al ritmo attuale chiudi a 3495 €, 505 € sotto.',
    );
  });

  it('states an exceeded ceiling as a fact — the day it happened first — and the projection after it', () => {
    const over = ceiling({ spent: 4180, spentToDate: 4180, usedPct: 104.5, projection: 5890, remaining: 0, exceeded: true, overBy: 180, crossedOn: 13 });
    const v = buildBudgetVerdict({ ceiling: over, risk: risk(), hasItems: true, now: NOW });
    expect(v.headline).toBe('Ad agosto hai superato il tetto.');
    expect(v.tone).toBe('negative');
    expect(plain(v.sentence)).toBe(
      'Lo hai superato il 13; a 9 giorni dalla fine del mese hai speso 4180 € su 4000 €, 180 € oltre, e al ritmo attuale chiudi a 5890 €.',
    );
    const today = buildBudgetVerdict({ ceiling: { ...over, crossedOn: 22 }, risk: risk(), hasItems: true, now: NOW });
    expect(plain(today.sentence)).toMatch(/^Lo hai superato oggi; /);
  });

  it('a crossing that only the scheduled rows produce is in the future tense', () => {
    const ahead = ceiling({ spent: 4110, spentToDate: 2910, scheduled: 1200, usedPct: 102.75, exceeded: true, overBy: 110, crossedOn: 28, projection: 5300 });
    const v = buildBudgetVerdict({ ceiling: ahead, risk: risk(), hasItems: true, now: NOW });
    expect(v.headline).toBe('Ad agosto supererai il tetto.');
    expect(v.tone).toBe('negative');
    expect(plain(v.sentence)).toBe(
      'Lo superi il 28 con le spese già in calendario; a 9 giorni dalla fine del mese hai impegnato 4110 € su 4000 €, 110 € oltre.',
    );
  });

  it('a warning names the day the pace crosses the ceiling', () => {
    const v = buildBudgetVerdict({ ceiling: ceiling({ projectedCrossingDay: 29 }), risk: risk(), hasItems: true, now: NOW });
    expect(plain(v.sentence)).toBe(
      'A 9 giorni dalla fine del mese hai usato il 73% del tetto (2910 € su 4000 €): al ritmo attuale chiudi a 4100 €, 100 € oltre, superando il tetto il 29.',
    );
  });

  it('drops the projection clause in the first days of the month and says why', () => {
    const early = ceiling({ spent: 210, spentToDate: 210, usedPct: 5.25, projection: null, remaining: 3790, calendar: { dayOfMonth: 2, daysInMonth: 31, daysLeft: 29, canForecast: false }, calendarPct: (2 / 31) * 100 });
    const v = buildBudgetVerdict({ ceiling: early, risk: risk({ atRisk: [], canForecast: false }), hasItems: true, now: new Date(2026, 7, 2, 12) });
    expect(v.headline).toBe('Agosto è appena iniziato.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe(
      'A 29 giorni dalla fine del mese hai usato il 5% del tetto (210 € su 4000 €); una proiezione arriva dal quarto giorno.',
    );
  });

  it('on the last day there is no pace to speak of: the month is what it is', () => {
    const last = ceiling({ spent: 3900, spentToDate: 3900, usedPct: 97.5, projection: 3900, remaining: 100, dailyAllowance: null, calendar: { dayOfMonth: 31, daysInMonth: 31, daysLeft: 0, canForecast: true }, calendarPct: 100 });
    const v = buildBudgetVerdict({ ceiling: last, risk: risk({ atRisk: [] }), hasItems: true, now: new Date(2026, 7, 31, 12) });
    expect(v.headline).toBe('Il budget di agosto tiene.');
    expect(plain(v.sentence)).toBe("All'ultimo giorno del mese hai usato il 98% del tetto (3900 € su 4000 €): 100 € sotto.");
  });

  it('a projection that prints as the ceiling is neither over nor under', () => {
    const v = buildBudgetVerdict({ ceiling: ceiling({ projection: 3999.6 }), risk: risk({ atRisk: [] }), hasItems: true, now: NOW });
    expect(v.headline).toBe('Il budget di agosto tiene.');
    expect(plain(v.sentence)).toMatch(/: al ritmo attuale chiudi esattamente al tetto\.$/);
  });

  it('singular day: «A 1 giorno»', () => {
    const c = ceiling({ calendar: { dayOfMonth: 30, daysInMonth: 31, daysLeft: 1, canForecast: true }, calendarPct: (30 / 31) * 100, projection: 3007, remaining: 1090 });
    const v = buildBudgetVerdict({ ceiling: c, risk: risk({ atRisk: [] }), hasItems: true, now: new Date(2026, 7, 30, 12) });
    expect(plain(v.sentence)).toMatch(/^A 1 giorno dalla fine del mese/);
  });

  it('without a ceiling the question passes to the category budgets', () => {
    const v = buildBudgetVerdict({ ceiling: null, risk: risk(), hasItems: true, now: NOW });
    expect(v.headline).toBe('3 budget su 12 rischiano di sforare.');
    expect(v.tone).toBe('warning');
    expect(plain(v.sentence)).toBe(
      'Nessun tetto complessivo: ad agosto 3 categorie su 12 chiudono oltre il loro budget al ritmo attuale, Ristoranti di più (+73 €). Impostane uno nelle impostazioni per leggere il mese nel suo insieme.',
    );
    const one = buildBudgetVerdict({ ceiling: null, risk: risk({ atRisk: risk().atRisk.slice(0, 1) }), hasItems: true, now: NOW });
    expect(one.headline).toBe('1 budget su 12 rischia di sforare.');
    expect(plain(one.sentence)).toContain('1 categoria su 12 chiude oltre il suo budget al ritmo attuale, Ristoranti (+73 €).');
  });

  it('without a ceiling and nothing at risk, every budget holds', () => {
    const v = buildBudgetVerdict({ ceiling: null, risk: risk({ atRisk: [] }), hasItems: true, now: NOW });
    expect(v.headline).toBe('Tutti i budget di agosto tengono.');
    expect(v.tone).toBe('positive');
    expect(plain(v.sentence)).toBe(
      'Nessun tetto complessivo: le 12 categorie con un budget chiudono il mese entro il loro limite al ritmo attuale.',
    );
  });

  it('without a ceiling, early in the month, says the projection is not there yet', () => {
    const v = buildBudgetVerdict({ ceiling: null, risk: risk({ atRisk: [], canForecast: false }), hasItems: true, now: new Date(2026, 7, 2, 12) });
    expect(v.headline).toBe('Agosto è appena iniziato.');
    expect(plain(v.sentence)).toBe('Nessun tetto complessivo: 12 budget mensili per categoria, e una proiezione arriva dal quarto giorno.');
  });

  it('without a ceiling and without monthly budgets there is no month to read', () => {
    const v = buildBudgetVerdict({ ceiling: null, risk: risk({ atRisk: [], evaluated: 0 }), hasItems: true, now: NOW });
    expect(v.headline).toBe('Nessun budget mensile ad agosto.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe('Solo budget annuali o obiettivi di entrata: aggiungi un tetto mensile o un budget per categoria per leggere il mese.');
  });

  it('with nothing set at all, the page says so', () => {
    const v = buildBudgetVerdict({ ceiling: null, risk: risk({ atRisk: [], evaluated: 0 }), hasItems: false, now: NOW });
    expect(v.headline).toBe('Nessun budget impostato.');
    expect(v.tone).toBe('neutral');
    expect(plain(v.sentence)).toBe('Un tetto mensile su tutte le spese, o un budget per categoria, e questa pagina ti dice ogni giorno se agosto sta tenendo.');
  });
});

describe('describeCeiling', () => {
  it('reads the spent share against the calendar share, in points', () => {
    expect(plain(describeCeiling(ceiling()))).toBe('Hai usato il 73% del tetto al 71% del mese: 2 punti avanti rispetto al calendario.');
    expect(plain(describeCeiling(ceiling({ usedPct: 68 })))).toBe('Hai usato il 68% del tetto al 71% del mese: 3 punti indietro rispetto al calendario.');
    expect(plain(describeCeiling(ceiling({ usedPct: 70.6 })))).toBe('Hai usato il 71% del tetto al 71% del mese: in linea con il calendario.');
    expect(plain(describeCeiling(ceiling({ usedPct: 72 })))).toBe('Hai usato il 72% del tetto al 71% del mese: 1 punto avanti rispetto al calendario.');
  });

  it('uses the article the printed figure takes', () => {
    expect(plain(describeCeiling(ceiling({ usedPct: 8, calendarPct: 8 })))).toBe("Hai usato l'8% del tetto all'8% del mese: in linea con il calendario.");
    expect(plain(describeCeiling(ceiling({ usedPct: 0.2, calendarPct: 3 })))).toBe('Hai usato lo 0% del tetto al 3% del mese: 3 punti indietro rispetto al calendario.');
  });

  it('states an exceeded ceiling by the day it happened and the amount over', () => {
    expect(plain(describeCeiling(ceiling({ spent: 4180, usedPct: 104.5, exceeded: true, overBy: 180, crossedOn: 13 })))).toBe('Hai superato il tetto il 13, al 42% del mese: 180 € oltre.');
    expect(plain(describeCeiling(ceiling({ spent: 4180, usedPct: 104.5, exceeded: true, overBy: 180, crossedOn: 22 })))).toBe('Hai superato il tetto oggi, al 71% del mese: 180 € oltre.');
    expect(plain(describeCeiling(ceiling({ spent: 4110, usedPct: 102.75, exceeded: true, overBy: 110, crossedOn: 28 })))).toBe('Le spese già in calendario superano il tetto il 28: 110 € oltre.');
  });

  it('the daily KPI reads the allowance while under and the real pace against the ceiling\u2019s once over', () => {
    expect(plain(describeDailyCaption(ceiling()))).toBe('per restare nel tetto');
    const over = ceiling({ spent: 4180, exceeded: true, overBy: 180, crossedOn: 13, dailyPace: 190, dailyAllowance: 0 });
    expect(plain(describeDailyCaption(over))).toBe('spesi al giorno · il tetto ne regge 129');
    expect(plain(describeOverCaption(over))).toBe('dal 13');
    expect(plain(describeOverCaption({ ...over, crossedOn: 22 }))).toBe('da oggi');
    expect(plain(describeOverCaption({ ...over, crossedOn: 28 }))).toBe('dal 28, in calendario');
    expect(plain(describeProjectionCaption(ceiling()))).toBe('al ritmo attuale');
    expect(plain(describeProjectionCaption(ceiling({ projectedCrossingDay: 29 })))).toBe('al ritmo attuale · supera il 29');
  });

  it('aside: the month and the day', () => {
    expect(plain(describeCeilingAside(ceiling(), NOW))).toBe('agosto · giorno 22 di 31');
  });
});

describe('describeRisk', () => {
  it('counts the categories at risk and names the worst', () => {
    expect(plain(describeRisk(risk()))).toBe('3 su 12 rischiano di sforare: Ristoranti di più (+73 €).');
    expect(plain(describeRisk(risk({ atRisk: risk().atRisk.slice(0, 1) })))).toBe('1 su 12 rischia di sforare: Ristoranti (+73 €).');
  });

  it('says when nothing is at risk, when there is nothing to evaluate, and when it is too early', () => {
    expect(plain(describeRisk(risk({ atRisk: [] })))).toBe('Nessuna delle 12 categorie rischia di sforare a fine mese.');
    expect(plain(describeRisk(risk({ atRisk: [], evaluated: 1 })))).toBe('La categoria con un budget non rischia di sforare a fine mese.');
    expect(plain(describeRisk(risk({ atRisk: [], evaluated: 0 })))).toBe('Nessun budget mensile per categoria.');
    expect(plain(describeRisk(risk({ atRisk: [], canForecast: false })))).toBe('12 budget mensili; una proiezione arriva dal quarto giorno del mese.');
  });
});

describe('describeAlerts', () => {
  const alert = (overrides: Partial<BudgetAlert>): BudgetAlert => ({
    key: 'k',
    label: 'Casa',
    level: 'warning',
    threshold: 90,
    thresholdCrossed: true,
    spent: 1150,
    budgetAmount: 1250,
    usedRatio: 0.92,
    forecastedOverrun: false,
    crossedOn: null,
    ...overrides,
  });
  const rows = [alert({ key: 'a', label: 'Abbonamenti', level: 'exceeded', threshold: 100, spent: 58, budgetAmount: 50, usedRatio: 1.16, crossedOn: 2 }), alert({})];

  it('names the crossed thresholds, exceeded first, with the day a budget went over', () => {
    expect(plain(describeAlerts(rows, true, NOW))).toBe('2 soglie superate: Abbonamenti ha sforato il 2, Casa è al 92%.');
    expect(plain(describeAlerts([{ ...rows[0], crossedOn: null }], true, NOW))).toBe('1 soglia superata: Abbonamenti ha sforato.');
    expect(plain(describeAlerts(rows.slice(1), true, NOW))).toBe('1 soglia superata: Casa è al 92%.');
    expect(plain(describeAlerts([...rows, alert({ key: 'c', label: 'Auto', usedRatio: 0.91 }), alert({ key: 'd', label: 'Svago', usedRatio: 0.9 })], true, NOW))).toBe(
      '4 soglie superate: Abbonamenti ha sforato il 2, Casa è al 92% e altre 2.',
    );
  });

  it('says when nothing crossed and when alerts are off', () => {
    expect(plain(describeAlerts([], true, NOW))).toBe('Nessuna soglia superata ad agosto.');
    expect(plain(describeAlerts(rows, false, NOW))).toBe('Nessun avviso: li hai disattivati.');
  });

  it('footer and aside name where the forecasts live and which thresholds are armed', () => {
    expect(plain(describeAlertsFooter(true, 3))).toBe('Gli sforamenti previsti (3) stanno in Categorie a rischio. Gli stessi avvisi arrivano nell\'email mensile.');
    expect(plain(describeAlertsFooter(true, 0))).toBe("Gli stessi avvisi arrivano nell'email mensile.");
    expect(plain(describeAlertsFooter(false, 3))).toBe("Riattivali nelle impostazioni per vedere qui le soglie superate e riceverle nell'email mensile.");
    expect(plain(describeAlertsAside([90, 100], true))).toBe('soglie 90 · 100');
    expect(plain(describeAlertsAside([90, 100], false))).toBe('disattivati');
  });
});

describe('describeAnnualBudgets', () => {
  const summary = (rows: AnnualBudgetSummary['rows'], aheadCount = 0): AnnualBudgetSummary => ({ rows, year: 2026, yearElapsedPct: 64.1, monthsLeft: 4, aheadCount });
  const annualItem = (id: string): BudgetItem => ({ id, kind: 'expense', scope: 'category', period: 'annual', categoryId: id, amount: 0, order: 0 });
  const vac = { item: annualItem('v'), key: 'v', label: 'Vacanze', budget: 2500, spent: 1400, usedPct: 56, remaining: 1100, ahead: false, exceeded: false };
  const gifts = { item: annualItem('g'), key: 'g', label: 'Regali', budget: 600, spent: 180, usedPct: 30, remaining: 420, ahead: false, exceeded: false };

  it('reads the year against the calendar', () => {
    expect(plain(describeAnnualBudgets(summary([vac, gifts])))).toBe('Nessuno dei 2 budget è avanti al calendario dell\'anno; il più usato è Vacanze (56%).');
    expect(plain(describeAnnualBudgets(summary([vac])))).toBe("Vacanze è al 56% con l'anno al 64%.");
    expect(plain(describeAnnualBudgets(summary([{ ...gifts, usedPct: 70, ahead: true }, vac], 1)))).toBe("1 dei 2 budget è avanti al calendario dell'anno: Regali (70%).");
    expect(plain(describeAnnualBudgets(summary([{ ...gifts, usedPct: 70, ahead: true }, { ...vac, usedPct: 66, ahead: true }], 2)))).toBe(
      "2 dei 2 budget sono avanti al calendario dell'anno: Regali (70%) e Vacanze (66%).",
    );
    expect(plain(describeAnnualBudgets(summary([{ ...gifts, usedPct: 120, ahead: true, exceeded: true, remaining: 0 }, vac], 1)))).toBe(
      "1 dei 2 budget è avanti al calendario dell'anno: Regali ha già superato il suo (120%).",
    );
  });

  it('aside: the year, its start and how much of it is gone', () => {
    expect(plain(describeAnnualAside(summary([vac])))).toBe('2026, da gennaio · anno al 64%');
  });
});

describe('tile readings', () => {
  it('income targets: registered against expected', () => {
    const income: IncomeTargetSummary = { expected: 4500, registered: 4580, count: 2 };
    expect(plain(describeIncomeTargets(income))).toBe('Registrate 4580 € su 4500 € previste');
  });

  it('allocation: assigned against the ceiling, over-allocation stops the save', () => {
    const v = (allocated: number, overall: number): BudgetAllocationValidation => ({ overall, allocated, available: overall - allocated, valid: overall <= 0 || allocated <= overall });
    expect(plain(describeAllocation(v(3790, 4000), 12))).toBe('Hai assegnato 3790 € dei 4000 € del tetto: 210 € non sono in nessuna categoria.');
    expect(plain(describeAllocation(v(4000, 4000), 12))).toBe('Hai assegnato alle categorie tutto il tetto di 4000 €.');
    expect(plain(describeAllocation(v(4300, 4000), 12))).toBe('Hai assegnato 4300 € su un tetto di 4000 €: 300 € di troppo, le modifiche non si salvano finché non rientri.');
    expect(plain(describeAllocation(v(3790, 0), 12))).toBe('12 budget mensili per 3790 € al mese, senza un tetto complessivo.');
    expect(plain(describeAllocation(v(0, 0), 0))).toBe('Nessun budget mensile di spesa.');
  });

  it('settings: the allocation as a reading, the overrun as the reason nothing saves', () => {
    const v = (allocated: number, overall: number): BudgetAllocationValidation => ({ overall, allocated, available: overall - allocated, valid: overall <= 0 || allocated <= overall });
    expect(plain(describeCeilingSetting(v(3790, 4000)))).toBe('Assegnati 3790 €, disponibili 210 €.');
    expect(plain(describeCeilingSetting(v(4300, 4000)))).toBe('Assegnati 4300 €: la somma dei budget mensili supera il tetto di 300 €.');
    expect(plain(describeCeilingSetting(v(100, 0)))).toBe('Un limite su tutte le spese del mese, sopra i budget per categoria.');
  });

  it('counts in the aside, singular and plural', () => {
    expect(plain(describeBudgetCounts(12, 2, NOW))).toBe('agosto · 12 budget di spesa, 2 obiettivi di entrata');
    expect(plain(describeBudgetCounts(1, 1, NOW))).toBe('agosto · 1 budget di spesa, 1 obiettivo di entrata');
    expect(plain(describeBudgetCounts(3, 0, NOW))).toBe('agosto · 3 budget di spesa');
  });

  it('history: closed months over their ceiling — recorded, current, or both — or just the window', () => {
    const h = (overCount: number | null, recordedCount = 0, closedCount = 5, recordedFrom: string | null = null): SpendingHistory => ({ months: [], closedCount, overCount, recordedCount, recordedFrom, average: 3100 });
    expect(plain(describeHistory(h(0)))).toBe('Nessun mese oltre il tetto attuale negli ultimi 5 chiusi.');
    expect(plain(describeHistory(h(2)))).toBe('2 mesi su 5 oltre il tetto attuale.');
    expect(plain(describeHistory(h(1)))).toBe('1 mese su 5 oltre il tetto attuale.');
    expect(plain(describeHistory(h(2, 5, 5, 'Mar')))).toBe('2 mesi su 5 oltre il loro tetto.');
    expect(plain(describeHistory(h(0, 5, 5, 'Mar')))).toBe('Nessun mese oltre il loro tetto negli ultimi 5 chiusi.');
    expect(plain(describeHistory(h(1, 2, 5, 'Giu')))).toBe('1 mese su 5 oltre il tetto (il loro da giu, prima quello attuale).');
    expect(plain(describeHistory(h(null)))).toBe('Spese totali per mese.');
  });
});

describe('dayRef', () => {
  it('elides before otto and undici, marks the first as ordinal', () => {
    const text = (n: Narrative) => plain(n);
    expect(text(dayRef('il', 13))).toBe('il 13');
    expect(text(dayRef('il', 8))).toBe("l'8");
    expect(text(dayRef('il', 11))).toBe("l'11");
    expect(text(dayRef('il', 1))).toBe('il 1°');
    expect(text(dayRef('dal', 8))).toBe("dall'8");
    expect(text(dayRef('dal', 21))).toBe('dal 21');
  });
});
