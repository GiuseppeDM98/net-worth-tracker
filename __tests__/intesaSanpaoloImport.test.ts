/**
 * The Intesa Sanpaolo import, against the bank's real export shape.
 *
 * The fixture is the portfolio file this bridge was written from, sanitised of its account
 * numbers. It is read through the SAME XLSX reader the browser uses, so a change in the
 * library or in the report's layout turns these red instead of shipping a silent zero.
 */

import { resolve } from 'node:path';
import { readSheet } from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';
import {
  INTESA_BROKER_NAME,
  INTESA_CASH_TICKER,
  IntesaParseError,
  applyIntesaClassChoices,
  buildIntesaImportPlan,
  mapIntesaPositionToAssetFormData,
  mapIntesaPositionType,
  parseIntesaNumber,
  parseIntesaWorkbook,
  type IntesaRows,
} from '@/lib/utils/intesaSanpaoloImport';
import { readIntesaWorkbookFile } from '@/lib/utils/intesaSanpaoloWorkbook';
import type { Asset } from '@/types/assets';

const FIXTURE = resolve(__dirname, 'fixtures/intesa-sanpaolo-portfolio.xlsx');

async function readFixture() {
  const rows = (await readSheet(FIXTURE)) as IntesaRows;
  return parseIntesaWorkbook(rows);
}

function existingAsset(overrides: Partial<Asset> = {}): Pick<
  Asset,
  | 'id'
  | 'name'
  | 'isin'
  | 'ticker'
  | 'type'
  | 'assetClass'
  | 'quantity'
  | 'currentPrice'
  | 'exchange'
  | 'taxRate'
  | 'displayTicker'
  | 'composition'
> {
  return {
    id: 'a1',
    name: 'EURIZON EASYFUND BOND HIGH YIELD - R',
    isin: 'LU0114074718',
    ticker: 'LU0114074718',
    type: 'etf',
    assetClass: 'bonds',
    quantity: 25.554,
    currentPrice: 258.85,
    exchange: 'Intesa Sanpaolo',
    taxRate: 26,
    displayTicker: null,
    ...overrides,
  };
}

/** Yahoo's real answer for IT0005650905 (Eurizon Market Selection 20), read 2026-10-20. */
const MARKET_SELECTION_20_ALLOCATION = {
  stock: 0.1925,
  bond: 0.72690004,
  cash: 0.036,
  other: 0.0446,
  preferred: 0,
  convertible: 0.00029999999,
};

describe('parseIntesaWorkbook', () => {
  it('reads every position and the liquidity total from the real export', async () => {
    const workbook = await readFixture();
    expect(workbook.positions).toHaveLength(22);
    expect(workbook.skipped).toBe(0);
    expect(workbook.cash).toEqual({
      balance: 6606.39,
      currency: 'EUR',
      accountLabel: 'Conto 00000/0000/00000000',
    });
  });

  it('keeps Italian quantities, unit costs and prices apart', async () => {
    const workbook = await readFixture();
    const first = workbook.positions[0];
    expect(first.isin).toBe('IT0005650905');
    expect(first.name).toBe('EURIZON MARKET SELECTION 20');
    expect(first.section).toBe('fund');
    expect(first.quantity).toBe(19699.016);
    expect(first.averageCost).toBe(5);
    expect(first.price).toBe(5.195);
    expect(first.marketValue).toBe(102336.39);
  });

  it('reads the certificate table as a bond and flags its euro-per-unit price', async () => {
    const workbook = await readFixture();
    const bond = workbook.positions.find((position) => position.isin === 'XS2982333986');
    expect(bond).toBeDefined();
    expect(bond?.section).toBe('bond');
    expect(bond?.quantity).toBe(40);
    expect(bond?.averageCost).toBe(1000);
    expect(bond?.price).toBe(1014.9);
    expect(mapIntesaPositionType(bond!)).toEqual({
      type: 'bond',
      assetClass: 'bonds',
      typeUncertain: false,
    });
    const formData = mapIntesaPositionToAssetFormData(bond!);
    expect(formData.type).toBe('bond');
    expect(formData.isin).toBe('XS2982333986');
    expect(formData.currentPrice).toBe(1014.9);
    expect(formData.autoUpdatePrice).toBe(false);
    expect(formData.notes).toContain('prezzo in euro per unità');
    expect(workbook.warnings).toContainEqual(
      expect.stringContaining('«ISP BCP UNICREDIT 29» (XS2982333986): prezzo in euro per unità')
    );
  });

  it('classifies a bond-named fund as bonds and names the ones it cannot classify', async () => {
    const workbook = await readFixture();
    const highYield = workbook.positions.find((position) => position.isin === 'LU0114074718');
    expect(mapIntesaPositionType(highYield!).assetClass).toBe('bonds');

    const uncertain = workbook.positions
      .filter((position) => mapIntesaPositionType(position).typeUncertain)
      .map((position) => position.name);
    expect(uncertain).toContain('EURIZON MARKET SELECTION 20');
    expect(uncertain).toContain('EURIZON FUND - GLOBAL ALLOCATION  - CLASSE R');
    expect(uncertain).toHaveLength(9);
  });

  it('has no unreadable rows, only the certificate price caveat', async () => {
    const workbook = await readFixture();
    expect(workbook.skipped).toBe(0);
    expect(workbook.warnings).toHaveLength(1);
    expect(workbook.warnings[0]).toContain('prezzo in euro per unità');
  });

  it('refuses a sheet that has neither positions nor liquidity', () => {
    expect(() => parseIntesaWorkbook([['Investimenti'], [null, null]])).toThrow(IntesaParseError);
  });
});

describe('readIntesaWorkbookFile validation for Drag and Drop', () => {
  it('rejects files without .xlsx extension', async () => {
    const invalidFile = new File(['dummy content'], 'report.csv', { type: 'text/csv' });
    await expect(readIntesaWorkbookFile(invalidFile)).rejects.toThrow(
      'Il file deve essere un .xlsx esportato da Intesa Sanpaolo.'
    );
  });
});

describe('parseIntesaNumber', () => {
  it('treats a dot as a thousands separator and a comma as the decimal one', () => {
    expect(parseIntesaNumber('2.995')).toBe(2995);
    expect(parseIntesaNumber('1.234,56 €')).toBe(1234.56);
    expect(parseIntesaNumber('19.699,016')).toBe(19699.016);
    expect(parseIntesaNumber('-2,60%')).toBe(-2.6);
    expect(parseIntesaNumber('1014,9 €')).toBe(1014.9);
    expect(parseIntesaNumber(6606.39)).toBe(6606.39);
    expect(parseIntesaNumber('')).toBeUndefined();
  });
});

describe('mapIntesaPositionToAssetFormData', () => {
  it('writes the broker label and keeps Yahoo out of the price path', async () => {
    const workbook = await readFixture();
    const formData = mapIntesaPositionToAssetFormData(workbook.positions[0]);
    expect(formData.exchange).toBe(INTESA_BROKER_NAME);
    expect(formData.autoUpdatePrice).toBe(false);
    expect(formData.isin).toBe('IT0005650905');
    expect(formData.taxRate).toBe(26);
  });

  it('stores a hybrid fund’s published mix as composition and its largest leg as the class', async () => {
    const workbook = await readFixture();
    const formData = mapIntesaPositionToAssetFormData(
      workbook.positions[0],
      MARKET_SELECTION_20_ALLOCATION
    );
    expect(formData.composition?.map((leg) => leg.assetClass)).toEqual(['bonds', 'equity', 'cash']);
    expect(formData.composition?.reduce((sum, leg) => sum + leg.percentage, 0)).toBeCloseTo(100, 10);
    // The name says «20», the fund is 73% bonds: a reader ignoring composition shows the truth.
    expect(formData.assetClass).toBe('bonds');
  });

  it('leaves a bond or an unread fund without a composition', async () => {
    const workbook = await readFixture();
    const bond = workbook.positions.find((position) => position.section === 'bond');
    expect(
      mapIntesaPositionToAssetFormData(bond!, MARKET_SELECTION_20_ALLOCATION).composition
    ).toBeUndefined();
    expect(mapIntesaPositionToAssetFormData(workbook.positions[0], null).composition).toBeUndefined();
  });
});

describe('buildIntesaImportPlan', () => {
  it('proposes every position as new and the liquidity as its own cash account', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(workbook, []);
    expect(plan.stats.newCount).toBe(22);
    expect(plan.stats.priceUpdateCount).toBe(0);
    expect(plan.stats.unchangedCount).toBe(0);
    expect(plan.cash?.balance).toBe(6606.39);
    expect(plan.cash?.ticker).toBe(INTESA_CASH_TICKER);
  });

  it('matches an existing position by ISIN instead of duplicating it', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(workbook, [existingAsset()]);
    expect(plan.stats.newCount).toBe(21);
    expect(plan.stats.unchangedCount).toBe(1);
    const diff = plan.holdings.find((holding) => holding.position.isin === 'LU0114074718');
    expect(diff?.kind).toBe('unchanged');
    expect(diff?.existingAssetId).toBe('a1');
    expect(diff?.exchangeUpdate).toBe(false);
  });

  it('sees a moved price and never proposes a ledger quantity', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(workbook, [
      existingAsset({ currentPrice: 250, quantity: 10, exchange: undefined }),
    ]);
    const diff = plan.holdings.find((holding) => holding.position.isin === 'LU0114074718');
    expect(diff?.kind).toBe('price-and-drift');
    expect(diff?.existingAssetId).toBe('a1');
    expect(diff?.exchangeUpdate).toBe(true);
    // The drift is a number in the preview and a warning, never a write payload.
    expect(diff?.quantityDrift).toBeCloseTo(15.554, 3);
    expect(plan.warnings.some((warning) => warning.includes('riconcilia'))).toBe(true);
    expect(diff?.formData.quantity).toBe(25.554);
  });

  it('repairs the broker label even when price and quantity are unchanged', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(workbook, [existingAsset({ exchange: undefined })]);
    const diff = plan.holdings.find((holding) => holding.position.isin === 'LU0114074718');
    expect(diff?.kind).toBe('unchanged');
    expect(diff?.exchangeUpdate).toBe(true);
    expect(plan.stats.exchangeUpdateCount).toBe(1);
  });

  it('gives a new hybrid fund its composition and drops the «classe da verificare» warning', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(workbook, [], {
      IT0005650905: MARKET_SELECTION_20_ALLOCATION,
    });
    const diff = plan.holdings.find((holding) => holding.position.isin === 'IT0005650905');
    expect(diff?.kind).toBe('new');
    expect(diff?.formData.composition).toHaveLength(3);
    expect(diff?.needsClassChoice).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes('MARKET SELECTION 20'))).toBe(false);
  });

  it('fills an existing fund’s EMPTY composition and says so', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(
      workbook,
      [
        existingAsset({
          isin: 'IT0005650905',
          name: 'EURIZON MARKET SELECTION 20',
          assetClass: 'equity',
          quantity: 19699.016,
          currentPrice: 5.195,
        }),
      ],
      { IT0005650905: MARKET_SELECTION_20_ALLOCATION }
    );
    const diff = plan.holdings.find((holding) => holding.position.isin === 'IT0005650905');
    expect(diff?.kind).toBe('composition-update');
    expect(diff?.compositionUpdate).toBe(true);
    expect(diff?.formData.composition).toHaveLength(3);
    expect(plan.stats.compositionUpdateCount).toBe(1);
  });

  it('never overwrites a composition the user already typed', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(
      workbook,
      [
        existingAsset({
          isin: 'IT0005650905',
          name: 'EURIZON MARKET SELECTION 20',
          assetClass: 'equity',
          quantity: 19699.016,
          currentPrice: 5.195,
          composition: [{ assetClass: 'equity', percentage: 100 }],
        }),
      ],
      { IT0005650905: MARKET_SELECTION_20_ALLOCATION }
    );
    const diff = plan.holdings.find((holding) => holding.position.isin === 'IT0005650905');
    expect(diff?.kind).toBe('unchanged');
    expect(diff?.compositionUpdate).toBe(false);
    expect(diff?.needsClassChoice).toBe(false);
    expect(plan.stats.compositionUpdateCount).toBe(0);
    // The preview must not announce a mix the save would not write.
    expect(diff?.formData.composition?.map((leg) => leg.assetClass)).toEqual([
      'bonds',
      'equity',
      'cash',
    ]);
  });
});

describe('the class the user chooses in the preview', () => {
  it('waits for a class on every fund the market could not decide', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(workbook, []);

    const waiting = plan.holdings.filter((holding) => holding.needsClassChoice);
    // The name says nothing about the class and no mix was read: the row asks for it.
    expect(waiting.length).toBeGreaterThan(0);
    expect(waiting.every((holding) => holding.kind === 'new')).toBe(true);
    // The class is not a warning any more: the row asks it, and the import waits.
    expect(plan.warnings.some((warning) => warning.includes('classe non deducibile'))).toBe(false);
  });

  it('takes the class already stored on a tracked asset: the second upload asks nothing', async () => {
    const workbook = await readFixture();
    const position = workbook.positions.find((candidate) => candidate.isin === 'IT0005650905')!;
    const existing = existingAsset({
      isin: position.isin,
      name: position.name,
      assetClass: 'bonds',
      quantity: position.quantity,
      currentPrice: position.price,
    });

    const plan = buildIntesaImportPlan(workbook, [existing]);
    const diff = plan.holdings.find((holding) => holding.position.isin === position.isin)!;

    expect(diff.needsClassChoice).toBe(false);
    expect(diff.storedAssetClass).toBe('bonds');
  });

  it('stores the class the user chose, on the row that was waiting for it', async () => {
    const workbook = await readFixture();
    const plan = buildIntesaImportPlan(workbook, []);
    const position = workbook.positions.find((candidate) => candidate.isin === 'IT0005650905')!;

    const saved = applyIntesaClassChoices(plan, { [position.isin]: 'bonds' });
    const diff = saved.holdings.find((holding) => holding.position.isin === position.isin)!;

    expect(diff.formData.assetClass).toBe('bonds');
    expect(diff.needsClassChoice).toBe(false);
  });
});
