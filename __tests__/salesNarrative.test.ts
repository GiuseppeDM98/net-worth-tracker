/**
 * Tests for lib/utils/salesNarrative.ts — the words for a period's sales and the market-vs-flows
 * split, shared by the Panoramica, Patrimonio and the periodic email. SDK-free like
 * emailNarrative: no Firebase mock at the top of this file, on purpose.
 *
 * Intl 'it-IT' puts a no-break space before `€` and leaves four-digit amounts ungrouped
 * (`4089 €` but `39.052 €`): expectations are written the way the reader sees them, nbsp flattened.
 */

import { describe, expect, it } from 'vitest';

import { declineHeadlineTail, describeOwnFlowsSplit, describeSales } from '@/lib/utils/salesNarrative';
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

describe('describeOwnFlowsSplit', () => {
  it('should split the change into the market and the own flows, exactly', () => {
    // September 2026 on the real account: −4.937,74 € with the market at −1.078,73 €.
    expect(plain(describeOwnFlowsSplit(-4937.74, -1078.73))).toBe(
      'Di quel movimento, −1079 € viene dal mercato e −3859 € dai tuoi movimenti.',
    );
  });

  it('should colour each half by its own sign', () => {
    const segments = describeOwnFlowsSplit(4120.18, 3980);
    expect(segments.find((segment) => text(segment) === '+3980 €')).toMatchObject({ mono: true, sign: 'positive' });
    expect(segments.find((segment) => text(segment) === '+140 €')).toMatchObject({ mono: true, sign: 'positive' });
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
});
