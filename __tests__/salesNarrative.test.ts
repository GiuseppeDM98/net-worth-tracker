/**
 * Tests for lib/utils/salesNarrative.ts — the words for a period's sales and the market-vs-flows
 * split, shared by the Panoramica, Patrimonio and the periodic email. SDK-free like
 * emailNarrative: no Firebase mock at the top of this file, on purpose.
 *
 * Intl 'it-IT' puts a no-break space before `€` and leaves four-digit amounts ungrouped
 * (`4089 €` but `39.052 €`): expectations are written the way the reader sees them, nbsp flattened.
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
  proceeds: 39052.45,
  realizedGain: 15726.38,
  estimatedTax: 4088.86,
  instruments: [{ id: 'vwce', name: 'Vanguard FTSE All-World', proceeds: 39052.45, realizedGain: 15726.38, estimatedTax: 4088.86 }],
  brokenLedgers: 0,
};

describe('describeSales', () => {
  it('should say what was sold, the gain and the tax already paid — in the past tense, as an estimate', () => {
    // Regime amministrato: the broker withholds the tax at the sale, so «pagato», never «pagherai»;
    // «circa» because the figure comes from the instrument's rate, not from the broker's statement.
    expect(plain(describeSales(SEPTEMBER_SALE))).toBe(
      'Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 € e pagato circa 4089 € di tasse.',
    );
  });

  it('should count the instruments when more than one was sold', () => {
    const two: PeriodSalesSummary = {
      ...SEPTEMBER_SALE,
      instruments: [SEPTEMBER_SALE.instruments[0], { id: 'b', name: 'B', proceeds: 100, realizedGain: 10, estimatedTax: 2.6 }],
    };
    expect(plain(describeSales(two))).toContain('Hai venduto 2 strumenti per 39.052 €');
  });

  it('should name a loss and say there is no tax on it', () => {
    const loss: PeriodSalesSummary = { ...SEPTEMBER_SALE, realizedGain: -1200, estimatedTax: 0 };
    expect(plain(describeSales(loss))).toBe(
      'Hai venduto Vanguard FTSE All-World per 39.052 € con una minusvalenza di 1200 €, senza tasse.',
    );
  });

  it('should say the tax is not estimated when the rate is missing, instead of printing zero', () => {
    const noRate: PeriodSalesSummary = { ...SEPTEMBER_SALE, estimatedTax: null };
    expect(plain(describeSales(noRate))).toBe(
      "Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 €; senza un'aliquota sullo strumento le tasse non sono stimate.",
    );
    const twoNoRate: PeriodSalesSummary = {
      ...noRate,
      instruments: [noRate.instruments[0], { id: 'b', name: 'B', proceeds: 100, realizedGain: 10, estimatedTax: null }],
    };
    expect(plain(describeSales(twoNoRate))).toContain("senza un'aliquota su ogni strumento");
  });

  it('should mark the figures mono and the tax as a plain figure, not a loss', () => {
    const segments = describeSales(SEPTEMBER_SALE);
    const tax = segments.find((segment) => segment.text.startsWith('4089'));
    expect(tax).toMatchObject({ mono: true });
    expect(tax?.sign).toBeUndefined();
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
    expect(plain(describeMonthSplit({ delta: -4937.74, marketEffect: -1078.73, savings: null }))).toBe(
      'Di quel movimento: −1079 € dal mercato e −3859 € tra risparmio e altre variazioni.',
    );
  });

  it('should colour each part by its own sign', () => {
    const segments = describeMonthSplit({ delta: 4120.18, marketEffect: 3980, savings: 1180 });
    expect(segments.find((segment) => text(segment) === '+3980 €')).toMatchObject({ mono: true, sign: 'positive' });
    expect(segments.find((segment) => text(segment) === '+1180 €')).toMatchObject({ mono: true, sign: 'positive' });
    expect(segments.find((segment) => text(segment) === '−1040 €')).toMatchObject({ mono: true, sign: 'negative' });
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
      ' per le tasse sulla vendita di Vanguard FTSE All-World, non per il mercato.',
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
    // The real account, settembre 2026: Δ +124,32 €, market +2018,47 € (the month's traded quotes
    // included), 2094,62 € saved so far, tax 4088,86 € — +100,09 € left for the other changes,
    // under max(100 €, 5% of 4213 €): card spending not yet debited, not a cause (owner, 2026-09-19).
    const segments = describeSales(SEPTEMBER_SALE, { delta: 124.32, marketEffect: 2018.47, savings: 2094.62 });
    expect(plain(segments)).toBe(
      'Hai venduto Vanguard FTSE All-World per 39.052 € con una plusvalenza di 15.726 € e pagato circa 4089 € di tasse: ' +
        'senza, il mese avrebbe fatto +4213 € (+2018 € dal mercato e +2095 € risparmiati).',
    );
    expect(segments.find((s) => text(s) === '+2095 €')).toMatchObject({ mono: true, sign: 'positive' });
  });

  it('should not add a counterfactual when there is no tax to take out', () => {
    const loss = { ...SEPTEMBER_SALE, realizedGain: -200, estimatedTax: 0 };
    expect(plain(describeSales(loss, { delta: 124.32, marketEffect: 1480.59, savings: null }))).not.toContain('senza,');
    const noRate = { ...SEPTEMBER_SALE, estimatedTax: null };
    expect(plain(describeSales(noRate, { delta: 124.32, marketEffect: 1480.59, savings: null }))).not.toContain('senza,');
  });
});

describe('describePurchases', () => {
  it('should state what was bought beside the sale, as a fact', () => {
    const withBuys = { ...SEPTEMBER_SALE, purchases: { amount: 34305.1, instrumentCount: 6 } };
    expect(plain(describePurchases(withBuys))).toBe('Nello stesso mese hai comprato 6 strumenti per 34.305 €.');
    const one = { ...SEPTEMBER_SALE, purchases: { amount: 1996.29, instrumentCount: 1 } };
    expect(plain(describePurchases(one, 'anno'))).toBe('Nello stesso anno hai comprato 1 strumento per 1996 €.');
  });

  it('should say nothing without purchases, or on a payload that predates them', () => {
    expect(describePurchases({ ...SEPTEMBER_SALE, purchases: null })).toEqual([]);
    expect(describePurchases(SEPTEMBER_SALE)).toEqual([]);
  });
});

describe('taxedGrowthHeadline', () => {
  it('should name the instrument when one was sold, and the verb the caller speaks with', () => {
    expect(taxedGrowthHeadline('Settembre', 'flat', SEPTEMBER_SALE)).toBe(
      'Settembre è in pari: le tasse sulla vendita di Vanguard FTSE All-World si sono prese la crescita.',
    );
    expect(taxedGrowthHeadline('Il 2026', 'eroded', null, 'è cresciuto')).toBe(
      'Il 2026 è cresciuto, ma le tasse sulle vendite si sono prese più di metà della crescita.',
    );
  });
});
