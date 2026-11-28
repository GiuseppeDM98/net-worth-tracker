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
  periodSubject,
  periodTitle,
  periodKindLabel,
  periodScopeLabel,
  periodBaselineLabel,
  periodBaselineHeading,
  yearEarlierHeading,
  type EmailPeriod,
  type PeriodEmailVerdictInput,
} from '@/lib/utils/emailNarrative';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

const plain = (narrative: Narrative | null) =>
  narrative === null ? null : narrativeToText(narrative).replace(/ /g, ' ');

const AUGUST: EmailPeriod = { kind: 'monthly', year: 2026, month: 8 };
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
  it('names both kinds as a masculine singular subject, so one verb agreement serves both', () => {
    expect(periodSubject(AUGUST)).toBe('Agosto');
    expect(periodSubject(YEAR)).toBe('Il 2026');
  });

  it('titles the email', () => {
    expect(periodTitle(AUGUST)).toBe('Agosto 2026');
    expect(periodTitle(YEAR)).toBe('Anno 2026');
  });

  it('labels the kind of report in the eyebrow', () => {
    expect(periodKindLabel('monthly')).toBe('Riepilogo mensile');
    expect(periodKindLabel('yearly')).toBe('Riepilogo annuale');
  });

  it('gives every flow tile a scope, because an email has no period picker', () => {
    expect(periodScopeLabel(AUGUST)).toBe('agosto 2026');
    expect(periodScopeLabel(YEAR)).toBe('2026');
  });

  it('names the baseline inside a sentence', () => {
    expect(periodBaselineLabel(AUGUST)).toBe('luglio');
    expect(periodBaselineLabel(YEAR)).toBe('il 2025');
  });

  it('wraps the year on a January email, in the sentence and in the heading', () => {
    const january: EmailPeriod = { kind: 'monthly', year: 2026, month: 1 };
    expect(periodBaselineLabel(january)).toBe('dicembre');
    expect(periodBaselineHeading(january)).toBe('Dicembre 2025');
  });

  it('names the same period one year earlier', () => {
    expect(yearEarlierHeading(AUGUST)).toBe('Agosto 2025');
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

  // The fallback without a baseline: a deficit is said as the email's tile says it, never as a
  // negative «messo da parte» (owner, 2026-11-12) (E1).
  it('says a deficit without a baseline in euros, never as a negative share', () => {
    const verdict = buildPeriodEmailVerdict({ ...GROWING, previousNetWorth: 0, rank: null, totalIncome: 2000, totalExpenses: 2600 });
    expect(plain(verdict.sentence)).toBe('Il patrimonio vale 312.480 €. Sono usciti 600 € più di quanto è entrato.');
    const tiny = buildPeriodEmailVerdict({ ...GROWING, previousNetWorth: 0, rank: null, totalIncome: 3, totalExpenses: 500 });
    expect(plain(tiny.sentence)).toBe('Il patrimonio vale 312.480 €. Sono usciti 497 € più di quanto è entrato.');
  });

  /**
   * The pension contributions and the debts repaid are the user's money, taken out of the
   * residual by the caller (`marketEffectOf`) and named here (owner, 2026-10-14): left in, the
   * month's TFR read as «mercato». 4310 = 2130 + 1180 + 300 + 700.
   */
  it('names the pension contributions and each debt repaid beside the market, uncoloured', () => {
    const verdict = buildPeriodEmailVerdict({
      ...GROWING,
      marketEffect: 2130,
      flows: { pensionPaidIn: 700, debts: [{ name: 'Mutuo', repaid: 300 }] },
    });
    expect(plain(verdict.sentence)).toContain(
      'Di quel movimento, +2130 € viene dal mercato, +1180 € da quanto hai risparmiato, +300 € dal debito rimborsato (Mutuo) e +700 € da quanto hai versato nel fondo pensione.',
    );
    expect(verdict.sentence.find((segment) => segment.text.replace(/ /g, ' ') === '+700 €')?.sign).toBeUndefined();
  });

  it('splits the movement into market and savings, exactly', () => {
    expect(plain(buildPeriodEmailVerdict(GROWING).sentence)).toBe(
      'Il patrimonio vale 312.480 €: +4310 € (+1,40%) su luglio. ' +
        'Di quel movimento, +3130 € viene dal mercato e +1180 € da quanto hai risparmiato. ' +
        'È il 7° mese migliore su 34 registrati.',
    );
  });

  it('takes the tax on a sale out of the market and names it, in the headline and in the split', () => {
    // A falling month with a taxed sale, as the email sees it: Δ −5000 €, +1000 € saved, 4160 € of
    // estimated tax — the service hands a residual already net of that tax
    // (−5000 − 1000 + 4160 = −1840), and the tax is its own third part.
    const verdict = buildPeriodEmailVerdict({
      ...GROWING,
      period: { kind: 'monthly', year: 2026, month: 9 },
      netWorthDelta: -5000,
      netWorthDeltaPct: -1.66,
      totalIncome: 2800,
      totalExpenses: 1800,
      marketEffect: -1840,
      sales: {
        proceeds: 40000,
        realizedGain: 16000,
        estimatedTax: 4160,
        instruments: [{ id: 'orni', name: 'Ornitorinco World', proceeds: 40000, realizedGain: 16000, estimatedTax: 4160 }],
        brokenLedgers: 0,
      },
      rank: null,
    });
    expect(verdict.headline).toBe('Settembre è in calo: il mercato ha pesato, le tasse sulle vendite di più.');
    expect(plain(verdict.sentence)).toBe(
      'Il patrimonio vale 312.480 €: −5000 € (−1,66%) su agosto. ' +
        'Di quel movimento, −1840 € viene dal mercato, +1000 € da quanto hai risparmiato e −4160 € dalle tasse sulle vendite. ' +
        'Hai venduto Ornitorinco World per 40.000 € con una plusvalenza di 16.000 € e pagato circa 4160 € di tasse.',
    );
  });

  it('names the tax in the headline when it took the growth, and tells what was bought beside the sale', () => {
    // A flat month as a monthly email sees it: +120 € (+0,04%) with 4160 € withheld on ORNI and
    // six instruments bought in the month.
    const sales = {
      proceeds: 40000,
      realizedGain: 16000,
      estimatedTax: 4160,
      instruments: [{ id: 'orni', name: 'ORNI', proceeds: 40000, realizedGain: 16000, estimatedTax: 4160 }],
      brokenLedgers: 0,
      purchases: { amount: 34000, instrumentCount: 6 },
    };
    const flat = buildPeriodEmailVerdict({
      ...GROWING,
      period: { kind: 'monthly', year: 2026, month: 9 },
      netWorthDelta: 120,
      netWorthDeltaPct: 0.04,
      sales,
      rank: null,
    });
    expect(flat.headline).toBe('Settembre è in pari: le tasse sulla vendita di ORNI si sono prese la crescita.');
    expect(flat.tone).toBe('warning');
    expect(plain(flat.sentence)).toContain('pagato circa 4160 € di tasse. Nello stesso mese hai comprato 6 strumenti per 34.000 €.');

  });

  it('keeps the two-part split when the sale carried no tax', () => {
    const verdict = buildPeriodEmailVerdict({
      ...GROWING,
      sales: { proceeds: 1000, realizedGain: -200, estimatedTax: 0, instruments: [{ id: 'a', name: 'A', proceeds: 1000, realizedGain: -200, estimatedTax: 0 }], brokenLedgers: 0 },
      rank: null,
    });
    expect(plain(verdict.sentence)).toBe(
      'Il patrimonio vale 312.480 €: +4310 € (+1,40%) su luglio. ' +
        'Di quel movimento, +3130 € viene dal mercato e +1180 € da quanto hai risparmiato. ' +
        'Hai venduto A per 1000 € con una minusvalenza di 200 €, senza tasse.',
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

});

// ─── Tile readings ────────────────────────────────────────────────────────────

describe('describeNetWorthTile', () => {
  it('reads the change against the named baseline', () => {
    expect(
      plain(describeNetWorthTile({ period: AUGUST, previousNetWorth: 308170, netWorthDelta: 4310, netWorthDeltaPct: 1.4 })),
    ).toBe('Rispetto a luglio è salito di +4310 €, il +1,40%.');
  });

  it('puts the article on a year: «Rispetto al 2025», never «a il 2025»', () => {
    expect(
      plain(describeNetWorthTile({ period: YEAR, previousNetWorth: 90000, netWorthDelta: 14000, netWorthDeltaPct: 15.56 })),
    ).toBe('Rispetto al 2025 è salito di +14.000 €, il +15,56%.');
    expect(plain(buildPeriodEmailVerdict({ ...GROWING, period: YEAR, rank: null }).sentence)).toContain('(+1,40%) sul 2025.');
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

  it('names the tax on the sales as its own part, as an estimate', () => {
    expect(plain(describeMarketSplit(-1840, 1000, 4160))).toBe(
      'Mercato −1840 €, risparmio +1000 €, tasse sulle vendite circa −4160 €. È un residuo strutturale: assorbe anche i movimenti non tracciati.',
    );
    expect(plain(describeMarketSplit(3130, 1180, 0))).not.toContain('tasse');
  });

  it('names the debt repaid and the pension contributions as their own parts', () => {
    expect(plain(describeMarketSplit(2130, 1180, null, { pensionPaidIn: 700, debts: [{ name: 'Mutuo', repaid: 300 }] }))).toBe(
      'Mercato +2130 €, risparmio +1180 €, debito rimborsato +300 €, fondo pensione +700 €. È un residuo strutturale: assorbe anche i movimenti non tracciati.',
    );
    expect(plain(describeMarketSplit(2130, 1180, null, { pensionPaidIn: 0, debts: [] }))).toBe(
      'Mercato +2130 €, risparmio +1180 €. È un residuo strutturale: assorbe anche i movimenti non tracciati.',
    );
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
  // The article follows the figure as printed (The Comma Rule; «il 81,0%» until 2026-11-14).
  it('says «l’81,0%» in the tile and in the verdict without a baseline', () => {
    expect(plain(describeCashflowTile({ totalIncome: 1000, totalExpenses: 190 }))).toBe("Hai messo da parte 810 €, l'81,0% di quanto è entrato.");
    const verdict = buildPeriodEmailVerdict({ ...GROWING, previousNetWorth: 0, rank: null, totalIncome: 1000, totalExpenses: 190 });
    expect(plain(verdict.sentence)).toContain("Hai messo da parte +810 €, l'81,0% di quanto è entrato.");
  });

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
    ).toBe('Stipendio copre l\'86,1% di quanto è entrato.');
  });

  it('takes the article from the share as printed (The Comma Rule)', () => {
    expect(plain(describeIncomeCategoriesTile([{ name: 'Stipendio', amount: 3000 }, { name: 'Altro', amount: 7000 }], 5))).toBe(
      'Altro copre il 70,0% di quanto è entrato.',
    );
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
          { label: 'Spese Necessarie', amount: 1640 },
          { label: 'Spese Non Necessarie', amount: 1180 },
          { label: 'Debiti', amount: 180 },
        ]),
      ),
    ).toBe('Spese Necessarie 1640 € (54,7%) · Spese Non Necessarie 1180 € (39,3%) · Debiti 180 € (6,0%).');
  });

  it('omits a type with nothing in it, rather than printing a zero row', () => {
    const reading = plain(
      describeExpenseTypes([
        { label: 'Spese Necessarie', amount: 1640 },
        { label: 'Debiti', amount: 0 },
      ]),
    );
    expect(reading).toBe('Spese Necessarie 1640 € (100,0%).');
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

describe('buildPeriodEmailVerdict — the tax weighed on the change', () => {
  const SALE = (tax: number) => ({
    proceeds: 9000,
    realizedGain: 3500,
    estimatedTax: tax,
    instruments: [{ id: 'orni', name: 'ORNI', proceeds: 9000, realizedGain: 3500, estimatedTax: tax }],
    brokenLedgers: 0,
  });
  const FALLING = { ...GROWING, netWorthDelta: -10000, netWorthDeltaPct: -3, marketEffect: -20000, rank: null };

  it('should name a tax material on the period change, and drop one that is not', () => {
    // 900 € is past max(100 €, 5% of −10.000 €); against the market's −20.000 € it would not be.
    expect(buildPeriodEmailVerdict({ ...FALLING, sales: SALE(900) }).headline).toBe('Agosto è in calo: il mercato ha pesato, e con lui le tasse sulle vendite.');
    expect(buildPeriodEmailVerdict({ ...FALLING, sales: SALE(2) }).headline).toBe('Agosto è in calo: il mercato ha pesato.');
  });
});
