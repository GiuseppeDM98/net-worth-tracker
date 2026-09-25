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
  narrativeToText,
  projectMonthEndSpending,
  resolveLivedCashflow,
  type Narrative,
  type OverviewVerdictInput,
} from '@/lib/utils/overviewNarrative';
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
      'Il patrimonio vale 412.380,52 €: −4155,63 € (−1,40%) su agosto, +8,29% da inizio anno. ' +
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
    cashflow: { savings: 2094.62, savingsRate: 44.92, scheduledExpenses: 1296.75, scheduledIncome: 0 },
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
      'Il patrimonio vale 297.209,77 €: +124,32 € (+0,04%) su agosto, +13,47% da inizio anno, nuovo massimo storico. ' +
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
      'Il patrimonio vale 412.380,52 €: +4120,18 € (+1,01%) su luglio, +8,29% da inizio anno, nuovo massimo storico. ' +
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
      'Il patrimonio vale 412.380,52 €: +4120,18 € (+1,01%) su dicembre, +8,29% da inizio anno. ' +
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
    cashflow: { savings: 1180, savingsRate: 28.2, scheduledExpenses: 0, scheduledIncome: 0 },
  };

  it('should split the month into market, savings and the other changes, exactly', () => {
    // 4120,18 = 3980 (market) + 1180 (saved) − 1039,82 (other).
    const text = plain(buildOverviewVerdict(WITH_CASHFLOW).sentence);
    expect(text).toContain('Hai messo da parte il 28% delle entrate finora; sul mercato');
    expect(text).toContain('Di quel movimento: +3980 € dal mercato, +1180 € risparmiati, −1040 € di altre variazioni.');
  });

  it('should drop the other changes under 1 €, and say «spesi oltre le entrate» for negative savings', () => {
    const exact = { ...WITH_CASHFLOW, cashflow: { ...WITH_CASHFLOW.cashflow!, savings: 140.5 } };
    expect(plain(buildOverviewVerdict(exact).sentence)).toContain('Di quel movimento: +3980 € dal mercato e +141 € risparmiati.');
    const overspent = { ...WITH_CASHFLOW, savingsRate: -10, cashflow: { ...WITH_CASHFLOW.cashflow!, savings: -300, savingsRate: -10 } };
    expect(plain(buildOverviewVerdict(overspent).sentence)).toContain('−300 € spesi oltre le entrate, +440 € di altre variazioni.');
  });

  it('should name the calendar beside the rate, both sides when both are scheduled', () => {
    const both = { ...WITH_CASHFLOW, cashflow: { ...WITH_CASHFLOW.cashflow!, scheduledExpenses: 1296.75, scheduledIncome: 2456.41 } };
    expect(plain(buildOverviewVerdict(both).sentence)).toContain(
      'Hai messo da parte il 28% delle entrate finora (in calendario altri 1297 € di spese e 2456 € di entrate); sul mercato',
    );
    const income = { ...WITH_CASHFLOW, cashflow: { ...WITH_CASHFLOW.cashflow!, scheduledIncome: 2456.41 } };
    expect(plain(buildOverviewVerdict(income).sentence)).toContain('finora (altri 2456 € di entrate in calendario);');
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
    expect(plain(describeCashflow(40, -6.4, 8)!)).toBe(
      'Messo da parte il 40%; spese in calo del 6,4% su luglio.',
    );
    expect(plain(describeCashflow(12.4, 3, 8)!)).toBe(
      'Messo da parte il 12%; spese in aumento del 3,0% su luglio.',
    );
    expect(plain(describeCashflow(-8, 0, 8)!)).toBe('Speso più di quanto è entrato.');
    expect(describeCashflow(null, 0, 8)).toBeNull();
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
