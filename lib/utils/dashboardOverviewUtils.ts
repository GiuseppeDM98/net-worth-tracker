/**
 * Pure helpers for the Panoramica (Overview) dashboard page.
 *
 * Deliberately import nothing from the Firebase/Firestore layer (mirrors the
 * convention in lib/utils/allocationUtils.ts) so they're directly unit-testable —
 * dashboardOverviewService.ts (server-only) calls these with data it has already
 * fetched via adminDb.
 */

import { Asset, MonthlySnapshot } from '@/types/assets';
import { GoalAssetAssignment, GoalPriority, InvestmentGoal } from '@/types/goals';
import {
  DashboardOverviewCostDriver,
  DashboardOverviewGoalProgress,
  DashboardOverviewInstrumentMover,
  DashboardOverviewMover,
} from '@/types/dashboardOverview';
import { calculateAssetValue } from '@/lib/services/assetService';
import { getAssetDisplayTicker } from '@/lib/utils/assetDisplay';
import { ASSET_CLASS_LABELS } from '@/lib/utils/allocationUtils';
import { PENSION_BAND_KEY } from '@/lib/utils/historyComposition';
import { attributeSelectedChange } from '@/lib/utils/snapshotAssetBreakdown';
import { valueEffectMonth } from '@/lib/utils/pensionReturn';
import type { PensionContribution } from '@/types/pension';

/**
 * What the digest needs to read a pension fund's growth as return: the contributions that moved
 * its value, and the month from which they are fully recorded (`pensionReturnStartMonth`, or the
 * first recorded contribution — resolved by the caller with `resolvePensionReturnStart`).
 */
export interface PensionMarketInput {
  contributions: PensionContribution[];
  /** 'YYYY-MM' from which contributions are complete; null = never, so funds stay at 0. */
  startMonth: string | null;
}

const monthKeyOf = (year: number, month: number) => `${year}-${String(month).padStart(2, '0')}`;

/**
 * Per-asset market (price) effect since the previous snapshot, keyed by assetId.
 *
 * WHY price effect and not value delta: the digest under the hero is meant to say what the
 * MARKET did, and a class-level value delta cannot tell a price move from the user's own
 * buying and selling — selling 14.000 € of cash to buy crypto used to read as
 * "Liquidità −14.110 · Criptovalute +11.869", which is a description of the user's trades,
 * not of any return. The split comes from `attributeSelectedChange`, the same
 * price/quantity attribution Storico → Valore per Strumento uses, applied one asset at a
 * time: priceEffect = q_prev × (u_curr − u_prev) on the quantity held at the START of the
 * period, where u is the effective EUR unit value. Consequences worth knowing:
 *   - a position opened this month has no prior price and contributes 0;
 *   - cash (unit value 1) and any hand-valued asset kept at price 1 can never show a market
 *     effect — their growth lands in the quantity effect by construction. PENSION FUNDS are the
 *     exception, handled separately: their value lives in `quantity` at price 1 and moves for two
 *     reasons, contributions and the fund's own return, so the return is `Δvalue − contributions
 *     registered since the previous snapshot` (attributed by `valueEffectMonth`, the same rule
 *     Previdenza's "Rendimento del fondo" uses). Only from `startMonth` on: before it,
 *     contributions were not recorded and the whole growth would read as return, so the fund
 *     contributes 0 — the settings card says exactly this;
 *   - real estate is measured GROSS of debt: `calculateAssetValue` nets the mortgage out, so on
 *     the net value a mere instalment would read as the property appreciating (measured on the
 *     real account: "Immobili +1.036 €" in a month where only the debt moved). The snapshot's
 *     raw `price` is the gross property value, so both sides use `quantity × price` instead.
 *
 * Returns null when the previous snapshot has no per-asset breakdown (older or hand-entered
 * snapshots): with class totals only, nothing honest can be attributed.
 */
function computePriceEffectsByAsset(
  assets: Asset[],
  previousSnapshot: MonthlySnapshot | null,
  pension?: PensionMarketInput
): Map<string, number> | null {
  const rawPreviousByAsset = previousSnapshot?.byAsset ?? [];
  if (rawPreviousByAsset.length === 0 || !previousSnapshot) return null;

  // The hand-valued property, by TYPE: a REIT ETF in the realestate class is a quoted fund whose
  // snapshot `price` is a native-currency quote, so it keeps the EUR attribution like any ETF.
  const realEstateIds = new Set(
    assets.filter((asset) => asset.type === 'realestate').map((asset) => asset.id)
  );
  const previousByAsset = rawPreviousByAsset.map((row) =>
    realEstateIds.has(row.assetId) ? { ...row, totalValue: row.quantity * row.price } : row
  );

  const currentByAsset = assets
    .filter((asset) => asset.quantity > 0)
    .map((asset) => ({
      assetId: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      quantity: asset.quantity,
      price: asset.currentPrice,
      totalValue: realEstateIds.has(asset.id)
        ? asset.quantity * asset.currentPrice
        : calculateAssetValue(asset),
    }));

  const effects = new Map<string, number>();
  for (const current of currentByAsset) {
    const { priceEffect } = attributeSelectedChange(previousByAsset, currentByAsset, new Set([current.assetId]));
    effects.set(current.assetId, priceEffect);
  }

  // Pension funds: the fund's own return, net of what was paid in since the previous snapshot.
  const previousMonthKey = monthKeyOf(previousSnapshot.year, previousSnapshot.month);
  const previousById = new Map(previousByAsset.map((row) => [row.assetId, row]));
  for (const asset of assets) {
    if (asset.type !== 'pensionFund' || !(asset.quantity > 0)) continue;
    const prev = previousById.get(asset.id);
    const trackable = pension?.startMonth !== null && pension?.startMonth !== undefined && pension.startMonth <= previousMonthKey;
    if (!prev || !trackable) {
      effects.set(asset.id, 0);
      continue;
    }
    const paidInSince = pension.contributions
      .filter((c) => c.assetId === asset.id && valueEffectMonth(c) > previousMonthKey)
      .reduce((sum, c) => sum + c.amount, 0);
    effects.set(asset.id, calculateAssetValue(asset) - prev.totalValue - paidInSince);
  }
  return effects;
}

/**
 * Every asset class whose MARKET PRICE moved between the previous month's snapshot and the live
 * portfolio, largest absolute euro effect first — the "Mercato:" digest under the hero sparkline.
 * A composite asset's effect is split across its `composition`, mirroring how
 * `calculateCurrentAllocation` folds its value into classes — EXCEPT pension funds, which get
 * their own "Previdenza" line (Storico's band key): folded into Azioni/Obbligazioni their return
 * is invisible, and the user asked for it by name. Effects under €1 are dropped as noise. Returns [] when there is no prior snapshot, the previous snapshot has no
 * per-asset breakdown, or the portfolio is empty. See `computePriceEffectsByAsset` for what
 * "market effect" does and does not capture.
 */
export function computeTopMovers(
  assets: Asset[],
  previousSnapshot: MonthlySnapshot | null,
  totalValue: number,
  pension?: PensionMarketInput
): DashboardOverviewMover[] {
  if (totalValue <= 0) return [];
  const effects = computePriceEffectsByAsset(assets, previousSnapshot, pension);
  if (!effects) return [];

  const byClass = new Map<string, number>();
  const add = (assetClass: string, amount: number) =>
    byClass.set(assetClass, (byClass.get(assetClass) ?? 0) + amount);

  for (const asset of assets) {
    const effect = effects.get(asset.id);
    if (!effect) continue;
    if (asset.type === 'pensionFund') {
      add(PENSION_BAND_KEY, effect);
    } else if (asset.composition && asset.composition.length > 0) {
      for (const component of asset.composition) {
        add(component.assetClass, (effect * component.percentage) / 100);
      }
    } else {
      add(asset.assetClass, effect);
    }
  }

  const movers: DashboardOverviewMover[] = [];
  for (const [assetClass, delta] of byClass) {
    if (Math.abs(delta) < 1) continue;
    const label = assetClass === PENSION_BAND_KEY ? 'Previdenza' : (ASSET_CLASS_LABELS[assetClass] ?? assetClass);
    movers.push({ assetClass, label, delta });
  }

  return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** Patrimonio's verdict needs one driver and its hero footer three; ten keeps the payload small. */
const MAX_INSTRUMENT_MOVERS = 10;

/**
 * The instruments behind `computeTopMovers`, each by its OWN price effect, largest absolute
 * first — Patrimonio names the top one in its verdict ("Vanguard ha fatto il grosso") and lists
 * the first three under its hero. Same attribution, same pension and real-estate rules, same
 * €1 noise floor; an instrument is never split by its `composition`, so the sum over this list
 * equals the sum over the class digest. Returns [] under the same conditions as
 * `computeTopMovers`. `name` resolves via `getAssetDisplayTicker` (alias → ticker → name), like
 * every other instrument label, so a long fund name isn't truncated mid-word in the digest.
 */
export function computeTopInstrumentMovers(
  assets: Asset[],
  previousSnapshot: MonthlySnapshot | null,
  totalValue: number,
  pension?: PensionMarketInput
): DashboardOverviewInstrumentMover[] {
  if (totalValue <= 0) return [];
  const effects = computePriceEffectsByAsset(assets, previousSnapshot, pension);
  if (!effects) return [];

  const movers: DashboardOverviewInstrumentMover[] = [];
  for (const asset of assets) {
    const delta = effects.get(asset.id);
    if (delta === undefined || Math.abs(delta) < 1) continue;
    movers.push({ id: asset.id, name: getAssetDisplayTicker(asset), delta });
  }

  return movers
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, MAX_INSTRUMENT_MOVERS);
}

/**
 * Total market (price) effect over the whole portfolio since the previous snapshot — the
 * share of this month's net-worth change that is return rather than the user's own flows.
 * Null when nothing can be attributed (no prior snapshot, or one without `byAsset`), which
 * callers must keep distinct from a measured 0.
 */
export function computeMarketEffect(
  assets: Asset[],
  previousSnapshot: MonthlySnapshot | null,
  pension?: PensionMarketInput
): number | null {
  const effects = computePriceEffectsByAsset(assets, previousSnapshot, pension);
  if (!effects) return null;
  let total = 0;
  for (const effect of effects.values()) total += effect;
  return total;
}

/**
 * Held instruments that carry a TER, by what they cost per year (value × TER ÷ 100), largest
 * first — the same per-asset figure `calculateAnnualPortfolioCost` sums. Stamp duty is not
 * an instrument's cost and stays out. `name` is resolved via `getAssetDisplayTicker` (alias →
 * ticker → name), the same fallback used everywhere else an instrument is labeled, so a long
 * fund name doesn't get cut mid-word when the tile truncates it.
 */
export function rankCostDrivers(assets: Asset[]): DashboardOverviewCostDriver[] {
  return assets
    .filter((asset) => asset.quantity > 0 && (asset.totalExpenseRatio ?? 0) > 0)
    .map((asset) => ({
      id: asset.id,
      name: getAssetDisplayTicker(asset),
      totalExpenseRatio: asset.totalExpenseRatio!,
      annualCost: (calculateAssetValue(asset) * asset.totalExpenseRatio!) / 100,
    }))
    .sort((a, b) => b.annualCost - a.annualCost);
}

/**
 * All-time-high check: compares the live total against the highest historical
 * snapshot, excluding the current month's own snapshot so overwriting this
 * month's snapshot never compares the value against itself.
 * previousAllTimeHigh is null (and isNewATH false) when there's no prior
 * snapshot to compare against — a first-ever snapshot is a baseline, not a record.
 */
export function computeAllTimeHigh(
  snapshots: MonthlySnapshot[],
  currentMonth: number,
  currentYear: number,
  liveTotalValue: number
): { previousAllTimeHigh: number | null; isNewATH: boolean } {
  const priorSnapshots = snapshots.filter(
    (s) => !(s.year === currentYear && s.month === currentMonth)
  );

  if (priorSnapshots.length === 0) {
    return { previousAllTimeHigh: null, isNewATH: false };
  }

  const previousAllTimeHigh = Math.max(...priorSnapshots.map((s) => s.totalNetWorth));

  return {
    previousAllTimeHigh,
    isNewATH: liveTotalValue > previousAllTimeHigh,
  };
}

const GOAL_PRIORITY_RANK: Record<GoalPriority, number> = { alta: 0, media: 1, bassa: 2 };

/**
 * Every in-progress goal in the order Overview shows them: highest priority first, then
 * furthest along (highest progress %) among ties. Fully-funded goals (progress >= 100%) and
 * open-ended goals (no targetAmount, so no percentage to show) are excluded.
 */
export function rankGoalProgress(
  goals: InvestmentGoal[],
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): DashboardOverviewGoalProgress[] {
  const assetMap = new Map(assets.map((a) => [a.id, a]));

  const candidates = goals
    .filter((g) => g.targetAmount != null && g.targetAmount > 0)
    .map((goal) => {
      let currentValue = 0;
      for (const assignment of assignments) {
        if (assignment.goalId !== goal.id) continue;
        const asset = assetMap.get(assignment.assetId);
        if (!asset) continue; // Skip orphaned assignments (asset deleted from portfolio)
        currentValue += (calculateAssetValue(asset) * assignment.percentage) / 100;
      }
      const progressPercentage = (currentValue / goal.targetAmount!) * 100;
      return { goal, currentValue, progressPercentage };
    })
    .filter((c) => c.progressPercentage < 100);

  candidates.sort((a, b) => {
    const rankDiff = GOAL_PRIORITY_RANK[a.goal.priority] - GOAL_PRIORITY_RANK[b.goal.priority];
    if (rankDiff !== 0) return rankDiff;
    return b.progressPercentage - a.progressPercentage;
  });

  return candidates.map(({ goal, currentValue, progressPercentage }) => ({
    goalId: goal.id,
    goalName: goal.name,
    goalColor: goal.color,
    currentValue,
    targetAmount: goal.targetAmount!,
    progressPercentage,
  }));
}

/** The single most relevant in-progress goal — the head of `rankGoalProgress`, kept for the payload's `goalProgress`. */
export function pickFeaturedGoalProgress(
  goals: InvestmentGoal[],
  assignments: GoalAssetAssignment[],
  assets: Asset[]
): DashboardOverviewGoalProgress | null {
  return rankGoalProgress(goals, assignments, assets)[0] ?? null;
}
