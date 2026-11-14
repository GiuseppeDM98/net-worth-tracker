/**
 * Tests for lib/utils/overviewNarrative.ts — the pure layer behind the Panoramica's
 * verdict headline and the one-line readings under each tile. No React, no Firebase:
 * the module only needs chartService's it-IT percentage formatter, whose Firebase chain
 * is mocked away exactly like __tests__/dashboardOverviewUtils.test.ts does.
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

import { ASSET_CLASS_SEQUENCE } from '@/lib/utils/allocationUtils';
import { PENSION_BAND_KEY } from '@/lib/utils/historyComposition';
import {
  atPreviousMonth,
  buildOverviewVerdict,
  describeCashflow,
  describeComposition,
  describeCosts,
  describeGoal,
  describeLiquidity,
  describeScheduledCaption,
  describeScheduledNetCaption,
  narrativeToText,
  overviewRestLabel,
  projectMonthEndSpending,
  resolveLivedCashflow,
  type Narrative,
  type OverviewVerdictInput,
} from '@/lib/utils/overviewNarrative';
import { splitVerdict } from '@/lib/utils/narrative';
import { readSavings } from '@/lib/utils/savingsRate';
import type { DashboardOverviewExpenseStats } from '@/types/dashboardOverview';

// Intl 'it-IT' separates the amount from "€" with a no-break space and leaves four-digit
// amounts ungrouped (CLDR minimumGroupingDigits = 2, see AGENTS.md → Italian Localization):
// expectations below are written the way the screen really prints them, with the nbsp
// flattened to a plain space for readability.
const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');

const AUGUST: OverviewVerdictInput = {
  month: 8,
  totalValue: 412380.52,
  monthlyVariation: { value: 4120.18, percentage: 1.01 },
  yearlyVariation: { value: 31560, percentage: 8.29 },
  isNewATH: true,
  savingsRate: 40,
  marketEffect: 3980,
  topMover: { assetClass: 'equity', delta: 3480 },
};

/**
 * The lived cashflow the page builds from the payload (`resolveLivedCashflow`): `income` and
 * `expenses` are the WHOLE month, calendar included, as the payload carries them.
 */
function livedOf(income: number, expenses: number, expensesScheduled = 0, incomeScheduled = 0) {
  return resolveLivedCashflow({
    currentMonth: { income, expenses, net: income - expenses, expensesScheduled, incomeScheduled },
  } as DashboardOverviewExpenseStats)!;
}

describe('buildOverviewVerdict — headline and tone', () => {
  it('should call a growing month with healthy savings a good month', () => {
    const verdict = buildOverviewVerdict(AUGUST);
    expect(verdict.headline).toBe('Agosto sta andando bene.');
    expect(verdict.tone).toBe('positive');
  });

  it('should warn when the net worth grows but spending exceeds income', () => {
    const verdict = buildOverviewVerdict({ ...AUGUST, savingsRate: -12 });
    expect(verdict.headline).toBe('Agosto cresce, ma le spese superano le entrate.');
    expect(verdict.tone).toBe('warning');
  });

  it('should blame the market for a falling month when the market effect is negative', () => {
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      monthlyVariation: { value: -2100, percentage: -0.5 },
      marketEffect: -2600,
      topMover: { assetClass: 'equity', delta: -2400 },
    });
    expect(verdict.headline).toBe('Agosto è in calo: il mercato ha pesato.');
    expect(verdict.tone).toBe('negative');
  });

  it('should NOT blame the market when the net worth fell while the market gained', () => {
    // Flows (spending, withdrawals) explain the drop — saying "il mercato" would be a lie.
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      monthlyVariation: { value: -2100, percentage: -0.5 },
      marketEffect: 900,
      topMover: { assetClass: 'equity', delta: 900 },
    });
    expect(verdict.headline).toBe('Agosto è in calo, nonostante il mercato.');
    expect(verdict.tone).toBe('warning');
  });

  // September 2026 on the real account: −4.937,74 € with the market at −1.078,73 € and 4.088,86 €
  // of estimated tax on a Vanguard sale — a fifth of the drop was the market's.
  const SEPTEMBER_SALE = {
    proceeds: 39052.45,
    realizedGain: 15726.38,
    estimatedTax: 4088.86,
    instruments: [{ id: 'vwce', name: 'Vanguard FTSE All-World', proceeds: 39052.45, realizedGain: 15726.38, estimatedTax: 4088.86 }],
    brokenLedgers: 0,
  };
  const SEPTEMBER: OverviewVerdictInput = {
    ...AUGUST,
    month: 9,
    monthlyVariation: { value: -4937.74, percentage: -1.66 },
    marketEffect: -1078.73,
    topMover: { assetClass: 'equity', delta: -815.94 },
    sales: SEPTEMBER_SALE,
  };

  it('should name the tax over the market when the estimated tax on a sale outweighs the market loss', () => {
    const verdict = buildOverviewVerdict(SEPTEMBER);
    expect(verdict.headline).toBe('Settembre è in calo: il mercato ha pesato, le tasse sulle vendite di più.');
    expect(verdict.tone).toBe('negative');
  });

  it('should name both when the market lost more than the tax', () => {
    const verdict = buildOverviewVerdict({ ...SEPTEMBER, marketEffect: -5000 });
    expect(verdict.headline).toBe('Settembre è in calo: il mercato ha pesato, e con lui le tasse sulle vendite.');
  });

  it('should name the flows over the market when no sale explains them', () => {
    const verdict = buildOverviewVerdict({ ...SEPTEMBER, sales: null });
    expect(verdict.headline).toBe('Settembre è in calo: più per le uscite che per il mercato.');
    expect(verdict.tone).toBe('negative');
  });

  it('should name the tax on the sale in the headline when the market gained and the tax explains the drop', () => {
    // The real account, settembre 2026: −4155,63 € with the market at +153 € and 4.089 € withheld
    // by the broker — «nonostante il mercato» stopped one step short of the cause (owner, 2026-09-13).
    const verdict = buildOverviewVerdict({
      ...SEPTEMBER,
      isNewATH: false,
      monthlyVariation: { value: -4155.63, percentage: -1.4 },
      marketEffect: 153,
      topMover: { assetClass: 'pension', delta: 256 },
    });
    expect(verdict.headline).toBe('Settembre è in calo per le tasse sulla vendita di Vanguard FTSE All-World, non per il mercato.');
    expect(verdict.tone).toBe('warning');
    // The sale comes right after the variation and carries the month without the tax, and the
    // pension band reads as a subject, not as its database key.
    expect(plain(verdict.sentence)).toBe(
      'Il patrimonio vale 412.380,52 €: −4155,63 € (−1,40%) su agosto, +8,29% da inizio anno (+31.560,00 €). ' +
        'Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 € e pagato circa 4089 € di tasse: ' +
        'senza, il mese avrebbe fatto −67 € (+153 € dal mercato e −220 € tra risparmio e altre variazioni). ' +
        'Hai messo da parte il 40% delle entrate; sul mercato hanno spinto soprattutto i fondi pensione (+256 €).',
    );
  });

  // The real account, settembre 2026 on the 19th: +124,32 € (+0,04%) with 4088,86 € withheld on a
  // VWCE sale and six instruments bought. The market counts the month's traded quotes too
  // (+1480,59 held + 537,88 traded), the savings are the ones already made (4662,73 − 2568,11), and
  // 1296,75 € of expenses are still in the calendar. The headline read «Settembre sta andando
  // bene», the split «+2733 € dai tuoi movimenti» (owner, 2026-09-19).
  const SEPTEMBER_FLAT: OverviewVerdictInput = {
    month: 9,
    totalValue: 297209.77,
    monthlyVariation: { value: 124.32, percentage: 0.04 },
    yearlyVariation: { value: 35288.88, percentage: 13.47 },
    isNewATH: true,
    savingsRate: 44.92,
    // 4663 − (3865,13 − 1296,75) = 2094,62 already saved, 44,92% of the income.
    cashflow: livedOf(4663, 3865.13, 1296.75, 0),
    marketEffect: 2018.47,
    topMover: { assetClass: 'crypto', delta: 725.63 },
    sales: {
      proceeds: 39052.45,
      realizedGain: 15726.38,
      estimatedTax: 4088.86,
      instruments: [{ id: 'vwce', name: 'VWCE', proceeds: 39052.45, realizedGain: 15726.38, estimatedTax: 4088.86 }],
      brokenLedgers: 0,
      purchases: { amount: 34305.1, instrumentCount: 6 },
    },
  };

  it('should name the tax in the headline when a flat month is flat only because of it', () => {
    const verdict = buildOverviewVerdict(SEPTEMBER_FLAT);
    expect(verdict.headline).toBe('Settembre è in pari: le tasse sulla vendita di VWCE si sono prese la crescita.');
    expect(verdict.tone).toBe('warning');
    expect(plain(verdict.sentence)).toBe(
      'Il patrimonio vale 297.209,77 €: +124,32 € (+0,04%) su agosto, +13,47% da inizio anno (+35.288,88 €), nuovo massimo storico. ' +
        'Hai venduto VWCE per 39.052 € con una plusvalenza di 15.726 € e pagato circa 4089 € di tasse: ' +
        'senza, il mese avrebbe fatto +4213 € (+2018 € dal mercato e +2095 € risparmiati). ' +
        'Nello stesso mese hai comprato 6 strumenti per 34.305 €. ' +
        'Hai messo da parte il 45% delle entrate finora (altri 1297 € di spese in calendario); ' +
        'sul mercato hanno spinto soprattutto le criptovalute (+726 €).',
    );
  });

  it('should say the tax took most of a growth that is still visible', () => {
    const verdict = buildOverviewVerdict({ ...SEPTEMBER_FLAT, monthlyVariation: { value: 3000, percentage: 1.02 } });
    expect(verdict.headline).toBe('Settembre cresce, ma le tasse sulla vendita di VWCE si sono prese più di metà della crescita.');
    expect(verdict.tone).toBe('warning');
  });

  it('should keep a good month good when the tax took less than half of the growth', () => {
    const verdict = buildOverviewVerdict({ ...SEPTEMBER_FLAT, monthlyVariation: { value: 4100, percentage: 1.4 } });
    expect(verdict.headline).toBe('Settembre sta andando bene.');
    expect(verdict.tone).toBe('positive');
    // The sale keeps its place at the end, still with the month without the tax.
    expect(plain(verdict.sentence)).toMatch(/\(\+726 €\)\. Hai venduto VWCE .* senza, il mese avrebbe fatto \+8189 €/);
  });

  it('should keep «nonostante il mercato» when the market gained and the tax is a minority of the drop', () => {
    const verdict = buildOverviewVerdict({
      ...SEPTEMBER,
      monthlyVariation: { value: -12000, percentage: -3 },
      marketEffect: 900,
      topMover: { assetClass: 'equity', delta: 900 },
    });
    expect(verdict.headline).toBe('Settembre è in calo, nonostante il mercato.');
    expect(verdict.tone).toBe('warning');
    // The taxed sale carries the split in three parts; the two-part one would mix the tax back in.
    expect(plain(verdict.sentence)).toContain('senza, il mese avrebbe fatto −7911 € (+900 € dal mercato e −8811 € tra risparmio e altre variazioni).');
    expect(plain(verdict.sentence)).not.toContain('Di quel movimento');
  });

  it('should stay neutral and factual without a prior snapshot to compare against', () => {
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      monthlyVariation: null,
      yearlyVariation: null,
      isNewATH: false,
      marketEffect: null,
      topMover: null,
    });
    expect(verdict.headline).toBe('Il tuo patrimonio ad agosto.');
    expect(verdict.tone).toBe('neutral');
  });

  it('should use the apostrophe form for vowel months', () => {
    expect(buildOverviewVerdict({ ...AUGUST, month: 10 }).headline).toBe('Ottobre sta andando bene.');
    expect(
      buildOverviewVerdict({ ...AUGUST, month: 4, monthlyVariation: null, marketEffect: null, topMover: null })
        .headline,
    ).toBe('Il tuo patrimonio ad aprile.');
    expect(
      buildOverviewVerdict({ ...AUGUST, month: 5, monthlyVariation: null, marketEffect: null, topMover: null })
        .headline,
    ).toBe('Il tuo patrimonio a maggio.');
  });
});

describe('buildOverviewVerdict — sentence', () => {
  it('should state value, monthly and yearly change, the record, savings and the market driver', () => {
    const text = plain(buildOverviewVerdict(AUGUST).sentence);
    expect(text).toBe(
      'Il patrimonio vale 412.380,52 €: +4120,18 € (+1,01%) su luglio, +8,29% da inizio anno (+31.560,00 €), nuovo massimo storico. ' +
        'Hai messo da parte il 40% delle entrate; sul mercato hanno spinto soprattutto le azioni (+3480 €). ' +
        'Di quel movimento: +3980 € dal mercato e +140 € tra risparmio e altre variazioni.',
    );
  });

  it('should close on the sale and the month without its tax, in three parts that add up', () => {
    const text = plain(
      buildOverviewVerdict({
        ...AUGUST,
        month: 9,
        isNewATH: false,
        monthlyVariation: { value: -4937.74, percentage: -1.66 },
        marketEffect: -1078.73,
        topMover: { assetClass: 'equity', delta: -815.94 },
        sales: {
          proceeds: 39052.45,
          realizedGain: 15726.38,
          estimatedTax: 4088.86,
          instruments: [{ id: 'vwce', name: 'Vanguard FTSE All-World', proceeds: 39052.45, realizedGain: 15726.38, estimatedTax: 4088.86 }],
          brokenLedgers: 0,
        },
      }).sentence,
    );
    // −4937,74 + 4088,86 = −848,88 = −1078,73 (market) + 229,85 (own flows net of the tax).
    expect(text).toContain(
      'sul mercato hanno pesato soprattutto le azioni (−816 €). ' +
        'Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 € e pagato circa 4089 € di tasse: ' +
        'senza, il mese avrebbe fatto −849 € (−1079 € dal mercato e +230 € tra risparmio e altre variazioni).',
    );
    expect(text).not.toContain('Di quel movimento');
    // A payload computed before `purchases` existed says nothing about purchases.
    expect(text).not.toContain('hai comprato');
  });

  it('should keep the two-part split when the sale carries no tax to take out', () => {
    const text = plain(
      buildOverviewVerdict({
        ...AUGUST,
        sales: {
          proceeds: 1000,
          realizedGain: -200,
          estimatedTax: 0,
          instruments: [{ id: 'a', name: 'A', proceeds: 1000, realizedGain: -200, estimatedTax: 0 }],
          brokenLedgers: 0,
          purchases: null,
        },
      }).sentence,
    );
    expect(text).toContain(
      'Di quel movimento: +3980 € dal mercato e +140 € tra risparmio e altre variazioni. ' +
        'Hai venduto A per 1000 € con una minusvalenza di 200 €, senza tasse.',
    );
  });

  it('should mark figures as mono with their sign so the UI can colour them', () => {
    const segments = buildOverviewVerdict(AUGUST).sentence;
    const monthly = segments.find((s) => s.text.startsWith('+4120,18'));
    expect(monthly).toMatchObject({ mono: true, sign: 'positive' });
    const value = segments.find((s) => s.text.startsWith('412.380,52'));
    expect(value).toMatchObject({ mono: true });
    expect(value?.sign).toBeUndefined();
  });

  it('should say a class weighed on the month when its market effect is negative', () => {
    const text = plain(
      buildOverviewVerdict({
        ...AUGUST,
        monthlyVariation: { value: -2100, percentage: -0.5 },
        marketEffect: -2600,
        topMover: { assetClass: 'crypto', delta: -2400 },
      }).sentence,
    );
    expect(text).toContain('−2100,00 € (−0,50%) su luglio');
    expect(text).toContain('sul mercato hanno pesato soprattutto le criptovalute (−2400 €)');
  });

  it('should conjugate singular classes', () => {
    const text = plain(
      buildOverviewVerdict({ ...AUGUST, topMover: { assetClass: 'trendFollowing', delta: 800 } }).sentence,
    );
    expect(text).toContain('sul mercato ha spinto soprattutto il trend following (+800 €)');
  });

  it('should drop the record and the driver when they do not apply, and roll December back to the previous year', () => {
    const text = plain(
      buildOverviewVerdict({
        ...AUGUST,
        month: 1,
        isNewATH: false,
        marketEffect: null,
        topMover: null,
      }).sentence,
    );
    expect(text).toBe(
      'Il patrimonio vale 412.380,52 €: +4120,18 € (+1,01%) su dicembre, +8,29% da inizio anno (+31.560,00 €). ' +
        'Hai messo da parte il 40% delle entrate.',
    );
  });

  it('should capitalise the driver when there is no savings clause before it', () => {
    const text = plain(buildOverviewVerdict({ ...AUGUST, savingsRate: null }).sentence);
    expect(text).toContain('. Sul mercato hanno spinto soprattutto le azioni (+3480 €).');
  });

  it('should give every asset class and the pension band a subject, so no key ever reaches the sentence', () => {
    for (const assetClass of [...ASSET_CLASS_SEQUENCE, PENSION_BAND_KEY]) {
      const text = plain(buildOverviewVerdict({ ...AUGUST, topMover: { assetClass, delta: 500 } }).sentence);
      // The subject is an Italian noun phrase with its article — never the bare key («soprattutto
      // pension», «soprattutto equity»); «il carry» is the one key that is also its own Italian word.
      expect(text).toMatch(/; sul mercato (hanno|ha) spinto soprattutto (le|gli|la|il|i) [a-zà-ù ]+ \(\+500 €\)\./);
      expect(text).not.toContain(`soprattutto ${assetClass} `);
    }
  });

  it('should drop the driver clause for a class it cannot name, instead of printing the key', () => {
    const text = plain(buildOverviewVerdict({ ...AUGUST, topMover: { assetClass: 'structuredNotes', delta: 500 } }).sentence);
    expect(text).toContain('Hai messo da parte il 40% delle entrate.');
    expect(text).not.toContain('structuredNotes');
    expect(text).not.toContain('sul mercato');
  });
});

describe('buildOverviewVerdict — the month split and the savings already made', () => {
  const WITH_CASHFLOW: OverviewVerdictInput = {
    ...AUGUST,
    savingsRate: 28.2,
    // 4200 − 3020 = 1180 saved (28,1% → «28%»).
    cashflow: livedOf(4200, 3020),
  };

  it('should split the month into market, savings and the other changes, exactly', () => {
    // 4120,18 = 3980 (market) + 1180 (saved) − 1039,82 (other).
    const text = plain(buildOverviewVerdict(WITH_CASHFLOW).sentence);
    expect(text).toContain('Hai messo da parte il 28% delle entrate finora; sul mercato');
    expect(text).toContain('Di quel movimento: +3980 € dal mercato, +1180 € risparmiati, −1040 € di altre variazioni.');
  });

  it("should name the month's pension contributions instead of «altre variazioni»", () => {
    // 4120,18 = 3980 + 1180 − 1039,82 of which −1039,82 is nothing the flows explain; with 1000 €
    // paid into the fund the rest is −2040 € (owner, 2026-10-14: the contributions are named).
    const withFlows = { ...WITH_CASHFLOW, monthFlows: { pensionPaidIn: 1000, debts: [] } };
    expect(plain(buildOverviewVerdict(withFlows).sentence)).toContain(
      'Di quel movimento: +3980 € dal mercato, +1180 € risparmiati, +1000 € versati nel fondo pensione, −2040 € di altre variazioni.',
    );
  });

  it('should drop the other changes under 1 €, and say «spesi oltre le entrate» for negative savings', () => {
    const exact = { ...WITH_CASHFLOW, cashflow: livedOf(4200, 4059.5) };
    expect(plain(buildOverviewVerdict(exact).sentence)).toContain('Di quel movimento: +3980 € dal mercato e +141 € risparmiati.');
    const overspent = { ...WITH_CASHFLOW, savingsRate: -10, cashflow: livedOf(3000, 3300) };
    expect(plain(buildOverviewVerdict(overspent).sentence)).toContain('−300 € spesi oltre le entrate, +440 € di altre variazioni.');
  });

  it('should name the calendar beside the rate, both sides when both are scheduled', () => {
    const both = { ...WITH_CASHFLOW, cashflow: livedOf(4200 + 2456.41, 3020 + 1296.75, 1296.75, 2456.41) };
    expect(plain(buildOverviewVerdict(both).sentence)).toContain(
      'Hai messo da parte il 28% delle entrate finora (in calendario altri 1297 € di spese e 2456 € di entrate); sul mercato',
    );
    const income = { ...WITH_CASHFLOW, cashflow: livedOf(4200 + 2456.41, 3020, 0, 2456.41) };
    expect(plain(buildOverviewVerdict(income).sentence)).toContain('finora (altri 2456 € di entrate in calendario);');
  });
});

// The three cases of the savings floor (owner, 2026-11-12): ① nothing in, 500 € out; ② 3 € in, 500 €
// out (−16.567% as a rate, so euros); ③ 2000 € in, 2600 € out, a true −30%. The calendar holds
// 1500 € of spending and 2600 € of income still to come; the whole month then closes at 23%.
describe('buildOverviewVerdict — the lived part below the savings floor', () => {
  const CALENDAR = { expenses: 1500, income: 2600 };
  const NO_INCOME = livedOf(CALENDAR.income, 500 + CALENDAR.expenses, CALENDAR.expenses, CALENDAR.income);
  const TINY_INCOME = livedOf(3 + CALENDAR.income, 500 + CALENDAR.expenses, CALENDAR.expenses, CALENDAR.income);
  const TRUE_RATE = livedOf(2000 + CALENDAR.income, 2600 + CALENDAR.expenses, CALENDAR.expenses, CALENDAR.income);
  const inputOf = (cashflow: ReturnType<typeof livedOf>): OverviewVerdictInput => ({
    ...AUGUST,
    topMover: null,
    savingsRate: cashflow.savingsRate,
    cashflow,
  });

  it('should say in euros a lived part without income, and how the calendar closes the month (V1)', () => {
    expect(plain(buildOverviewVerdict(inputOf(NO_INCOME)).sentence)).toContain(
      ' Nessuna entrata finora, 500 € di spese; con il calendario (2600 € di entrate, 1500 € di spese) il mese chiude al 23%.',
    );
  });

  it('should say a deficit larger than the income as a signed saving in euros (V2)', () => {
    const text = plain(buildOverviewVerdict(inputOf(TINY_INCOME)).sentence);
    expect(text).toContain(
      ' Finora hai messo da parte −497 €: le spese superano le entrate; con il calendario (2600 € di entrate, 1500 € di spese) il mese chiude al 23%.',
    );
    expect(text).not.toContain('delle entrate finora');
  });

  it('should keep a true −30% as a rate, with the calendar aside and no closing (V3)', () => {
    const text = plain(buildOverviewVerdict(inputOf(TRUE_RATE)).sentence);
    expect(text).toContain(' Hai messo da parte il −30% delle entrate finora (in calendario altri 1500 € di spese e 2600 € di entrate).');
    expect(text).not.toContain('con il calendario');
  });

  it('should end at the first clause with nothing in the calendar (V4)', () => {
    const noIncome = plain(buildOverviewVerdict(inputOf(livedOf(0, 500))).sentence);
    expect(noIncome).toContain(' Nessuna entrata finora, 500 € di spese.');
    expect(noIncome).not.toContain('con il calendario');
    const tinyIncome = plain(buildOverviewVerdict(inputOf(livedOf(3, 500))).sentence);
    expect(tinyIncome).toContain(' Finora hai messo da parte −497 €: le spese superano le entrate.');
    expect(tinyIncome).not.toContain('con il calendario');
  });

  it('should follow the whole month in the headline when the lived part is not a rate (V5-V6)', () => {
    // ② with a month that closes at 23%: not the warning.
    const closesPositive = buildOverviewVerdict(inputOf(TINY_INCOME));
    expect(closesPositive.headline).toBe('Agosto sta andando bene.');
    expect(closesPositive.tone).toBe('positive');
    // ② with only spending in the calendar: the whole month is a deficit too, the warning stays.
    const closesNegative = buildOverviewVerdict(inputOf(livedOf(3, 500 + CALENDAR.expenses, CALENDAR.expenses, 0)));
    expect(closesNegative.headline).toBe('Agosto cresce, ma le spese superano le entrate.');
    expect(closesNegative.tone).toBe('warning');
    expect(plain(closesNegative.sentence)).toContain(
      ' Finora hai messo da parte −497 €: le spese superano le entrate; con il calendario (1500 € di spese) il mese chiude a −1997 €.',
    );
  });

  // The article of every savings rate follows the figure as printed (The Comma Rule; «il 81%»
  // printed until 2026-11-14), «il» before a negative one as before.
  it('should say «l’81%» in the verdict and in the Cashflow tile', () => {
    expect(plain(buildOverviewVerdict(inputOf(livedOf(1000, 190))).sentence)).toContain(" Hai messo da parte l'81% delle entrate finora");
    expect(plain(describeCashflow(readSavings(1000, 190), 0, 8)!)).toBe("Messo da parte l'81%.");
    expect(plain(describeCashflow(readSavings(1000, 920), 0, 8)!)).toBe("Messo da parte l'8%.");
  });

  it('should take the article of the closing from the figure as printed (The Comma Rule)', () => {
    // 3 € in, 500 € out so far, a salary of 2600 € still to come: the month closes at 81%, «all'81%».
    expect(plain(buildOverviewVerdict(inputOf(livedOf(2603, 500, 0, 2600))).sentence)).toContain(
      ' Finora hai messo da parte −497 €: le spese superano le entrate; con il calendario (2600 € di entrate) il mese chiude all\'81%.',
    );
  });

  it('should keep the headline of a month where nothing has happened yet (V8)', () => {
    // Lived none, 300 € of spending in the calendar: no clause supports a warning.
    const verdict = buildOverviewVerdict(inputOf(livedOf(0, 300, 300, 0)));
    expect(verdict.headline).toBe('Agosto sta andando bene.');
  });

  it('should name «il risparmio» behind «Il perché» when the clause is in euros', () => {
    expect(buildOverviewVerdict(inputOf(TINY_INCOME)).restLabel).toBe('il patrimonio, il risparmio e il mercato del mese');
  });
});

describe('resolveLivedCashflow', () => {
  it('should take the scheduled slice out of both sides, like Tracciamento', () => {
    // The real account on 19 settembre 2026: the whole month said 17%, what had happened 45%.
    const lived = resolveLivedCashflow({
      currentMonth: { income: 4662.73, expenses: 3864.86, net: 797.87, expensesScheduled: 1296.75, incomeScheduled: 0 },
    } as DashboardOverviewExpenseStats)!;
    expect(lived.savings).toBeCloseTo(2094.62, 2);
    expect(lived.savingsRate).toBeCloseTo(44.92, 2);
    expect(lived.scheduledExpenses).toBe(1296.75);
  });

  it('should refuse a payload that predates incomeScheduled, and have no rate without income', () => {
    expect(resolveLivedCashflow({ currentMonth: { income: 100, expenses: 50, net: 50, expensesScheduled: 0 } } as DashboardOverviewExpenseStats)).toBeNull();
    expect(resolveLivedCashflow(null)).toBeNull();
    const salaryTomorrow = resolveLivedCashflow({
      currentMonth: { income: 2456, expenses: 300, net: 2156, expensesScheduled: 0, incomeScheduled: 2456 },
    } as DashboardOverviewExpenseStats)!;
    expect(salaryTomorrow.savingsRate).toBeNull();
    expect(salaryTomorrow.savings).toBe(-300);
  });
});

describe('atPreviousMonth', () => {
  it('should put the euphonic d before a vowel month and capitalise on request', () => {
    expect(atPreviousMonth(9)).toBe('ad agosto');
    expect(atPreviousMonth(9, true)).toBe('Ad agosto');
    expect(atPreviousMonth(5)).toBe('ad aprile');
    expect(atPreviousMonth(11)).toBe('ad ottobre');
    expect(atPreviousMonth(8)).toBe('a luglio');
    expect(atPreviousMonth(1)).toBe('a dicembre');
  });
});

describe('tile readings', () => {
  it('describeLiquidity should state the liquid share and amount', () => {
    expect(plain(describeLiquidity(38200, 262180, 412380.52)!)).toBe(
      'Il 72,8% è liquidabile: 300.380 €.',
    );
    expect(describeLiquidity(0, 0, 0)).toBeNull();
  });

  it('describeCashflow should read savings and the expense trend against the previous month', () => {
    expect(plain(describeCashflow(readSavings(1000, 600), -6.4, 8)!)).toBe(
      'Messo da parte il 40%; spese in calo del 6,4% su luglio.',
    );
    expect(plain(describeCashflow(readSavings(1000, 876), 3, 8)!)).toBe(
      'Messo da parte il 12%; spese in aumento del 3,0% su luglio.',
    );
    expect(plain(describeCashflow(readSavings(1000, 1080), 0, 8)!)).toBe('Speso più di quanto è entrato.');
    // Below the floor the tile still says it in words; without income it says nothing.
    expect(plain(describeCashflow(readSavings(3, 500), 0, 8)!)).toBe('Speso più di quanto è entrato.');
    expect(describeCashflow(readSavings(0, 500), 0, 8)).toBeNull();
    expect(describeCashflow(readSavings(0, 0), 0, 8)).toBeNull();
  });

  it('describeComposition should name the dominant class and the smallest one', () => {
    const classes = [
      { assetClass: 'equity', percentage: 52.4 },
      { assetClass: 'bonds', percentage: 18.1 },
      { assetClass: 'crypto', percentage: 2.7 },
    ];
    expect(plain(describeComposition(classes)!)).toBe(
      'Più della metà in azioni; criptovalute al 2,7%.',
    );
    expect(
      narrativeToText(
        describeComposition([
          { assetClass: 'bonds', percentage: 45 },
          { assetClass: 'equity', percentage: 40 },
          { assetClass: 'cash', percentage: 15 },
        ])!,
      ),
    ).toBe('Obbligazioni al 45,0%; liquidità al 15,0%.');
    expect(describeComposition([])).toBeNull();
    expect(plain(describeComposition([{ assetClass: 'equity', percentage: 100 }])!)).toBe(
      'Tutto in azioni.',
    );
  });

  it('describeComposition should articulate the preposition on the figure AS PRINTED', () => {
    // Found at the browser collaudo of 2026-08-30: a hard-coded «al » printed «carry al 0,1%».
    // A class rounding to zero takes «allo», a vowel-initial number name takes «all'».
    expect(
      plain(
        describeComposition([
          { assetClass: 'equity', percentage: 45 },
          { assetClass: 'carry', percentage: 0.06 },
        ])!,
      ),
    ).toBe("Azioni al 45,0%; carry allo 0,1%.");
    expect(
      plain(
        describeComposition([
          { assetClass: 'bonds', percentage: 8.5 },
          { assetClass: 'trendFollowing', percentage: 11.2 },
        ])!,
      ),
    ).toBe("Trend following all'11,2%; obbligazioni all'8,5%.");
  });

  it('describeCosts should convert the annual cost into a monthly weight and a share of the portfolio', () => {
    expect(plain(describeCosts(1034, 412380.52)!)).toBe('Pesa 86 € al mese, lo 0,25% del patrimonio.');
    expect(plain(describeCosts(1034, 0)!)).toBe('Pesa 86 € al mese.');
    expect(describeCosts(0, 412380.52)).toBeNull();
  });

  it('describeGoal should state what is still missing', () => {
    expect(plain(describeGoal(38000, 100000)!)).toBe('Mancano 62.000 €.');
    expect(plain(describeGoal(100000, 100000)!)).toBe('Obiettivo raggiunto.');
  });
});

describe('projectMonthEndSpending', () => {
  it('should extrapolate the spending so far linearly to the end of the month', () => {
    expect(projectMonthEndSpending(4372, 22, 31)).toBeCloseTo(6160.55, 1);
  });

  it('should equal the spending so far on the last day of the month', () => {
    expect(projectMonthEndSpending(4372, 31, 31)).toBe(4372);
  });

  it('should return null when the month has not started or the calendar is malformed', () => {
    expect(projectMonthEndSpending(100, 0, 31)).toBeNull();
    expect(projectMonthEndSpending(100, 5, 0)).toBeNull();
  });
});

/**
 * Where a phone cuts the verdict (since 2026-10-11; The Binding-Clause Rule and doc/guide/panoramica.md).
 * Falsified on 2026-10-11, one at a time: «title only» went red with `leadLength` set to the
 * first sentence's length; the taxed-story cut went red moved one segment earlier (the tax's
 * `binding` segment past the cut cancelled it, no «Il perché» at all) and one later (the savings
 * clause's first segment landed in the lead); the whole-paragraph case went red with `binding`
 * removed from `describeSales`; the unsigned zero went red (in the retirement, the same day) with
 * the `isPrintedZero` branch removed from `signed` («+0,00 €»).
 */
describe('buildOverviewVerdict — the phone cut', () => {
  it('should cut under the title: the strip restates the first sentence, the rest is «Il perché»', () => {
    const verdict = buildOverviewVerdict(AUGUST);
    expect(verdict.leadLength).toBe(0);
    expect(verdict.restLabel).toBe('il patrimonio, il risparmio e il mercato del mese');

    const split = splitVerdict(verdict);
    expect(split.lead).toEqual([]);
    expect(plain(split.rest)).toBe(plain(verdict.sentence));
    expect(split.restLabel).toBe('il patrimonio, il risparmio e il mercato del mese');
  });

  it('should cut AFTER the sale when the headline names its tax: the tax stays on the first screen', () => {
    // The flat month: the lead is the first sentence, the sale and the purchases; the savings and
    // the market go behind «Il perché».
    const SEPTEMBER_FLAT: OverviewVerdictInput = {
      month: 9,
      totalValue: 300000,
      monthlyVariation: { value: 100, percentage: 0.03 },
      yearlyVariation: { value: 30000, percentage: 11.11 },
      isNewATH: false,
      savingsRate: 40,
      cashflow: livedOf(5000, 3000),
      marketEffect: 2000,
      topMover: { assetClass: 'equity', delta: 1500 },
      sales: {
        proceeds: 40000,
        realizedGain: 16000,
        estimatedTax: 4160,
        instruments: [{ id: 'a', name: 'VWCE', proceeds: 40000, realizedGain: 16000, estimatedTax: 4160 }],
        brokenLedgers: 0,
        purchases: { amount: 30000, instrumentCount: 2 },
      },
    };
    const verdict = buildOverviewVerdict(SEPTEMBER_FLAT);
    expect(verdict.headline).toContain('è in pari');
    const split = splitVerdict(verdict);
    expect(plain(split.lead)).toBe(
      'Il patrimonio vale 300.000,00 €: +100,00 € (+0,03%) su agosto, +11,11% da inizio anno (+30.000,00 €). ' +
        'Hai venduto VWCE per 40.000 € con una plusvalenza di 16.000 € e pagato circa 4160 € di tasse: ' +
        'senza, il mese avrebbe fatto +4260 € (+2000 € dal mercato, +2000 € risparmiati, +260 € di altre variazioni). ' +
        'Nello stesso mese hai comprato 2 strumenti per 30.000 €.',
    );
    expect(plain(split.rest)).toBe(' Hai messo da parte il 40% delle entrate finora; sul mercato hanno spinto soprattutto le azioni (+1500 €).');
    expect(split.restLabel).toBe('il patrimonio, il risparmio e il mercato del mese');
    // The cut sits on a segment boundary, right after the sale clause.
    expect(verdict.leadLength).toBe(verdict.sentence.findIndex((segment) => segment.text.startsWith(' Hai messo da parte')));
  });

  it('should keep the whole paragraph on a phone when a taxed sale is not the story (its clause is binding)', () => {
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      sales: {
        proceeds: 10000,
        realizedGain: 2000,
        estimatedTax: 520,
        instruments: [{ id: 'a', name: 'A', proceeds: 10000, realizedGain: 2000, estimatedTax: 520 }],
        brokenLedgers: 0,
      },
    });
    expect(verdict.headline).toBe('Agosto sta andando bene.');
    expect(verdict.leadLength).toBe(0);
    const split = splitVerdict(verdict);
    expect(split.rest).toEqual([]);
    expect(split.restLabel).toBeNull();
    expect(plain(split.lead)).toContain('pagato circa 520 € di tasse');
  });

  it('should hide a sale without tax behind «Il perché» and name it in the label', () => {
    const verdict = buildOverviewVerdict({
      ...AUGUST,
      sales: {
        proceeds: 1000,
        realizedGain: -200,
        estimatedTax: 0,
        instruments: [{ id: 'a', name: 'A', proceeds: 1000, realizedGain: -200, estimatedTax: 0 }],
        brokenLedgers: 0,
        purchases: null,
      },
    });
    expect(verdict.restLabel).toBe('il patrimonio, il risparmio, il mercato e la vendita del mese');
    expect(splitVerdict(verdict).rest.length).toBeGreaterThan(0);
  });

  it('should set no cut when the sentence ends at the lead', () => {
    // The taxed story with nothing after the sale: no savings, no market.
    const verdict = buildOverviewVerdict({
      month: 9,
      totalValue: 300000,
      monthlyVariation: { value: 100, percentage: 0.03 },
      yearlyVariation: null,
      isNewATH: false,
      savingsRate: null,
      marketEffect: null,
      topMover: null,
      sales: {
        proceeds: 40000,
        realizedGain: 16000,
        estimatedTax: 4160,
        instruments: [{ id: 'a', name: 'VWCE', proceeds: 40000, realizedGain: 16000, estimatedTax: 4160 }],
        brokenLedgers: 0,
      },
    });
    expect(verdict.leadLength).toBeUndefined();
    expect(verdict.restLabel).toBeUndefined();
  });

  it('should print a zero without a sign and without a colour, −0,004 included', () => {
    const verdict = buildOverviewVerdict({ ...AUGUST, monthlyVariation: { value: -0.004, percentage: 0 }, yearlyVariation: { value: 0, percentage: -0.001 } });
    expect(plain(verdict.sentence)).toContain('Il patrimonio vale 412.380,52 €: 0,00 € (0,00%) su luglio, 0,00% da inizio anno (0,00 €)');
    const zero = verdict.sentence.find((segment) => plain([segment]) === '0,00 €');
    expect(zero).toMatchObject({ mono: true });
    expect(zero?.sign).toBeUndefined();
  });

  it('should print the year\'s euro in brackets after its percentage, signed', () => {
    const segments = buildOverviewVerdict({ ...AUGUST, yearlyVariation: { value: -2500, percentage: -0.6 } }).sentence;
    expect(plain(segments)).toContain(', −0,60% da inizio anno (−2500,00 €)');
    expect(segments.find((segment) => segment.text.startsWith('−2500'))).toMatchObject({ mono: true, sign: 'negative' });
  });
});

/** Seen red on 2026-10-11 (the retirement) with «il patrimonio» removed from the list: four tests, this one first. */
describe('overviewRestLabel', () => {
  it('should always open on «il patrimonio» and close on «del mese», the subjects in a fixed order', () => {
    expect(overviewRestLabel({ savings: false, market: false, sale: false })).toBe('il patrimonio del mese');
    expect(overviewRestLabel({ savings: true, market: false, sale: false })).toBe('il patrimonio e il risparmio del mese');
    expect(overviewRestLabel({ savings: false, market: true, sale: false })).toBe('il patrimonio e il mercato del mese');
    expect(overviewRestLabel({ savings: false, market: false, sale: true })).toBe('il patrimonio e la vendita del mese');
    expect(overviewRestLabel({ savings: true, market: true, sale: false })).toBe('il patrimonio, il risparmio e il mercato del mese');
    expect(overviewRestLabel({ savings: true, market: false, sale: true })).toBe('il patrimonio, il risparmio e la vendita del mese');
    expect(overviewRestLabel({ savings: false, market: true, sale: true })).toBe('il patrimonio, il mercato e la vendita del mese');
    expect(overviewRestLabel({ savings: true, market: true, sale: true })).toBe('il patrimonio, il risparmio, il mercato e la vendita del mese');
  });
});

/**
 * The calendar as a caption under a figure (The Scheduled-Is-Not-Spent Rule).
 * Falsified on 2026-10-11: the floor case went red with `> 0` in place of `>= 1`; the words went
 * red with «già» dropped.
 */
describe('describeScheduledCaption', () => {
  it('should say the amount is inside the figure, with the words of scheduledSentence and the horizon', () => {
    expect(plain(describeScheduledCaption(350, 30)!)).toBe('di cui 350 € già in calendario, entro il 30');
    expect(plain(describeScheduledCaption(350, 30)!.filter((segment) => segment.mono))).toBe('350 €');
  });

  it('should drop the caption under one euro', () => {
    expect(describeScheduledCaption(0, 30)).toBeNull();
    expect(describeScheduledCaption(0.5, 30)).toBeNull();
    expect(describeScheduledCaption(1, 31)).not.toBeNull();
  });

  it('should name both sides under the month\'s savings, or the one side that is scheduled', () => {
    expect(plain(describeScheduledNetCaption(350, 2456, 30)!)).toBe('di cui 350 € di spese e 2456 € di entrate già in calendario, entro il 30');
    expect(plain(describeScheduledNetCaption(350, 0.2, 30)!)).toBe('di cui 350 € di spese già in calendario, entro il 30');
    expect(plain(describeScheduledNetCaption(0, 2456, 31)!)).toBe('di cui 2456 € di entrate già in calendario, entro il 31');
    expect(describeScheduledNetCaption(0, 0, 30)).toBeNull();
  });
});
