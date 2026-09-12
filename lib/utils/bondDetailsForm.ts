/**
 * Bond details from the asset form — the pure assembly step of `AssetDialog`'s «Dettagli Cedole»
 * block, kept out of the component so it can be tested against the real function rather than a
 * hand-kept copy (which is how a `!couponRate` guard silently dropped every zero-coupon bond's
 * details for months — issue #340).
 */

import type {
  AnnouncedInflationRate,
  BondDetails,
  BondInflationIndexation,
  CouponFrequency,
  CouponRateTier,
  IndexationCoefficientEntry,
} from '@/types/assets';
import { latestIndexationCoefficient, upsertIndexationCoefficient } from '@/lib/utils/couponUtils';

/** The form's «none» sentinel: a Radix Select item value can never be the empty string. */
export const NO_INFLATION_INDEXATION = 'none';

/** The bond fields of the asset form, as react-hook-form hands them over (empty number = NaN). */
export interface BondDetailsFormInput {
  bondCouponRate?: number;
  bondCouponFrequency?: CouponFrequency;
  bondIssueDate?: string;
  bondMaturityDate?: string;
  bondNominalValue?: number;
  bondCouponRateSchedule?: CouponRateTier[];
  bondFinalPremiumRate?: number;
  bondInflationIndexation?: BondInflationIndexation | typeof NO_INFLATION_INDEXATION;
  /** BTP€i: the coefficient the user reads today; stored as today's entry when it is news. */
  bondIndexationCoefficient?: number;
}

/**
 * What the form does not edit but must carry across a save: the announcements managed from the
 * Dividendi tab. Dropped when the bond leaves the mechanism they belong to.
 */
export interface ExistingBondAnnouncements {
  announcedInflationRates?: AnnouncedInflationRate[];
  indexationCoefficients?: IndexationCoefficientEntry[];
}

function isFilledNumber(value: number | undefined): value is number {
  return value !== undefined && !isNaN(value);
}

/**
 * Assembles a BondDetails object from validated form values.
 * Returns undefined when the bond details section is hidden or a required field is missing.
 *
 * A coupon rate of 0 is a zero-coupon bond, not a missing rate: the details (maturity, nominal,
 * indexation) are saved and `hasCouponPayments` keeps the scheduler from materialising a 0 €
 * coupon. Only an EMPTY field (undefined / NaN) blocks the assembly.
 *
 * @param today - The day a freshly typed indexation coefficient is dated (injected: no `new Date()` here)
 */
export function buildBondDetailsFromForm(
  data: BondDetailsFormInput,
  showBondDetails: boolean,
  showStepUp: boolean,
  existing: ExistingBondAnnouncements | undefined,
  today: Date
): BondDetails | undefined {
  if (
    !showBondDetails ||
    !isFilledNumber(data.bondCouponRate) ||
    !data.bondCouponFrequency ||
    !data.bondIssueDate ||
    !data.bondMaturityDate
  ) {
    return undefined;
  }

  const indexation: BondInflationIndexation | undefined =
    data.bondInflationIndexation && data.bondInflationIndexation !== NO_INFLATION_INDEXATION
      ? data.bondInflationIndexation
      : undefined;

  return {
    couponRate: data.bondCouponRate,
    couponFrequency: data.bondCouponFrequency,
    issueDate: new Date(data.bondIssueDate),
    maturityDate: new Date(data.bondMaturityDate),
    ...(isFilledNumber(data.bondNominalValue) && data.bondNominalValue > 0 ? { nominalValue: data.bondNominalValue } : {}),
    ...(showStepUp && data.bondCouponRateSchedule && data.bondCouponRateSchedule.length > 0
      ? { couponRateSchedule: data.bondCouponRateSchedule }
      : {}),
    ...(isFilledNumber(data.bondFinalPremiumRate) && data.bondFinalPremiumRate > 0
      ? { finalPremiumRate: data.bondFinalPremiumRate }
      : {}),
    ...(indexation ? { inflationIndexation: indexation } : {}),
    // Preserve the announcements of the mechanism the bond keeps — they are managed from the
    // Dividendi tab, not this form — and drop the other mechanism's, which no longer mean anything.
    ...(indexation === 'italia' && existing?.announcedInflationRates && existing.announcedInflationRates.length > 0
      ? { announcedInflationRates: existing.announcedInflationRates }
      : {}),
    ...(indexation === 'euro' ? buildIndexationCoefficients(existing?.indexationCoefficients, data.bondIndexationCoefficient, today) : {}),
  };
}

/**
 * The BTP€i's coefficient list after this save: the existing entries, plus today's when the form
 * carries a coefficient that differs from the latest one already known (re-saving the same figure
 * adds nothing).
 */
function buildIndexationCoefficients(
  existing: IndexationCoefficientEntry[] | undefined,
  typed: number | undefined,
  today: Date
): Pick<BondDetails, 'indexationCoefficients'> {
  const isNews =
    isFilledNumber(typed) && typed > 0 && latestIndexationCoefficient(existing, today) !== typed;
  const entries = isNews ? upsertIndexationCoefficient(existing, today, typed) : (existing ?? []);
  return entries.length > 0 ? { indexationCoefficients: entries } : {};
}
