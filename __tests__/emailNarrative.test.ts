/**
 * Tests for lib/utils/emailNarrative.ts — the verdict and the tile readings of the two
 * periodic emails.
 *
 * Note what is NOT at the top of this file: no `vi.mock('@/lib/firebase/config')`. The module
 * takes its formatters from `lib/utils/formatters.ts` rather than from `chartService`, so it
 * carries no Firebase chain at all — which is the property that lets a Lambda import it. If a
 * future edit makes these mocks necessary again, the import has drifted back to the client SDK.
 *
 * Intl 'it-IT' puts a no-break space before `€` and leaves four-digit amounts ungrouped
 * (`4.310 €` but `9310 €` at four digits): expectations are written the way the reader really
 * sees them, with the nbsp flattened to a plain space.
 */

import { describe, expect, it } from 'vitest';

import {
  buildPeriodEmailVerdict,
  buildBudgetEmailVerdict,
  describeNetWorthTile,
  describeMarketSplit,
  describeCompositionTile,
  describeClassMovesTile,
  describeCashflowTile,
  describeExpenseCategoriesTile,
  describeIncomeCategoriesTile,
  describeExpenseTypes,
  describeTopExpensesTile,
  describeDividendsTile,
  describeYearOverYearTile,
  describeBudgetAlertsTile,
  describeOverallCeiling,
  describeMonthlyBudgetsTile,
  describeAnnualBudgetsTile,
  periodSubject,
  periodTitle,
  periodKindLabel,
  periodScopeLabel,
  periodBaselineLabel,
  periodBaselineHeading,
  yearEarlierHeading,
  budgetWindowLabel,
  type EmailPeriod,
  type PeriodEmailVerdictInput,
  type BudgetEmailVerdictInput,
} from '@/lib/utils/emailNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

const plain = (narrative: Narrative | null) =>
  narrative === null ? null : narrativeToText(narrative).replace(/ /g, ' ');

const AUGUST: EmailPeriod = { kind: 'monthly', year: 2026, month: 8 };
const Q3: EmailPeriod = { kind: 'quarterly', year: 2026, month: 9, quarter: 3 };
const H1: EmailPeriod = { kind: 'semiannual', year: 2026, month: 6, semester: 1 };
const YEAR: EmailPeriod = { kind: 'yearly', year: 2026, month: 12 };

const GROWING: PeriodEmailVerdictInput = {
  period: AUGUST,
  currentNetWorth: 312480,
  previousNetWorth: 308170,
  netWorthDelta: 4310,
  netWorthDeltaPct: 1.4,
  totalIncome: 4180,
  totalExpenses: 3000,
  marketEffect: 3130,
  rank: { position: 7, total: 34, scope: 'month', trend: 'growth' },
};

// ─── Period vocabulary ────────────────────────────────────────────────────────

describe('the period, in words', () => {
  it('names every kind as a masculine singular subject, so one verb agreement serves all', () => {
    expect(periodSubject(AUGUST)).toBe('Agosto');
    expect(periodSubject(Q3)).toBe('Il terzo trimestre');
    expect(periodSubject(H1)).toBe('Il primo semestre');
    expect(periodSubject(YEAR)).toBe('Il 2026');
  });

  it('titles the email', () => {
    expect(periodTitle(AUGUST)).toBe('Agosto 2026');
    expect(periodTitle(Q3)).toBe('Q3 2026');
    expect(periodTitle(H1)).toBe('1° Semestre 2026');
    expect(periodTitle(YEAR)).toBe('Anno 2026');
  });

  it('labels the kind of report in the eyebrow', () => {
    expect(periodKindLabel('monthly')).toBe('Riepilogo mensile');
    expect(periodKindLabel('quarterly')).toBe('Riepilogo trimestrale');
    expect(periodKindLabel('semiannual')).toBe('Riepilogo semestrale');
    expect(periodKindLabel('yearly')).toBe('Riepilogo annuale');
  });

  it('gives every flow tile a scope, because an email has no period picker', () => {
    expect(periodScopeLabel(AUGUST)).toBe('agosto 2026');
    expect(periodScopeLabel(Q3)).toBe('lug–set 2026');
    expect(periodScopeLabel(H1)).toBe('gen–giu 2026');
    expect(periodScopeLabel(YEAR)).toBe('2026');
  });

  it('names the baseline inside a sentence', () => {
    expect(periodBaselineLabel(AUGUST)).toBe('luglio');
    expect(periodBaselineLabel(Q3)).toBe('il trimestre precedente');
    expect(periodBaselineLabel(YEAR)).toBe('il 2025');
  });

  it('wraps the year on a January email, in the sentence and in the heading', () => {
    const january: EmailPeriod = { kind: 'monthly', year: 2026, month: 1 };
    expect(periodBaselineLabel(january)).toBe('dicembre');
    expect(periodBaselineHeading(january)).toBe('Dicembre 2025');
  });

  it('wraps the year on a Q1 email too', () => {
    expect(periodBaselineHeading({ kind: 'quarterly', year: 2026, month: 3, quarter: 1 })).toBe('Q4 2025');
    expect(periodBaselineHeading(Q3)).toBe('Q2 2026');
  });

  it('names the same period one year earlier', () => {
    expect(yearEarlierHeading(AUGUST)).toBe('Agosto 2025');
    expect(yearEarlierHeading(Q3)).toBe('Q3 2025');
    expect(yearEarlierHeading(YEAR)).toBe('2025');
  });
});

// ─── The verdict ──────────────────────────────────────────────────────────────

describe('buildPeriodEmailVerdict', () => {
  it('credits the market only when the market actually gained', () => {
    expect(buildPeriodEmailVerdict(GROWING).headline).toBe('Agosto è cresciuto: il mercato ha spinto.');
  });

  it('refuses to credit the market when the market lost and the total still grew', () => {
    const verdict = buildPeriodEmailVerdict({ ...GROWING, marketEffect: -900 });
    expect(verdict.headline).toBe('Agosto è cresciuto, nonostante il mercato.');
    expect(verdict.tone).toBe('positive');
  });

  it('blames the market on a falling period only when the market lost money', () => {
    const falling = { ...GROWING, netWorthDelta: -2100, netWorthDeltaPct: -0.68 };
    expect(buildPeriodEmailVerdict({ ...falling, marketEffect: -3280 }).headline).toBe(
      'Agosto è in calo: il mercato ha pesato.',
    );
    expect(buildPeriodEmailVerdict({ ...falling, marketEffect: 500 }).headline).toBe(
      'Agosto è in calo, nonostante il mercato.',
    );
  });

  it('names no cause at all when nothing is attributable', () => {
    const verdict = buildPeriodEmailVerdict({ ...GROWING, marketEffect: null });
    expect(verdict.headline).toBe('Agosto è cresciuto.');
    expect(plain(verdict.sentence)).not.toContain('mercato');
  });

  it('says a growing period overspent, when it did', () => {
    const verdict = buildPeriodEmailVerdict({ ...GROWING, totalIncome: 2000, totalExpenses: 3000 });
    expect(verdict.headline).toBe('Agosto è cresciuto, ma le spese hanno superato le entrate.');
    expect(verdict.tone).toBe('warning');
  });

  it('judges nothing when there is no earlier snapshot', () => {
    const verdict = buildPeriodEmailVerdict({ ...GROWING, previousNetWorth: 0, rank: null });
    expect(verdict.headline).toBe('Agosto è il primo periodo registrato.');
    expect(verdict.tone).toBe('neutral');
    expect(plain(verdict.sentence)).toBe(
      'Il patrimonio vale 312.480 €. Hai messo da parte +1180 €, il 28,2% di quanto è entrato.',
    );
  });

  it('splits the movement into market and savings, exactly', () => {
    expect(plain(buildPeriodEmailVerdict(GROWING).sentence)).toBe(
      'Il patrimonio vale 312.480 €: +4310 € (+1,40%) su luglio. ' +
        'Di quel movimento, +3130 € viene dal mercato e +1180 € da quanto hai risparmiato. ' +
        'È il 7° mese migliore su 34 registrati.',
    );
  });

  it('never calls a record decline "il mese migliore"', () => {
    const verdict = buildPeriodEmailVerdict({
      ...GROWING,
      netWorthDelta: -9200,
      netWorthDeltaPct: -2.98,
      marketEffect: -10380,
      rank: { position: 2, total: 34, scope: 'month', trend: 'decline' },
    });
    expect(plain(verdict.sentence)).toContain('È il 2° calo più marcato su 34 registrati.');
    expect(plain(verdict.sentence)).not.toContain('migliore');
  });

  it('drops the record clause when there is no standing', () => {
    expect(plain(buildPeriodEmailVerdict({ ...GROWING, rank: null }).sentence)).not.toContain('migliore');
  });

  it('drops the savings clause when nothing came in', () => {
    const verdict = buildPeriodEmailVerdict({
      ...GROWING,
      previousNetWorth: 0,
      totalIncome: 0,
      totalExpenses: 0,
      marketEffect: null,
      rank: null,
    });
    expect(plain(verdict.sentence)).toBe('Il patrimonio vale 312.480 €.');
  });

  it('speaks about a quarter in the quarter’s own words', () => {
    const verdict = buildPeriodEmailVerdict({ ...GROWING, period: Q3, rank: null });
    expect(verdict.headline).toBe('Il terzo trimestre è cresciuto: il mercato ha spinto.');
    expect(plain(verdict.sentence)).toContain('su il trimestre precedente');
  });
});

// ─── Tile readings ────────────────────────────────────────────────────────────

describe('describeNetWorthTile', () => {
  it('reads the change against the named baseline', () => {
    expect(
      plain(describeNetWorthTile({ period: AUGUST, previousNetWorth: 308170, netWorthDelta: 4310, netWorthDeltaPct: 1.4 })),
    ).toBe('Rispetto a luglio è salito di +4310 €, il +1,40%.');
  });

  it('uses the falling verb when it fell', () => {
    expect(
      plain(describeNetWorthTile({ period: AUGUST, previousNetWorth: 308170, netWorthDelta: -2100, netWorthDeltaPct: -0.68 })),
    ).toBe('Rispetto a luglio è sceso di −2100 €, il −0,68%.');
  });

  it('names the absence instead of printing a zero delta', () => {
    expect(
      plain(describeNetWorthTile({ period: AUGUST, previousNetWorth: 0, netWorthDelta: 0, netWorthDeltaPct: 0 })),
    ).toBe('Non c’è un periodo precedente da cui misurare la variazione.');
  });
});

describe('describeMarketSplit', () => {
  it('keeps calling the residual a residual', () => {
    expect(plain(describeMarketSplit(3130, 1180))).toBe(
      'Mercato +3130 €, risparmio +1180 €. È un residuo strutturale: assorbe anche i movimenti non tracciati.',
    );
  });

  it('is absent when the effect is not attributable', () => {
    expect(describeMarketSplit(null, 1180)).toBeNull();
  });
});

describe('describeCompositionTile', () => {
  const CLASSES = [
    { assetClass: 'equity', value: 168400 },
    { assetClass: 'realestate', value: 62000 },
    { assetClass: 'bonds', value: 54900 },
    { assetClass: 'cash', value: 18930 },
    { assetClass: 'crypto', value: 8250 },
  ];

  it('claims the majority only when the leader is actually above half', () => {
    expect(plain(describeCompositionTile(CLASSES))).toBe(
      'Azioni al 53,9%, più di tutte le altre classi messe insieme.',
    );
  });

  it('states the leader without the majority claim when it is below half', () => {
    const balanced = [
      { assetClass: 'equity', value: 40 },
      { assetClass: 'bonds', value: 35 },
      { assetClass: 'cash', value: 25 },
    ];
    const reading = plain(describeCompositionTile(balanced));
    expect(reading).toBe('La classe più pesante è obbligazioni, 40,0% su 3 classi.'.replace('obbligazioni', 'azioni'));
    expect(reading).not.toContain('messe insieme');
  });

  it('says so when there is only one class', () => {
    expect(plain(describeCompositionTile([{ assetClass: 'cash', value: 900 }]))).toBe('Tutto in liquidità.');
  });

  it('is absent when nothing is held', () => {
    expect(describeCompositionTile([])).toBeNull();
    expect(describeCompositionTile([{ assetClass: 'equity', value: 0 }])).toBeNull();
  });
});

describe('describeClassMovesTile', () => {
  it('separates the percent mover from the euro mover when they differ', () => {
    expect(
      plain(
        describeClassMovesTile({
          bestPct: { name: 'Criptovalute', deltaPct: 6.8, deltaAbs: 525 },
          worstPct: { name: 'Obbligazioni', deltaPct: -0.9, deltaAbs: -498 },
          bestAbs: { name: 'Azioni', deltaPct: 2.42, deltaAbs: 3980 },
          worstAbs: { name: 'Obbligazioni', deltaPct: -0.9, deltaAbs: -498 },
        }),
      ),
    ).toBe('In percentuale ha spinto Criptovalute, in euro Azioni; sotto zero Obbligazioni.');
  });

  it('claims no loser when every class gained', () => {
    const reading = plain(
      describeClassMovesTile({
        bestPct: { name: 'Azioni', deltaPct: 4, deltaAbs: 3000 },
        worstPct: { name: 'Obbligazioni', deltaPct: 0.4, deltaAbs: 120 },
        bestAbs: { name: 'Azioni', deltaPct: 4, deltaAbs: 3000 },
        worstAbs: { name: 'Obbligazioni', deltaPct: 0.4, deltaAbs: 120 },
      }),
    );
    expect(reading).toBe('Ha spinto Azioni.');
    expect(reading).not.toContain('sotto zero');
  });

  it('is absent when nothing moved at all', () => {
    expect(describeClassMovesTile({ bestPct: null, worstPct: null, bestAbs: null, worstAbs: null })).toBeNull();
  });
});

describe('describeCashflowTile', () => {
  it('reads the savings rate', () => {
    expect(plain(describeCashflowTile({ totalIncome: 4180, totalExpenses: 3000 }))).toBe(
      'Hai messo da parte 1180 €, il 28,2% di quanto è entrato.',
    );
  });

  it('never prints a negative "messo da parte"', () => {
    const reading = plain(describeCashflowTile({ totalIncome: 2000, totalExpenses: 3000 }));
    expect(reading).toBe('Sono usciti 1000 € più di quanto è entrato.');
    expect(reading).not.toContain('messo da parte');
  });

  it('states spending without income as what it is', () => {
    expect(plain(describeCashflowTile({ totalIncome: 0, totalExpenses: 900 }))).toBe(
      'Sono uscite 900 €, senza entrate registrate.',
    );
  });

  it('names an empty period', () => {
    expect(plain(describeCashflowTile({ totalIncome: 0, totalExpenses: 0 }))).toBe(
      'Nessun movimento registrato nel periodo.',
    );
  });
});

describe('ranked category readings', () => {
  const EXPENSES = [
    { name: 'Casa', amount: 980 },
    { name: 'Alimentari', amount: 610 },
    { name: 'Trasporti', amount: 385 },
    { name: 'Salute', amount: 240 },
    { name: 'Tempo libero', amount: 225 },
    { name: 'Utenze', amount: 560 },
  ];

  it('states the leader and what the shown rows explain', () => {
    expect(plain(describeExpenseCategoriesTile(EXPENSES, 5))).toBe(
      'Casa è la voce più pesante, 32,7% delle uscite; i 5 in elenco ne spiegano l’92,5%.',
    );
  });

  it('drops the "in elenco" clause when nothing is withheld', () => {
    const reading = plain(describeExpenseCategoriesTile(EXPENSES, 6));
    expect(reading).toBe('Casa è la voce più pesante, 32,7% delle uscite.');
    expect(reading).not.toContain('in elenco');
  });

  it('uses the income noun for income', () => {
    expect(
      plain(
        describeIncomeCategoriesTile(
          [
            { name: 'Stipendio', amount: 3600 },
            { name: 'Rimborsi', amount: 380 },
            { name: 'Altro', amount: 200 },
          ],
          3,
        ),
      ),
    ).toBe('Stipendio copre il 86,1% di quanto è entrato.');
  });

  it('is absent when there is nothing to rank', () => {
    expect(describeExpenseCategoriesTile([], 5)).toBeNull();
    expect(describeIncomeCategoriesTile([{ name: 'Stipendio', amount: 0 }], 5)).toBeNull();
  });
});

describe('describeExpenseTypes', () => {
  it('shares out the three types', () => {
    expect(
      plain(
        describeExpenseTypes([
          { label: 'Fisse', amount: 1640 },
          { label: 'Variabili', amount: 1180 },
          { label: 'Debiti', amount: 180 },
        ]),
      ),
    ).toBe('Fisse 1640 € (54,7%) · Variabili 1180 € (39,3%) · Debiti 180 € (6,0%).');
  });

  it('omits a type with nothing in it, rather than printing a zero row', () => {
    const reading = plain(
      describeExpenseTypes([
        { label: 'Fisse', amount: 1640 },
        { label: 'Debiti', amount: 0 },
      ]),
    );
    expect(reading).toBe('Fisse 1640 € (100,0%).');
    expect(reading).not.toContain('Debiti');
  });
});

describe('describeTopExpensesTile', () => {
  it('weighs the listed rows against the whole period', () => {
    expect(
      plain(describeTopExpensesTile([{ amount: 780 }, { amount: 214 }, { amount: 189 }, { amount: 160 }, { amount: 143 }], 3000)),
    ).toBe('Cinque voci pesano 1486 €, il 49,5% delle uscite del periodo.');
  });

  it('drops the share when there is no total to divide by', () => {
    expect(plain(describeTopExpensesTile([{ amount: 780 }], 0))).toBe('Una voce pesa 780 €.');
  });

  it('is absent with no rows', () => {
    expect(describeTopExpensesTile([], 3000)).toBeNull();
  });
});

describe('describeDividendsTile', () => {
  it('prints cents, because a dividend has them', () => {
    expect(plain(describeDividendsTile(236.4, 3))).toBe('Tre pagamenti ricevuti, per un lordo di 236,40 €.');
  });

  it('agrees with a single payment', () => {
    expect(plain(describeDividendsTile(80, 1))).toBe('Un pagamento ricevuto, per un lordo di 80,00 €.');
  });

  it('is absent when nothing was received', () => {
    expect(describeDividendsTile(0, 0)).toBeNull();
  });
});

describe('describeYearOverYearTile', () => {
  it('states the twelve-month move and how the flows agreed', () => {
    expect(
      plain(
        describeYearOverYearTile({
          period: AUGUST,
          netWorth: { absChange: 38900, pctChange: 14.22 },
          income: { absChange: 180, pctChange: 4.5 },
          expenses: { absChange: 145, pctChange: 5.08 },
        }),
      ),
    ).toBe('In dodici mesi il patrimonio è salito di +38.900 €; entrate e uscite si sono mosse nella stessa direzione.');
  });

  it('says which way each flow went when they disagree', () => {
    expect(
      plain(
        describeYearOverYearTile({
          period: AUGUST,
          netWorth: { absChange: 38900, pctChange: 14.22 },
          income: { absChange: 180, pctChange: 4.5 },
          expenses: { absChange: -145, pctChange: -5.08 },
        }),
      ),
    ).toContain('le entrate sono cresciute mentre le uscite sono calate');
  });

  it('drops the flow clause when a flow has no baseline', () => {
    const reading = plain(
      describeYearOverYearTile({
        period: AUGUST,
        netWorth: { absChange: 38900, pctChange: 14.22 },
        income: null,
        expenses: { absChange: 145, pctChange: 5.08 },
      }),
    );
    expect(reading).toBe('In dodici mesi il patrimonio è salito di +38.900 €.');
  });

  it('is absent without a net-worth baseline', () => {
    expect(describeYearOverYearTile({ period: AUGUST, netWorth: null, income: null, expenses: null })).toBeNull();
  });
});

describe('describeBudgetAlertsTile', () => {
  it('counts what is over, what is near and what is fine', () => {
    expect(
      plain(
        describeBudgetAlertsTile(
          [
            { label: 'Alimentari', level: 'exceeded' },
            { label: 'Tempo libero', level: 'warning' },
          ],
          9,
        ),
      ),
    ).toBe('Un budget è stato superato e uno è vicino al limite; i 7 restanti hanno chiuso sotto.');
  });

  it('is absent when no budget raised an alert', () => {
    expect(describeBudgetAlertsTile([], 9)).toBeNull();
  });
});

// ─── The budget email ─────────────────────────────────────────────────────────

const SUNDAY: BudgetEmailVerdictInput = {
  onTrackCount: 7,
  atRiskCount: 2,
  exceededCount: 1,
  overall: { spent: 2870, limit: 3000, projected: 2965 },
  dayOfMonth: 30,
  daysInMonth: 31,
};

describe('buildBudgetEmailVerdict', () => {
  it('opens on how many hold and whether the ceiling does', () => {
    const verdict = buildBudgetEmailVerdict(SUNDAY);
    expect(verdict.headline).toBe('Sette budget su nove sono in linea, il tetto del mese regge.');
    expect(verdict.tone).toBe('negative');
  });

  it('judges the ceiling on the projection, not on what is spent so far', () => {
    expect(buildBudgetEmailVerdict({ ...SUNDAY, overall: { spent: 2870, limit: 3000, projected: 3240 } }).headline).toBe(
      'Sette budget su nove sono in linea, e il tetto del mese non regge.',
    );
  });

  it('names the month’s position, and never the week', () => {
    const sentence = plain(buildBudgetEmailVerdict(SUNDAY).sentence);
    expect(sentence).toBe(
      'Al giorno 30 di 31 hai speso 2870 € del tetto mensile di 3000 €; ' +
        'al ritmo attuale la proiezione a fine mese è 2965 €. Uno è già oltre il limite, uno è vicino.',
    );
    expect(sentence).not.toMatch(/settiman/i);
  });

  it('is warning, not negative, when nothing has actually been exceeded', () => {
    expect(buildBudgetEmailVerdict({ ...SUNDAY, exceededCount: 0 }).tone).toBe('warning');
  });

  it('is positive when everything holds', () => {
    const verdict = buildBudgetEmailVerdict({ ...SUNDAY, onTrackCount: 9, atRiskCount: 0, exceededCount: 0 });
    expect(verdict.headline).toBe('Tutti i nove budget sono in linea, e il tetto regge.');
    expect(verdict.tone).toBe('positive');
  });

  it('says plainly when there are no budgets at all', () => {
    expect(
      buildBudgetEmailVerdict({ onTrackCount: 0, atRiskCount: 0, exceededCount: 0, overall: null, dayOfMonth: 30, daysInMonth: 31 })
        .headline,
    ).toBe('Non hai budget configurati.');
  });
});

describe('describeOverallCeiling', () => {
  it('puts the two percentages side by side, which is the only way either means anything', () => {
    expect(plain(describeOverallCeiling({ spent: 2870, limit: 3000, dayOfMonth: 30, daysInMonth: 31 }))).toBe(
      'Hai usato il 96% del tetto al 97% del mese: il passo è giusto.',
    );
  });

  it('calls out spending faster than the calendar', () => {
    expect(plain(describeOverallCeiling({ spent: 2400, limit: 3000, dayOfMonth: 10, daysInMonth: 31 }))).toContain(
      'stai spendendo più in fretta del tempo che passa',
    );
  });

  it('is absent without a ceiling', () => {
    expect(describeOverallCeiling({ spent: 900, limit: 0, dayOfMonth: 10, daysInMonth: 31 })).toBeNull();
  });
});

describe('describeMonthlyBudgetsTile', () => {
  const ROWS = [
    { label: 'Alimentari', ratio: 1.11, status: 'over' as const, isIncome: false },
    { label: 'Tempo libero', ratio: 0.9, status: 'warning' as const, isIncome: false },
    { label: 'Casa', ratio: 0.93, status: 'ok' as const, isIncome: false },
    { label: 'Stipendio', ratio: 1.03, status: 'ok' as const, isIncome: true },
  ];

  it('names what sfondò and what is close', () => {
    expect(plain(describeMonthlyBudgetsTile(ROWS))).toBe(
      'Alimentari ha sfondato il limite; Tempo libero chiuderà al limite se non cambia passo.',
    );
  });

  it('says plainly when nothing needs attention', () => {
    expect(
      plain(describeMonthlyBudgetsTile([{ label: 'Casa', ratio: 0.5, status: 'ok', isIncome: false }])),
    ).toBe('Un budget del mese è sotto il limite.');
  });

  it('ignores income targets when counting expense budgets', () => {
    expect(plain(describeMonthlyBudgetsTile([{ label: 'Stipendio', ratio: 1.03, status: 'ok', isIncome: true }]))).toBeNull();
  });
});

describe('describeAnnualBudgetsTile', () => {
  const ROWS = [
    { label: 'Vacanze', ratio: 0.747, status: 'ok' as const, isIncome: false },
    { label: 'Regali', ratio: 0.388, status: 'ok' as const, isIncome: false },
  ];

  it('compares the share consumed with the share of the YEAR gone', () => {
    expect(plain(describeAnnualBudgetsTile(ROWS, 66.3))).toBe(
      'Vacanze ha già consumato il 75% del suo budget con il 66% dell’anno alle spalle.',
    );
  });

  it('states pace, not a verdict: a row ahead of the calendar is still "ok"', () => {
    // `rowStatus` alone decides over/warning/ok, on the 80% threshold. The reading may say a
    // budget is ahead of the calendar without promoting it to a risk.
    expect(plain(describeAnnualBudgetsTile(ROWS, 66.3))).not.toMatch(/superat|oltre il limite/);
  });

  it('says so when every annual budget is behind the calendar', () => {
    expect(plain(describeAnnualBudgetsTile([{ label: 'Regali', ratio: 0.2, status: 'ok', isIncome: false }], 66.3))).toBe(
      'Tutti i budget dell’anno sono sotto il 66% di calendario già trascorso.',
    );
  });
});

describe('budgetWindowLabel', () => {
  it('never says "settimana", because no figure in that email is weekly', () => {
    expect(budgetWindowLabel('monthly', 'agosto')).toBe('dal 1° agosto a oggi');
    expect(budgetWindowLabel('annual', 'agosto')).toBe('da inizio anno a oggi');
  });
});
