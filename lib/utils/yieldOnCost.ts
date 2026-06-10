/**
 * Yield on Cost (YOC) & Current Yield — single source of truth.
 *
 * DESIGN: forward-looking, per-share, on CURRENT holdings.
 *
 * We define both metrics on a PER-SHARE dividend rate (DPS) projected onto the
 * shares currently held, divided by the current cost (YOC) or current market
 * price (Current Yield). This is the standard textbook YOC and has three desirable
 * properties that the previous period-realized definition lacked:
 *
 *   1. Sold positions are excluded — only assets with quantity > 0 contribute, so
 *      dividends from assets no longer owned never inflate the numerator while their
 *      cost basis is absent from the denominator.
 *   2. Repurchases are reflected — the denominator uses the CURRENT averageCost, so
 *      selling and rebuying at a different price updates YOC (historical costPerShare
 *      snapshots are intentionally not used here).
 *   3. Buy-after-dividend is undistorted — because the per-asset rate is per-share
 *      (annualizedDPS / averageCost), buying more shares after a dividend does not
 *      change the asset's own yield; it only changes that asset's weight in the
 *      portfolio aggregate, which is correct for a current-holdings view.
 *
 * The same function powers the Performance page ("Metriche da Proventi Finanziari",
 * window = selected period) and the Dividendi tab ("YOC Portafoglio", window = TTM),
 * so both surfaces report one consistent number for the same portfolio.
 *
 * MULTI-CURRENCY: per-share EUR is derived as (grossAmountEur ?? grossAmount) / quantity
 * (net analogously), so non-EUR dividends use their EUR conversion when available.
 */

export interface DividendInput {
  assetId: string;
  paymentDate: Date | { toDate: () => Date };
  quantity: number;
  grossAmount: number;
  netAmount: number;
  grossAmountEur?: number;
  netAmountEur?: number;
}

export interface AssetInput {
  id: string;
  ticker: string;
  name: string;
  quantity: number;
  averageCost?: number;
  currentPrice: number;
}

export interface YieldOnCostAssetMetrics {
  assetId: string;
  assetTicker: string;
  assetName: string;
  quantity: number;       // current quantity
  averageCost: number;    // current average cost per share (EUR)
  currentPrice: number;   // current market price per share (EUR)
  // Annualized dividend-per-share over the window (EUR), gross and net
  annualizedDpsGross: number;
  annualizedDpsNet: number;
  // Dividends actually received in the window for THIS held asset (EUR) — for display
  realizedGross: number;
  realizedNet: number;
  // Annualized income on current holdings (annualizedDps × current quantity)
  annualIncomeGross: number;
  annualIncomeNet: number;
  costBasis: number;      // quantity × averageCost
  marketValue: number;    // quantity × currentPrice
  yocGrossPct: number;    // annualizedDpsGross / averageCost × 100
  yocNetPct: number;
  currentYieldGrossPct: number; // annualizedDpsGross / currentPrice × 100
  currentYieldNetPct: number;
}

export interface DividendYieldMetrics {
  assets: YieldOnCostAssetMetrics[];
  portfolioYocGross: number | null;
  portfolioYocNet: number | null;
  portfolioCurrentYieldGross: number | null;
  portfolioCurrentYieldNet: number | null;
  totalCostBasis: number;
  totalMarketValue: number;
  totalAnnualIncomeGross: number;
  totalAnnualIncomeNet: number;
  totalRealizedGross: number; // sum of realizedGross across held assets (display)
  totalRealizedNet: number;
  assetCount: number;
}

function toDate(value: Date | { toDate: () => Date }): Date {
  return value instanceof Date ? value : value.toDate();
}

const EMPTY: DividendYieldMetrics = {
  assets: [],
  portfolioYocGross: null,
  portfolioYocNet: null,
  portfolioCurrentYieldGross: null,
  portfolioCurrentYieldNet: null,
  totalCostBasis: 0,
  totalMarketValue: 0,
  totalAnnualIncomeGross: 0,
  totalAnnualIncomeNet: 0,
  totalRealizedGross: 0,
  totalRealizedNet: 0,
  assetCount: 0,
};

/**
 * Compute YOC and Current Yield for a dividend window.
 *
 * @param dividends - All user dividends (filtered internally by window + held asset)
 * @param assets - All user assets (cost basis / market value source)
 * @param startDate - Window start (inclusive), compared against payment date
 * @param endDate - Window end (inclusive, must be capped at today by the caller)
 * @param numberOfMonths - Window length in months, used to annualize DPS
 * @returns Per-asset and portfolio YOC / Current Yield. Returns empty/null metrics
 *          when there are no held dividend-paying assets in the window.
 */
export function computeDividendYieldMetrics(
  dividends: DividendInput[],
  assets: AssetInput[],
  startDate: Date,
  endDate: Date,
  numberOfMonths: number
): DividendYieldMetrics {
  if (numberOfMonths <= 0) return EMPTY;

  const assetsMap = new Map(assets.map(a => [a.id, a]));

  // Accumulate per-share DPS (gross/net, EUR) and realized totals per asset, counting
  // only dividends paid within the window for assets still held (quantity > 0).
  const dpsGross = new Map<string, number>();
  const dpsNet = new Map<string, number>();
  const realizedGross = new Map<string, number>();
  const realizedNet = new Map<string, number>();

  for (const div of dividends) {
    if (!div.quantity || div.quantity <= 0) continue; // guard: avoid divide-by-zero
    const paymentDate = toDate(div.paymentDate);
    if (paymentDate < startDate || paymentDate > endDate) continue;

    const asset = assetsMap.get(div.assetId);
    if (!asset || asset.quantity <= 0) continue; // exclude sold / unknown assets

    const grossEur = div.grossAmountEur ?? div.grossAmount;
    const netEur = div.netAmountEur ?? div.netAmount;

    dpsGross.set(div.assetId, (dpsGross.get(div.assetId) ?? 0) + grossEur / div.quantity);
    dpsNet.set(div.assetId, (dpsNet.get(div.assetId) ?? 0) + netEur / div.quantity);
    realizedGross.set(div.assetId, (realizedGross.get(div.assetId) ?? 0) + grossEur);
    realizedNet.set(div.assetId, (realizedNet.get(div.assetId) ?? 0) + netEur);
  }

  const years = numberOfMonths / 12;
  const annualize = (periodValue: number): number =>
    numberOfMonths >= 12 ? periodValue / years : (periodValue / numberOfMonths) * 12;

  const result: YieldOnCostAssetMetrics[] = [];

  dpsGross.forEach((periodDpsGross, assetId) => {
    const asset = assetsMap.get(assetId);
    // Require a known cost basis to express a yield on cost
    if (!asset || !asset.averageCost || asset.averageCost <= 0 || asset.quantity <= 0) return;

    const annualizedDpsGross = annualize(periodDpsGross);
    const annualizedDpsNet = annualize(dpsNet.get(assetId) ?? 0);
    const costBasis = asset.quantity * asset.averageCost;
    const marketValue = asset.quantity * asset.currentPrice;

    result.push({
      assetId,
      assetTicker: asset.ticker,
      assetName: asset.name,
      quantity: asset.quantity,
      averageCost: asset.averageCost,
      currentPrice: asset.currentPrice,
      annualizedDpsGross,
      annualizedDpsNet,
      realizedGross: realizedGross.get(assetId) ?? 0,
      realizedNet: realizedNet.get(assetId) ?? 0,
      annualIncomeGross: annualizedDpsGross * asset.quantity,
      annualIncomeNet: annualizedDpsNet * asset.quantity,
      costBasis,
      marketValue,
      yocGrossPct: (annualizedDpsGross / asset.averageCost) * 100,
      yocNetPct: (annualizedDpsNet / asset.averageCost) * 100,
      currentYieldGrossPct: asset.currentPrice > 0 ? (annualizedDpsGross / asset.currentPrice) * 100 : 0,
      currentYieldNetPct: asset.currentPrice > 0 ? (annualizedDpsNet / asset.currentPrice) * 100 : 0,
    });
  });

  if (result.length === 0) return EMPTY;

  // Portfolio aggregates: income weighted by current holdings over current cost / value.
  const totalCostBasis = result.reduce((s, a) => s + a.costBasis, 0);
  const totalMarketValue = result.reduce((s, a) => s + a.marketValue, 0);
  const totalAnnualIncomeGross = result.reduce((s, a) => s + a.annualIncomeGross, 0);
  const totalAnnualIncomeNet = result.reduce((s, a) => s + a.annualIncomeNet, 0);

  return {
    assets: result,
    portfolioYocGross: totalCostBasis > 0 ? (totalAnnualIncomeGross / totalCostBasis) * 100 : null,
    portfolioYocNet: totalCostBasis > 0 ? (totalAnnualIncomeNet / totalCostBasis) * 100 : null,
    portfolioCurrentYieldGross: totalMarketValue > 0 ? (totalAnnualIncomeGross / totalMarketValue) * 100 : null,
    portfolioCurrentYieldNet: totalMarketValue > 0 ? (totalAnnualIncomeNet / totalMarketValue) * 100 : null,
    totalCostBasis,
    totalMarketValue,
    totalAnnualIncomeGross,
    totalAnnualIncomeNet,
    totalRealizedGross: result.reduce((s, a) => s + a.realizedGross, 0),
    totalRealizedNet: result.reduce((s, a) => s + a.realizedNet, 0),
    assetCount: result.length,
  };
}
