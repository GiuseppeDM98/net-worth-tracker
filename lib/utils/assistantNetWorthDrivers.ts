/**
 * The change of an analysed period, split as Storico's Driver splits it (`growthDrivers.ts`):
 * savings + market − taxes + debt repaid + pension contributions + the rest, adding up to the euro.
 * Handed to the Assistente so it says how much of a period was market instead of guessing it by
 * difference (owner, 2026-11-16: «Il sistema non scompone la variazione … non posso quantificarla»).
 *
 * Pure: the caller hands the snapshots (already without the dummies it excludes) and the Driver's
 * context; a window with a month that has no snapshot is not split at all, because its parts
 * would no longer add up to the change.
 */
import { buildMonthlyGrowthDrivers, sumGrowthDrivers, type GrowthDriverContext } from '@/lib/utils/growthDrivers';
import { valueEffectMonth } from '@/lib/utils/pensionReturn';
import type { Asset, MonthlySnapshot } from '@/types/assets';
import type { PensionContribution } from '@/types/pension';

export interface AssistantNetWorthDrivers {
  /** The snapshot the change is measured FROM, and the one it closes on. */
  from: { year: number; month: number };
  to: { year: number; month: number };
  /** The change of the net worth between the two: the sum of the parts below. */
  total: number;
  savings: number;
  market: number;
  /** The estimated tax on the period's sales, as a magnitude (≥ 0): it is subtracted. */
  taxes: number;
  debtRepaid: number;
  pensionContributions: number;
  /** The rest, and its three named causes (pension funds, holdings, accounts). */
  other: number;
  otherPension: number;
  otherHoldings: number;
  otherAccounts: number;
  /** True when every month of the window was measured instrument by instrument. */
  isMarketMeasured: boolean;
}

const indexOf = (s: { year: number; month: number }) => s.year * 12 + (s.month - 1);

export function buildAssistantNetWorthDrivers(input: {
  snapshots: MonthlySnapshot[];
  from: MonthlySnapshot | null;
  to: MonthlySnapshot | null;
  context: GrowthDriverContext;
}): AssistantNetWorthDrivers | null {
  const { from, to } = input;
  if (!from || !to) return null;
  const start = indexOf(from);
  const end = indexOf(to);
  if (end <= start) return null;
  const window = input.snapshots.filter((s) => indexOf(s) >= start && indexOf(s) <= end);
  const rows = buildMonthlyGrowthDrivers(window, input.context);
  // A gap is not a month: the Driver skips it, and the parts would miss its change.
  if (rows.length !== end - start) return null;
  const sum = sumGrowthDrivers(rows);
  if (!sum) return null;
  return {
    from: { year: from.year, month: from.month },
    to: { year: to.year, month: to.month },
    total: sum.netWorthGrowth,
    savings: sum.netSavings,
    market: sum.market,
    taxes: sum.taxes,
    debtRepaid: sum.debtRepaid,
    pensionContributions: sum.pensionContributions,
    other: sum.other,
    otherPension: sum.otherPension,
    otherHoldings: sum.otherHoldings,
    otherAccounts: sum.otherAccounts,
    isMarketMeasured: sum.isMarketMeasured,
  };
}

/**
 * The contributions that moved the funds' value in the period (after `afterKey`, through
 * `throughKey`, by `valueEffectMonth`), by asset class through each fund's `composition` — the
 * split `byAssetClass` folds the fund by — or its own class without one (owner, 2026-11-16: the
 * assistant could not tell, in Azioni and Obbligazioni, the contributions from the return).
 */
export function pensionPaidInByClass(
  contributions: PensionContribution[],
  assets: Asset[],
  afterKey: string,
  throughKey: string
): Record<string, number> {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const byClass: Record<string, number> = {};
  const add = (assetClass: string, amount: number) => { byClass[assetClass] = (byClass[assetClass] ?? 0) + amount; };
  for (const contribution of contributions) {
    const key = valueEffectMonth(contribution);
    if (key <= afterKey || key > throughKey) continue;
    const fund = assetsById.get(contribution.assetId);
    if (!fund) continue;
    if (fund.composition && fund.composition.length > 0) {
      for (const part of fund.composition) add(part.assetClass, (contribution.amount * part.percentage) / 100);
    } else {
      add(fund.assetClass, contribution.amount);
    }
  }
  return byClass;
}
