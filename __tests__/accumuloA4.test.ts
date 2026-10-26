/**
 * Accumulo's pure sentences: the empty-state preview with the suggested inflow, the Questo mese aside /
 * match note / reserve footer.
 */
import { describe, it, expect } from 'vitest';
import { redistributeRemainder } from '@/lib/utils/accumulationPlanUtils';
import {
  describeAccumuloPreview,
  describeAccumuloIntro,
  describeAccumuloPreviewLead,
  describeAccumulationOutcomeFooter,
  describeClosedPlansAside,
  describeMatchNote,
  describeMonthReading,
  describeMonthTileAside,
  describePriceChangeNotice,
} from '@/lib/utils/accumulationNarrative';
import { narrativeToText } from '@/lib/utils/narrative';

const flat = (text: string) => text.replace(/[  ]/g, ' ');

describe('describeAccumuloPreview (M3)', () => {
  const base = { months: 12, reserveEur: 10000, monthlyEur: 3208, weightsFrom: 'today' as const };
  it('says the suggested inflow when there is one', () => {
    expect(flat(narrativeToText(describeAccumuloPreview({ ...base, inflowEur: 1000 })))).toContain('e 1000 € al mese di entrate.');
  });
  it('keeps «senza entrate mensili» at zero', () => {
    expect(narrativeToText(describeAccumuloPreview({ ...base, inflowEur: 0 }))).toContain('senza entrate mensili');
  });
});

describe('Questo mese (M5, M6)', () => {
  it('the header aside names the month and the installment', () => {
    expect(describeMonthTileAside('2026-10', 3, 12)).toBe('ottobre 2026 · rata 3 di 12');
  });
  it('the match note says what the Registro holds', () => {
    expect(flat(describeMatchNote(24, 3134))).toMatch(/^Trovato nel Registro: 24 quote, 3\.?134,00 €$|^Trovato nel Registro: 24 quote, 3134 €$/);
  });
  it('the footer names the reserve only while it is intact', () => {
    const input = { maxDrift: null, residualEur: 0 };
    expect(flat(narrativeToText(describeAccumulationOutcomeFooter({ ...input, reserve: { eur: 10000, intact: true } })))).toContain('riserva di 10.000 € intatta');
    expect(narrativeToText(describeAccumulationOutcomeFooter({ ...input, reserve: { eur: 10000, intact: false } }))).not.toContain('intatta');
  });
  it('closed plans count', () => {
    expect(describeClosedPlansAside(1)).toBe('1 piano');
    expect(describeClosedPlansAside(2)).toBe('2 piani');
  });
});

describe('Questo mese reading and price notice', () => {
  it('reads the open purchases in words, singular and plural, and nothing when none is open', () => {
    expect(flat(narrativeToText(describeMonthReading(4, 3134) ?? []))).toBe(
      "Quattro acquisti per 3134 €. Registrali da qui: l'operazione va nel Registro e la riga si chiude da sola.",
    );
    expect(flat(narrativeToText(describeMonthReading(1, 500) ?? []))).toContain('Un acquisto per 500 €. Registralo da qui');
    expect(describeMonthReading(0, 0)).toBeNull();
  });

  it('says what the prices changed in the rata, like the render', () => {
    const text = flat(
      narrativeToText(
        describePriceChangeNotice({
          lines: [
            { label: 'VWCE', plannedQuantity: 10, suggestedQuantity: 9 },
            { label: 'AVWS', plannedQuantity: 0, suggestedQuantity: 2 },
          ],
          plannedTotalEur: 1000,
          suggestedTotalEur: 904.8,
        }),
      ),
    );
    expect(text).toMatch(/^I prezzi sono cambiati dall'attivazione: con quelli di oggi la rata compra 2 AVWS in più e 9 VWCE invece di 10 \(.*95,20 €\)\.$/);
  });
});

describe('redistributeRemainder', () => {
  const pos = (id: string, pct: number) => ({ id, label: id, targetPercentage: pct, memberAssetIds: [id], buyAssetId: id });
  it('shares the gap in proportion and lands on exactly 100,0', () => {
    const out = redistributeRemainder([pos('a', 50), pos('b', 30), pos('c', 0)]);
    expect(out.reduce((s, p) => s + p.targetPercentage, 0)).toBeCloseTo(100, 5);
    expect(out[2].targetPercentage).toBe(0);
    expect(out[0].targetPercentage).toBeGreaterThan(out[1].targetPercentage);
  });
  it('shares equally when every weight is 0', () => {
    const out = redistributeRemainder([pos('a', 0), pos('b', 0), pos('c', 0)]);
    expect(out.reduce((s, p) => s + p.targetPercentage, 0)).toBeCloseTo(100, 5);
  });
  it('takes weight back when the sum is above 100', () => {
    const out = redistributeRemainder([pos('a', 80), pos('b', 40)]);
    expect(out.reduce((s, p) => s + p.targetPercentage, 0)).toBeCloseTo(100, 5);
  });
});

describe('empty-tile reading and preview lead (RV4, render)', () => {
  it('says the cash, then the lead with reserve, inflow and rata', () => {
    expect(flat(narrativeToText(describeAccumuloIntro({ cashEur: 36500 })))).toContain('Nei conti di liquidità hai 36.500 €');
    expect(flat(narrativeToText(describeAccumuloPreviewLead({ months: 12, reserveEur: 10000, monthlyEur: 3208, inflowEur: 1000 })))).toBe(
      'Con una riserva di 10.000 € e 1000 € al mese, 12 rate da 3208 € porterebbero:',
    );
  });
});
