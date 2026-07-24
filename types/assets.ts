import type { PensionFundDetails } from './pension';

// AssetType: Granular classification used in UI (stock, ETF, bond, crypto, etc.)
// AssetClass: Broad financial categories for allocation analysis (equity, bonds, etc.)
//
// Mapping examples:
// - stock -> equity
// - etf -> equity (usually) OR bonds (for bond ETFs) - determined by assetClass field
// - bond -> bonds
// - crypto -> crypto
// - cash -> cash
// - realestate -> realestate
// - pensionFund -> equity (fallback only; the real mix lives in `composition`) - see TYPE_TO_CLASS
//
// WARNING: adding a type here requires updating TYPE_TO_CLASS in components/assets/AssetDialog.tsx
// (exhaustive `Record<AssetType, AssetClass>` — tsc catches this one) and deciding whether the type
// belongs in LEDGER_ASSET_TYPES (types/assetTransactions.ts — tsc does NOT catch that one).
export type AssetType = 'stock' | 'etf' | 'bond' | 'crypto' | 'commodity' | 'cash' | 'realestate' | 'pensionFund';
// trendFollowing (managed futures) and carry are exposure-only classes reached via a leveraged/
// composite `etf`'s `composition` legs (spec 3-leveraged-etf-allocation/01-data-model.md §2) — no
// AssetType maps to them directly in TYPE_TO_CLASS.
export type AssetClass = 'equity' | 'bonds' | 'crypto' | 'realestate' | 'cash' | 'commodity'
                        | 'trendFollowing' | 'carry';

// Coupon payment frequency for bonds.
// Determines how many times per year the coupon is paid.
export type CouponFrequency = 'monthly' | 'quarterly' | 'semiannual' | 'annual';

// One tier of a step-up coupon schedule.
// yearFrom/yearTo are 1-based years from issueDate (inclusive).
// Example: BTP Valore → [{ yearFrom:1, yearTo:2, rate:2.50 }, { yearFrom:3, yearTo:4, rate:2.80 }, ...]
export interface CouponRateTier {
  yearFrom: number; // Inclusive, 1-based (year 1 = first full year after issue)
  yearTo: number;   // Inclusive
  rate: number;     // Annual coupon rate % for this period
}

// One announced inflation component for an inflation-linked bond (BTP Italia Sì style).
// The user enters the FOI inflation rate for a specific coupon period when it is published
// (shortly before that coupon is paid). It is matched to a coupon by the year+month of couponDate.
// periodRate is the inflation rate FOR THAT PERIOD (e.g. the semester) — it is already per-period
// and is NOT divided by the coupon frequency (see resolveCoupon in couponUtils.ts).
export interface AnnouncedInflationRate {
  couponDate: Date;   // Payment date of the coupon this rate applies to
  periodRate: number; // FOI inflation % for that period (negative values are floored to 0 — deflation guarantee)
}

// Bond-specific details stored alongside the asset.
// Used to auto-generate the next coupon as a dividend entry.
//
// Teacher Note - Coupon Calculation:
// Plain/step-up bond: gross per payment = (couponRate / 100 / periodsPerYear) * nominalValue * quantity
//   Example: 4% annual, quarterly, nominalValue=1000, quantity=5 → (4/100/4) * 1000 * 5 = €50 per quarter
// Inflation-linked bond (isInflationLinked): the announced per-period inflation is ADDED to the
//   already-per-period fixed rate, and is NOT divided by frequency:
//   ((couponRate / 100 / periodsPerYear) + max(0, periodRate) / 100) * nominalValue * quantity
//   Example: fixed 1.5% annual + FOI 1.3% semester, nominalValue=1000 → (0.75% + 1.3%) * 1000 = €20.50 per unit
//
// For step-up bonds: couponRateSchedule overrides couponRate when present (couponRate is the fallback).
//
// WARNING: adding a field here also requires updating buildBondDetailsFromForm, the reset effect
// (BOTH the edit branch and the new-record branch), and the edit round-trip in components/assets/AssetDialog.tsx.
export interface BondDetails {
  couponRate: number;          // Annual coupon rate %. For inflation-linked bonds: the guaranteed minimum (fixed) annual rate.
  couponFrequency: CouponFrequency;
  issueDate: Date; // Reference date for coupon schedule (first coupon = issueDate + 1 period)
  maturityDate: Date; // Bond redemption date (no coupons generated after this)
  nominalValue?: number;       // Face value per unit in currency (e.g. 1000 for a €1000 bond). Default: 1
  couponRateSchedule?: CouponRateTier[]; // Step-up tiers; overrides couponRate when present
  finalPremiumRate?: number;   // Bonus % of nominalValue paid at maturity (e.g. 0.8 for BTP Valore, 0.6 for BTP Italia Sì loyalty premium)
  isInflationLinked?: boolean; // True for additive inflation-linked bonds (BTP Italia Sì): coupon = fixed + announced FOI inflation
  announcedInflationRates?: AnnouncedInflationRate[]; // User-announced per-period inflation rates, keyed by coupon date
}

/**
 * How the Allocazione page treats an asset. One field, three mutually exclusive states — NOT a
 * pair of overlapping booleans, which is what an earlier cut had and what made the two ideas below
 * impossible to tell apart in the UI.
 *
 * The two questions are orthogonal, and only three of the four combinations are meaningful:
 *   "Is this part of my invested portfolio?"  ×  "Can I trade it?"
 *
 *  - `tradable`  (default) — yes / yes. ETFs, stocks, bonds, cash.
 *  - `frozen`    — yes / no. It IS invested wealth and belongs in your asset-class percentages, but
 *                  you cannot move it: a pension fund locked until retirement, a private-equity
 *                  commitment. Counted in the DENOMINATOR (so your true equity/bond exposure is
 *                  right and the plans compensate for it with the assets you CAN move), but never
 *                  offered as a destination or a source in Ribilancia / Versa / Preleva.
 *  - `excluded`  — no / no. Not an investment at all: the home you live in. Out of the Allocazione
 *                  page entirely, denominator included — keeping it in would peg the realestate
 *                  class permanently off-target against an impossible-to-execute trade.
 *
 * Orthogonal to `isLiquid` (liquid vs illiquid net-worth split) and `isPrimaryResidence` (FIRE net
 * worth). Everywhere outside Allocazione — Panoramica, Storico, snapshots, FIRE, Patrimonio — all
 * three roles count identically toward net worth.
 */
export type AllocationRole = 'tradable' | 'frozen' | 'excluded';

export interface AssetComposition {
  assetClass: AssetClass;
  percentage: number;
  subCategory?: string; // Specific sub-category for this component of the composite asset
}

// Core asset model representing a single financial holding.
// Supports stocks, ETFs, bonds, crypto, real estate, cash, commodities.
// Includes automatic price updates via Yahoo Finance (unless autoUpdatePrice=false).
export interface Asset {
  id: string;
  userId: string;
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  subCategory?: string;
  currency: string;
  // DERIVED for LEDGER_ASSET_TYPES (stock/etf/bond/crypto/commodity, see types/assetTransactions.ts):
  // `quantity` and `averageCost` are recomputed by replaying `assetTransactions` — via
  // buildDerivedAssetFields in lib/utils/assetTransactionUtils.ts — and rewritten to this doc by the
  // trade Admin API after every ledger mutation. Do NOT write them directly for ledger types; the
  // ledger is the source of truth. cash/realestate keep direct editing and have no ledger.
  quantity: number;
  averageCost?: number; // Native-currency PMC (weighted avg of trade prices, fees excluded). Derived for ledger types — see note on `quantity`.
  taxRate?: number; // Tax rate percentage for unrealized gains (e.g., 26 for 26%)
  totalExpenseRatio?: number; // Total Expense Ratio (TER) as a percentage (e.g., 0.20 for 0.20%)
  stampDutyExempt?: boolean; // If true, asset is excluded from stamp duty (imposta di bollo) calculation (e.g. pension funds, real estate)
  includeInHistoryTables?: boolean; // If true, asset appears in Anno Corrente and Storico price/value tables regardless of cost basis tracking
  currentPrice: number;
  currentPriceEur?: number; // currentPrice converted to EUR via Frankfurter FX; populated during price updates for non-EUR assets
  isLiquid?: boolean; // Default: true - indicates whether the asset is liquid or illiquid
  autoUpdatePrice?: boolean; // Default: true - indicates whether price should be automatically updated via Yahoo Finance
  composition?: AssetComposition[]; // For composite assets (e.g., pension funds with mixed allocation: 60% equity, 40% bonds)
  outstandingDebt?: number; // Outstanding mortgage/loan for real estate. Net value calculation: value - outstandingDebt
  isPrimaryResidence?: boolean; // Indicates if this real estate is the primary residence (excluded from FIRE calculations based on user setting)
  allocationRole?: AllocationRole; // How the Allocazione page treats this asset. See AllocationRole. Absent → legacy excludeFromAllocation, else 'tradable'.
  /** @deprecated Superseded by `allocationRole`. Read-only legacy fallback: true → 'excluded'. Never write it. */
  excludeFromAllocation?: boolean;
  // For a leveraged/composite ETF: 2 = 2x, 3 = 3x, 1 or absent = no leverage. Shown in AssetDialog
  // for type 'etf' only (D4: no dedicated AssetType — the math depends solely on this field plus
  // `composition`, never on `type`). Multiplies notionalValue in `expandAssetExposure`
  // (lib/utils/assetExposureUtils.ts); `quantity`/`averageCost`/`pricePerUnit` stay per-quota and
  // independent of it.
  leverageRatio?: number;
  isin?: string; // ISIN code for dividend scraping (optional)
  bondDetails?: BondDetails; // Optional bond-specific details for coupon scheduling
  pensionFundDetails?: PensionFundDetails; // Optional fondo pensione details (type 'pensionFund'); see types/pension.ts
  // Start of the CURRENT continuous holding, stamped on (re)purchase — createAsset on ISIN reuse,
  // or updateAsset when quantity goes 0 → >0. Lets YOC / Current-Yield ignore dividends from a
  // previous, discontinuous holding of the same instrument. Absent for assets held since before
  // this field existed; the snapshot-derived fallback (deriveHoldingStartDates) then applies.
  holdingStartDate?: Date;
  lastPriceUpdate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetFormData {
  ticker: string;
  name: string;
  type: AssetType;
  assetClass: AssetClass;
  subCategory?: string;
  currency: string;
  quantity: number;
  averageCost?: number;
  taxRate?: number; // Tax rate percentage for unrealized gains (e.g., 26 for 26%)
  totalExpenseRatio?: number; // Total Expense Ratio (TER) as a percentage (e.g., 0.20 for 0.20%)
  stampDutyExempt?: boolean; // If true, asset is excluded from stamp duty (imposta di bollo) calculation
  includeInHistoryTables?: boolean; // If true, asset appears in Anno Corrente and Storico price/value tables regardless of cost basis tracking
  currentPrice: number;
  currentPriceEur?: number; // currentPrice converted to EUR via FX; set at creation for non-EUR assets
  isLiquid?: boolean;
  autoUpdatePrice?: boolean;
  composition?: AssetComposition[];
  outstandingDebt?: number;
  isPrimaryResidence?: boolean;
  allocationRole?: AllocationRole; // How the Allocazione page treats this asset. See AllocationRole.
  leverageRatio?: number; // For a leveraged/composite ETF: 2 = 2x, 3 = 3x, 1 or absent = no leverage.
  isin?: string; // ISIN code for dividend scraping (optional)
  bondDetails?: BondDetails; // Optional bond-specific details for coupon scheduling
  pensionFundDetails?: PensionFundDetails; // Optional fondo pensione details (type 'pensionFund'); see types/pension.ts
}

export interface SubCategoryConfig {
  enabled: boolean;
  categories: string[];
}

export interface SpecificAssetAllocation {
  name: string; // Ticker or asset name (e.g., "AAPL", "MSFT")
  targetPercentage: number; // Percentage relative to the subcategory
}

export interface SubCategoryTarget {
  targetPercentage: number;
  specificAssetsEnabled?: boolean;
  specificAssets?: SpecificAssetAllocation[];
}

// Asset allocation target structure for portfolio rebalancing.
//
// Structure: assetClass -> targetPercentage / subTargets
// - Top level: asset class (equity, bonds, etc.) with target %
// - Second level: sub-categories (e.g., "US Stocks", "Emerging Markets") with target % relative to asset class
// - Third level: specific assets (e.g., "AAPL", "MSFT") with target % relative to sub-category
//
// Example:
// {
//   "equity": {
//     targetPercentage: 60,
//     subTargets: {
//       "US Stocks": { targetPercentage: 70 },  // 70% of equity = 42% of total portfolio
//       "Emerging Markets": { targetPercentage: 30 }  // 30% of equity = 18% of total
//     }
//   }
// }
export interface AssetAllocationTarget {
  [assetClass: string]: {
    targetPercentage: number;
    useFixedAmount?: boolean;
    fixedAmount?: number;
    subCategoryConfig?: SubCategoryConfig;
    subTargets?: {
      [subCategory: string]: number | SubCategoryTarget; // Support both old (number) and new (SubCategoryTarget) format for backward compatibility. Migrate to SubCategoryTarget when possible.
    };
  };
}

export interface CoastFirePensionInput {
  id: string;
  label: string;
  grossMonthlyAmount: number; // Monthly gross pension, nominal future amount from the source estimate
  monthsPerYear: number; // Annual payment count (e.g. 13 in Italy)
  startDate?: string; // Retirement start date in YYYY-MM-DD format
  startAge?: number; // Legacy fallback kept for backward compatibility with previously saved rows
}

export interface CoastFireTaxBracket {
  id: string;
  upTo: number | null; // Null = no upper bound (top bracket)
  rate: number; // Percentage rate (e.g. 23 for 23%)
}

/**
 * A household member the account's pension funds can be attributed to (spec 2-pension-fund
 * follow-up). The IRPEF pension-deduction ceiling is per TAXPAYER, not per account/household, so an
 * account tracking more than one person's fondo pensione (e.g. both spouses) needs a per-person RAL
 * and eligibility, not one shared value. `Asset.pensionFundDetails.familyMemberId` links a fund to
 * one of these; a fund with no link, or a stale one (member deleted), is treated as unassigned by
 * the Previdenza view rather than silently mixed into anyone else's calculation.
 */
export interface FamilyMember {
  id: string;
  name: string;
  grossAnnualIncome?: number; // RAL — base for the marginal-rate IRPEF benefit estimate
  isFirstEmploymentPost2007?: boolean; // Eligibility for the extra-deducibilità plafond recovery
  firstEmploymentYear?: number; // First calendar year of participation — anchors the plafond 5/20-year windows
}

export interface AssetAllocationSettings {
  userAge?: number;
  riskFreeRate?: number;
  withdrawalRate?: number; // Safe withdrawal rate for FIRE calculations (e.g., 4.0 for 4%)
  plannedAnnualExpenses?: number; // Planned annual expenses for FIRE projections
  coastFireRetirementAge?: number; // Target age at which Coast FIRE should mature into the full FIRE number
  coastFireCustomExpenses?: number; // User-defined annual retirement expenses for Coast FIRE; undefined = derive from last complete year
  coastFirePensions?: CoastFirePensionInput[]; // Optional state-pension inputs used only by the Coast FIRE tab
  coastFireTaxBrackets?: CoastFireTaxBracket[]; // Progressive IRPEF brackets used to estimate state-pension net income
  includePrimaryResidenceInFIRE?: boolean; // If true, include primary residences in FIRE calculations; if false, exclude them (FIRE standard)
  dividendIncomeCategoryId?: string; // Category ID for automatic dividend income entries
  dividendIncomeSubCategoryId?: string; // Subcategory ID for automatic dividend income entries
  fireProjectionScenarios?: FIREProjectionScenarios; // Custom scenario parameters for FIRE projections (Bear/Base/Bull)
  monteCarloScenarios?: MonteCarloScenarios; // Custom scenario parameters for Monte Carlo simulations (Bear/Base/Bull)
  goalBasedInvestingEnabled?: boolean; // Toggle to enable goal-based investing feature (mental allocation of portfolio to financial goals)
  goalDrivenAllocationEnabled?: boolean; // When true AND goalBasedInvestingEnabled, derive allocation targets from goal recommended allocations instead of manual Settings targets
  autoCalculateEquityBonds?: boolean; // When true, equity and bond targets are auto-computed via the "125 − age − (rate × 5)" formula; stored explicitly so disabling persists across reloads
  defaultDebitCashAssetId?: string; // Default cash asset pre-selected for expenses/debts in expense dialog
  defaultCreditCashAssetId?: string; // Default cash asset pre-selected for income entries in expense dialog
  stampDutyEnabled?: boolean; // Toggle to include stamp duty (imposta di bollo) in annual portfolio cost
  stampDutyRate?: number; // Annual stamp duty rate as a percentage (e.g. 0.2 for 0.20%)
  checkingAccountSubCategory?: string; // Cash subcategory name representing checking accounts (conti correnti); stamp duty applies only if value > 5000€
  cashflowHistoryStartYear?: number; // Min year shown in TotalHistoryTab charts (excludes bulk-imported older data); defaults to 2025
  laborIncomeCategoryIds?: string[]; // Category IDs of type 'income' representing labor/salary income; used for dashboard KPI cards
  assistantResponseStyle?: 'balanced' | 'concise' | 'deep'; // Mirrors assistant preference for cross-feature defaults
  assistantMacroContextEnabled?: boolean; // Enables macro/web context in assistant flows when explicitly requested
  assistantMemoryEnabled?: boolean; // Allows the assistant to persist reusable user context
  costCentersEnabled?: boolean; // When true, Centri di Costo tab appears in Cashflow and the cost center selector appears in ExpenseDialog
  monthlyEmailEnabled?: boolean; // When true, a summary email is sent on the last day of each month
  quarterlyEmailEnabled?: boolean; // When true, a summary email is sent on the last day of each quarter (Mar/Jun/Sep/Dec)
  semiAnnualEmailEnabled?: boolean; // When true, a summary email is sent on the last day of each half-year (Jun 30 / Dec 31)
  yearlyEmailEnabled?: boolean; // When true, a summary email is sent on December 31
  weeklyBudgetEmailEnabled?: boolean; // When true, a budget status email is sent every Sunday
  monthlyEmailRecipients?: string[]; // Recipient list shared by all periodic summary emails (monthly/quarterly/semiannual/yearly/weekly-budget)
  // Fondo pensione — household members, one RAL/eligibility per taxpayer (see FamilyMember). Feeds
  // computePensionTaxRecap in the Previdenza view, once per member with ≥1 linked fund. Editable
  // from Impostazioni → Preferenze → Famiglia, not part of the FIRE Coast tax params above.
  familyMembers?: FamilyMember[];
  // When true, FireCalculatorTab subtracts locked pension-fund capital (unlockDate in the future)
  // from the FIRE-eligible net worth — see lib/utils/pensionFire.ts. Off by default (opt-in, MVP).
  respectPensionLockInFire?: boolean;
  targets: AssetAllocationTarget;
}

export interface AllocationData {
  currentPercentage: number;
  currentValue: number;
  targetPercentage: number;
  targetValue: number;
  difference: number;
  differenceValue: number;
  action: 'COMPRA' | 'VENDI' | 'OK';
}

export interface AllocationResult {
  byAssetClass: {
    [assetClass: string]: AllocationData;
  };
  bySubCategory: {
    [subCategory: string]: AllocationData; // Key format: "assetClass:subCategory"
  };
  bySpecificAsset: {
    [specificAsset: string]: AllocationData; // Key format: "assetClass:subCategory:assetName"
  };
  // Leverage-aware totals (spec 3-leveraged-etf-allocation). For an unleveraged portfolio
  // notional === market, so every field below collapses to the pre-leverage number and the
  // result is byte-identical to before (invariant #1).
  //
  // `totalValue` is the NOTIONAL exposure total of the investable base — kept under this name
  // for backward compatibility (existing readers get notional, == market when unleveraged). Each
  // class's `currentValue`/`currentPercentage` is likewise a notional figure, so the percentages
  // sum to `leverageRatio × 100` rather than to 100 under leverage.
  totalValue: number;
  /** Market total of the investable base (tradable + frozen). Hero "Patrimonio investito". */
  marketValue: number;
  /** Notional exposure total of the investable base. Hero "Esposizione nozionale". == totalValue. */
  notionalValue: number;
  /** notionalValue / marketValue over the investable base (1 when unleveraged or market = 0). */
  leverageRatio: number;
  /** True when leverageRatio exceeds 1 by more than a rounding epsilon — drives the hero split. */
  hasLeveragedExposure: boolean;
}

export interface PieChartData {
  name: string;
  value: number;
  percentage: number;
  color: string;
  /** Raw asset-class key (e.g. 'equity'), set only by asset-class distribution data. */
  assetClass?: string;
  [key: string]: any; // Index signature for Recharts compatibility
}

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface MonthlySnapshot {
  userId: string;
  year: number;
  month: number;
  isDummy?: boolean; // Indicates if this is a test/dummy snapshot
  totalNetWorth: number;
  liquidNetWorth: number;
  illiquidNetWorth: number; // New field to track illiquid assets separately
  // FIRE-adjusted net worth excludes the primary residence (isPrimaryResidence flag).
  // Optional for backwards compatibility — absent on snapshots created before this field was added.
  fireNetWorth?: number;
  byAssetClass: {
    [assetClass: string]: number;
  };
  byAsset: Array<{
    assetId: string;
    ticker: string;
    name: string;
    quantity: number;
    price: number;
    totalValue: number;
  }>;
  assetAllocation: {
    [assetClass: string]: number;
  };
  createdAt: Date;
  note?: string; // Optional note to document significant financial events (max 500 characters)
}

export interface PriceHistory {
  ticker: string;
  price: number;
  date: Date;
  currency: string;
}

// Monte Carlo Simulation Types
export type PortfolioSource = 'total' | 'liquid' | 'custom';
export type WithdrawalAdjustment = 'inflation' | 'fixed' | 'percentage';
export interface MonteCarloParams {
  // Portfolio settings
  portfolioSource: PortfolioSource;
  initialPortfolio: number;

  // Retirement duration
  retirementYears: number;

  // Asset allocation (all 4 must sum to 100%)
  equityPercentage: number;
  bondsPercentage: number;
  realEstatePercentage: number;
  commoditiesPercentage: number;

  // Withdrawal settings
  annualWithdrawal: number;
  withdrawalAdjustment: WithdrawalAdjustment;

  // Market parameters
  equityReturn: number;
  equityVolatility: number;
  bondsReturn: number;
  bondsVolatility: number;
  realEstateReturn: number;
  realEstateVolatility: number;
  commoditiesReturn: number;
  commoditiesVolatility: number;
  inflationRate: number;

  // Simulation settings
  numberOfSimulations: number;
}

export interface SimulationPath {
  year: number;
  value: number;
}

export interface SingleSimulationResult {
  simulationId: number;
  success: boolean;
  failureYear?: number;
  finalValue: number;
  path: SimulationPath[];
}

export interface PercentilesData {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

export interface MonteCarloResults {
  successRate: number;
  successCount: number;
  failureCount: number;
  medianFinalValue: number;
  percentiles: PercentilesData[];
  failureAnalysis: {
    averageFailureYear: number;
    medianFailureYear: number;
  } | null;
  distribution: {
    range: string;
    count: number;
    percentage: number;
  }[];
  simulations: SingleSimulationResult[];
}

// Monte Carlo Scenario Types
// Each scenario defines per-asset-class returns/volatilities plus inflation,
// enabling Bear/Base/Bull comparison of retirement outcomes.
export interface MonteCarloScenarioParams {
  equityReturn: number;
  equityVolatility: number;
  bondsReturn: number;
  bondsVolatility: number;
  realEstateReturn: number;
  realEstateVolatility: number;
  commoditiesReturn: number;
  commoditiesVolatility: number;
  inflationRate: number;
}

export interface MonteCarloScenarios {
  bear: MonteCarloScenarioParams;
  base: MonteCarloScenarioParams;
  bull: MonteCarloScenarioParams;
}

// Asset Price History Types
export type AssetHistoryDisplayMode = 'price' | 'totalValue';

export interface AssetHistoryDateFilter {
  year: number;
  month: number; // 1-12
}

export interface AssetHistoryTransformOptions {
  filterYear?: number;
  filterStartDate?: AssetHistoryDateFilter;
  includePreviousMonthBaseline?: boolean;
  excludeCash?: boolean;
  // When true, only assets already present in the passed currentAssets array are shown.
  // Snapshot-only assets (sold/deleted from the portfolio) are not re-introduced from
  // historical snapshot data. Use this when the caller pre-filters currentAssets (e.g.
  // to cost-basis-tracked assets only) and doesn't want deleted assets to bypass the filter.
  restrictToPassedAssets?: boolean;
}

export interface AssetHistoryTotalRow {
  monthColumns: string[];
  totals: {
    [monthKey: string]: number;
  };
  // Optional percentage fields for total row
  monthlyChanges?: {
    [monthKey: string]: number | undefined;  // undefined = first month (no previous)
  };
  ytd?: number;             // Year-to-date % (undefined if <2 months in current year)
  fromStart?: number;       // From start % (undefined if <2 months total)
  lastMonthChange?: number; // Change % of the last available month vs its predecessor
}

// Doubling Time Metric Types
// Used by History page to visualize wealth accumulation velocity
// Tracks when net worth doubles over time (2x, 4x, 8x... or €100k, €200k, €500k...)

export type DoublingMode = 'geometric' | 'threshold';

// Doubling Time Milestone represents a period where net worth doubled.
// Each milestone tracks either geometric progression (2x, 4x, 8x...)
// or fixed thresholds (€100k, €200k, €500k, €1M...).
export interface DoublingMilestone {
  milestoneNumber: number;           // 1st, 2nd, 3rd... milestone
  startValue: number;                 // Starting net worth (e.g., €50,000)
  endValue: number;                   // Ending net worth (e.g., €100,000)
  startDate: {
    year: number;
    month: number;
  };
  endDate: {
    year: number;
    month: number;
  };
  durationMonths: number;             // Time taken in months
  periodLabel: string;                // "01/20 - 06/22" (MM/YY format)
  isComplete: boolean;                // true if milestone reached, false if in progress
  progressPercentage?: number;        // 0-100 for incomplete milestones
  milestoneType: 'geometric' | 'threshold';  // Type of milestone
  thresholdValue?: number;            // e.g., 100000 for €100k threshold (only for threshold type)
}

// Summary of all doubling time milestones with aggregate statistics.
// Used to display fastest doubling, average time, and current progress.
export interface DoublingTimeSummary {
  milestones: DoublingMilestone[];
  fastestDoubling: DoublingMilestone | null;
  averageMonths: number | null;
  totalDoublings: number;
  currentDoublingInProgress: DoublingMilestone | null;
}

// FIRE Projection Scenario Types
// Used by the FIRE Calculator tab to project portfolio growth under different
// market conditions (Bear/Base/Bull) with inflation-adjusted expenses.
// Complementary to Monte Carlo (stochastic) — these are deterministic projections.

export interface FIREScenarioParams {
  growthRate: number;    // Annual market growth rate as percentage (e.g., 7.0 for 7%)
  inflationRate: number; // Annual inflation rate as percentage (e.g., 2.5 for 2.5%)
}

export interface FIREProjectionScenarios {
  bear: FIREScenarioParams;
  base: FIREScenarioParams;
  bull: FIREScenarioParams;
}

export interface FIREProjectionYearData {
  year: number;            // Projection year number (1, 2, 3...)
  calendarYear: number;    // Actual calendar year (2026, 2027...)
  bearNetWorth: number;
  baseNetWorth: number;
  bullNetWorth: number;
  bearExpenses: number;    // Annual expenses inflated with bear scenario inflation
  baseExpenses: number;    // Annual expenses inflated with base scenario inflation
  bullExpenses: number;    // Annual expenses inflated with bull scenario inflation
  bearFireNumber: number;  // FIRE Number using bear expenses
  baseFireNumber: number;  // FIRE Number using base expenses
  bullFireNumber: number;  // FIRE Number using bull expenses
  bearFireReached: boolean;
  baseFireReached: boolean;
  bullFireReached: boolean;
}

export interface FIREProjectionResult {
  yearlyData: FIREProjectionYearData[];
  bearYearsToFIRE: number | null;  // null = not reached within projection horizon
  baseYearsToFIRE: number | null;
  bullYearsToFIRE: number | null;
  annualSavings: number;
  initialNetWorth: number;
  initialExpenses: number;
  scenarios: FIREProjectionScenarios;
}
