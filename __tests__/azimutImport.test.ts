/**
 * The Azimut import, against the bank's real export shape.
 */

import { resolve } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { describe, expect, it } from 'vitest';
import {
  AZIMUT_BROKER_NAME,
  AZIMUT_CASH_TICKER,
  AzimutParseError,
  buildAzimutImportPlan,
  extractCodeFromProduct,
  mapAzimutPositionToAssetFormData,
  mapAzimutPositionType,
  parseAzimutNumber,
  parseAzimutWorkbook,
  type AzimutSheetData,
} from '@/lib/utils/azimutImport';
import { readAzimutWorkbookFile } from '@/lib/utils/azimutWorkbook';
import type { Asset } from '@/types/assets';

const SAMPLE_XLSX_FILE = '/tmp/file_attachments/az/2026-10-21 AZ portfolio.xlsx';

async function readSampleWorkbook() {
  const sheets = (await readXlsxFile(SAMPLE_XLSX_FILE)) as AzimutSheetData[];
  return parseAzimutWorkbook(sheets);
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
    id: 'az1',
    name: 'ENEL ORD (ENEL IM)',
    ticker: 'ENEL.MI',
    type: 'stock',
    assetClass: 'equity',
    quantity: 400,
    currentPrice: 9.192,
    exchange: 'Azimut',
    taxRate: 26,
    displayTicker: 'ENEL ORD (ENEL IM)',
    ...overrides,
  };
}

describe('parseAzimutWorkbook with real file', () => {
  it('reads all 34 positions and cash from the portfolio export', async () => {
    const workbook = await readSampleWorkbook();
    expect(workbook.positions).toHaveLength(34);
    expect(workbook.skipped).toBe(0);
    expect(workbook.cash).toEqual({
      balance: 2649.03,
      currency: 'EUR',
      accountLabel: '02-4055000653-000645923',
    });
  });

  it('correctly parses Gestito positions', async () => {
    const workbook = await readSampleWorkbook();
    const gestito = workbook.positions.filter((p) => p.section === 'gestito');
    expect(gestito).toHaveLength(6);
    const bgf = gestito[0];
    expect(bgf.name).toBe('BGF WORLD HEALTHSCIENCE "E2" (EUR) ACC');
    expect(bgf.quantity).toBeCloseTo(266.95, 2);
    expect(bgf.price).toBe(64.1);
    expect(bgf.marketValue).toBe(17111.5);
  });

  it('correctly parses Economia Reale positions', async () => {
    const workbook = await readSampleWorkbook();
    const economia = workbook.positions.filter((p) => p.section === 'economia-reale');
    expect(economia).toHaveLength(6);
    const eltif = economia[0];
    expect(eltif.name).toBe('AZIMUT ELTIF - PRIVATE DEBT DIGITAL LENDING CL.D');
    expect(eltif.quantity).toBe(10100);
    expect(eltif.marketValue).toBe(8134);
    expect(eltif.price).toBeCloseTo(0.805, 3);
  });

  it('correctly parses Amministrato sub-sections (Obbligazioni, Azioni, ETF)', async () => {
    const workbook = await readSampleWorkbook();
    const bonds = workbook.positions.filter((p) => p.section === 'obbligazioni');
    const stocks = workbook.positions.filter((p) => p.section === 'azioni');
    const etfs = workbook.positions.filter((p) => p.section === 'etf');

    expect(bonds).toHaveLength(4);
    expect(stocks).toHaveLength(5);
    expect(etfs).toHaveLength(13);

    const btp = bonds[0];
    expect(btp.name).toBe('BTP 0,35% 17 NOV 2028 EUR');
    expect(btp.quantity).toBe(25000);
    expect(btp.price).toBe(94.73435);

    const basf = stocks[0];
    expect(basf.name).toBe('BASF A.G. (BAS GY) EUR');
    expect(basf.ticker).toBe('BAS.DE');
    expect(basf.quantity).toBe(60);

    const coinshares = etfs[0];
    expect(coinshares.name).toBe('COINSHARES PHYSICAL BITCOIN (BITC GY) EUR');
    expect(coinshares.ticker).toBe('BITC.DE');
  });

  it('refuses an empty workbook without positions or cash', () => {
    expect(() => parseAzimutWorkbook([])).toThrow(AzimutParseError);
  });
});

describe('extractCodeFromProduct', () => {
  it('extracts Bloomberg ticker symbols in parentheses and converts suffixes', () => {
    expect(extractCodeFromProduct('BASF A.G. (BAS GY) EUR')).toEqual({ ticker: 'BAS.DE' });
    expect(extractCodeFromProduct('ENEL ORD (ENEL IM)')).toEqual({ ticker: 'ENEL.MI' });
    expect(extractCodeFromProduct('ESSILORLUXOTTICA SA (EL FP) PARIGI EUR')).toEqual({ ticker: 'EL.PA' });
    expect(extractCodeFromProduct('LOUIS VUITTON MOET HEN. EU (MC FP)')).toEqual({ ticker: 'MC.PA' });
    expect(extractCodeFromProduct('VISA INC CLASS A(V UN)')).toEqual({ ticker: 'V' });
    expect(extractCodeFromProduct('COINSHARES PHYSICAL BITCOIN (BITC GY) EUR')).toEqual({ ticker: 'BITC.DE' });
    expect(extractCodeFromProduct('ISHARES MSCI WORLD EUR HEDGED (IWDE IM) EUR')).toEqual({ ticker: 'IWDE.MI' });
  });

  it('ignores currency designations in parentheses and falls back to name', () => {
    expect(extractCodeFromProduct('BGF WORLD HEALTHSCIENCE "E2" (EUR) ACC')).toEqual({
      ticker: 'BGF WORLD HEALTHSCIENCE "E2" (EUR) ACC',
    });
    expect(extractCodeFromProduct('FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC')).toEqual({
      ticker: 'FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC',
    });
  });

  it('extracts explicit ISIN strings when present', () => {
    expect(extractCodeFromProduct('BTP 0,35% IT0005454241 EUR')).toEqual({ isin: 'IT0005454241' });
    expect(extractCodeFromProduct('FONDO (LU0114074718)')).toEqual({ isin: 'LU0114074718' });
  });
});

describe('parseAzimutNumber', () => {
  it('parses numbers formatted as Italian strings or raw numbers', () => {
    expect(parseAzimutNumber('2.649,03')).toBe(2649.03);
    expect(parseAzimutNumber('10.100')).toBe(10100);
    expect(parseAzimutNumber('94,73435')).toBe(94.73435);
    expect(parseAzimutNumber(1234.56)).toBe(1234.56);
    expect(parseAzimutNumber('N/D')).toBeUndefined();
    expect(parseAzimutNumber('')).toBeUndefined();
  });
});

describe('mapAzimutPositionToAssetFormData', () => {
  it('creates AssetFormData with exchange Azimut', async () => {
    const workbook = await readSampleWorkbook();
    const enel = workbook.positions.find((p) => p.name.includes('ENEL'))!;
    const formData = mapAzimutPositionToAssetFormData(enel);
    expect(formData.exchange).toBe(AZIMUT_BROKER_NAME);
    expect(formData.ticker).toBe('ENEL.MI');
    expect(formData.name).toBe('ENEL ORD (ENEL IM)');
    expect(formData.type).toBe('stock');
    expect(formData.assetClass).toBe('equity');
    expect(formData.currentPrice).toBe(9.192);
    expect(formData.quantity).toBe(400);
  });
});

describe('buildAzimutImportPlan', () => {
  it('proposes all positions as new when tracking empty portfolio', async () => {
    const workbook = await readSampleWorkbook();
    const plan = buildAzimutImportPlan(workbook, []);
    expect(plan.stats.newCount).toBe(34);
    expect(plan.cash?.balance).toBe(2649.03);
    expect(plan.cash?.ticker).toBe(AZIMUT_CASH_TICKER);
  });

  it('matches existing asset by ticker or name and detects unchanged status', async () => {
    const workbook = await readSampleWorkbook();
    const plan = buildAzimutImportPlan(workbook, [existingAsset()]);
    expect(plan.stats.newCount).toBe(33);
    expect(plan.stats.unchangedCount).toBe(1);
    const diff = plan.holdings.find((h) => h.formData.ticker === 'ENEL.MI');
    expect(diff?.kind).toBe('unchanged');
    expect(diff?.existingAssetId).toBe('az1');
  });

  it('detects price updates and quantity drifts', async () => {
    const workbook = await readSampleWorkbook();
    const plan = buildAzimutImportPlan(workbook, [
      existingAsset({ currentPrice: 8.5, quantity: 350 }),
    ]);
    const diff = plan.holdings.find((h) => h.formData.ticker === 'ENEL.MI');
    expect(diff?.kind).toBe('price-and-drift');
    expect(diff?.quantityDrift).toBe(50);
  });
});

describe('readAzimutWorkbookFile validation', () => {
  it('rejects non-xlsx file', async () => {
    const file = new File(['dummy'], 'test.csv', { type: 'text/csv' });
    await expect(readAzimutWorkbookFile(file)).rejects.toThrow(
      'Il file deve essere un .xlsx esportato da Azimut.'
    );
  });
});
