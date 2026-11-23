/**
 * Accumulo's pure sentences: the model written by hand starts from what is held, the empty-state preview
 * with the suggested inflow, the model tile's sentences and the Questo mese aside / match note / reserve footer.
 */
import { describe, it, expect } from 'vitest';
import type { Asset } from '@/types/assets';
import { redistributeRemainder } from '@/lib/utils/accumulationPlanUtils';
import { seedModelFromToday } from '@/lib/utils/modelPortfolio';
import { describeModelOrigin, describeModelSalesHint, MODEL_TARGETED_HINT } from '@/lib/utils/weightOptimizerNarrative';
import {
  describeAccumuloPreview,
  describeAccumuloIntro,
  describeAccumuloPreviewLead,
  describeQuietMonthReading,
  describeAccumulationOutcomeFooter,
  describeClosedPlansAside,
  describeMatchNote,
  describeMonthReading,
  describeMonthTileAside,
  describePriceChangeNotice,
  describeInstallmentStatus,
} from '@/lib/utils/accumulationNarrative';
import { narrativeToText } from '@/lib/utils/narrative';

const flat = (text: string) => text.replace(/[  ]/g, ' ');

function asset(id: string, overrides: Partial<Asset> = {}): Asset {
  return { id, name: id, ticker: id, type: 'etf', assetClass: 'equity', quantity: 1, currentPrice: 100, ...overrides } as Asset;
}
const valueOf = (a: Asset) => a.quantity * (a.currentPrice ?? 0);

describe('seedModelFromToday', () => {
  it('weights the held tradable instruments by value, Σ = 100, leaving out accounts, frozen and empty ones', () => {
    const weights = seedModelFromToday(
      [
        asset('A', { quantity: 3 }),
        asset('B', { quantity: 1 }),
        asset('EMPTY', { quantity: 0 }),
        asset('FROZEN', { allocationRole: 'frozen' } as Partial<Asset>),
        asset('CONTO', { type: 'cash', assetClass: 'cash' }),
      ],
      valueOf,
    );
    expect(weights).toEqual([
      { assetId: 'A', targetPercentage: 75 },
      { assetId: 'B', targetPercentage: 25 },
    ]);
  });

  it('is empty when nothing tradable is held', () => {
    expect(seedModelFromToday([asset('CONTO', { type: 'cash', assetClass: 'cash' })], valueOf)).toEqual([]);
  });
});

describe('model tile sentences', () => {
  it('names who stays above the model, then points at «Ricalcola»', () => {
    expect(describeModelSalesHint(['ETF-A', 'ETF-B', 'ETF-C'])).toBe(`Senza vendere, ETF-A, ETF-B e ETF-C restano sopra il modello. ${MODEL_TARGETED_HINT}`);
    expect(describeModelSalesHint(['ETF-C'])).toContain('ETF-C resta sopra il modello.');
  });
  it('is the fixed hint when nobody is above the model', () => {
    expect(describeModelSalesHint([])).toBe(MODEL_TARGETED_HINT);
  });
  it('names the mode and the manual change of a model that started from a calculation', () => {
    const snapshot = { computedAt: new Date('2026-10-02T12:00:00'), mode: 'reachable' as const };
    const updatedAt = new Date('2026-10-05T12:00:00');
    expect(describeModelOrigin('optimizer', updatedAt, snapshot)).toBe("Proposto dall'ottimizzatore il 02/10/2026 (Raggiungibile col PAC).");
    expect(describeModelOrigin('manual', updatedAt, snapshot)).toBe("Proposto dall'ottimizzatore il 02/10/2026 (Raggiungibile col PAC), poi cambiato a mano.");
    expect(describeModelOrigin('manual', updatedAt)).toBe('Scritto a mano il 05/10/2026.');
  });
});

describe('describeAccumuloPreview', () => {
  // The reason names the reserve actually used, the allocation's cash quota (2026-11-17). Seen red with 10.000 € fixed.
  it('without a preview it names the reserve in use', () => {
    expect(flat(narrativeToText(describeAccumuloPreview(null, 20000)))).toContain("Con la quota di liquidità dell'allocazione (20.000 €) da tenere");
    expect(flat(narrativeToText(describeAccumuloPreview(null, 0)))).not.toContain('quota');
  });
  const base = { months: 12, reserveEur: 10000, monthlyEur: 3208, weightsFrom: 'today' as const };
  it('says the suggested inflow when there is one', () => {
    expect(flat(narrativeToText(describeAccumuloPreview({ ...base, inflowEur: 1000 })))).toContain('e 1000 € al mese di entrate.');
  });
  it('keeps «senza entrate mensili» at zero', () => {
    expect(narrativeToText(describeAccumuloPreview({ ...base, inflowEur: 0 }))).toContain('senza entrate mensili');
  });
});

describe('Questo mese', () => {
  it('the header aside names the month and the installment', () => {
    expect(describeMonthTileAside('2026-10', { kind: 'instalment', ordinal: 3, total: 12 })).toBe('ottobre 2026 · rata 3 di 12');
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
    expect(flat(narrativeToText(describeMonthReading(4, 3000) ?? []))).toBe(
      "Quattro acquisti per 3000 €. Registrali da qui: l'operazione va nel Registro e la riga si chiude da sola.",
    );
    expect(flat(narrativeToText(describeMonthReading(1, 500) ?? []))).toContain('Un acquisto per 500 €. Registralo da qui');
    expect(describeMonthReading(0, 0)).toBeNull();
  });

  it('says what the prices changed in the rata, like the render', () => {
    const text = flat(
      narrativeToText(
        describePriceChangeNotice({
          lines: [
            { label: 'ETF-A', plannedQuantity: 10, suggestedQuantity: 9 },
            { label: 'ETF-B', plannedQuantity: 0, suggestedQuantity: 2 },
          ],
          plannedTotalEur: 1000,
          suggestedTotalEur: 900,
        }),
      ),
    );
    expect(text).toBe("I prezzi sono cambiati dall'attivazione: con quelli di oggi la rata compra 2 ETF-B in più e 9 ETF-A invece di 10 (−100,00 €).");
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

describe('empty-tile reading and preview lead', () => {
  it('says the cash, then the lead with reserve, inflow and rata', () => {
    expect(flat(narrativeToText(describeAccumuloIntro({ cashEur: 36500, reserveEur: 0 })))).toContain('Nei conti di liquidità hai 36.500 €');
    expect(flat(narrativeToText(describeAccumuloIntro({ cashEur: 36500, reserveEur: 10000 })))).toContain(
      "Oltre la quota di liquidità dell'allocazione (10.000 €) hai 26.500 €",
    );
    expect(flat(narrativeToText(describeAccumuloPreviewLead({ months: 12, reserveEur: 10000, monthlyEur: 3208, inflowEur: 1000 })))).toBe(
      "Con la quota di liquidità dell'allocazione (10.000 €) e 1000 € al mese, 12 rate da 3208 € porterebbero:",
    );
  });
});

// Cash within the quota: the inflows first bring it back to the quota, then a plan buys (owner,
// 2026-11-17). Never a negative «beyond». Seen red with the inflows spent from the first month.
describe('describeAccumuloIntro — cash within the quota', () => {
  it('the preview: the first months refill, then the plan buys', () => {
    const text = flat(narrativeToText(describeAccumuloIntro({ cashEur: 8000, reserveEur: 10000, refillMonths: 2 })));
    expect(text).toBe(
      "Nella liquidità hai 8000 €, entro la quota dell'allocazione (10.000 €): le entrate dei primi 2 mesi la riportano alla quota, poi un piano di accumulo investe il resto verso i pesi di oggi, a quote intere, e ti dice ogni mese cosa comprare.",
    );
  });

  it('no preview: how many months of inflows bring the cash back to the quota', () => {
    const text = flat(narrativeToText(describeAccumuloIntro(null, { reserveEur: 50000, cashEur: 9500, inflowEur: 1000 })));
    expect(text).toBe(
      "Nella liquidità hai 9500 €, entro la quota dell'allocazione (50.000 €): con 1000 € al mese di entrate tornano alla quota in 41 mesi, e solo dopo un piano compra.",
    );
  });

  it('no preview and no inflow: the cash stays within the quota', () => {
    const text = flat(narrativeToText(describeAccumuloIntro(null, { reserveEur: 50000, cashEur: 9000, inflowEur: 0 })));
    expect(text).toBe(
      "Nella liquidità hai 9000 €, entro la quota dell'allocazione (50.000 €): senza entrate mensili non resta nulla da investire.",
    );
  });
});

describe('describeAccumuloPreviewLead — after a refill', () => {
  it('says the months that refill before the rate', () => {
    expect(flat(narrativeToText(describeAccumuloPreviewLead({ months: 10, refillMonths: 2, reserveEur: 10000, monthlyEur: 1000, inflowEur: 1000 })))).toBe(
      "Con la quota di liquidità dell'allocazione (10.000 €) e 1000 € al mese, dopo 2 mesi per ricostituirla, 10 rate da 1000 € porterebbero:",
    );
  });
});

// Questo mese in a month with no line (2026-11-17). Seen red with no reading at all.
describe('describeQuietMonthReading', () => {
  it('the reserve refilling', () => {
    expect(flat(narrativeToText(describeQuietMonthReading({ refilling: true, nextMonth: '2027-03' })))).toBe(
      'Questo mese non c’è nulla da comprare: le entrate restano sui conti finché la liquidità non torna alla riserva. La prima rata è a marzo.',
    );
  });
  it('a share below one quota', () => {
    expect(flat(narrativeToText(describeQuietMonthReading({ refilling: false, nextMonth: '2027-03' })))).toBe(
      'Questo mese non c’è nulla da comprare: la quota del mese passa alla prossima rata, a marzo.',
    );
  });
});

// The empty tile reads the whole cash class too (2026-11-17).
describe('describeAccumuloIntro — cash held outside the accounts', () => {
  it('no preview: the months count the money-market fund', () => {
    expect(flat(narrativeToText(describeAccumuloIntro(null, { reserveEur: 29000, cashEur: 9000, inflowEur: 1000, otherCashEur: 21000 })))).toBe(
      "Nella liquidità hai 30.000 €, entro la quota dell'allocazione (50.000 €): con 1000 € al mese di entrate tornano alla quota in 20 mesi, e solo dopo un piano compra.",
    );
  });
  it('the preview prints the quota, not the reserve on the accounts', () => {
    const text = flat(narrativeToText(describeAccumuloIntro({ cashEur: 9000, reserveEur: 29000, refillMonths: 12, otherCashEur: 21000 })));
    expect(text).toContain("Nella liquidità hai 30.000 €, entro la quota dell'allocazione (50.000 €)");
    expect(flat(narrativeToText(describeAccumuloPreviewLead({ months: 3, refillMonths: 15, reserveEur: 29000, otherCashEur: 21000, monthlyEur: 1000, inflowEur: 1000 })))).toContain(
      "Con la quota di liquidità dell'allocazione (50.000 €)",
    );
  });
});

// A month with no line only refills the reserve: the calendar says so, never «Registrato» (owner, 2026-11-19).
// Mutation that turns it red: an empty month read as all closed.
describe('describeInstallmentStatus', () => {
  it('a month with no line is «Solo riserva»', () => {
    expect(describeInstallmentStatus([])).toBe('Solo riserva');
    expect(describeInstallmentStatus([{ status: 'executed' }, { status: 'skipped' }])).toBe('Registrato');
    expect(describeInstallmentStatus([{ status: 'executed' }, { status: 'planned' }])).toBe('Da fare');
  });
});

// Questo mese's aside counts the months that buy (owner, 2026-11-19, the 2026-11-17 rule kept).
// Mutation that turns it red: the refill month read as an instalment.
describe('describeMonthTileAside — refill months', () => {
  it('a refill month names the first instalment', () => {
    expect(describeMonthTileAside('2026-12', { kind: 'refill', firstBuyingMonth: '2027-02' })).toBe('dicembre 2026 · solo riserva, prima rata a febbraio');
    expect(describeMonthTileAside('2026-12', { kind: 'refill', firstBuyingMonth: undefined })).toBe('dicembre 2026 · solo riserva');
  });

  // A first instalment 12 months away or more reads with its year: «a gennaio» alone is the next January
  // (owner, 2026-11-20). Mutation that turns it red: the year never printed.
  it('the year when the month alone would name an earlier one', () => {
    expect(describeMonthTileAside('2026-12', { kind: 'refill', firstBuyingMonth: '2027-11' })).toBe('dicembre 2026 · solo riserva, prima rata a novembre');
    expect(describeMonthTileAside('2026-12', { kind: 'refill', firstBuyingMonth: '2027-12' })).toBe('dicembre 2026 · solo riserva, prima rata a dicembre 2027');
    expect(describeMonthTileAside('2026-12', { kind: 'refill', firstBuyingMonth: '2028-02' })).toBe('dicembre 2026 · solo riserva, prima rata a febbraio 2028');
  });
});

// ── The swap month (owner, 2026-11-20): «scambio», never «rata» nor «solo riserva».
// Mutations that turn it red: the swap place read as a refill; the status of a swap month read «Da fare».
describe('the swap month reads «scambio»', () => {
  it('the aside and the status', () => {
    expect(describeMonthTileAside('2026-12', { kind: 'swap', firstBuyingMonth: '2028-02' })).toBe('dicembre 2026 · scambio, prima rata a febbraio 2028');
    expect(describeMonthTileAside('2026-12', { kind: 'swap', firstBuyingMonth: '2027-02' })).toBe('dicembre 2026 · scambio, prima rata a febbraio');
    expect(describeInstallmentStatus([{ status: 'planned', swap: true }])).toBe('Scambio da fare');
    expect(describeInstallmentStatus([{ status: 'executed', swap: true }])).toBe('Registrato');
    expect(describeInstallmentStatus([{ status: 'planned', swap: true }, { status: 'planned' }])).toBe('Da fare');
  });
});
