/**
 * Tests for lib/utils/salesNarrative.ts — the words for a period's sales and the market-vs-flows
 * split, shared by the Panoramica, Patrimonio and the periodic email. SDK-free like
 * emailNarrative: no Firebase mock at the top of this file, on purpose.
 *
 * Intl 'it-IT' puts a no-break space before `€` and leaves four-digit amounts ungrouped
 * (`4160 €` but `40.000 €`): expectations are written the way the reader sees them, nbsp flattened.
 */

import { describe, expect, it } from 'vitest';

import {
  declineHeadlineTail,
  describeMonthSplit,
  describePurchases,
  describeSales,
  isMaterialOtherChange,
  taxedGrowthHeadline,
} from '@/lib/utils/salesNarrative';
import type { PeriodSalesSummary } from '@/lib/utils/periodSales';
import { narrativeToText, type Narrative } from '@/lib/utils/narrative';

const plain = (narrative: Narrative) => narrativeToText(narrative).replace(/ /g, ' ');
const text = (segment: { text: string }) => segment.text.replace(/ /g, ' ');

const SEPTEMBER_SALE: PeriodSalesSummary = {
  proceeds: 40000,
  realizedGain: 16000,
  estimatedTax: 4160,
  instruments: [{ id: 'orni', name: 'Ornitorinco World', proceeds: 40000, realizedGain: 16000, estimatedTax: 4160 }],
  brokenLedgers: 0,
};

describe('describeSales', () => {
  it('should say what was sold, the gain and the tax already paid — in the past tense, as an estimate', () => {
    // Regime amministrato: the broker withholds the tax at the sale, so «pagato», never «pagherai»;
    // «circa» because the figure comes from the instrument's rate, not from the broker's statement.
    expect(plain(describeSales(SEPTEMBER_SALE))).toBe(
      'Hai venduto Ornitorinco World per 40.000 € con una plusvalenza di 16.000 € e pagato circa 4160 € di tasse.',
    );
  });

  it('should drop «circa» when the whole tax is what the broker withheld', () => {
    const withheld: PeriodSalesSummary = { ...SEPTEMBER_SALE, estimatedTax: 4170, taxIsWithheld: true };
    expect(plain(describeSales(withheld))).toBe(
      'Hai venduto Ornitorinco World per 40.000 € con una plusvalenza di 16.000 € e pagato 4170 € di tasse.',
    );
  });

  it('should count the instruments when more than one was sold', () => {
    const two: PeriodSalesSummary = {
      ...SEPTEMBER_SALE,
      instruments: [SEPTEMBER_SALE.instruments[0], { id: 'b', name: 'B', proceeds: 100, realizedGain: 10, estimatedTax: 2.6 }],
    };
    expect(plain(describeSales(two))).toContain('Hai venduto 2 strumenti per 40.000 €');
  });

  it('should name a loss and say there is no tax on it', () => {
    const loss: PeriodSalesSummary = { ...SEPTEMBER_SALE, realizedGain: -1200, estimatedTax: 0 };
    expect(plain(describeSales(loss))).toBe(
      'Hai venduto Ornitorinco World per 40.000 € con una minusvalenza di 1200 €, senza tasse.',
    );
  });

  it('should say the tax is not estimated when the rate is missing, instead of printing zero', () => {
    const noRate: PeriodSalesSummary = { ...SEPTEMBER_SALE, estimatedTax: null };
    expect(plain(describeSales(noRate))).toBe(
      "Hai venduto Ornitorinco World per 40.000 € con una plusvalenza di 16.000 €; senza un'aliquota sullo strumento le tasse non sono stimate.",
    );
    const twoNoRate: PeriodSalesSummary = {
      ...noRate,
      instruments: [noRate.instruments[0], { id: 'b', name: 'B', proceeds: 100, realizedGain: 10, estimatedTax: null }],
    };
    expect(plain(describeSales(twoNoRate))).toContain("senza un'aliquota su ogni strumento");
  });

  it('should mark the figures mono and the tax as a plain figure, not a loss', () => {
    const segments = describeSales(SEPTEMBER_SALE);
    const tax = segments.find((segment) => segment.text.startsWith('4160'));
    expect(tax).toMatchObject({ mono: true });
    expect(tax?.sign).toBeUndefined();
  });

  /**
   * The Binding-Clause Rule (since 2026-10-11): the tax and the counterfactual are the clauses
   * a phone never hides behind a tap. Falsified on 2026-10-11 with the `binding` wrapper removed
   * from the tax: this test and `e2e/overview.mobile.spec.ts` (the taxed month) went red.
   */
  it('should bind the tax and the month without it, and nothing else', () => {
    const segments = describeSales(SEPTEMBER_SALE, { delta: -5000, marketEffect: -1100, savings: null });
    const bound = segments.filter((segment) => segment.binding).map(text).join('');
    const free = segments.filter((segment) => !segment.binding).map(text).join('');
    expect(bound).toBe(
      ' e pagato circa 4160 € di tasse: senza, il mese avrebbe fatto −840 € (−1100 € dal mercato e +260 € tra risparmio e altre variazioni).',
    );
    expect(free).toBe('Hai venduto Ornitorinco World per 40.000 € con una plusvalenza di 16.000 €');
  });

  it('should bind the tax even at zero, and nothing on a loss or a missing rate', () => {
    const zeroTax = describeSales({ ...SEPTEMBER_SALE, realizedGain: 10, estimatedTax: 0 });
    expect(zeroTax.filter((segment) => segment.binding).map(text).join('')).toBe(' e pagato circa 0 € di tasse');
    expect(describeSales({ ...SEPTEMBER_SALE, realizedGain: -1200, estimatedTax: 0 }).some((segment) => segment.binding)).toBe(false);
    expect(describeSales({ ...SEPTEMBER_SALE, estimatedTax: null }).some((segment) => segment.binding)).toBe(false);
  });
});

describe('describeMonthSplit', () => {
  it('should split the change into the market, the savings and the other changes, exactly', () => {
    // 4120,18 = 3980 + 1180 − 1039,82: «tuoi movimenti» was read as income − expenses, so the savings
    // are named and what is left has its own name (owner, 2026-09-19).
    expect(plain(describeMonthSplit({ delta: 4120.18, marketEffect: 3980, savings: 1180 }))).toBe(
      'Di quel movimento: +3980 € dal mercato, +1180 € risparmiati, −1040 € di altre variazioni.',
    );
  });

  it('should say what the second part holds when the savings are not known', () => {
    expect(plain(describeMonthSplit({ delta: -5000, marketEffect: -1100, savings: null }))).toBe(
      'Di quel movimento: −1100 € dal mercato e −3900 € tra risparmio e altre variazioni.',
    );
  });

  it('should colour each part by its own sign', () => {
    const segments = describeMonthSplit({ delta: 4120.18, marketEffect: 3980, savings: 1180 });
    expect(segments.find((segment) => text(segment) === '+3980 €')).toMatchObject({ mono: true, sign: 'positive' });
    expect(segments.find((segment) => text(segment) === '+1180 €')).toMatchObject({ mono: true, sign: 'positive' });
    expect(segments.find((segment) => text(segment) === '−1040 €')).toMatchObject({ mono: true, sign: 'negative' });
  });

  /**
   * A printed zero is unsigned and uncoloured on every figure of the page (AGENTS.md § Layout
   * and Color Tokens). Seen red on 2026-10-11, in the retirement of the Panoramica's
   * composition: `signedCompactEuro` still printed «+0 € risparmiati» with a positive colour.
   */
  it('should print a part that rounds to zero without a sign and without a colour', () => {
    const segments = describeMonthSplit({ delta: 3980.3, marketEffect: 3980, savings: 0.3 });
    expect(plain(segments)).toBe('Di quel movimento: +3980 € dal mercato e 0 € risparmiati.');
    expect(segments.find((segment) => text(segment) === '0 €')).toMatchObject({ mono: true });
    expect(segments.find((segment) => text(segment) === '0 €')?.sign).toBeUndefined();
    expect(plain(describeMonthSplit({ delta: -2000.2, marketEffect: -2000, savings: -0.2 }))).toBe('Di quel movimento: −2000 € dal mercato e 0 € risparmiati.');
  });
});

describe("describeMonthSplit — the user's money outside the cashflow", () => {
  /**
   * A month whose «altre variazioni» was exactly the pension contributions (owner, 2026-10-14: the
   * TFR and the voluntary payments read as «+1792 € di altre variazioni», which looked like an
   * error). 2500 = 2000 − 1500 + 2000: named, nothing is left over, and the clause goes.
   */
  it('should name the pension contributions and leave nothing to «altre variazioni»', () => {
    const split = { delta: 2500, marketEffect: 2000, savings: -1500, flows: { pensionPaidIn: 2000, debts: [] } };
    expect(plain(describeMonthSplit(split))).toBe(
      'Di quel movimento: +2000 € dal mercato, −1500 € spesi oltre le entrate, +2000 € versati nel fondo pensione.',
    );
  });

  it('should name each debt repaid by its asset, and keep a material residual', () => {
    const split = {
      delta: 4000,
      marketEffect: 1000,
      savings: 1500,
      flows: { pensionPaidIn: 500, debts: [{ name: 'Mutuo', repaid: 300 }, { name: 'Prestito auto', repaid: 150 }] },
    };
    expect(plain(describeMonthSplit(split))).toBe(
      'Di quel movimento: +1000 € dal mercato, +1500 € risparmiati, +450 € di debito rimborsato (Mutuo +300 €, Prestito auto +150 €), +500 € versati nel fondo pensione, +550 € di altre variazioni.',
    );
  });

  it('should list one debt by its name alone, and call a debt that went up «nuovo debito»', () => {
    expect(plain(describeMonthSplit({ delta: 2300, marketEffect: 1000, savings: 1000, flows: { pensionPaidIn: 0, debts: [{ name: 'Mutuo', repaid: 300 }] } }))).toBe(
      'Di quel movimento: +1000 € dal mercato, +1000 € risparmiati, +300 € di debito rimborsato (Mutuo).',
    );
    // A new loan: the cash it brought in has no cashflow row (+20.000 € of residual), the debt −20.000 €.
    expect(plain(describeMonthSplit({ delta: 2000, marketEffect: 1000, savings: 1000, flows: { pensionPaidIn: 0, debts: [{ name: 'Prestito auto', repaid: -20000 }] } }))).toBe(
      'Di quel movimento: +1000 € dal mercato, +1000 € risparmiati, −20.000 € di nuovo debito (Prestito auto), +20.000 € di altre variazioni.',
    );
  });

  it('should print the flows signed but uncoloured, and drop a debt that prints as zero', () => {
    const segments = describeMonthSplit({
      delta: 3800,
      marketEffect: 1000,
      savings: 1000,
      flows: { pensionPaidIn: 1500, debts: [{ name: 'Mutuo', repaid: 300 }, { name: 'Prestito chiuso', repaid: 0.2 }] },
    });
    expect(plain(segments)).toContain('+300 € di debito rimborsato (Mutuo), +1500 € versati nel fondo pensione');
    expect(segments.find((segment) => text(segment) === '+1500 €')).toMatchObject({ mono: true });
    expect(segments.find((segment) => text(segment) === '+1500 €')?.sign).toBeUndefined();
    expect(segments.find((segment) => text(segment) === '+300 €')?.sign).toBeUndefined();
    expect(segments.find((segment) => text(segment) === '+1000 €')).toMatchObject({ sign: 'positive' });
  });

  it('should name the flows before the part that holds the savings when the savings are not known', () => {
    expect(plain(describeMonthSplit({ delta: 3000, marketEffect: 1000, savings: null, flows: { pensionPaidIn: 500, debts: [] } }))).toBe(
      'Di quel movimento: +1000 € dal mercato, +500 € versati nel fondo pensione, +1500 € tra risparmio e altre variazioni.',
    );
  });

  it("should carry the flows into the taxed sale's month without the tax", () => {
    const sale = { ...SEPTEMBER_SALE, estimatedTax: 1000, instruments: [{ ...SEPTEMBER_SALE.instruments[0], estimatedTax: 1000 }] };
    const split = { delta: 1500, marketEffect: 1000, savings: 1000, flows: { pensionPaidIn: 500, debts: [] } };
    expect(plain(describeSales(sale, split))).toContain(
      'senza, il mese avrebbe fatto +2500 € (+1000 € dal mercato, +1000 € risparmiati, +500 € versati nel fondo pensione).',
    );
  });
});

describe('isMaterialOtherChange', () => {
  it('should say «altre variazioni» only from max(100 €, 5% of the change)', () => {
    expect(isMaterialOtherChange(99.99, 500)).toBe(false);
    expect(isMaterialOtherChange(100, 500)).toBe(true);
    expect(isMaterialOtherChange(-100, 500)).toBe(true);
    // 5% of 4213 = 210,65: the share wins over the floor.
    expect(isMaterialOtherChange(150, 4213)).toBe(false);
    expect(isMaterialOtherChange(211, -4213)).toBe(true);
  });

  it('should keep the clause when the residual is material, and drop it when it is not', () => {
    expect(plain(describeMonthSplit({ delta: 4700, marketEffect: 2000, savings: 2100 }))).toBe(
      'Di quel movimento: +2000 € dal mercato, +2100 € risparmiati, +600 € di altre variazioni.',
    );
    expect(plain(describeMonthSplit({ delta: 4250, marketEffect: 2000, savings: 2100 }))).toBe(
      'Di quel movimento: +2000 € dal mercato e +2100 € risparmiati.',
    );
  });
});

describe('declineHeadlineTail', () => {
  it('should give every cause its own tail, and a bare full stop to the unknown one', () => {
    expect(declineHeadlineTail('despite-market')).toBe(', nonostante il mercato.');
    expect(declineHeadlineTail('taxes-over-market')).toBe(': il mercato ha pesato, le tasse sulle vendite di più.');
    expect(declineHeadlineTail('market-and-taxes')).toBe(': il mercato ha pesato, e con lui le tasse sulle vendite.');
    expect(declineHeadlineTail('flows-over-market')).toBe(': più per le uscite che per il mercato.');
    expect(declineHeadlineTail('market')).toBe(': il mercato ha pesato.');
    expect(declineHeadlineTail('unknown')).toBe('.');
  });

  it('should name the instrument sold when the tax is the cause, and «le vendite» for more than one', () => {
    expect(declineHeadlineTail('taxes-despite-market', SEPTEMBER_SALE)).toBe(
      ' per le tasse sulla vendita di Ornitorinco World, non per il mercato.',
    );
    const twoSales: PeriodSalesSummary = {
      ...SEPTEMBER_SALE,
      instruments: [SEPTEMBER_SALE.instruments[0], { ...SEPTEMBER_SALE.instruments[0], id: 'swda', name: 'iShares Core MSCI World' }],
    };
    expect(declineHeadlineTail('taxes-despite-market', twoSales)).toBe(' per le tasse sulle vendite, non per il mercato.');
    expect(declineHeadlineTail('taxes-despite-market')).toBe(' per le tasse sulle vendite, non per il mercato.');
  });
});

describe('describeSales — the month without the tax', () => {
  it('should close on the counterfactual and leave an immaterial «altre variazioni» unsaid', () => {
    // Δ +120 €, market +2000 € (the month's traded quotes included), 2100 € saved so far, tax
    // 4160 € — +180 € left for the other changes, under max(100 €, 5% of 4280 €): card spending
    // not yet debited, not a cause (owner, 2026-09-19).
    const segments = describeSales(SEPTEMBER_SALE, { delta: 120, marketEffect: 2000, savings: 2100 });
    expect(plain(segments)).toBe(
      'Hai venduto Ornitorinco World per 40.000 € con una plusvalenza di 16.000 € e pagato circa 4160 € di tasse: ' +
        'senza, il mese avrebbe fatto +4280 € (+2000 € dal mercato e +2100 € risparmiati).',
    );
    expect(segments.find((s) => text(s) === '+2100 €')).toMatchObject({ mono: true, sign: 'positive' });
  });

  it('should not add a counterfactual when there is no tax to take out', () => {
    const loss = { ...SEPTEMBER_SALE, realizedGain: -200, estimatedTax: 0 };
    expect(plain(describeSales(loss, { delta: 120, marketEffect: 1500, savings: null }))).not.toContain('senza,');
    const noRate = { ...SEPTEMBER_SALE, estimatedTax: null };
    expect(plain(describeSales(noRate, { delta: 120, marketEffect: 1500, savings: null }))).not.toContain('senza,');
  });
});

describe('describePurchases', () => {
  it('should state what was bought beside the sale, as a fact', () => {
    const withBuys = { ...SEPTEMBER_SALE, purchases: { amount: 34000, instrumentCount: 6 } };
    expect(plain(describePurchases(withBuys))).toBe('Nello stesso mese hai comprato 6 strumenti per 34.000 €.');
    const one = { ...SEPTEMBER_SALE, purchases: { amount: 2000, instrumentCount: 1 } };
    expect(plain(describePurchases(one, 'anno'))).toBe('Nello stesso anno hai comprato 1 strumento per 2000 €.');
  });

  it('should say nothing without purchases, or on a payload that predates them', () => {
    expect(describePurchases({ ...SEPTEMBER_SALE, purchases: null })).toEqual([]);
    expect(describePurchases(SEPTEMBER_SALE)).toEqual([]);
  });
});

describe('taxedGrowthHeadline', () => {
  it('should name the instrument when one was sold, and the verb the caller speaks with', () => {
    expect(taxedGrowthHeadline('Settembre', 'flat', SEPTEMBER_SALE)).toBe(
      'Settembre è in pari: le tasse sulla vendita di Ornitorinco World si sono prese la crescita.',
    );
    expect(taxedGrowthHeadline('Il 2026', 'eroded', null, 'è cresciuto')).toBe(
      'Il 2026 è cresciuto, ma le tasse sulle vendite si sono prese più di metà della crescita.',
    );
  });
});

describe('describeSales — an immaterial tax', () => {
  const SMALL_SALE: PeriodSalesSummary = {
    proceeds: 3700,
    realizedGain: 20,
    estimatedTax: 2,
    instruments: [{ id: 'orni', name: 'ORNI', proceeds: 3700, realizedGain: 20, estimatedTax: 2 }],
    brokenLedgers: 0,
  };

  it('should state the tax paid and drop the month without it', () => {
    const split = { delta: -877, marketEffect: -1941, savings: 3692, flows: null };
    expect(plain(describeSales(SMALL_SALE, split))).toBe('Hai venduto ORNI per 3700 € con una plusvalenza di 20 € e pagato circa 2 € di tasse.');
  });
});
