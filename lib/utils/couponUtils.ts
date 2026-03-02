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

import { CouponFrequency, CouponRateTier } from '@/types/assets';

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
