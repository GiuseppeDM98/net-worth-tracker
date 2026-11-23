/**
 * The plan tick's sentences on «Applica» (lib/utils/advicePlanNarrative.ts): the summary of the plan the click
 * creates, and one line per instrument it creates.
 */
import { describe, expect, it } from 'vitest';
import { describeAdvicePlanSummary, describeNewInstrument } from '@/lib/utils/advicePlanNarrative';

describe('the plan of accumulation on «Applica»', () => {
  /** The plan month `k` months after December 2026. */
  const monthAt = (k: number) => {
    const date = new Date(2026, 11 + k, 1, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };
  const summaryOf = (rows: Array<{ action: string; estimatedTaxEur?: number | null }>, toCreate = 0, months = 12, waiting = 0, refillMonths = 0) =>
    describeAdvicePlanSummary({
      draft: { months, startMonth: '2026-12', liquidity: { monthlyInflowEur: 500 }, positions: [], disposals: [] },
      preview: {
        liquidity: { refillMonths },
        schedule: { installments: [
          ...Array.from({ length: waiting }, (_, k) => ({ month: monthAt(k), lines: [] })),
          { month: monthAt(waiting), lines: [{ plannedAmountEur: 600 }, { plannedAmountEur: 400 }] },
        ] },
      },
      toCreate: Array.from({ length: toCreate }, () => ({})),
      reconciled: { rows },
    } as never);

  it('the summary: months, first month, inflow, the first instalment that buys, the instruments, the taxes of the sales', () => {
    expect(summaryOf([{ action: 'buy' }], 1)).toMatch(/^12 mesi da dicembre 2026, 500,00\s*€ al mese: prima rata 1000,00\s*€, 1 strumento da creare\.$/);
    expect(summaryOf([{ action: 'sell', estimatedTaxEur: 20 }, { action: 'sell', estimatedTaxEur: 30 }], 0, 1)).toMatch(/^1 mese da .*, 2 vendite con tasse stimate 50,00\s*€\.$/);
    expect(summaryOf([{ action: 'sell', estimatedTaxEur: 20 }, { action: 'sell', estimatedTaxEur: null }])).toMatch(/, 2 vendite con tasse stimate 20,00\s*€, non stimabili su 1\.$/);
    expect(summaryOf([{ action: 'sell', estimatedTaxEur: null }])).toMatch(/, 1 vendita con tasse non stimabili\.$/);
    expect(summaryOf([{ action: 'buy' }])).not.toMatch(/vendit|strument/);
  });

  // The first instalment that buys, when it is not the plan's first month, is named with its month and why the
  // months before buy nothing (owner, 2026-11-20). Mutation that turns it red: the month left out.
  it('names the month of the first purchase, and the months that refill the reserve before it', () => {
    expect(summaryOf([{ action: 'buy' }])).toMatch(/: prima rata 1000,00\s*€\.$/);
    expect(summaryOf([{ action: 'buy' }], 0, 36, 11, 11)).toMatch(/: prima rata 1000,00\s*€ a novembre 2027, dopo 11 mesi che ricostituiscono la riserva\.$/);
    expect(summaryOf([{ action: 'buy' }], 0, 12, 1, 1)).toMatch(/: prima rata 1000,00\s*€ a gennaio 2027, dopo 1 mese che ricostituisce la riserva\.$/);
    expect(summaryOf([{ action: 'buy' }], 0, 12, 2, 0)).toMatch(/: prima rata 1000,00\s*€ a febbraio 2027\.$/);
  });

  // The swap (owner, 2026-11-20): its month is no instalment, and the summary names it. Mutations that turn it
  // red: the swap line counted as the first instalment; the swap clause left out.
  it('a swap: never the first instalment, named with its month, what it sells and what it buys', () => {
    const summary = describeAdvicePlanSummary({
      draft: {
        months: 36, startMonth: '2026-12', liquidity: { monthlyInflowEur: 500 },
        positions: [{ buyAssetId: 'a1', label: 'ETF A' }, { buyAssetId: 'btp', label: 'BTP€i airone' }],
        disposals: [{ assetId: 's1', monthIndex: 1, reinvestAssetId: 'btp' }, { assetId: 's2', monthIndex: 1, reinvestAssetId: 'btp' }, { assetId: 's3', monthIndex: 2 }],
      },
      firstIndex: 1,
      preview: {
        liquidity: { refillMonths: 11 },
        schedule: { installments: [
          { month: monthAt(0), lines: [{ assetId: 'btp', plannedAmountEur: 4400, swap: true }] },
          ...Array.from({ length: 10 }, (_, k) => ({ month: monthAt(k + 1), lines: [] })),
          { month: monthAt(11), lines: [{ assetId: 'a1', plannedAmountEur: 1000 }] },
        ] },
      },
      toCreate: [],
      reconciled: {
        rows: [],
        instruments: [{ ref: 'S1', name: 'ETF uno', assetId: 's1' }, { ref: 'S2', name: 'ETF due', assetId: 's2' }, { ref: 'S3', name: 'ETF tre', assetId: 's3' }],
      },
    } as never);
    expect(summary).toMatch(/: prima rata 1000,00\s*€ a novembre 2027, dopo 11 mesi che ricostituiscono la riserva, scambio a dicembre 2026: vendi ETF uno e ETF due e compri BTP€i airone\.$/);
  });

  it('describeNewInstrument: the four lines', () => {
    expect(describeNewInstrument('ETF Nuovo', { kind: 'priced', quote: { symbol: 'NEW1.MI', price: 50, currency: 'EUR', priceEur: 50, quotedAt: '2026-11-19T12:00:00.000Z' } }))
      .toMatch(/^ETF Nuovo · NEW1\.MI · 50,00\s*€ · 19\/11\/2026$/);
    expect(describeNewInstrument('ETF Nuovo', { kind: 'unpriced', reason: 'no-fresh-quote' })).toBe('ETF Nuovo · senza prezzo: nessun listino ha un prezzo degli ultimi 5 giorni. Il piano lo compra quando gli dai un ticker in Patrimonio.');
    expect(describeNewInstrument('ETF Nuovo', { kind: 'unpriced', reason: 'no-symbol' })).toBe('ETF Nuovo · senza ticker né prezzo: completalo in Patrimonio perché il piano lo compri.');
    expect(describeNewInstrument('BTP', { kind: 'bond', pricePct: null, indexed: false })).toBe('BTP · titolo di Stato: il prezzo arriva al primo aggiornamento. Completa nominale, cedola e scadenza in Patrimonio.');
  });

  // The bond priced at the click (owner, 2026-11-20). Mutation that turns it red: the BTP€i's missing coefficient unsaid.
  it('describeNewInstrument: a bond quoted by Borsa Italiana, a BTP€i with and without its coefficient', () => {
    expect(describeNewInstrument('BTP', { kind: 'bond', pricePct: 98.5, indexed: false })).toBe('BTP · titolo di Stato · Borsa Italiana 98,50: 0,985 € per euro di nominale. Completa cedola e scadenza in Patrimonio.');
    expect(describeNewInstrument('BTP€i', { kind: 'bond', pricePct: 98.5, indexed: true })).toBe("BTP€i · BTP€i · Borsa Italiana 98,50, senza il coefficiente di indicizzazione: scrivilo qui sotto perché il piano lo compri da subito.");
    expect(describeNewInstrument('BTP€i', { kind: 'bond', pricePct: 98.5, indexed: true, coefficient: 1.2 })).toBe('BTP€i · BTP€i · Borsa Italiana 98,50 × coefficiente 1,2: 1,182 € per euro di nominale. Completa cedola, scadenza e coefficienti in Patrimonio.');
  });});
