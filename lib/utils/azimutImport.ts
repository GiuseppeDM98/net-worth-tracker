/**
 * Azimut — the pure layer behind Impostazioni → Collegamenti → Azimut.
 *
 * Azimut's online portfolio exports an `.xlsx` report containing up to four sheets:
 *   1. `AZIMUT - GESTITO`: SICAVs and mutual funds
 *   2. `AZIMUT - ECONOMIA REALE`: Private Debt and Private Equity funds
 *   3. `AZIMUT - AMMINISTRATO`: Obbligazioni, Azioni, and ETF / ETC / ETN
 *   4. `AZIMUT - LIQUIDITA`: Bank accounts / cash
 *
 * This module turns those rows into positions, maps them onto `AssetFormData`, and builds
 * the preview plan. It performs NO I/O and knows nothing about React or Firestore.
 */

import type { Asset, AssetClass, AssetComposition, AssetFormData, AssetType } from '@/types/assets';
import type { InstrumentFundAllocation } from '@/types/exposure';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { resolveYahooSymbolForIsin } from '@/lib/utils/yahooSymbolForIsin';
import { compositionFromFundAllocation } from '@/lib/utils/fundComposition';

export type AzimutCell = unknown;
export type AzimutRows = readonly (readonly AzimutCell[])[];

export interface AzimutSheetData {
  sheet?: string;
  data: AzimutRows;
}

export type AzimutSection = 'gestito' | 'economia-reale' | 'obbligazioni' | 'azioni' | 'etf';

export interface AzimutPositionInput {
  id: string;
  isin?: string;
  ticker?: string;
  displayTicker?: string;
  name: string;
  contract?: string;
  section: AzimutSection;
  quantity: number;
  averageCost?: number;
  price: number;
  marketValue?: number;
  currency: string;
}

export interface AzimutCashInput {
  balance: number;
  currency: 'EUR';
  accountLabel?: string;
}

export interface AzimutWorkbook {
  positions: AzimutPositionInput[];
  cash: AzimutCashInput | null;
  skipped: number;
  warnings: string[];
}

export class AzimutParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AzimutParseError';
  }
}

export const AZIMUT_BROKER_NAME = 'Azimut';
export const AZIMUT_CASH_ACCOUNT_NAME = 'Azimut — Liquidità';
export const AZIMUT_CASH_TICKER = 'AZIMUT-EUR';

function text(cell: AzimutCell): string {
  if (typeof cell === 'string') return cell.trim();
  if (typeof cell === 'number' && Number.isFinite(cell)) return String(cell);
  return '';
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse Italian or standard numeric values.
 */
export function parseAzimutNumber(cell: AzimutCell): number | undefined {
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
  if (typeof cell !== 'string') return undefined;
  let value = cell.trim();
  if (value === '' || value === 'N/D') return undefined;
  const negative = value.startsWith('-') || (value.startsWith('(') && value.endsWith(')'));
  value = value.replace(/[€%\s()]/g, '').replace(/^\+/, '');
  if (!/\d/.test(value)) return undefined;
  value = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value.replace(/\./g, '');
  value = value.replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -Math.abs(parsed) : parsed;
}

const ISIN_REGEX = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

function isIsin(value: string): boolean {
  return ISIN_REGEX.test(value);
}

/**
 * Converts Bloomberg exchange suffix to Yahoo Finance suffix.
 * e.g., BAS GY -> BAS.DE, ENEL IM -> ENEL.MI, EL FP -> EL.PA, V UN -> V
 */
function convertBloombergTicker(code: string): { isin?: string; ticker?: string } {
  const clean = code.trim().toUpperCase();
  if (isIsin(clean)) {
    return { isin: clean };
  }
  const parts = clean.split(/\s+/);
  if (parts.length === 2) {
    const [symbol, suffix] = parts;
    const suffixMap: Record<string, string> = {
      GY: '.DE',
      GR: '.DE',
      IM: '.MI',
      FP: '.PA',
      UN: '',
      UW: '',
      UQ: '',
      LN: '.L',
      NA: '.AS',
      SW: '.SW',
      VX: '.SW',
    };
    if (suffix in suffixMap) {
      return { ticker: `${symbol}${suffixMap[suffix]}` };
    }
  }
  return { ticker: clean };
}

const CURRENCY_OR_HEDGE_PARENS = /^(EUR|USD|GBP|CHF|CAD|AUD|JPY|EURHDG|USDHDG|EUR HEDGED|USD HEDGED)$/i;

/**
 * Extracts ISIN or ticker code from a product description.
 */
export function extractCodeFromProduct(prodotto: string): { isin?: string; ticker?: string } {
  const isinMatch = prodotto.match(/\b([A-Z]{2}[A-Z0-9]{9}[0-9])\b/);
  if (isinMatch) {
    return { isin: isinMatch[1] };
  }
  const parenMatches = [...prodotto.matchAll(/\(([^)]+)\)/g)];
  for (const match of parenMatches) {
    const inside = match[1].trim();
    if (!CURRENCY_OR_HEDGE_PARENS.test(inside)) {
      const converted = convertBloombergTicker(inside);
      if (converted.ticker || converted.isin) return converted;
    }
  }
  return { ticker: prodotto.trim() };
}

function inferFundClass(name: string): { assetClass: AssetClass; uncertain: boolean } {
  const n = normalized(name);
  if (/\b(BITC|BITCOIN|CRYPTO)\b/.test(n)) {
    return { assetClass: 'crypto', uncertain: false };
  }
  if (/\b(GOLD|SILVER|COPPER|WHEAT|COMMODIT|ORO)\b/.test(n)) {
    return { assetClass: 'commodity', uncertain: false };
  }
  if (/\b(EONIA|CASH|MONETAR|LIQUID|SHORT TERM)\b/.test(n)) {
    return { assetClass: 'bonds', uncertain: false };
  }
  if (/\b(BOND|OBBLIG|TESORERIA|CREDIT|DEBT)\b/.test(n)) {
    return { assetClass: 'bonds', uncertain: false };
  }
  if (/\b(EQUITY|AZION|WORLD|EUROPEAN|US|EMERGING|DAX|STAR MARK)\b/.test(n)) {
    return { assetClass: 'equity', uncertain: false };
  }
  if (/\b(REAL ESTATE|IMMOBIL)\b/.test(n)) {
    return { assetClass: 'realestate', uncertain: false };
  }
  return { assetClass: 'equity', uncertain: true };
}

function sectionLabel(section: AzimutSection): string {
  switch (section) {
    case 'obbligazioni':
      return 'obbligazioni';
    case 'azioni':
      return 'azioni';
    case 'economia-reale':
      return 'economia reale (private debt/equity)';
    case 'etf':
      return 'ETF e altri strumenti';
    case 'gestito':
      return 'fondi e gestito';
  }
}

/**
 * Parses raw sheets or rows into structured workbook output.
 */
export function parseAzimutWorkbook(input: AzimutSheetData[] | AzimutRows): AzimutWorkbook {
  const sheets: AzimutSheetData[] = Array.isArray(input) && input.length > 0 && typeof input[0] === 'object' && input[0] !== null && 'data' in input[0]
    ? (input as AzimutSheetData[])
    : [{ sheet: 'AZIMUT', data: input as AzimutRows }];

  const positions: AzimutPositionInput[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  let skipped = 0;
  let cash: AzimutCashInput | null = null;

  for (const sheetData of sheets) {
    const sheetName = normalized(sheetData.sheet ?? '');
    const rows = sheetData.data;
    if (!rows || rows.length === 0) continue;

    let currentSection: AzimutSection | null = null;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const col0 = text(row[0]);
      const norm0 = normalized(col0);

      // --- 1. LIQUIDITA ---
      if (sheetName.includes('LIQUIDITA') || norm0 === 'LIQUIDITA\'' || norm0 === 'LIQUIDITA') {
        if (norm0.startsWith('CONTO CORRENTE') || normalized(text(row[0])).startsWith('CONTO CORRENTE')) {
          const balance = parseAzimutNumber(row[2]) ?? parseAzimutNumber(row[6]);
          if (balance !== undefined) {
            const accountLabel = text(row[1]) || undefined;
            cash = { balance, currency: 'EUR', accountLabel };
          }
          continue;
        }
      }

      // --- 2. GESTITO ---
      if (sheetName.includes('GESTITO') || norm0 === 'GESTITO' || norm0 === 'SICAV') {
        if (norm0 === 'MACRO PRODOTTO' && normalized(text(row[1])) === 'PRODOTTO') {
          currentSection = 'gestito';
          continue;
        }
        if (currentSection === 'gestito') {
          if (norm0.startsWith('TOTALE') || col0 === '') continue;
          const prodotto = text(row[1]);
          if (!prodotto || norm0 === 'PRODOTTO') continue;

          const contract = text(row[2]) || undefined;
          const quantity = parseAzimutNumber(row[3]);
          const currency = text(row[4]) || 'EUR';
          const averageCost = parseAzimutNumber(row[5]);
          const price = parseAzimutNumber(row[7]);
          const marketValue = parseAzimutNumber(row[10]);

          const effectivePrice = price ?? (quantity && quantity > 0 && marketValue ? marketValue / quantity : undefined);

          if (!quantity || quantity <= 0 || !effectivePrice || effectivePrice < 0) {
            skipped += 1;
            warnings.push(`«${prodotto}»: quantità o prezzo non validi, riga scartata.`);
            continue;
          }

          const { isin, ticker } = extractCodeFromProduct(prodotto);
          const id = isin ?? ticker ?? prodotto;

          if (seenIds.has(id)) {
            skipped += 1;
            warnings.push(`«${prodotto}»: posizione ripetuta, riga duplicata scartata.`);
            continue;
          }
          seenIds.add(id);

          positions.push({
            id,
            isin,
            ticker,
            displayTicker: prodotto,
            name: prodotto,
            contract,
            section: 'gestito',
            quantity,
            averageCost,
            price: effectivePrice,
            marketValue,
            currency,
          });
          continue;
        }
      }

      // --- 3. ECONOMIA REALE ---
      if (sheetName.includes('ECONOMIA REALE') || norm0 === 'ECONOMIA REALE' || norm0 === 'PRIVATE DEBT' || norm0 === 'PRIVATE EQUITY') {
        if (norm0 === 'MACRO PRODOTTO' && normalized(text(row[1])) === 'PRODOTTO') {
          currentSection = 'economia-reale';
          continue;
        }
        if (currentSection === 'economia-reale') {
          if (norm0.startsWith('TOTALE') || col0 === '') continue;
          const prodotto = text(row[1]);
          if (!prodotto || norm0 === 'PRODOTTO') continue;

          const contract = text(row[2]) || undefined;
          const quantity = parseAzimutNumber(row[4]); // Versato avvalorato
          const marketValue = parseAzimutNumber(row[6]); // Controvalore (€)
          const price = quantity && quantity > 0 && marketValue !== undefined ? marketValue / quantity : (marketValue ?? 1);

          if (marketValue === undefined || marketValue <= 0) {
            skipped += 1;
            warnings.push(`«${prodotto}»: controvalore non valido, riga scartata.`);
            continue;
          }

          const effectiveQty = quantity && quantity > 0 ? quantity : 1;
          const { isin, ticker } = extractCodeFromProduct(prodotto);
          const id = isin ?? ticker ?? prodotto;

          if (seenIds.has(id)) {
            skipped += 1;
            warnings.push(`«${prodotto}»: posizione ripetuta, riga duplicata scartata.`);
            continue;
          }
          seenIds.add(id);

          positions.push({
            id,
            isin,
            ticker,
            displayTicker: prodotto,
            name: prodotto,
            contract,
            section: 'economia-reale',
            quantity: effectiveQty,
            price,
            marketValue,
            currency: 'EUR',
          });
          continue;
        }
      }

      // --- 4. AMMINISTRATO ---
      if (norm0 === 'OBBLIGAZIONI') {
        currentSection = 'obbligazioni';
        continue;
      }
      if (norm0 === 'AZIONI') {
        currentSection = 'azioni';
        continue;
      }
      if (norm0 === 'ETF E ALTRI STRUMENTI') {
        currentSection = 'etf';
        continue;
      }

      if (currentSection === 'obbligazioni' || currentSection === 'azioni' || currentSection === 'etf') {
        if (norm0.startsWith('TOTALE') || col0 === '' || norm0 === 'PRODOTTO') continue;
        const prodotto = col0;
        const contract = text(row[1]) || undefined;
        const quantity = parseAzimutNumber(row[2]);
        const currency = text(row[3]) || 'EUR';
        const price = parseAzimutNumber(row[4]);
        const marketValue = parseAzimutNumber(row[7]);

        const effectivePrice = price ?? (quantity && quantity > 0 && marketValue ? marketValue / quantity : undefined);

        if (!quantity || quantity <= 0 || !effectivePrice || effectivePrice < 0) {
          skipped += 1;
          warnings.push(`«${prodotto}»: quantità o prezzo non validi, riga scartata.`);
          continue;
        }

        const { isin, ticker } = extractCodeFromProduct(prodotto);
        const id = isin ?? ticker ?? prodotto;

        if (seenIds.has(id)) {
          skipped += 1;
          warnings.push(`«${prodotto}»: posizione ripetuta, riga duplicata scartata.`);
          continue;
        }
        seenIds.add(id);

        positions.push({
          id,
          isin,
          ticker,
          displayTicker: prodotto,
          name: prodotto,
          contract,
          section: currentSection,
          quantity,
          price: effectivePrice,
          marketValue,
          currency,
        });
      }
    }
  }

  if (positions.length === 0 && !cash) {
    throw new AzimutParseError(
      'Nessuna posizione o liquidità trovata: usa il file XLSX esportato dal portafoglio Azimut.'
    );
  }

  return {
    positions,
    cash,
    skipped,
    warnings,
  };
}

export interface MappedAzimutPosition {
  type: AssetType;
  assetClass: AssetClass;
  typeUncertain: boolean;
}

export function mapAzimutPositionType(position: AzimutPositionInput): MappedAzimutPosition {
  if (position.section === 'obbligazioni') {
    return { type: 'bond', assetClass: 'bonds', typeUncertain: false };
  }
  if (position.section === 'azioni') {
    return { type: 'stock', assetClass: 'equity', typeUncertain: false };
  }
  if (position.section === 'economia-reale') {
    const normName = normalized(position.name);
    if (normName.includes('DEBT') || normName.includes('BOND')) {
      return { type: 'etf', assetClass: 'bonds', typeUncertain: false };
    }
    return { type: 'etf', assetClass: 'equity', typeUncertain: false };
  }
  const { assetClass, uncertain } = inferFundClass(position.name);
  return { type: 'etf', assetClass, typeUncertain: uncertain };
}

function compositionForPosition(
  position: AzimutPositionInput,
  allocation: InstrumentFundAllocation | null | undefined,
  assetClass: AssetClass
): AssetComposition[] {
  if (position.section !== 'gestito' && position.section !== 'etf') return [];
  return compositionFromFundAllocation(allocation, assetClass);
}

function storedClassFor(assetClass: AssetClass, composition: AssetComposition[]): AssetClass {
  return composition.length > 0 ? composition[0].assetClass : assetClass;
}

export function mapAzimutPositionToAssetFormData(
  position: AzimutPositionInput,
  allocation?: InstrumentFundAllocation | null
): AssetFormData {
  const { type, assetClass } = mapAzimutPositionType(position);
  const composition = compositionForPosition(position, allocation, assetClass);
  const resolvedTicker = position.isin
    ? (resolveYahooSymbolForIsin(position.isin) ?? position.isin)
    : (position.ticker ?? position.name);

  return {
    ticker: resolvedTicker,
    displayTicker: position.displayTicker ?? position.name,
    name: position.name,
    type,
    assetClass: storedClassFor(assetClass, composition),
    currency: position.currency || 'EUR',
    quantity: position.quantity,
    ...(composition.length > 0 ? { composition } : {}),
    ...(position.averageCost !== undefined && position.averageCost > 0
      ? { averageCost: position.averageCost }
      : {}),
    taxRate: type === 'bond' ? 12.5 : 26,
    currentPrice: position.price,
    isLiquid: true,
    autoUpdatePrice: false,
    ...(position.isin ? { isin: position.isin } : {}),
    exchange: AZIMUT_BROKER_NAME,
    notes: `Import Azimut · ${sectionLabel(position.section)}`,
  };
}

export type AzimutDiffKind =
  | 'new'
  | 'price-update'
  | 'drift-only'
  | 'price-and-drift'
  | 'composition-update'
  | 'unchanged';

export interface AzimutHoldingDiff {
  kind: AzimutDiffKind;
  position: AzimutPositionInput;
  formData: AssetFormData;
  existingAssetId?: string;
  existingTaxRate?: number;
  existingDisplayTicker?: string | null;
  quantityDrift: number;
  typeUncertain: boolean;
  exchangeUpdate: boolean;
  compositionUpdate: boolean;
}

export interface AzimutCashPlan {
  balance: number;
  currency: 'EUR';
  accountLabel?: string;
  displayName: string;
  ticker: string;
  existingAssetId?: string;
}

export interface AzimutImportPlan {
  holdings: AzimutHoldingDiff[];
  cash: AzimutCashPlan | null;
  warnings: string[];
  stats: {
    holdingCount: number;
    newCount: number;
    priceUpdateCount: number;
    driftCount: number;
    compositionUpdateCount: number;
    unchangedCount: number;
    exchangeUpdateCount: number;
    skippedCount: number;
  };
}

const PRICE_EPS = 1e-9;
const QTY_EPS = 1e-6;

export function buildAzimutImportPlan(
  workbook: AzimutWorkbook,
  existingAssets: Pick<
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
  >[],
  allocations: Record<string, InstrumentFundAllocation> = {}
): AzimutImportPlan {
  const byIsin = new Map<string, (typeof existingAssets)[number]>();
  const byTickerOrName = new Map<string, (typeof existingAssets)[number]>();

  for (const asset of existingAssets) {
    const isin = asset.isin?.trim().toUpperCase();
    if (isin && !byIsin.has(isin)) byIsin.set(isin, asset);

    const tickerKey = asset.ticker?.trim().toUpperCase();
    if (tickerKey && !byTickerOrName.has(tickerKey)) byTickerOrName.set(tickerKey, asset);

    const nameKey = asset.name?.trim().toUpperCase();
    if (nameKey && !byTickerOrName.has(nameKey)) byTickerOrName.set(nameKey, asset);

    const displayKey = asset.displayTicker?.trim().toUpperCase();
    if (displayKey && !byTickerOrName.has(displayKey)) byTickerOrName.set(displayKey, asset);
  }

  const warnings = [...workbook.warnings];
  const holdings = workbook.positions.map((position) => {
    const allocation = position.isin ? allocations[position.isin] : undefined;
    const formData = mapAzimutPositionToAssetFormData(position, allocation);
    const composition = formData.composition ?? [];
    const hasComposition = composition.length > 0;
    const { typeUncertain } = mapAzimutPositionType(position);

    const existing = (position.isin ? byIsin.get(position.isin.toUpperCase()) : undefined)
      ?? byTickerOrName.get(formData.ticker.toUpperCase())
      ?? byTickerOrName.get(position.name.toUpperCase());

    if (!existing) {
      if (typeUncertain && !hasComposition) {
        warnings.push(
          `«${position.name}»: classe non deducibile dal nome, proposta azionaria — verifica su Patrimonio.`
        );
      }
      return {
        kind: 'new',
        position,
        formData,
        quantityDrift: 0,
        typeUncertain: typeUncertain && !hasComposition,
        exchangeUpdate: true,
        compositionUpdate: false,
      } satisfies AzimutHoldingDiff;
    }

    const priceMoved = Math.abs(existing.currentPrice - position.price) > PRICE_EPS;
    const drift = position.quantity - existing.quantity;
    const hasDrift = isLedgerAssetType(existing.type) && Math.abs(drift) > QTY_EPS;
    const exchangeUpdate = existing.exchange?.trim() !== AZIMUT_BROKER_NAME;
    const hasExistingComposition = (existing.composition?.length ?? 0) > 0;
    const compositionUpdate = !hasExistingComposition && hasComposition;

    const kind: AzimutDiffKind = priceMoved
      ? hasDrift
        ? 'price-and-drift'
        : 'price-update'
      : hasDrift
        ? 'drift-only'
        : compositionUpdate
          ? 'composition-update'
          : 'unchanged';

    if (hasDrift) {
      warnings.push(
        `«${existing.name}»: il file riporta ${position.quantity} quote contro ${existing.quantity} nel Registro — il prezzo si aggiorna, la quantità no.`
      );
    }

    return {
      kind,
      position,
      formData,
      existingAssetId: existing.id,
      existingTaxRate: existing.taxRate,
      existingDisplayTicker: existing.displayTicker,
      quantityDrift: hasDrift ? drift : 0,
      typeUncertain: typeUncertain && !hasExistingComposition && !compositionUpdate,
      exchangeUpdate,
      compositionUpdate,
    } satisfies AzimutHoldingDiff;
  });

  const existingCash = existingAssets.find(
    (asset) => asset.type === 'cash' && asset.assetClass === 'cash' && asset.ticker === AZIMUT_CASH_TICKER
  );

  return {
    holdings,
    cash: workbook.cash
      ? {
          balance: workbook.cash.balance,
          currency: 'EUR',
          accountLabel: workbook.cash.accountLabel,
          displayName: AZIMUT_CASH_ACCOUNT_NAME,
          ticker: AZIMUT_CASH_TICKER,
          existingAssetId: existingCash?.id,
        }
      : null,
    warnings,
    stats: {
      holdingCount: holdings.length,
      newCount: holdings.filter((diff) => diff.kind === 'new').length,
      priceUpdateCount: holdings.filter(
        (diff) => diff.kind === 'price-update' || diff.kind === 'price-and-drift'
      ).length,
      driftCount: holdings.filter(
        (diff) => diff.kind === 'drift-only' || diff.kind === 'price-and-drift'
      ).length,
      compositionUpdateCount: holdings.filter((diff) => diff.compositionUpdate).length,
      unchangedCount: holdings.filter((diff) => diff.kind === 'unchanged').length,
      exchangeUpdateCount: holdings.filter((diff) => diff.kind !== 'new' && diff.exchangeUpdate).length,
      skippedCount: workbook.skipped,
    },
  };
}
