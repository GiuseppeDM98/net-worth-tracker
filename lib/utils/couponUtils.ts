/**
 * Coupon Utilities - Pure functions for bond coupon scheduling and calculation.
 *
 * Design Note:
 * These are pure functions with no side effects, making them easy to unit test.
 * The coupon schedule is derived entirely from the issueDate and frequency:
 * first coupon = issueDate + 1 period, then every period thereafter until maturity.
 *
 * Teacher Note - Coupon Schedule:
 * A bond issued on 14/05/2024 with quarterly frequency pays on:
 *   14/08/2024, 14/11/2024, 14/02/2025, 14/05/2025, ...
 * We advance the issueDate by N months (3 for quarterly) per period.
 */

import {
  AnnouncedInflationRate,
  BondDetails,
  BondInflationIndexation,
  CouponFrequency,
  CouponRateTier,
  IndexationCoefficientEntry,
} from '@/types/assets';

/**
 * Returns the number of coupon payments per year for the given frequency.
 */
export function getPeriodsPerYear(frequency: CouponFrequency): number {
  switch (frequency) {
    case 'monthly':    return 12;
    case 'quarterly':  return 4;
    case 'semiannual': return 2;
    case 'annual':     return 1;
  }
}

/**
 * Returns the number of months between coupon payments.
 */
function getMonthsPerPeriod(frequency: CouponFrequency): number {
  return 12 / getPeriodsPerYear(frequency);
}

/**
 * Advances a date by N months, preserving the day-of-month as much as possible.
 *
 * Why not add days? Month-based coupon schedules use calendar months (e.g. +3 months),
 * not fixed-day intervals (e.g. +91 days). This matches real-world bond conventions.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * Returns the first upcoming coupon date strictly after today.
 * Returns null if there are no future coupons before or on the maturity date.
 *
 * Algorithm:
 * 1. Start from issueDate + 1 period (first coupon date)
 * 2. Walk forward by frequency until the coupon date is in the future
 * 3. If the resulting date exceeds maturityDate, return null (bond has matured)
 *
 * @param issueDate - Bond issue date (coupon schedule anchor)
 * @param frequency - Payment frequency
 * @param maturityDate - Bond redemption date (inclusive: coupons ON maturity are valid)
 */
export function getNextCouponDate(
  issueDate: Date,
  frequency: CouponFrequency,
  maturityDate: Date
): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthsPerPeriod = getMonthsPerPeriod(frequency);

  // First coupon is issueDate + 1 period
  let couponDate = addMonths(issueDate, monthsPerPeriod);

  // Walk forward until we find a future coupon date
  while (couponDate <= today) {
    couponDate = addMonths(couponDate, monthsPerPeriod);
  }

  // Check if the next coupon is within the bond's life
  if (couponDate > maturityDate) {
    return null;
  }

  return couponDate;
}

/**
 * Returns the coupon date exactly one period after the given paid date.
 * Returns null if the resulting date exceeds the maturity date.
 *
 * Use this in Phase 3 of the cron job to advance the schedule from the
 * last PAID coupon, instead of recomputing from "today" (which has timezone
 * ambiguity when comparing UTC Firestore Timestamps with local midnight).
 *
 * Example: paid = 28/02/2026, quarterly → next = 28/05/2026
 *
 * @param paidDate    - The paymentDate of the coupon that was just paid
 * @param frequency   - Payment frequency
 * @param maturityDate - Bond redemption date
 */
export function getFollowingCouponDate(
  paidDate: Date,
  frequency: CouponFrequency,
  maturityDate: Date
): Date | null {
  const next = addMonths(paidDate, getMonthsPerPeriod(frequency));
  return next > maturityDate ? null : next;
}

/**
 * Returns the applicable annual coupon rate for a given payment date.
 *
 * For step-up bonds, finds the CouponRateTier whose [yearFrom, yearTo] range
 * contains the bond-year of the payment date. Bond-year is computed as:
 *   Math.ceil(elapsedMonths / 12)
 * where elapsedMonths = whole months from issueDate to paymentDate (minimum 1).
 *
 * Falls back to baseRate if no matching tier is found or schedule is empty.
 *
 * Example:
 *   issueDate=2026-03-01, paymentDate=2028-06-01 → ~27 months → year=3
 *   schedule=[{1,2,2.5},{3,4,2.8},{5,6,3.5}] → returns 2.8
 *
 * @param paymentDate - Date the coupon will be paid
 * @param issueDate   - Bond issue date (schedule anchor)
 * @param baseRate    - Fallback annual rate % (used when no schedule or no matching tier)
 * @param schedule    - Optional step-up tiers
 */
export function getApplicableCouponRate(
  paymentDate: Date,
  issueDate: Date,
  baseRate: number,
  schedule?: CouponRateTier[]
): number {
  if (!schedule || schedule.length === 0) return baseRate;

  // Calculate whole months elapsed from issueDate to paymentDate
  const elapsedMonths =
    (paymentDate.getFullYear() - issueDate.getFullYear()) * 12 +
    (paymentDate.getMonth() - issueDate.getMonth());

  // Bond-year: 1-based, minimum 1
  const bondYear = Math.max(1, Math.ceil(Math.max(1, elapsedMonths) / 12));

  const tier = schedule.find((t) => bondYear >= t.yearFrom && bondYear <= t.yearTo);
  return tier ? tier.rate : baseRate;
}

/**
 * Calculates the gross coupon amount per unit (per share) for a single payment period.
 *
 * Formula: (annualRate / 100 / periodsPerYear) * nominalValue
 *
 * Example: 4% annual, quarterly, nominalValue=1000
 *   → (4 / 100 / 4) * 1000 = €10.00 per unit per quarter
 *
 * @param couponRate - Annual coupon rate as percentage (e.g. 4.0 for 4%)
 * @param nominalValue - Face value per unit in currency (e.g. 1000 for a €1000 bond)
 * @param frequency - Payment frequency
 */
export function calculateCouponPerShare(
  couponRate: number,
  nominalValue: number,
  frequency: CouponFrequency
): number {
  return (couponRate / 100 / getPeriodsPerYear(frequency)) * nominalValue;
}

/**
 * Whether the bond pays coupons at all. A zero-coupon bond (BOT, CTZ, a zero-coupon BTP) has a
 * legitimate rate of 0 and no step-up tier above it: its details are still worth saving (maturity,
 * nominal, indexation), but nothing must be materialised as a dividend (issue #340).
 */
export function hasCouponPayments(bondDetails: Pick<BondDetails, 'couponRate' | 'couponRateSchedule'>): boolean {
  if (bondDetails.couponRate > 0) return true;
  return (bondDetails.couponRateSchedule ?? []).some((tier) => tier.rate > 0);
}

// ---------------------------------------------------------------------------
// Inflation-linked bonds
//
// Teacher Note — two mechanisms, one field (`inflationIndexation`):
//
// `italia` (BTP Italia): an ADDITIVE coupon — a guaranteed minimum fixed rate (annual,
// like a normal coupon) PLUS the national FOI inflation rate measured over the
// coupon period (e.g. the semester). The two are applied to the nominal capital
// (the capital is NOT revalued; the bond redeems at par). Official formula:
//   coupon_period = (fixedAnnualRate / periodsPerYear + max(0, inflationPeriodRate)) / 100 * nominal
// Crucially the inflation component is ALREADY per-period, so it is NOT divided
// by the frequency — only the fixed annual rate is. In deflation the inflation
// component is floored at 0 and the fixed rate stays guaranteed.
//
// `euro` (BTP€i): a MULTIPLICATIVE coupon — the real rate per period times the Eurostat HICP
// (ex tobacco) indexation coefficient at the payment date:
//   coupon_period = (realAnnualRate / periodsPerYear) / 100 * coefficient(paymentDate) * nominal
// The revaluation is never paid with the coupon: it accrues in the coefficient and is cashed at
// maturity (nominal × coefficient, floored at par). No minimum coupon, no loyalty premium. The MEF
// publishes the coefficient daily per bond; the user copies it (MEF table or contract note).
//
// In both cases the figure for a period is published shortly before the coupon is paid,
// so when the cron materializes the next coupon ~6 months ahead it is not yet known: that
// coupon is marked provisional — at the fixed floor for `italia`, at the latest known
// coefficient for `euro` (a better estimate than par) — until the user announces it.
// ---------------------------------------------------------------------------

/**
 * The ONE reader of a bond's inflation mechanism: the `inflationIndexation` field, with the legacy
 * `isInflationLinked` flag (written before 2026-09-11) read as `italia`.
 */
export function resolveInflationIndexation(
  bondDetails: Pick<BondDetails, 'inflationIndexation' | 'isInflationLinked'>
): BondInflationIndexation | null {
  if (bondDetails.inflationIndexation) return bondDetails.inflationIndexation;
  return bondDetails.isInflationLinked ? 'italia' : null;
}

/**
 * Returns the Italian adjective for a coupon frequency (for human-readable notes).
 */
export function couponFrequencyLabel(frequency: CouponFrequency): string {
  switch (frequency) {
    case 'monthly':    return 'mensile';
    case 'quarterly':  return 'trimestrale';
    case 'semiannual': return 'semestrale';
    case 'annual':     return 'annuale';
  }
}

/**
 * Coerces a date-like value to a Date.
 *
 * Why: announcedInflationRates[].couponDate is typed as Date, but raw Firestore
 * reads (the cron) deliver Firestore Timestamps. We accept both structurally
 * rather than importing firebase-admin into this pure module.
 */
function coerceDate(value: Date | { toDate: () => Date } | string | number): Date {
  if (value instanceof Date) return value;
  if (value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(value as string | number);
}

/**
 * Formats a rate for a coupon note: up to `decimals` decimals (2 by default), trailing zeros
 * trimmed, Italian decimal comma (e.g. 2.05 → "2,05", 1.5 → "1,5", 2 → "2").
 */
function formatRate(value: number, decimals = 2): string {
  const factor = 10 ** decimals;
  return (Math.round(value * factor) / factor).toString().replace('.', ',');
}

/** Same calendar day, in the local calendar the dates were built in. */
function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Same year and month — the drift-tolerant match a coupon date needs (see findAnnouncedInflationRate). */
function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Finds the indexation coefficient (BTP€i) for a coupon date: the entry of that very day first,
 * else the latest entry of the same year+month (a coupon and a refresh can share a month, and the
 * stored day may drift from the recomputed payment date, as with the FOI rates).
 *
 * @returns the coefficient, or null when nothing was announced for that period.
 */
export function findIndexationCoefficient(
  entries: IndexationCoefficientEntry[] | undefined,
  couponDate: Date
): number | null {
  if (!entries || entries.length === 0) return null;
  const withDates = entries.map((entry) => ({ date: coerceDate(entry.date), coefficient: entry.coefficient }));
  const exact = withDates.find((entry) => isSameDay(entry.date, couponDate));
  if (exact) return exact.coefficient;
  const sameMonth = withDates
    .filter((entry) => isSameMonth(entry.date, couponDate))
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  return sameMonth.length > 0 ? sameMonth[0].coefficient : null;
}

/**
 * The latest coefficient known at `asOf` (entry date ≤ asOf) — what the valuation and a
 * provisional coupon use. Null when nothing is known yet at that date.
 */
export function latestIndexationCoefficient(
  entries: IndexationCoefficientEntry[] | undefined,
  asOf: Date
): number | null {
  if (!entries || entries.length === 0) return null;
  const known = entries
    .map((entry) => ({ date: coerceDate(entry.date), coefficient: entry.coefficient }))
    .filter((entry) => entry.date.getTime() <= asOf.getTime())
    .sort((a, b) => b.date.getTime() - a.date.getTime());
  return known.length > 0 ? known[0].coefficient : null;
}

/**
 * Upserts a coefficient for a date, replacing any entry of the same calendar DAY (a coupon's
 * entry and a same-month refresh both survive). Returns a new array, sorted by date (pure).
 */
export function upsertIndexationCoefficient(
  entries: IndexationCoefficientEntry[] | undefined,
  date: Date,
  coefficient: number
): IndexationCoefficientEntry[] {
  const others = (entries ?? []).filter((entry) => !isSameDay(coerceDate(entry.date), date));
  return [...others, { date, coefficient }].sort(
    (a, b) => coerceDate(a.date).getTime() - coerceDate(b.date).getTime()
  );
}

/**
 * Finds the announced FOI inflation rate for a given coupon date.
 *
 * Match is by year+month: a bond's coupons are at least one month apart, so the
 * (year, month) pair uniquely identifies a coupon and is robust to day-of-month
 * drift between the stored couponDate and the recomputed payment date.
 *
 * @returns the announced per-period rate %, or null if not yet announced.
 */
export function findAnnouncedInflationRate(
  rates: AnnouncedInflationRate[] | undefined,
  couponDate: Date
): number | null {
  if (!rates || rates.length === 0) return null;
  const targetYear = couponDate.getFullYear();
  const targetMonth = couponDate.getMonth();
  for (const entry of rates) {
    const entryDate = coerceDate(entry.couponDate);
    if (entryDate.getFullYear() === targetYear && entryDate.getMonth() === targetMonth) {
      return entry.periodRate;
    }
  }
  return null;
}

/**
 * Upserts an announced inflation rate for a coupon date, replacing any existing
 * entry that shares the same year+month. Returns a new array (pure).
 *
 * Used when the user announces the FOI rate for the upcoming coupon: the new
 * entry is stored with a normalized Date couponDate so subsequent reads match.
 */
export function upsertAnnouncedInflationRate(
  rates: AnnouncedInflationRate[] | undefined,
  couponDate: Date,
  periodRate: number
): AnnouncedInflationRate[] {
  const targetYear = couponDate.getFullYear();
  const targetMonth = couponDate.getMonth();
  const others = (rates ?? []).filter((entry) => {
    const entryDate = coerceDate(entry.couponDate);
    return !(entryDate.getFullYear() === targetYear && entryDate.getMonth() === targetMonth);
  });
  return [...others, { couponDate, periodRate }];
}

/**
 * The resolved coupon for one payment, including its inflation provisional state.
 */
export interface ResolvedCoupon {
  perShare: number;                   // Gross coupon per unit: fixed (+ inflation / × coefficient when announced)
  fixedAnnualRate: number;            // Fixed (or real) annual rate applied (step-up tier or base)
  indexation: BondInflationIndexation | null; // The mechanism applied, null for a plain/step-up bond
  inflationPeriodRate: number | null; // `italia`: announced per-period inflation % (floored at 0), or null if not announced
  indexationCoefficient: number | null; // `euro`: the coefficient applied (the announced one, or the latest known when provisional)
  isProvisional: boolean;             // True when inflation-linked AND the period's figure is not yet announced
}

/**
 * Resolves the gross coupon per unit for a payment date, composing the existing
 * step-up logic with the inflation-linked component of the bond's mechanism.
 *
 * For a plain or step-up bond this is just calculateCouponPerShare at the
 * applicable rate. `italia` adds the announced per-period inflation (deflation-floored
 * at 0); when the rate is not yet announced the coupon is the fixed floor and
 * isProvisional is true. `euro` multiplies by the coefficient announced for the
 * payment date; when it is not yet known the coupon uses the latest known coefficient
 * (par when none) and isProvisional is true.
 *
 * @param paymentDate  - Date the coupon will be paid (already coerced to Date by the caller)
 * @param bondDetails  - The bond configuration (couponRate is the fixed/guaranteed minimum or the real rate)
 * @param nominalValue - Face value per unit (default 1 is the caller's responsibility)
 */
export function resolveCoupon(
  paymentDate: Date,
  bondDetails: BondDetails,
  nominalValue: number
): ResolvedCoupon {
  const issueDate = coerceDate(bondDetails.issueDate);
  const fixedAnnualRate = getApplicableCouponRate(
    paymentDate,
    issueDate,
    bondDetails.couponRate,
    bondDetails.couponRateSchedule
  );
  const fixedPerShare = calculateCouponPerShare(fixedAnnualRate, nominalValue, bondDetails.couponFrequency);
  const indexation = resolveInflationIndexation(bondDetails);
  const base = { fixedAnnualRate, indexation, inflationPeriodRate: null, indexationCoefficient: null };

  // Plain / step-up bond: no inflation component.
  if (indexation === null) {
    return { ...base, perShare: fixedPerShare, isProvisional: false };
  }

  if (indexation === 'euro') {
    const announced = findIndexationCoefficient(bondDetails.indexationCoefficients, paymentDate);
    // Provisional: the coefficient at the payment date is not known yet — the latest known one
    // is a closer estimate than par, and the note says which it is.
    const coefficient = announced ?? latestIndexationCoefficient(bondDetails.indexationCoefficients, paymentDate) ?? 1;
    return {
      ...base,
      perShare: fixedPerShare * coefficient,
      indexationCoefficient: coefficient,
      isProvisional: announced === null,
    };
  }

  const announced = findAnnouncedInflationRate(bondDetails.announcedInflationRates, paymentDate);
  if (announced === null) {
    // Provisional: the FOI inflation for this period has not been announced yet.
    return { ...base, perShare: fixedPerShare, isProvisional: true };
  }

  // Deflation guarantee: a negative announced rate contributes 0; the fixed rate stays guaranteed.
  const flooredInflation = Math.max(0, announced);
  const inflationPerShare = (flooredInflation / 100) * nominalValue;
  return {
    ...base,
    perShare: fixedPerShare + inflationPerShare,
    inflationPeriodRate: flooredInflation,
    isProvisional: false,
  };
}

/**
 * Builds the human-readable Italian note stored on a coupon dividend.
 *
 * - plain/step-up:      "Cedola semestrale — tasso annuo 2,8%"
 * - italia final:       "Cedola semestrale — fisso 0,75% + inflazione FOI 1,3% = 2,05% del nominale"
 * - italia provisional: "Cedola provvisoria semestrale — solo tasso fisso 0,75% (in attesa del tasso d'inflazione FOI del periodo)"
 * - euro final:         "Cedola semestrale — tasso reale 0,2% × coefficiente di indicizzazione 1,25 = 0,25% del nominale"
 * - euro provisional:   "Cedola provvisoria semestrale — tasso reale 0,2% all'ultimo coefficiente noto 1,2 (in attesa del coefficiente di indicizzazione alla data di stacco)"
 */
export function buildCouponNote(resolved: ResolvedCoupon, frequency: CouponFrequency): string {
  const freqLabel = couponFrequencyLabel(frequency);

  // Non-inflation-linked: keep the historical annual-rate phrasing.
  if (resolved.indexation === null) {
    return `Cedola ${freqLabel} — tasso annuo ${formatRate(resolved.fixedAnnualRate)}%`;
  }

  const fixedPerPeriod = resolved.fixedAnnualRate / getPeriodsPerYear(frequency);

  if (resolved.indexation === 'euro') {
    const coefficient = resolved.indexationCoefficient ?? 1;
    if (resolved.isProvisional) {
      const basis = coefficient === 1
        ? 'al coefficiente 1 (nessun coefficiente inserito)'
        : `all'ultimo coefficiente noto ${formatRate(coefficient, 5)}`;
      return `Cedola provvisoria ${freqLabel} — tasso reale ${formatRate(fixedPerPeriod, 4)}% ${basis} (in attesa del coefficiente di indicizzazione alla data di stacco)`;
    }
    return `Cedola ${freqLabel} — tasso reale ${formatRate(fixedPerPeriod, 4)}% × coefficiente di indicizzazione ${formatRate(coefficient, 5)} = ${formatRate(fixedPerPeriod * coefficient, 4)}% del nominale`;
  }

  if (resolved.isProvisional) {
    return `Cedola provvisoria ${freqLabel} — solo tasso fisso ${formatRate(fixedPerPeriod)}% (in attesa del tasso d'inflazione FOI del periodo)`;
  }

  const inflation = resolved.inflationPeriodRate ?? 0;
  const total = fixedPerPeriod + inflation;
  return `Cedola ${freqLabel} — fisso ${formatRate(fixedPerPeriod)}% + inflazione FOI ${formatRate(inflation)}% = ${formatRate(total)}% del nominale`;
}
