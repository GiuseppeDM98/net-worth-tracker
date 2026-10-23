/**
 * Intesa Sanpaolo — the pure layer behind Impostazioni → Collegamenti → Intesa Sanpaolo.
 *
 * Intesa's online portfolio exports an `.xlsx` report (no public read-only API): one sheet with a
 * section per account, a table for funds/SICAVs, one for certificates/bonds, and a liquidity
 * section. This module turns those rows into positions, maps them onto `AssetFormData`, and builds
 * the preview plan. It performs NO I/O and knows nothing about React or Firestore, so the browser
 * can preview the exact rows that the save step will write.
 *
 * The layout is read by HEADERS, never by fixed row numbers: the report's blank rows and section
 * titles move as accounts are added, but every table repeats the same `Descrizione`/`ISIN` header.
 * A table whose quantity column is `Quantità` and whose cost column is `Prezzo medio fiscale` is a
 * bond/certificate table; the other one is a fund table.
 *
 * NUMBERS ARE ITALIAN: `1.234,56 €` is 1234.56 and `2.995` is 2995 — a dot is a thousands
 * separator, and a decimal part always carries the comma (this is also why `Data-Ora` values such
 * as `16.29.36` must never reach the numeric parser).
 */

import type { Asset, AssetClass, AssetFormData, AssetType } from '@/types/assets';
import type { InstrumentFundAllocation } from '@/types/exposure';
import { isLedgerAssetType } from '@/types/assetTransactions';
import { resolveYahooSymbolForIsin } from '@/lib/utils/yahooSymbolForIsin';
import { readFundComposition, resolveAllocationClass } from '@/lib/utils/fundComposition';
import { applyClassChoices, needsClassChoice } from '@/lib/utils/importClassChoice';

/** A row as `read-excel-file` returns it, so this module stays free of the library. */
export type IntesaCell = unknown;
export type IntesaRows = readonly (readonly IntesaCell[])[];

export type IntesaPositionSection = 'fund' | 'bond';

export interface IntesaPositionInput {
  isin: string;
  name: string;
  section: IntesaPositionSection;
  quantity: number;
  /** Unit cost from the report: «Valore quota di carico» or «Prezzo medio fiscale». */
  averageCost?: number;
  /** Unit market price: «Valore Ultima Quota» or «Prezzo Mercato». */
  price: number;
  /** «Controvalore €» — the report's own total for the row, used only by the preview. */
  marketValue?: number;
}

export interface IntesaCashInput {
  balance: number;
  currency: 'EUR';
  /** The account label printed in the report, e.g. «Conto 00000/...». */
  accountLabel?: string;
}

export interface IntesaWorkbook {
  positions: IntesaPositionInput[];
  cash: IntesaCashInput | null;
  skipped: number;
  warnings: string[];
}

/** User-facing parse failure: the message is shown verbatim in the tile. */
export class IntesaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntesaParseError';
  }
}

export const INTESA_BROKER_NAME = 'Intesa Sanpaolo';
export const INTESA_CASH_ACCOUNT_NAME = 'Intesa Sanpaolo — Liquidità';
/**
 * The stable identity of the Intesa cash account, matched by re-imports. Never match on the name:
 * the user may rename an account, and a second import must not create a duplicate.
 */
export const INTESA_CASH_TICKER = 'INTESA-EUR';

function text(cell: IntesaCell): string {
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
 * Parse an Italian-formatted number. Exported because this is the one rule every figure in the
 * report depends on, and a mistaken separator changes a fund's quantity by three orders of
 * magnitude.
 */
export function parseIntesaNumber(cell: IntesaCell): number | undefined {
  if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
  if (typeof cell !== 'string') return undefined;
  let value = cell.trim();
  if (value === '') return undefined;
  const negative = value.startsWith('-') || (value.startsWith('(') && value.endsWith(')'));
  value = value.replace(/[€%\s()]/g, '').replace(/^\+/, '');
  if (!/\d/.test(value)) return undefined;
  // A decimal part always carries the comma; every dot is therefore a thousands separator.
  // This is why `2.995` (the report's tax cost) becomes 2995 and not 2.995.
  value = value.includes(',')
    ? value.replace(/\./g, '').replace(',', '.')
    : value.replace(/\./g, '');
  value = value.replace(/[^0-9.-]/g, '');
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return undefined;
  return negative ? -Math.abs(parsed) : parsed;
}

function isIsin(value: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(value);
}

function isTableHeader(row: readonly IntesaCell[]): boolean {
  return normalized(text(row[0])) === 'DESCRIZIONE' && normalized(text(row[1])) === 'ISIN';
}

function isBondTable(row: readonly IntesaCell[]): boolean {
  return normalized(text(row[2])) === 'QUANTITA' && normalized(text(row[3])).includes('PREZZO MEDIO FISCALE');
}

/** The best available class from the fund's own name; the preview names every uncertain one. */
function inferFundClass(name: string): { assetClass: AssetClass; uncertain: boolean } {
  const n = normalized(name);
  if (/\b(BOND|OBBLIG|TESORERIA|CREDIT|MONETAR|LIQUID|SHORT TERM)\b/.test(n)) {
    return { assetClass: 'bonds', uncertain: false };
  }
  if (/\b(EQUITY|AZION|WORLD|EUROPEAN RESEARCH|US RESEARCH|EMERGING MARKETS)\b/.test(n)) {
    return { assetClass: 'equity', uncertain: false };
  }
  if (/\b(COMMODIT|GOLD|ORO)\b/.test(n)) return { assetClass: 'commodity', uncertain: false };
  if (/\b(REAL ESTATE|IMMOBIL)\b/.test(n)) return { assetClass: 'realestate', uncertain: false };
  // Multi-asset funds have no single class in this app; equity is the least wrong default and
  // the preview says the classification needs a check on Patrimonio.
  return { assetClass: 'equity', uncertain: true };
}

function sectionLabel(section: IntesaPositionSection): string {
  return section === 'bond' ? 'obbligazioni e certificati' : 'fondi e sicav';
}

/** Read the report's rows into positions, cash, and the warnings the preview must show. */
export function parseIntesaWorkbook(rows: IntesaRows): IntesaWorkbook {
  const positions: IntesaPositionInput[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  let inTable = false;
  let tableIsBond = false;
  let cash: IntesaCashInput | null = null;
  let accountLabel: string | undefined;

  for (const row of rows) {
    const first = text(row[0]);
    const second = text(row[1]);

    if (normalized(first) === 'LIQUIDITA') {
      inTable = false;
      continue;
    }

    if (isTableHeader(row)) {
      inTable = true;
      tableIsBond = isBondTable(row);
      continue;
    }

    // The liquidity section: «Saldo totale» sits in column J, with the amount in K. A label
    // beginning with «Conto » names the account but is not a position row.
    if (normalized(text(row[9])) === 'SALDO TOTALE') {
      const balance = parseIntesaNumber(row[10]);
      if (balance !== undefined) cash = { balance, currency: 'EUR' };
      continue;
    }
    if (/^CONTO\b/i.test(first)) {
      accountLabel = first;
      if (!cash) {
        const balance = parseIntesaNumber(row[10]);
        if (balance !== undefined) cash = { balance, currency: 'EUR' };
      }
      continue;
    }

    if (!inTable) continue;
    const isin = second.toUpperCase();
    if (!isIsin(isin)) continue;

    const quantity = parseIntesaNumber(row[2]);
    const averageCost = parseIntesaNumber(row[3]);
    const marketValue = parseIntesaNumber(row[10]);
    const printedPrice = parseIntesaNumber(row[4]);
    // A quote missing from the report can still be derived from its own value, but never the
    // other way round: a price invented from a zero quantity is not a reading.
    const price =
      printedPrice !== undefined && printedPrice > 0
        ? printedPrice
        : quantity !== undefined && quantity > 0 && marketValue !== undefined
          ? marketValue / quantity
          : undefined;
    const name = first === '' ? isin : first;

    if (quantity === undefined || quantity <= 0 || price === undefined || price < 0) {
      skipped += 1;
      warnings.push(`«${name}» (${isin}): quantità o prezzo non leggibili, riga scartata.`);
      continue;
    }
    if (seen.has(isin)) {
      skipped += 1;
      warnings.push(`«${name}» (${isin}): ISIN ripetuto, la seconda riga è stata scartata.`);
      continue;
    }
    seen.add(isin);

    positions.push({
      isin,
      name,
      section: tableIsBond ? 'bond' : 'fund',
      quantity,
      ...(averageCost !== undefined && averageCost >= 0 ? { averageCost } : {}),
      price,
      ...(marketValue !== undefined ? { marketValue } : {}),
    });

    // The report quotes bonds and certificates in EURO PER UNIT. A plain Borsa Italiana bond
    // has a nominal of 1 €, so the app's %-of-par editor reads the stored price correctly. A
    // certificate with a 1.000 € nominal (this report's «ISP BCP UNICREDIT 29», 1.014,9 € per
    // unit) still stores the right VALUE, but its editor shows the same price as a percentage
    // of a 1 € nominal. Say so instead of letting the form surprise the reader. The > 10 €
    // threshold catches a 100 € nominal too, while a genuine 1 € unit stays silent.
    if (tableIsBond && price > 10) {
      warnings.push(
        `«${name}» (${isin}): prezzo in euro per unità; nell'editor il prezzo segue la convenzione % del nominale.`
      );
    }
  }

  if (positions.length === 0 && !cash) {
    throw new IntesaParseError(
      'Nessuna posizione o liquidità trovata: usa il file XLSX esportato dal portafoglio Intesa Sanpaolo.'
    );
  }

  return {
    positions,
    cash: cash ? { ...cash, ...(accountLabel ? { accountLabel } : {}) } : null,
    skipped,
    warnings,
  };
}

export interface MappedIntesaPosition {
  type: AssetType;
  assetClass: AssetClass;
  /** True when a fund's name gave no class keyword and equity was proposed. */
  typeUncertain: boolean;
}

export function mapIntesaPositionType(position: IntesaPositionInput): MappedIntesaPosition {
  if (position.section === 'bond') {
    return { type: 'bond', assetClass: 'bonds', typeUncertain: false };
  }
  const { assetClass, uncertain } = inferFundClass(position.name);
  // A fund is an `etf` here: it is a market-priced collective instrument, and the app has no
  // distinct mutual-fund type. The class is what allocation reads.
  return { type: 'etf', assetClass, typeUncertain: uncertain };
}

/**
 * A fresh `AssetFormData` for an Intesa position. The report is the source, so Yahoo stays off.
 */
export function mapIntesaPositionToAssetFormData(
  position: IntesaPositionInput,
  allocation?: InstrumentFundAllocation | null,
): AssetFormData {
  const { type, assetClass } = mapIntesaPositionType(position);
  // Only a fund has a published mix; a bond's ISIN has no `topHoldings` to read. The reading is
  // the ONE rule Intesa, Azimut, Scalable and Trade Republic share (`readFundComposition`): the
  // composition legs, and the dominant leg as the asset's own class.
  const reading = readFundComposition(position.section === 'fund' ? allocation : undefined, assetClass);
  return {
    ticker: resolveYahooSymbolForIsin(position.isin) ?? position.isin,
    displayTicker: position.name,
    name: position.name,
    type,
    assetClass: reading.assetClass,
    currency: 'EUR',
    quantity: position.quantity,
    ...(reading.composition.length > 0 ? { composition: reading.composition } : {}),
    ...(position.averageCost !== undefined && position.averageCost > 0
      ? { averageCost: position.averageCost }
      : {}),
    taxRate: type === 'bond' ? 12.5 : 26,
    currentPrice: position.price,
    isLiquid: true,
    autoUpdatePrice: false,
    isin: position.isin,
    exchange: INTESA_BROKER_NAME,
    notes: `Import Intesa Sanpaolo · ${sectionLabel(position.section)}${
      position.section === 'bond' ? ' · prezzo in euro per unità' : ''
    }`,
  };
}

export type IntesaDiffKind =
  | 'new'
  | 'price-update'
  | 'drift-only'
  | 'price-and-drift'
  | 'composition-update'
  | 'unchanged';

export interface IntesaHoldingDiff {
  kind: IntesaDiffKind;
  position: IntesaPositionInput;
  /** Creation payload; for existing assets this is preview-only (unless a composition is filled). */
  formData: AssetFormData;
  existingAssetId?: string;
  /** Carried through the metadata write so a price update cannot wipe a cost-basis rate. */
  existingTaxRate?: number;
  /** Carried through the metadata write so a price update cannot wipe the user's alias. */
  existingDisplayTicker?: string | null;
  /** Report quantity minus tracked quantity — a number to reconcile, never an auto-write. */
  quantityDrift: number;
  /**
   * The row waits for a class FROM THE USER: the market did not decide it (no published mix) and
   * no tracked asset carries one. A row that UPDATES a tracked asset never waits — the class is
   * already stored there, and the import never overwrites it.
   */
  needsClassChoice: boolean;
  /** The key the class choice is filed under: the row's own ISIN in the plan. */
  classChoiceKey: string;
  /** The class stored on the tracked asset this row updates — `undefined` for a new position. */
  storedAssetClass?: AssetClass;
  /** The tracked asset is not labelled as this broker yet (or has another label). */
  exchangeUpdate: boolean;
  /**
   * The tracked asset had NO composition and this import read the fund's published mix: fill it.
   * A composition the user already typed is NEVER overwritten — not even with a fresher one.
   */
  compositionUpdate: boolean;
}

export interface IntesaCashPlan {
  balance: number;
  currency: 'EUR';
  accountLabel?: string;
  displayName: string;
  ticker: string;
  existingAssetId?: string;
}

export interface IntesaImportPlan {
  holdings: IntesaHoldingDiff[];
  cash: IntesaCashPlan | null;
  warnings: string[];
  stats: {
    holdingCount: number;
    newCount: number;
    priceUpdateCount: number;
    driftCount: number;
    /** Existing funds whose empty composition this import fills from the ISIN. */
    compositionUpdateCount: number;
    unchangedCount: number;
    exchangeUpdateCount: number;
    skippedCount: number;
  };
}

const PRICE_EPS = 1e-9;
const QTY_EPS = 1e-6;

/**
 * Diff the report against the tracked assets. Matched by ISIN. The quantity of a ledger type is
 * owned by the Registro: a mismatch is a warning to reconcile, never a write. The broker label is
 * the one metadata the import may repair on an existing asset, so «all assets under that broker»
 * stays true after the first import.
 *
 * `allocations` is Yahoo's published mix per ISIN, fetched by the caller (the tile) before the
 * plan is built. It is used twice: a NEW fund stores it as `composition`, and an EXISTING fund
 * with no composition gets it filled — so hybrid funds imported before this existed become
 * visible in «Composizione» on the next import without touching a split the user already typed.
 */
export function buildIntesaImportPlan(
  workbook: IntesaWorkbook,
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
): IntesaImportPlan {
  const byIsin = new Map<string, (typeof existingAssets)[number]>();
  for (const asset of existingAssets) {
    const isin = asset.isin?.trim().toUpperCase();
    if (isin && !byIsin.has(isin)) byIsin.set(isin, asset);
  }

  const warnings = [...workbook.warnings];
  const holdings = workbook.positions.map((position) => {
    const existing = byIsin.get(position.isin);
    const allocation = allocations[position.isin];
    const formData = mapIntesaPositionToAssetFormData(position, allocation);
    const composition = formData.composition ?? [];
    const hasComposition = composition.length > 0;
    const { typeUncertain, assetClass } = mapIntesaPositionType(position);
    // The market's answer: the published mix produced a composition, or it named the class of a
    // fund that is nearly all one class (`resolveAllocationClass`, the same rule the Azimut
    // bridge reads). Everything else is the name's guess — and a guess is not a class: the row
    // waits for the user, in the preview row.
    const marketDecided = hasComposition || resolveAllocationClass(allocation, assetClass)?.measured === true;
    const unresolvedClass = typeUncertain && !marketDecided;
    if (!existing) {
      return {
        kind: 'new',
        position,
        formData,
        quantityDrift: 0,
        needsClassChoice: needsClassChoice({ uncertain: unresolvedClass }),
        classChoiceKey: position.isin,
        exchangeUpdate: true,
        compositionUpdate: false,
      } satisfies IntesaHoldingDiff;
    }
    const priceMoved = Math.abs(existing.currentPrice - position.price) > PRICE_EPS;
    const drift = position.quantity - existing.quantity;
    const hasDrift = isLedgerAssetType(existing.type) && Math.abs(drift) > QTY_EPS;
    const exchangeUpdate = existing.exchange?.trim() !== INTESA_BROKER_NAME;
    const hasExistingComposition = (existing.composition?.length ?? 0) > 0;
    // Fill an EMPTY composition only: the user's own split is a statement, not a cache.
    const compositionUpdate = !hasExistingComposition && hasComposition;
    const kind: IntesaDiffKind = priceMoved
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
        `«${existing.name}»: il file riporta ${position.quantity} quote contro ${existing.quantity} nel Registro — il prezzo si aggiorna, la quantità no (riconcilia con una rettifica).`
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
      // import never overwrites it. So the second upload of the same file asks nothing.
      needsClassChoice: needsClassChoice({
        uncertain: unresolvedClass && !hasExistingComposition && !compositionUpdate,
        storedClass: existing.assetClass,
      }),
      classChoiceKey: position.isin,
      storedAssetClass: existing.assetClass,
      exchangeUpdate,
      compositionUpdate,
    } satisfies IntesaHoldingDiff;
  });

  const existingCash = existingAssets.find(
    (asset) => asset.type === 'cash' && asset.assetClass === 'cash' && asset.ticker === INTESA_CASH_TICKER
  );

  return {
    holdings,
    cash: workbook.cash
      ? {
          balance: workbook.cash.balance,
          currency: 'EUR',
          accountLabel: workbook.cash.accountLabel,
          displayName: INTESA_CASH_ACCOUNT_NAME,
          ticker: INTESA_CASH_TICKER,
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

/**
 * The plan as it is SAVED: the classes the user picked in the preview, on the rows that were
 * waiting for one. A row that was not waiting keeps the class the plan measured — the choices are
 * filed by the row's own id, so one can only land on the row it was made for.
 */
export function applyIntesaClassChoices(
  plan: IntesaImportPlan,
  choices: Record<string, AssetClass>
): IntesaImportPlan {
  return { ...plan, holdings: applyClassChoices(plan.holdings, choices) };
}
