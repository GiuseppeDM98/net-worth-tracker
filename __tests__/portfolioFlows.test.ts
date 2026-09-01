import { describe, it, expect } from 'vitest';
import { buildPortfolioCashFlows, computeMonthlyPortfolioFlow, indexLedger } from '@/lib/utils/portfolioFlows';
import type { MonthlySnapshot } from '@/types/assets';
import type { AssetTransaction } from '@/types/assetTransactions';

function trade(
  assetId: string,
  type: AssetTransaction['type'],
  date: Date,
  quantity: number,
  priceEur: number,
  fees?: number,
): AssetTransaction {
  return { id: `${assetId}-${date.toISOString()}-${quantity}`, userId: 'user-1', assetId, type, date,
    quantity, pricePerUnit: priceEur, priceEur, fees, createdAt: date, updatedAt: date };
}

type Position = { assetId: string; quantity: number; price: number };

function makeSnapshot(year: number, month: number, positions: Position[]): MonthlySnapshot {
  return {
    userId: 'user-1',
    year,
    month,
    totalNetWorth: positions.reduce((sum, p) => sum + p.quantity * p.price, 0),
    liquidNetWorth: 0,
    illiquidNetWorth: 0,
    byAssetClass: {},
    byAsset: positions.map((p) => ({
      assetId: p.assetId,
      ticker: p.assetId.toUpperCase(),
      name: p.assetId,
      quantity: p.quantity,
      price: p.price,
      totalValue: p.quantity * p.price,
    })),
    assetAllocation: {},
    createdAt: new Date(year, month - 1, 28),
  } as MonthlySnapshot;
}

describe('computeMonthlyPortfolioFlow', () => {
  it('reads a price move as no flow at all', () => {
    const before = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);
    const after = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 100, price: 12 }]);

    expect(computeMonthlyPortfolioFlow(before, after, new Set())).toBe(0);
  });

  it('values a purchase at the month price', () => {
    const before = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);
    const after = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 12 }]);

    expect(computeMonthlyPortfolioFlow(before, after, new Set())).toBe(600);
  });

  it('reads a sale as a negative flow', () => {
    const before = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);
    const after = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 40, price: 10 }]);

    expect(computeMonthlyPortfolioFlow(before, after, new Set())).toBe(-600);
  });

  it('values a position closed during the month at its last known price', () => {
    const before = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);
    const after = makeSnapshot(2026, 2, []);

    expect(computeMonthlyPortfolioFlow(before, after, new Set())).toBe(-1000);
  });

  it('ignores assets outside the base', () => {
    // La liquidita' cala mentre lo strumento cresce: e' il denaro che attraversa il confine,
    // e va contato UNA volta sola, dal lato che sta dentro la base.
    const before = makeSnapshot(2026, 1, [
      { assetId: 'etf', quantity: 100, price: 10 },
      { assetId: 'conto', quantity: 5000, price: 1 },
    ]);
    const after = makeSnapshot(2026, 2, [
      { assetId: 'etf', quantity: 200, price: 10 },
      { assetId: 'conto', quantity: 4000, price: 1 },
    ]);

    expect(computeMonthlyPortfolioFlow(before, after, new Set(['conto']))).toBe(1000);
  });

  it('nets purchases against sales inside the same month', () => {
    const before = makeSnapshot(2026, 1, [
      { assetId: 'a', quantity: 100, price: 10 },
      { assetId: 'b', quantity: 50, price: 20 },
    ]);
    const after = makeSnapshot(2026, 2, [
      { assetId: 'a', quantity: 130, price: 10 },
      { assetId: 'b', quantity: 40, price: 20 },
    ]);

    expect(computeMonthlyPortfolioFlow(before, after, new Set())).toBe(100);
  });
});

describe('buildPortfolioCashFlows', () => {
  it('emits one flow per month MISURABILE, dated to the first of that month', () => {
    const flows = buildPortfolioCashFlows(
      [
        makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]),
        makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 10 }]),
        makeSnapshot(2026, 3, [{ assetId: 'etf', quantity: 150, price: 11 }]),
        makeSnapshot(2026, 4, [{ assetId: 'etf', quantity: 200, price: 11 }]),
      ],
      []
    );

    expect(flows).toHaveLength(3);
    expect(flows.map((f) => [f.date, f.netCashFlow])).toEqual([
      [new Date(2026, 1, 1), 500],
      // Marzo e' MISURATO e vale zero: solo il prezzo si e' mosso. Una voce a zero e un mese
      // assente sono fatti diversi — chi consuma i flussi ricade sul Cashflow solo per il secondo.
      [new Date(2026, 2, 1), 0],
      [new Date(2026, 3, 1), 550],
    ]);
  });

  it('non emette nulla per una coppia in cui MANCA il breakdown, da una parte o dall\'altra', () => {
    // E' il caso di chi ha uno storico inserito a mano: senza questa distinzione i suoi flussi
    // sarebbero tutti nulli e ogni versamento verrebbe letto come rendimento.
    const senzaBreakdown = makeSnapshot(2026, 2, []);
    const flows = buildPortfolioCashFlows(
      [
        makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]),
        senzaBreakdown,
        makeSnapshot(2026, 3, [{ assetId: 'etf', quantity: 100, price: 10 }]),
        makeSnapshot(2026, 4, [{ assetId: 'etf', quantity: 120, price: 10 }]),
      ],
      []
    );

    // (gen,feb) e (feb,mar) non sono misurabili; (mar,apr) si'.
    expect(flows.map((f) => f.date)).toEqual([new Date(2026, 3, 1)]);
    expect(flows[0].netCashFlow).toBe(200);
  });

  it('un asset opaco al flusso non contribuisce con le Δquantità', () => {
    // Un fondo pensione tiene il valore in `quantity` con prezzo 1: la sua quantita' cresce sia per
    // i versamenti sia per il mercato, e leggerla come flusso cancellerebbe il suo rendimento.
    const prima = makeSnapshot(2026, 1, [
      { assetId: 'etf', quantity: 100, price: 10 },
      { assetId: 'fondo', quantity: 5000, price: 1 },
    ]);
    const dopo = makeSnapshot(2026, 2, [
      { assetId: 'etf', quantity: 120, price: 10 },
      { assetId: 'fondo', quantity: 5400, price: 1 },
    ]);

    expect(computeMonthlyPortfolioFlow(prima, dopo, new Set(), undefined, new Set(['fondo']))).toBe(200);
    // Senza marcarlo opaco i 400 del fondo sparirebbero dal rendimento.
    expect(computeMonthlyPortfolioFlow(prima, dopo, new Set())).toBe(600);
  });

  it('un conto corrente NON è opaco: il suo saldo che cambia è denaro che si muove', () => {
    // Ed e' cio' che fa tornare i conti con la liquidita' DENTRO la base: l'ETF fa +200, il conto
    // -200, e il flusso netto e' zero perche' non e' entrato niente dall'esterno.
    const prima = makeSnapshot(2026, 1, [
      { assetId: 'etf', quantity: 100, price: 10 },
      { assetId: 'conto', quantity: 5000, price: 1 },
    ]);
    const dopo = makeSnapshot(2026, 2, [
      { assetId: 'etf', quantity: 120, price: 10 },
      { assetId: 'conto', quantity: 4800, price: 1 },
    ]);

    expect(computeMonthlyPortfolioFlow(prima, dopo, new Set())).toBe(0);
  });

  it('leaves income, expenses and dividends at zero — a purchase is none of those', () => {
    const flows = buildPortfolioCashFlows(
      [
        makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]),
        makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 10 }]),
      ],
      []
    );

    expect(flows[0]).toMatchObject({ income: 0, expenses: 0, dividendIncome: 0 });
  });

  it('sorts an unordered input before pairing months', () => {
    const january = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);
    const february = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 10 }]);

    expect(buildPortfolioCashFlows([february, january], [])[0].netCashFlow).toBe(500);
  });

  it('skips months without a breakdown instead of inventing a flow', () => {
    const withoutBreakdown = makeSnapshot(2026, 2, []);
    withoutBreakdown.byAsset = [];
    const flows = buildPortfolioCashFlows(
      [
        makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]),
        withoutBreakdown,
        makeSnapshot(2026, 3, [{ assetId: 'etf', quantity: 100, price: 10 }]),
      ],
      []
    );

    expect(flows).toHaveLength(0);
  });

  it('crosses a year boundary in the right order', () => {
    const flows = buildPortfolioCashFlows(
      [
        makeSnapshot(2025, 12, [{ assetId: 'etf', quantity: 100, price: 10 }]),
        makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 120, price: 10 }]),
      ],
      []
    );

    expect(flows).toHaveLength(1);
    expect(flows[0].netCashFlow).toBe(200);
  });
});

// Il registro e' la fonte PREFERITA, per asset: e' datato all'operazione, mentre uno snapshot e'
// datato alla rilevazione. Ma da solo non regge la storia, perche' conosce solo cio' che e' stato
// registrato — e le due fonti insieme, per asset, coprono entrambi i buchi.
describe('registro operazioni e Δquantità, per asset', () => {
  const gennaio = makeSnapshot(2026, 1, [{ assetId: 'etf', quantity: 100, price: 10 }]);
  const febbraio = makeSnapshot(2026, 2, [{ assetId: 'etf', quantity: 150, price: 12 }]);

  it("preferisce il registro dove l'asset è coperto, col prezzo dell'operazione", () => {
    // Δquantità direbbe 50 x 12 = 600 (prezzo di fine mese); il registro dice 50 x 11 = 550.
    const flow = computeMonthlyPortfolioFlow(gennaio, febbraio, new Set(),
      indexLedger([trade('etf', 'buy', new Date(2026, 1, 14), 50, 11)]));

    expect(flow).toBe(550);
  });

  it('somma le commissioni al flusso di un acquisto e le sottrae dal ricavo di una vendita', () => {
    const comprato = indexLedger([trade('etf', 'buy', new Date(2026, 1, 14), 50, 11, 9)]);
    expect(computeMonthlyPortfolioFlow(gennaio, febbraio, new Set(), comprato)).toBe(559);

    const marzo = makeSnapshot(2026, 3, [{ assetId: 'etf', quantity: 100, price: 12 }]);
    const venduto = indexLedger([trade('etf', 'sell', new Date(2026, 2, 10), 50, 11, 9)]);
    expect(computeMonthlyPortfolioFlow(febbraio, marzo, new Set(), venduto)).toBe(-541);
  });

  it("per un asset coperto, nessuna operazione nel mese significa flusso zero — non un buco da riempire", () => {
    // L'asset e' coperto da gennaio; a febbraio il registro tace, quindi il flusso e' 0 e tutta la
    // variazione e' rendimento. Le Δquantità NON intervengono a coprire il silenzio.
    const ledger = indexLedger([trade('etf', 'buy', new Date(2026, 0, 5), 100, 10)]);

    expect(computeMonthlyPortfolioFlow(gennaio, febbraio, new Set(), ledger)).toBe(0);
  });

  it('ricade sulle Δquantità per un asset che nel registro non compare mai', () => {
    // Il caso reale: strumenti tenuti su un altro intermediario, venduti senza che nessuna
    // operazione sia stata registrata.
    const ledger = indexLedger([trade('altro', 'buy', new Date(2026, 1, 3), 1, 1)]);

    expect(computeMonthlyPortfolioFlow(gennaio, febbraio, new Set(['altro']), ledger)).toBe(600);
  });

  it("ricade sulle Δquantità per i mesi PRECEDENTI alla prima operazione dell'asset", () => {
    // Un asset comprato altrove e poi tracciato: prima della prima operazione il registro non sa
    // nulla, e negare le Δquantità li' significherebbe leggere un acquisto come rendimento.
    const ledger = indexLedger([trade('etf', 'buy', new Date(2026, 5, 1), 10, 12)]);

    expect(computeMonthlyPortfolioFlow(gennaio, febbraio, new Set(), ledger)).toBe(600);
  });

  it('mescola le due fonti nello stesso mese, una per asset', () => {
    // E' aprile 2025 in miniatura: il nuovo strumento entra dal registro, il vecchio esce dalle
    // quantità perché la sua vendita non è registrata da nessuna parte.
    const prima = makeSnapshot(2026, 1, [{ assetId: 'vecchio', quantity: 200, price: 100 }]);
    const dopo = makeSnapshot(2026, 2, [{ assetId: 'nuovo', quantity: 300, price: 100 }]);
    const ledger = indexLedger([trade('nuovo', 'buy', new Date(2026, 1, 28), 300, 100)]);

    expect(computeMonthlyPortfolioFlow(prima, dopo, new Set(), ledger)).toBe(10_000);
  });

  it('un adjustment non muove denaro, ma rende comunque coperto l\'asset', () => {
    const ledger = indexLedger([trade('etf', 'adjustment', new Date(2026, 0, 9), 100, 10)]);

    expect(ledger.coveredFrom.get('etf')).toBe('2026-01');
    expect(computeMonthlyPortfolioFlow(gennaio, febbraio, new Set(), ledger)).toBe(0);
  });

  it('senza registro si comporta esattamente come prima', () => {
    expect(buildPortfolioCashFlows([gennaio, febbraio], [])[0].netCashFlow).toBe(600);
    expect(buildPortfolioCashFlows([gennaio, febbraio], [], [])[0].netCashFlow).toBe(600);
  });
});
