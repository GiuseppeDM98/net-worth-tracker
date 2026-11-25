/** The currencies an instrument or an amount may be chosen in: the ones Frankfurter quotes that the app lists. */
export const INSTRUMENT_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'HKD', 'SGD', 'PLN'] as const;
export type InstrumentCurrency = (typeof INSTRUMENT_CURRENCIES)[number];

export function isListedCurrency(code: string): code is InstrumentCurrency {
  return (INSTRUMENT_CURRENCIES as readonly string[]).includes(code);
}

/** Pence are a unit of the pound, not a currency: the code becomes GBP and the amount is divided by 100. */
export function normalizeCurrencyAmount(currency: string, amount: number): { currency: string; amount: number } {
  if (currency === 'GBp' || currency === 'GBX') return { currency: 'GBP', amount: amount / 100 };
  return { currency: currency.toUpperCase(), amount };
}

/**
 * May an amount be recorded in `currency`? A listed one always; another only when it is the own
 * currency of the instrument it belongs to (owner, 2026-11-23).
 */
export function isCurrencyAllowed(currency: string, instrumentCurrency?: string): boolean {
  const code = normalizeCurrencyAmount(currency, 0).currency;
  if (isListedCurrency(code)) return true;
  return instrumentCurrency !== undefined && normalizeCurrencyAmount(instrumentCurrency, 0).currency === code;
}
