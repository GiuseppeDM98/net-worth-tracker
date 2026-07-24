/**
 * Fondo pensione (Italian supplementary pension) — domain types.
 *
 * Scope note: the pension is tracked as a manually-valued asset (AssetType `pensionFund`, like
 * `realestate` — no price API), kept OUT of the allocation plans via `allocationRole: 'frozen'`, and
 * fed into FIRE as locked, illiquid capital. This file holds only the types the tax/deduction layer
 * needs; the pure calculation lives in `lib/utils/pensionDeduction.ts`.
 * Spec: docs/specs/2-pension-fund/01-data-model-and-rules.md §1.
 *
 * TAX RULE (why the "nature" distinction matters):
 * Contributions to a fondo pensione are IRPEF-deductible up to an annual ceiling, BUT only some
 * natures count. The employee's voluntary payments and the employer's contributions are deductible
 * and consume the ceiling; the TFR conferred to the fund is NOT deductible (it flows in tax-suspended
 * and is taxed separately at exit). So the deductible base = voluntary + employer, never TFR.
 */

/**
 * Origin of a single pension contribution. Only `voluntary` and `employer` are IRPEF-deductible and
 * count toward the annual ceiling; `tfr` is excluded from the deduction computation entirely.
 *
 * `ContributionSource` is the persisted field name (`PensionContribution.source`);
 * `PensionContributionNature` is the name the tax layer reads by. They are the same set of values —
 * kept as an alias so both the domain vocabulary and the calculation code read naturally.
 *
 * WARNING (checklist comment): adding a nature here requires updating, in lock-step:
 *   - DEDUCTIBLE_PENSION_NATURES + isDeductibleSource below (is the new nature deductible?)
 *   - the nature selector in components/pension/PensionContributionDialog.tsx (spec 04 §2)
 *   - the per-year/per-nature rollup in lib/utils/pensionContributions.ts (spec 03)
 */
export type PensionContributionNature = 'tfr' | 'voluntary' | 'employer';
export type ContributionSource = PensionContributionNature;

/** Natures that are IRPEF-deductible and consume the annual ceiling (TFR excluded by law). */
export const DEDUCTIBLE_PENSION_NATURES: readonly PensionContributionNature[] = ['voluntary', 'employer'];

/** True when a contribution source is IRPEF-deductible (voluntary or employer, never TFR). */
export function isDeductibleSource(source: ContributionSource): boolean {
  return DEDUCTIBLE_PENSION_NATURES.includes(source);
}

/**
 * A single dated contribution to a fondo pensione, stored in the dedicated `pensionContributions`
 * Firestore collection (spec 01 §3 — NOT as an `Expense`: contributions must never pollute the
 * cashflow savings-rate / budget metrics). Same event-per-asset shape as `dividends`.
 *
 * The value effect on the fund (a contribution raises the fund's value immediately) and the
 * voluntary-as-transfer wiring are layered on top of this record by the service (spec 03); this type
 * is just the persisted fact.
 */
export interface PensionContribution {
  id: string;
  userId: string;
  /** The fondo pensione asset (AssetType `pensionFund`) this contribution flowed into. */
  assetId: string;
  source: ContributionSource;
  /** Positive magnitude in EUR. */
  amount: number;
  date: Date;
  /** Tax year of competence (for the 730 / deduction estimate); usually the calendar year of `date`. */
  taxYear: number;
  /** Derived from `source` (voluntary/employer), persisted for direct per-year deductible queries. */
  deductible: boolean;
  notes?: string;
  /**
   * When the contribution is a VOLUNTARY payment tracked as a transfer from a cash account, the id
   * of the linked cashflow `transfer` entry. Absent for TFR/employer (which never transit the
   * user's account).
   */
  linkedExpenseId?: string;
  /** Origin cash account for a voluntary contribution — persisted so deletion can reverse the transfer. */
  sourceCashAssetId?: string;
  createdAt: Date;
}

/**
 * Optional block on `Asset`, populated only for fondo pensione assets (AssetType `pensionFund`).
 * Mirrors how `bondDetails` extends bond assets.
 *
 * The fund is NOT a new asset class (decision D2 in docs/specs/README.md) — its underlying
 * equity/bond mix lives in `Asset.composition`. These fields carry the pension-specific facts the
 * tax and FIRE layers need: enrollment dates (drive the benefit tax rate and the extra-deducibilità
 * window), the unlock date (FIRE locked capital), and caches derivable from the contributions
 * (source of truth = PensionContribution).
 */
export interface PensionFundDetails {
  /** Fund/PIP name, e.g. "Fondo X", "PIP Y". */
  provider: string;
  isin?: string;
  navFrequency?: 'monthly' | 'quarterly' | 'manual';
  /**
   * Dates are stored as ISO 'YYYY-MM-DD' strings (not Date/Timestamp): they match the HTML date
   * input and round-trip cleanly through Firestore without nested-Timestamp conversion.
   */
  /** Enrollment date in the complementary pension — drives the benefit tax rate (years enrolled). */
  enrollmentDate?: string;
  /**
   * Start of the FIRST employment relationship. Distinct from `enrollmentDate`: the 5-year accrual
   * window for the extra-deducibilità runs from participation, but eligibility itself depends on
   * this date being after 2007-01-01. Asked separately.
   */
  firstEmploymentDate?: string;
  /** Enables the plafond-recovery mechanism (spec 02 §2) — only for first employment after 2007-01-01. */
  isFirstEmploymentPost2007?: boolean;
  /** Date (ISO 'YYYY-MM-DD') from which the capital is accessible — per-fund, drives the FIRE lock-in. */
  unlockDate?: string;
  /** Benefit tax rate on the final payout, derived from years enrolled (15% → 9%); cached for FIRE. */
  currentBenefitTaxRate?: number;
  /** Cache of cumulative deducted contributions; source of truth = PensionContribution. */
  cumulativeDeductibleContributions?: number;
  /** Cache of cumulative non-deducted contributions (TFR + any excess over the ceiling). */
  cumulativeNonDeductibleContributions?: number;
  /** Cache of cumulative TFR conferred. */
  cumulativeTfr?: number;
}

/**
 * Inputs to the yearly deduction/plafond computation for a single target year (spec 02 §2).
 *
 * `deductibleContribByYear` is the per-year sum of DEDUCTIBLE contributions (voluntary + employer,
 * TFR already excluded upstream). It must span from `enrollmentYear` up to `targetYear` so the
 * multi-year "extra-deducibilità" fold can replay the plafond accrual and drawdown history.
 */
export interface PensionDeductionInput {
  /** Year the estimate is computed for. */
  targetYear: number;
  /** First calendar year of participation in the complementary pension (defines the 5/20-year windows). */
  enrollmentYear: number;
  /**
   * Eligibility for the "extra-deducibilità" recovery regime: reserved for workers whose FIRST
   * employment (mandatory pension contribution) began after 2007-01-01. The app cannot infer this,
   * so it is an explicit user-declared flag.
   */
  isFirstJobPost2007: boolean;
  /** year -> deductible contributions (voluntary + employer) paid that year, in EUR. */
  deductibleContribByYear: Record<number, number>;
}

/**
 * Result of the yearly deduction/plafond computation. All amounts in EUR.
 *
 * The three figures surfaced in the "Previdenza" annual recap map to:
 * - `deductedThisYear` → drives the tax-saving figure (benefit = tax(RAL) − tax(RAL − deducted)).
 * - `plafondCreatedThisYear` → "extra plafond built this year" (non-zero only in the first 5 years).
 * - `accruedPlafondResidual` → "recoverable plafond accumulated so far" (net of what's been used).
 */
export interface PensionDeductionState {
  /** Ordinary deduction ceiling for the target year (5.164,57 ≤2025, 5.300 ≥2026). */
  ordinaryCeiling: number;
  /** Deductible contributions (voluntary + employer) paid in the target year. */
  deductibleContributions: number;
  /** Extra plafond created in the target year = max(0, ceiling − contributions); 0 outside the 5-year accrual window. */
  plafondCreatedThisYear: number;
  /** Recoverable plafond still available (accrued minus already used); 0 once the usage window (year 25) has passed. */
  accruedPlafondResidual: number;
  /** Extra deduction headroom usable in the target year = min(residual entering the year, annual cap); 0 outside the usage window. */
  extraAvailableThisYear: number;
  /** Effective ceiling for the year = ordinaryCeiling + extraAvailableThisYear. */
  effectiveCeiling: number;
  /** Amount actually deductible this year = min(contributions, effectiveCeiling). */
  deductedThisYear: number;
  /** True when the target year falls in the first-5-years accrual window. */
  isAccrualYear: boolean;
  /** True when the target year falls in the 20-year usage window (years 6..25). */
  isUsageYear: boolean;
}
