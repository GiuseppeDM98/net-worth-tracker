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
  applyAzimutClassChoices,
  azimutAllocationKey,
  azimutAllocationLookup,
  buildAzimutImportPlan,
  extractCodeFromProduct,
  mapAzimutPositionToAssetFormData,
  mapAzimutPositionType,
  needsFundIdentity,
  parseAzimutNumber,
  parseAzimutWorkbook,
  type AzimutPositionInput,
  type AzimutSheetData,
} from '@/lib/utils/azimutImport';
import { normalizeFundName } from '@/lib/utils/fundIdentity';
import { readAzimutWorkbookFile } from '@/lib/utils/azimutWorkbook';
import type { Asset } from '@/types/assets';
import type { InstrumentFundAllocation } from '@/types/exposure';
import type { FundIdentityResult } from '@/types/fundIdentity';

const SAMPLE_XLSX_FILE = resolve(__dirname, 'fixtures/azimut-portfolio.xlsx');

function position(overrides: Partial<AzimutPositionInput> = {}): AzimutPositionInput {
  return {
    id: 'p1',
    name: 'UN FONDO',
    section: 'gestito',
    quantity: 1,
    price: 1,
    currency: 'EUR',
    ...overrides,
  };
}

function allocation(overrides: Partial<InstrumentFundAllocation> = {}): InstrumentFundAllocation {
  return { stock: 0, bond: 0, cash: 0, other: 0, preferred: 0, convertible: 0, ...overrides };
}

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
      accountLabel: '00-0000000000-000000000',
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

describe('azimutAllocationLookup', () => {
  it('asks by ISIN when the file carries one', () => {
    const bond = position({ name: 'FONDO (LU0114074718)', isin: 'LU0114074718', section: 'obbligazioni' });
    expect(azimutAllocationLookup(bond)).toEqual({ isin: 'LU0114074718' });
    expect(azimutAllocationKey(bond)).toBe('LU0114074718');
  });

  it('asks by the Bloomberg ticker when there is no ISIN', () => {
    const grid = position({
      name: 'FIRST TRUST CLEAN EDGE SMART GRID ETF (GRID IM)',
      ticker: 'GRID.MI',
      section: 'etf',
    });
    expect(azimutAllocationLookup(grid)).toEqual({ ticker: 'GRID.MI' });
    expect(azimutAllocationKey(grid)).toBe('GRID.MI');
  });

  it('asks nothing for a GESTITO fund whose «ticker» is its own name', () => {
    const fund = position({ name: 'R-CO VALOR "C" (EUR) ACC', ticker: 'R-CO VALOR "C" (EUR) ACC' });
    expect(azimutAllocationLookup(fund)).toEqual({});
    expect(azimutAllocationKey(fund)).toBeUndefined();
  });

  it('asks nothing for a section that cannot carry a fund mix', () => {
    const stock = position({ name: 'BASF A.G. (BAS GY) EUR', ticker: 'BAS.DE', section: 'azioni' });
    expect(azimutAllocationLookup(stock)).toEqual({});
    expect(azimutAllocationKey(stock)).toBeUndefined();
  });
});

describe('needsFundIdentity', () => {
  it('is true only for a fund the file gave no code at all', () => {
    const fund = position({ name: 'R-CO VALOR "C" (EUR) ACC', ticker: 'R-CO VALOR "C" (EUR) ACC' });
    expect(needsFundIdentity(fund)).toBe(true);
  });

  it('is false when the file printed a code — no name search can beat an ISIN', () => {
    const grid = position({ name: 'FIRST TRUST (GRID IM)', ticker: 'GRID.MI', section: 'etf' });
    expect(needsFundIdentity(grid)).toBe(false);
  });

  it('is false for a section that is not a fund', () => {
    const stock = position({ name: 'BASF A.G. (BAS GY) EUR', section: 'azioni' });
    expect(needsFundIdentity(stock)).toBe(false);
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

  it('stores the class the published mix names, not the name-based guess', () => {
    // A fund whose NAME says bonds, quoted 99,7% equity: one leg is not a composition, but the
    // class is still measured — the stored `assetClass` follows the mix.
    const formData = mapAzimutPositionToAssetFormData(
      position({ name: 'UN FONDO BOND (GRID IM)', ticker: 'GRID.MI', section: 'etf' }),
      allocation({ stock: 0.997, cash: 0.003 })
    );
    expect(formData.composition).toBeUndefined();
    expect(formData.assetClass).toBe('equity');
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

  it('confirms the class of a nearly single-class ETF from the mix its ticker resolves', async () => {
    const workbook = await readSampleWorkbook();
    const plan = buildAzimutImportPlan(workbook, [], {
      'GRID.MI': allocation({ stock: 0.9945, cash: 0.0029, other: 0.0026 }),
    });
    const grid = plan.holdings.find((h) => h.position.name.startsWith('FIRST TRUST'))!;
    // 99,45% equity is one leg, so there is no composition to store — but the class is measured.
    expect(grid.formData.assetClass).toBe('equity');
    expect(grid.formData.composition).toBeUndefined();
    expect(grid.needsClassChoice).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes('FIRST TRUST'))).toBe(false);
  });

  it('splits a hybrid ETF by the ticker’s mix', async () => {
    const workbook = await readSampleWorkbook();
    const plan = buildAzimutImportPlan(workbook, [], {
      'IWDE.MI': allocation({ stock: 0.9892, cash: 0.0103, other: 0.0004 }),
    });
    const iwde = plan.holdings.find((h) => h.position.name.startsWith('ISHARES MSCI WORLD'))!;
    expect(iwde.formData.composition?.map((leg) => leg.assetClass)).toEqual(['equity', 'cash']);
    expect(iwde.needsClassChoice).toBe(false);
  });

  it('keeps a fund that is ALL «other» undecided: the mix names no class', async () => {
    const workbook = await readSampleWorkbook();
    const plan = buildAzimutImportPlan(workbook, [], {
      'EUJP.MI': allocation({ other: 1 }),
    });
    const eujp = plan.holdings.find((h) => h.position.name.startsWith('WT LONG JPY'))!;
    expect(eujp.formData.assetClass).toBe('equity');
    // The mix names no class: the row waits for the USER, in the preview.
    expect(eujp.needsClassChoice).toBe(true);
  });

  it('waits for a class on every row the market could not decide', async () => {
    const workbook = await readSampleWorkbook();
    const plan = buildAzimutImportPlan(workbook, []);
    const waiting = plan.holdings.filter((holding) => holding.needsClassChoice);
    // Four GESTITO funds with no code to look up, and the two ETFs whose mix is unread: the class
    // of each is a question for the user, not a proposal the app writes.
    expect(waiting.map((holding) => holding.position.name).sort()).toEqual(
      [
        'FIDELITY FUNDS GLOBAL MULTI ASSET DEFENSIVE FUND "A" (EUR) ACC',
        'FIDELITY GLOBAL DIVIDEND "A" (EURHDG) ACC',
        'FIRST TRUST CLEAN EDGE SMART GRID ETF (GRID IM)',
        'FRANKLIN FTSE INDIA UCITS ETF (FLXI IM) EUR',
        'MORGAN STANLEY INVESTMENT FUNDS GLOBAL BRANDS "A" (USD) ACC',
        'R-CO VALOR "C" (EUR) ACC',
        'WT LONG JPY SHORT EUR (EUJP IM)',
        'WT SHT USD LONG EUR (USEU IM) EUR',
      ].sort()
    );
    // The class is not a warning any more: the row asks it, and the import waits.
    expect(plan.warnings.some((warning) => warning.includes('classe non deducibile'))).toBe(false);
  });
});

describe('buildAzimutImportPlan with the ISIN a name search resolved', () => {
  const R_CO_VALOR_IDENTITY = {
    status: 'matched' as const,
    identity: { isin: 'FR0011253624', name: 'R-co Valor C EUR', currency: 'EUR' },
    candidateCount: 3,
  };

  async function rcoScenario() {
    const workbook = await readSampleWorkbook();
    const rco = workbook.positions.find((candidate) => candidate.name.startsWith('R-CO VALOR'))!;
    const identities: Record<string, FundIdentityResult> = {
      [normalizeFundName(rco.name)]: { ...R_CO_VALOR_IDENTITY, query: rco.name },
    };
    return { workbook, rco, identities };
  }

  it('makes the found ISIN both the identity stored and the key its mix is read by', async () => {
    const { workbook, rco, identities } = await rcoScenario();

    const plan = buildAzimutImportPlan(
      workbook,
      [],
      { FR0011253624: allocation({ stock: 0.6, bond: 0.35, cash: 0.05 }) },
      identities
    );
    const diff = plan.holdings.find((holding) => holding.position.id === rco.id)!;

    expect(diff.kind).toBe('new');
    expect(diff.formData.isin).toBe('FR0011253624');
    expect(diff.formData.ticker).toBe('FR0011253624');
    // The mix arrived under the ISIN, not under the product name.
    expect(diff.formData.composition?.map((leg) => leg.assetClass)).toEqual(['equity', 'bonds', 'cash']);
    expect(diff.needsClassChoice).toBe(false);
    expect(plan.warnings.some((warning) => warning.includes(rco.name))).toBe(false);
  });

  it('leaves a «none» answer with no ISIN — and the row waiting for a class', async () => {
    const { workbook, rco, identities } = await rcoScenario();
    identities[normalizeFundName(rco.name)] = {
      query: rco.name,
      status: 'none',
      candidateCount: 8,
    };

    const plan = buildAzimutImportPlan(workbook, [], {}, identities);
    const diff = plan.holdings.find((holding) => holding.position.id === rco.id)!;

    expect(diff.formData.isin).toBeUndefined();
    expect(diff.formData.ticker).toBe(rco.name);
    // No ISIN and no mix: the class is the user's to choose, in the preview row.
    expect(diff.needsClassChoice).toBe(true);
    expect(plan.warnings.some((warning) => warning.includes('ISIN'))).toBe(false);
  });

  it('waits for a class when the identity is found but its mix is unread', async () => {
    const { workbook, rco, identities } = await rcoScenario();

    const plan = buildAzimutImportPlan(workbook, [], {}, identities);
    const diff = plan.holdings.find((holding) => holding.position.id === rco.id)!;

    // The ISIN was found, the class was not: the row asks for it, the ISIN is not a class.
    expect(diff.formData.isin).toBe('FR0011253624');
    expect(diff.needsClassChoice).toBe(true);
  });

  it('adds the ISIN to an existing asset that has none, without touching its identity', async () => {
    const { workbook, rco, identities } = await rcoScenario();
    const existing = existingAsset({
      id: 'az-rco',
      name: rco.name,
      ticker: rco.name,
      displayTicker: rco.name,
      type: mapAzimutPositionType(rco).type,
      assetClass: mapAzimutPositionType(rco).assetClass,
      quantity: rco.quantity,
      currentPrice: rco.price,
      exchange: AZIMUT_BROKER_NAME,
      composition: undefined,
    });

    const plan = buildAzimutImportPlan(workbook, [existing], {}, identities);
    const diff = plan.holdings.find((holding) => holding.position.id === rco.id)!;

    expect(diff.kind).toBe('identity-update');
    expect(diff.existingAssetId).toBe('az-rco');
    expect(diff.isinUpdate).toBe(true);
    expect(diff.formData.isin).toBe('FR0011253624');
    expect(plan.stats.isinUpdateCount).toBe(1);
  });

  it('never replaces an ISIN the asset already carries', async () => {
    const { workbook, rco, identities } = await rcoScenario();
    const existing = existingAsset({
      id: 'az-rco',
      name: rco.name,
      ticker: rco.name,
      displayTicker: rco.name,
      isin: 'FR0011253624',
      type: mapAzimutPositionType(rco).type,
      assetClass: mapAzimutPositionType(rco).assetClass,
      quantity: rco.quantity,
      currentPrice: rco.price,
      exchange: AZIMUT_BROKER_NAME,
      composition: undefined,
    });

    const plan = buildAzimutImportPlan(workbook, [existing], {}, identities);
    const diff = plan.holdings.find((holding) => holding.position.id === rco.id)!;

    expect(diff.isinUpdate).toBe(false);
    expect(diff.kind).toBe('unchanged');
  });
});

describe('the class the user chooses in the preview', () => {
  it('takes the class already stored on a tracked asset: the second upload asks nothing', async () => {
    const workbook = await readSampleWorkbook();
    const rco = workbook.positions.find((candidate) => candidate.name.startsWith('R-CO VALOR'))!;
    const existing = existingAsset({
      id: 'az-rco',
      name: rco.name,
      ticker: rco.name,
      displayTicker: rco.name,
      type: mapAzimutPositionType(rco).type,
      assetClass: 'bonds',
      quantity: rco.quantity,
      currentPrice: rco.price,
      exchange: AZIMUT_BROKER_NAME,
      composition: undefined,
    });

    const plan = buildAzimutImportPlan(workbook, [existing]);
    const diff = plan.holdings.find((holding) => holding.position.id === rco.id)!;

    // The class of a tracked asset is decided: the one stored there, which the import never
    // overwrites. So the row is not a question, and the preview does not ask it.
    expect(diff.needsClassChoice).toBe(false);
    expect(diff.storedAssetClass).toBe('bonds');
  });

  it('stores the class the user chose, on the row that was waiting for it', async () => {
    const workbook = await readSampleWorkbook();
    const rco = workbook.positions.find((candidate) => candidate.name.startsWith('R-CO VALOR'))!;
    const plan = buildAzimutImportPlan(workbook, []);

    const saved = applyAzimutClassChoices(plan, { [rco.id]: 'bonds' });
    const diff = saved.holdings.find((holding) => holding.position.id === rco.id)!;

    expect(diff.formData.assetClass).toBe('bonds');
    expect(diff.needsClassChoice).toBe(false);
    // The rows that were not waiting keep the class the plan measured.
    const grid = saved.holdings.find((holding) => holding.position.name.startsWith('FIRST TRUST'))!;
    expect(grid.formData.assetClass).toBe('equity');
    expect(grid.needsClassChoice).toBe(true);
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
