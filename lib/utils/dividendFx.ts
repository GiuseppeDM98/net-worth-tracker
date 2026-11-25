/**
 * The taxes and the euro side of a dividend paid in a foreign currency.
 *
 * Such a dividend is withheld twice — abroad on the gross, in Italy on what crosses the border — and is
 * credited in euro at the rate of the day it is paid. Until 2026-11-23 the record had one withholding and
 * the rate of the moment it was saved.
 */
import { roundToCents } from '@/lib/utils/cents';
import { STATEMENT_RATE_TOLERANCE, TradeFxError, describeTotalOff, type EcbRate, type TradeFxSource } from '@/lib/utils/tradeFx';

export const US_TREATY_RATE = 15;

export interface DividendTaxes {
  foreignTaxAmount: number;
  italianTaxAmount: number;
  /** Foreign + Italian: what `Dividend.taxAmount` stores. */
  taxAmount: number;
  netAmount: number;
}

/** The Italian tax is due on the «netto frontiera»: the gross less the foreign withholding. */
export function computeDividendTaxes(grossAmount: number, foreignTaxRate: number, italianTaxRate: number): DividendTaxes {
  const foreignTaxAmount = (grossAmount * foreignTaxRate) / 100;
  const italianTaxAmount = ((grossAmount - foreignTaxAmount) * italianTaxRate) / 100;
  const taxAmount = foreignTaxAmount + italianTaxAmount;
  return { foreignTaxAmount, italianTaxAmount, taxAmount, netAmount: grossAmount - taxAmount };
}

/**
 * Two withholdings when the issuer is not Italian, whatever the currency (owner, 2026-11-23): by the
 * ISIN's country, and for an instrument with no ISIN by a currency that is not the euro.
 */
export function hasForeignWithholding(isin: string | undefined, currency: string): boolean {
  const code = isin?.trim().toUpperCase() ?? '';
  if (code.length >= 2) return !code.startsWith('IT');
  return currency.toUpperCase() !== 'EUR';
}

/**
 * The foreign rate a new record proposes: the instrument's last one, else the US treaty rate for a
 * share (a bond's interest is not withheld in the US), else none.
 */
export function proposeForeignTaxRate(
  isin: string | undefined,
  assetClass: string | undefined,
  lastForeignRate: number | undefined,
): number {
  if (lastForeignRate !== undefined) return lastForeignRate;
  return assetClass === 'equity' && isin?.trim().toUpperCase().startsWith('US') ? US_TREATY_RATE : 0;
}

/** The foreign rate a stored record implies, undefined when it has no foreign part. */
export function foreignRateOf(record: { grossAmount: number; foreignTaxAmount?: number }): number | undefined {
  if (record.foreignTaxAmount === undefined || !(record.grossAmount > 0)) return undefined;
  return (record.foreignTaxAmount / record.grossAmount) * 100;
}

export interface DividendFxInput {
  grossAmount: number;
  netAmount: number;
  foreignTaxAmount: number;
  settledNetEur?: number;
  ecb: EcbRate | null;
}

export interface DividendFxResolution {
  grossAmountEur: number;
  taxAmountEur: number;
  netAmountEur: number;
  foreignTaxAmountEur: number;
  exchangeRate: number;
  fxSource: TradeFxSource;
}

export function resolveDividendFx(input: DividendFxInput): DividendFxResolution {
  let exchangeRate: number;
  let fxSource: TradeFxSource;
  let netAmountEur: number;
  if (input.settledNetEur !== undefined) {
    if (!(input.netAmount > 0)) throw new TradeFxError('nothing-to-convert');
    exchangeRate = input.settledNetEur / input.netAmount;
    if (input.ecb && Math.abs(exchangeRate / input.ecb.rate - 1) > STATEMENT_RATE_TOLERANCE) {
      throw new TradeFxError('total-off', input.ecb.rate);
    }
    fxSource = 'statement';
    netAmountEur = input.settledNetEur;
  } else {
    if (!input.ecb) throw new TradeFxError('no-rate');
    exchangeRate = input.ecb.rate;
    fxSource = input.ecb.isLatest ? 'ecb-latest' : 'ecb';
    netAmountEur = roundToCents(input.netAmount * exchangeRate);
  }
  const grossAmountEur = roundToCents(input.grossAmount * exchangeRate);
  return {
    grossAmountEur,
    // The difference, so gross − tax = net in euro too.
    taxAmountEur: roundToCents(grossAmountEur - netAmountEur),
    netAmountEur,
    foreignTaxAmountEur: roundToCents(input.foreignTaxAmount * exchangeRate),
    exchangeRate,
    fxSource,
  };
}

/**
 * The sentence of the 422 the dividend routes answer to a refused credit, or null when the error is
 * not one (the routes let it reach their 500). `no-rate` never gets here: the service saves without
 * the euro fields instead.
 */
export function describeDividendFxRefusal(error: unknown, currency: string): string | null {
  if (!(error instanceof TradeFxError)) return null;
  if (error.code === 'total-off' && error.ecbRate !== undefined) return describeTotalOff(currency, error.ecbRate);
  if (error.code === 'nothing-to-convert') return 'Il netto accreditato in euro richiede un netto maggiore di zero.';
  return null;
}
