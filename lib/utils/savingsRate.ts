/**
 * What can be said about «how much of the income was saved». A percentage of the income stops
 * being readable when the deficit is larger than the income itself (rate < −100%) or there is
 * no income at all: below that line the app speaks in euros (owner, 2026-11-12).
 *
 * The ONE door for a savings rate: every surface that prints one reads it here, never divides
 * `(income − spending) / income` on its own. The module has no imports on purpose — the server's
 * narrative modules (AI block, emails, PDF) read it beside the client's.
 */
export const SAVINGS_RATE_FLOOR = -100;

export type SavingsReading =
  | { kind: 'none' }
  | { kind: 'no-income'; spending: number }
  | { kind: 'deficit'; deficit: number; income: number; spending: number }
  | { kind: 'rate'; rate: number; savings: number; income: number; spending: number };

/** `income` and `spending` are magnitudes (≥ 0); a negative income counts as none. */
export function readSavings(income: number, spending: number): SavingsReading {
  const inflow = Math.max(income, 0);
  const outflow = Math.max(spending, 0);
  if (inflow === 0) return outflow === 0 ? { kind: 'none' } : { kind: 'no-income', spending: outflow };
  const savings = inflow - outflow;
  const rate = (savings / inflow) * 100;
  if (rate < SAVINGS_RATE_FLOOR) return { kind: 'deficit', deficit: -savings, income: inflow, spending: outflow };
  return { kind: 'rate', rate, savings, income: inflow, spending: outflow };
}

/** The rate when it can be printed as a percentage, else `null`. */
export function meaningfulSavingsRate(income: number, spending: number): number | null {
  const reading = readSavings(income, spending);
  return reading.kind === 'rate' ? reading.rate : null;
}

/** Σ savings / Σ income over the periods that are rates; `null` when none is. */
export function weightedSavingsRate(periods: readonly { income: number; spending: number }[]): number | null {
  let income = 0;
  let savings = 0;
  for (const period of periods) {
    const reading = readSavings(period.income, period.spending);
    if (reading.kind !== 'rate') continue;
    income += reading.income;
    savings += reading.savings;
  }
  return income > 0 ? (savings / income) * 100 : null;
}
