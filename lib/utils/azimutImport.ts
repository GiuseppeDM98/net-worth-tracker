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

import type { Asset, AssetClass, AssetFormData, AssetType } from '@/types/assets';
import type { InstrumentFundAllocation } from '@/types/exposure';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { resolveYahooSymbolForIsin } from '@/lib/utils/yahooSymbolForIsin';
import { readFundComposition, resolveAllocationClass } from '@/lib/utils/fundComposition';
import { inferFundClassFromName } from '@/lib/utils/fundNameClass';
import { normalizeFundName, type FundIdentity } from '@/lib/utils/fundIdentity';
import type { FundIdentityResult } from '@/types/fundIdentity';

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

/** Only these two sections can carry a published fund mix and a composition. */
function usesFundMix(position: AzimutPositionInput): boolean {
  return position.section === 'gestito' || position.section === 'etf';
}

/**
 * The identity Yahoo may be asked with for a position: its ISIN, else the Bloomberg code the
 * file carries. A GESTITO row has NEITHER — its `ticker` field is the product name, which is an
 * identity for matching, not a symbol — so it answers `{}` and the row keeps the name-based guess.
 *
 * The tile (what to ask) and the plan (which answer belongs to which row) read this ONE rule.
 */
export function azimutAllocationLookup(position: AzimutPositionInput): { isin?: string; ticker?: string } {
  if (position.isin) return { isin: position.isin };
  if (!usesFundMix(position)) return {};

  const ticker = position.ticker?.trim() ?? '';
  if (ticker === '') return {};
  // The parser's fallback is the product name: never ask Yahoo about a sentence.
  if (ticker.toUpperCase() === position.name.trim().toUpperCase()) return {};
  if (/\s/.test(ticker)) return {};
  return { ticker };
}

/** The key a published allocation arrives under for this position, if it can have one. */
export function azimutAllocationKey(position: AzimutPositionInput): string | undefined {
  const { isin, ticker } = azimutAllocationLookup(position);
  return isin ?? ticker;
}

/**
 * A position whose fund the app must ASK about by name: the file gave neither an ISIN nor a real
 * ticker, and the row IS a fund (a published mix and an ISIN may exist for it). The tile reads
 * this to decide which names to search and the plan to decide which answer belongs to the row —
 * ONE rule, the same way `azimutAllocationLookup` is read twice.
 */
export function needsFundIdentity(position: AzimutPositionInput): boolean {
  return usesFundMix(position) && azimutAllocationKey(position) === undefined;
}

/**
 * The identity EODHD found for this position, if exactly one candidate agreed on every part of
 * its name (`lib/utils/fundIdentity.ts`). A row that already carries a code has nothing to ask;
 * an ambiguous or missing answer is no identity at all — never a pick.
 */
function resolvedIdentity(
  position: AzimutPositionInput,
  identities: Record<string, FundIdentityResult>
): FundIdentity | undefined {
  if (!needsFundIdentity(position)) return undefined;
  const answer = identities[normalizeFundName(position.name)];
  return answer?.status === 'matched' ? answer.identity : undefined;
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
  const { assetClass, uncertain } = inferFundClassFromName(position.name);
  return { type: 'etf', assetClass, typeUncertain: uncertain };
}

export function mapAzimutPositionToAssetFormData(
  position: AzimutPositionInput,
  allocation?: InstrumentFundAllocation | null,
  identity?: FundIdentity
): AssetFormData {
  const { type, assetClass } = mapAzimutPositionType(position);
  const mix = usesFundMix(position) ? allocation : undefined;
  // The ONE rule every bridge reads (`readFundComposition`): the composition legs, and the
  // dominant leg as the asset's own class. A fund that is nearly all ONE class has no composition
  // to store, but the mix still names its class (`GRID.MI` is 99,45% equity). `other` never
  // counts: it is not a class, it is the part Yahoo could not bucket — and when it is the biggest
  // bucket the name's guess stands.
  const reading = readFundComposition(mix, assetClass);
  // Three ways to know what the position is, in order: the code the file printed, the ISIN EODHD
  // found from the product name (a GESTITO row has nothing else), and — when neither exists — the
  // name itself, which is an identity for matching but not a symbol to quote.
  const isin = position.isin ?? identity?.isin;
  const resolvedTicker = isin
    ? (resolveYahooSymbolForIsin(isin) ?? isin)
    : (position.ticker ?? position.name);

  return {
    ticker: resolvedTicker,
    displayTicker: position.displayTicker ?? position.name,
    name: position.name,
    type,
    assetClass: reading.assetClass,
    currency: position.currency || 'EUR',
    quantity: position.quantity,
    ...(reading.composition.length > 0 ? { composition: reading.composition } : {}),
    ...(position.averageCost !== undefined && position.averageCost > 0
      ? { averageCost: position.averageCost }
      : {}),
    taxRate: type === 'bond' ? 12.5 : 26,
    currentPrice: position.price,
    isLiquid: true,
    autoUpdatePrice: false,
    ...(isin ? { isin } : {}),
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
  | 'identity-update'
  | 'unchanged';

export interface AzimutHoldingDiff {
  kind: AzimutDiffKind;
  position: AzimutPositionInput;
  formData: AssetFormData;
  existingAssetId?: string;
  existingTaxRate?: number;
  existingDisplayTicker?: string | null;
  quantityDrift: number;
  /**
   * A NEW row whose class is the name's default (`inferFundClassFromName`): no keyword, no published
   * mix, no identity. It is imported as such and the preview says so — the correction lives on
   * Patrimonio. A row that updates a tracked asset is never guessed: its class is stored there.
   */
  classGuessed: boolean;
  /** The class stored on the tracked asset this row updates — `undefined` for a new position. */
  storedAssetClass?: AssetClass;
  exchangeUpdate: boolean;
  compositionUpdate: boolean;
  /** The asset has no ISIN and the import found one: written, never replacing an existing one. */
  isinUpdate: boolean;
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
    isinUpdateCount: number;
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
  allocations: Record<string, InstrumentFundAllocation> = {},
  identities: Record<string, FundIdentityResult> = {}
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
    // The name lookup answers with the fund's ISIN when exactly one candidate agreed; that ISIN is
    // then both the identity to store and the key its published mix arrives under.
    const identity = resolvedIdentity(position, identities);
    const lookupKey = azimutAllocationKey(position) ?? identity?.isin;
    const allocation = lookupKey ? allocations[lookupKey] : undefined;
    const formData = mapAzimutPositionToAssetFormData(position, allocation, identity);
    const composition = formData.composition ?? [];
    const hasComposition = composition.length > 0;
    const { typeUncertain, assetClass } = mapAzimutPositionType(position);
    // A hybrid fund carries its split in `composition`; a nearly single-class one carries none,
    // and only the published mix may then confirm the class (`other` alone never does).
    const allocationClass = usesFundMix(position) ? resolveAllocationClass(allocation, assetClass) : null;
    const classMeasured = hasComposition || allocationClass?.measured === true;

    const existing = (position.isin ? byIsin.get(position.isin.toUpperCase()) : undefined)
      ?? (identity ? byIsin.get(identity.isin) : undefined)
      ?? byTickerOrName.get(formData.ticker.toUpperCase())
      ?? byTickerOrName.get(position.name.toUpperCase());
    // A composition the asset ALREADY carries decides its class too — the split is a fact of the
    // asset, whatever the market publishes today.
    const hasExistingComposition = (existing?.composition?.length ?? 0) > 0;
    // The market's answer: the published mix measured the class, the mix produced a composition,
    // or the tracked asset carries one. Everything else is the name's guess, written as is.
    const marketDecided = classMeasured || hasExistingComposition;

    if (!existing) {
      return {
        kind: 'new',
        position,
        formData,
        quantityDrift: 0,
        classGuessed: typeUncertain && !marketDecided,
        exchangeUpdate: true,
        compositionUpdate: false,
        isinUpdate: false,
      } satisfies AzimutHoldingDiff;
    }

    const priceMoved = Math.abs(existing.currentPrice - position.price) > PRICE_EPS;
    const drift = position.quantity - existing.quantity;
    const hasDrift = isLedgerAssetType(existing.type) && Math.abs(drift) > QTY_EPS;
    const exchangeUpdate = existing.exchange?.trim() !== AZIMUT_BROKER_NAME;
    const compositionUpdate = !hasExistingComposition && hasComposition;
    // An identity the import FOUND (never one it replaces): the asset was born with a product name
    // for a ticker, and the ISIN is what makes it recognisable and classifiable from now on.
    const isinUpdate = !existing.isin?.trim() && (formData.isin?.trim() ?? '') !== '';

    const kind: AzimutDiffKind = priceMoved
      ? hasDrift
        ? 'price-and-drift'
        : 'price-update'
      : hasDrift
        ? 'drift-only'
        : compositionUpdate
          ? 'composition-update'
          : isinUpdate
            ? 'identity-update'
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
      // The class of a tracked asset is ALREADY decided: it is the one stored there, and the
      // import never overwrites it.
      classGuessed: false,
      storedAssetClass: existing.assetClass,
      exchangeUpdate,
      compositionUpdate,
      isinUpdate,
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
      isinUpdateCount: holdings.filter((diff) => diff.isinUpdate).length,
      unchangedCount: holdings.filter((diff) => diff.kind === 'unchanged').length,
      exchangeUpdateCount: holdings.filter((diff) => diff.kind !== 'new' && diff.exchangeUpdate).length,
      skippedCount: workbook.skipped,
    },
  };
}
