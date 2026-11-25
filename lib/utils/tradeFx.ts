/**
 * The euro side of a trade in a foreign currency.
 *
 * The owner types what the broker shows: price and fee in the instrument's currency and, when the
 * statement is in hand, the euro total that left (or reached) the account. From that total comes the
 * rate — the broker's, spread included — and the euro price is what is left once the fee is taken out,
 * so quantity × price ± fee IS the statement's total, to the cent. Without it the ECB rate of the
 * trade's day converts both. Either way the rate and its source stay on the trade (2026-11-23: until
 * then the rate was never stored and a missing fixing fell back to today's in silence).
 */
import { roundToCents } from '@/lib/utils/cents';
import { formatItalianDate } from '@/lib/utils/dateHelpers';

export type TradeFxSource = 'statement' | 'ecb' | 'ecb-latest';

export interface EcbRate {
  /** Euro per one unit of the currency. */
  rate: number;
  /** True when the day's fixing was not available and the latest one answered. */
  isLatest: boolean;
}

export interface TradeFxInput {
  type: 'buy' | 'sell';
  quantity: number;
  pricePerUnit: number;
  /** The fee in the instrument's currency; 0 when there is none. */
  feesNative: number;
  /** A fee already in euro — a trade saved before 2026-11-23. Never together with a native one. */
  legacyFeesEur?: number;
  settledTotalEur?: number;
  ecb: EcbRate | null;
}

export interface TradeFxResolution {
  priceEur: number;
  feesEur: number;
  fxRate: number;
  fxSource: TradeFxSource;
}

/** How far from the day's ECB rate a statement's implied rate may be before it reads as a typo. */
export const STATEMENT_RATE_TOLERANCE = 0.25;

export type TradeFxErrorCode = 'no-rate' | 'total-off' | 'nothing-to-convert';

export class TradeFxError extends Error {
  constructor(public readonly code: TradeFxErrorCode, public readonly ecbRate?: number) {
    super(code);
    Object.setPrototypeOf(this, TradeFxError.prototype);
  }
}

/** What the trade is worth in the instrument's currency: a buy pays the fee on top, a sale loses it. */
export function nativeTotal(input: Pick<TradeFxInput, 'type' | 'quantity' | 'pricePerUnit' | 'feesNative'>): number {
  const gross = input.quantity * input.pricePerUnit;
  return input.type === 'buy' ? gross + input.feesNative : gross - input.feesNative;
}

export function resolveTradeFx(input: TradeFxInput): TradeFxResolution {
  const legacyFee = input.legacyFeesEur ?? 0;
  if (input.settledTotalEur === undefined) {
    if (!input.ecb) throw new TradeFxError('no-rate');
    return {
      priceEur: input.pricePerUnit * input.ecb.rate,
      feesEur: legacyFee > 0 ? legacyFee : roundToCents(input.feesNative * input.ecb.rate),
      fxRate: input.ecb.rate,
      fxSource: input.ecb.isLatest ? 'ecb-latest' : 'ecb',
    };
  }
  if (input.quantity <= 0 || input.pricePerUnit <= 0) throw new TradeFxError('nothing-to-convert');
  // A euro fee is inside the statement's total (2026-11-23): what is left is what the titles moved.
  const convertedEur = input.type === 'buy' ? input.settledTotalEur - legacyFee : input.settledTotalEur + legacyFee;
  const native = nativeTotal(input);
  if (native <= 0 || convertedEur <= 0) throw new TradeFxError('nothing-to-convert');
  const fxRate = convertedEur / native;
  if (input.ecb && Math.abs(fxRate / input.ecb.rate - 1) > STATEMENT_RATE_TOLERANCE) {
    throw new TradeFxError('total-off', input.ecb.rate);
  }
  const feesEur = legacyFee > 0 ? legacyFee : roundToCents(input.feesNative * fxRate);
  // Buy: quantity × priceEur + fees = total. Sale: quantity × priceEur − fees = total.
  const titlesEur = input.type === 'buy' ? input.settledTotalEur - feesEur : input.settledTotalEur + feesEur;
  return { priceEur: titlesEur / input.quantity, feesEur, fxRate, fxSource: 'statement' };
}

/** «EUR/USD 1,0961»: the pair as it is quoted, the inverse of the stored euro-per-unit rate. */
export function formatFxPair(currency: string, fxRate: number): string {
  const code = currency === 'GBp' ? 'GBP' : currency.toUpperCase();
  const quoted = (1 / fxRate).toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `EUR/${code} ${quoted}`;
}

/** The line under a foreign trade in Movimenti. */
export function describeTradeFx(currency: string, fxRate: number, fxSource: TradeFxSource, tradeDate: Date): string {
  const pair = formatFxPair(currency, fxRate);
  if (fxSource === 'statement') return `${pair} · dal totale dell'estratto`;
  if (fxSource === 'ecb') return `${pair} · BCE del ${formatItalianDate(tradeDate)}`;
  return `${pair} · BCE più recente: quello del giorno non era disponibile`;
}

/** The refusal of a euro total that does not agree with the day's rate. */
export function describeTotalOff(currency: string, ecbRate: number): string {
  return `Il totale in euro non torna con il cambio del giorno (${formatFxPair(currency, ecbRate)}): controlla la cifra.`;
}
