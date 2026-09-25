/**
 * Which cash account a dividend or coupon credits — the ONE rule, shared by the daily cron, the
 * scrape route and the manual entry through `dividendIncomeService`.
 *
 * The account is chosen per INSTRUMENT (`Asset.dividendCashAssetId`, set in the asset form: two
 * brokers pay into two accounts) and falls back to the default in Impostazioni › Dividendi
 * (`dividendCashAssetId`); with neither, the income row is written with no account, as before.
 *
 * Only a payment that is NOT in the past when its income row is created credits the account
 * (owner, 2026-09-20). The scrape and the coupon catch-up bring in up to 370 days of history, and
 * the balance the owner keeps aligned to the bank already holds those payments: crediting them
 * would count them twice. So arrears get their row and move nothing; the price is that a coupon
 * recovered the day after a missed cron is not credited either — the owner adjusts the balance.
 *
 * SDK-free; «today» is a parameter.
 */

import { roundToCents } from '@/lib/utils/cents';
import { getItalyDateIso } from '@/lib/utils/dateHelpers';
import type { AssetType } from '@/types/assets';

export interface DividendAccountInput {
  /** The instrument's own account (`Asset.dividendCashAssetId`). */
  assetAccountId: string | undefined | null;
  /** The default from the settings (`dividendCashAssetId`). */
  defaultAccountId: string | undefined | null;
  paymentDate: Date;
  now: Date;
}

/** True when the payment's Italian calendar day is today or later. */
export function isPaymentDueOrAhead(paymentDate: Date, now: Date): boolean {
  return getItalyDateIso(paymentDate) >= getItalyDateIso(now);
}

/** The account to credit, or `undefined` when none is configured or the payment is an arrear. */
export function resolveDividendAccount(input: DividendAccountInput): string | undefined {
  const accountId = input.assetAccountId || input.defaultAccountId || undefined;
  if (!accountId) return undefined;
  return isPaymentDueOrAhead(input.paymentDate, input.now) ? accountId : undefined;
}

/** The sentinel of the asset form's picker: Radix reserves the empty string. */
export const NO_DIVIDEND_ACCOUNT = '__none__';

/** The instrument types that pay a dividend or a coupon — the only ones asked for an account. */
export function paysDividends(type: AssetType): boolean {
  return type === 'stock' || type === 'etf' || type === 'bond';
}

/**
 * What the asset form stores from its picker: the chosen account, or `undefined` — which the
 * write paths turn into a field delete — for the sentinel and for a type that pays nothing (an
 * instrument re-typed to real estate must not keep crediting an account nobody can see).
 */
export function dividendAccountFromForm(type: AssetType, pickerValue: string | undefined): string | undefined {
  if (!paysDividends(type) || !pickerValue || pickerValue === NO_DIVIDEND_ACCOUNT) return undefined;
  return pickerValue;
}

export interface DividendIncomeAmount {
  /** What the income row carries and the account receives: to the cent. */
  amount: number;
  currency: string;
  /** True when the EUR conversion stands in for a foreign-currency net. */
  isConvertedToEur: boolean;
}

/**
 * The amount of a dividend's income row: the EUR conversion when the dividend is foreign and has
 * one, the native net otherwise — rounded to the cent (lib/utils/cents.ts), because the row is
 * what moves the account and a bank credits cents. The dividend record keeps its exact net.
 */
export function dividendIncomeAmount(dividend: {
  currency: string;
  netAmount: number;
  netAmountEur?: number;
}): DividendIncomeAmount {
  const isConvertedToEur = dividend.currency.toUpperCase() !== 'EUR' && dividend.netAmountEur !== undefined;
  return {
    amount: roundToCents(isConvertedToEur ? dividend.netAmountEur! : dividend.netAmount),
    currency: isConvertedToEur ? 'EUR' : dividend.currency,
    isConvertedToEur,
  };
}
