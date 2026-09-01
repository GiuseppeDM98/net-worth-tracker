/**
 * Normalization of the real portfolio allocation onto the 4 Monte Carlo asset classes.
 *
 * Extracted verbatim from the effect that lived inline in MonteCarloTab.tsx so the FIRE
 * Ventaglio view can derive its market exposure from the SAME rule — two call sites
 * that must stay identical, because the divergent copy is the one the user sees
 * (AGENTS.md → Quick-Fix Reference).
 *
 * Model decisions inherited from the MC tab, unchanged:
 *   - only equity / bonds / realestate / commodity enter the simulation; crypto and cash are
 *     deliberately outside the 4-class model;
 *   - per-class percentages are rounded, classes sorted descending by value, and the rounding
 *     residual goes to the smallest class so the four always sum to exactly 100;
 *   - a portfolio holding none of the 4 classes returns null, meaning "keep whatever
 *     allocation you already had" (the MC tab's effect simply skips the update).
 */

/**
 * Paths a single Monte Carlo scenario is run with by default. A run is three scenarios
 * (bear · base · bull), so a default execution draws three times this many paths.
 *
 * It lives here rather than in `MonteCarloTab` because a second surface states it in words:
 * the public landing tells a visitor what the FIRE section computes, and a copy of the
 * number there would drift from the one the tab actually seeds (AGENTS.md → Quick-Fix
 * Reference: the divergent copy is the one the user sees).
 */
export const DEFAULT_MONTE_CARLO_SIMULATIONS = 10000;

export interface MonteCarloAllocationPercentages {
  equityPercentage: number;
  bondsPercentage: number;
  realEstatePercentage: number;
  commoditiesPercentage: number;
}

/**
 * Derive the 4-class MC allocation from `calculateCurrentAllocation(assets).byAssetClass`.
 *
 * @param byAssetClass - EUR value per asset class (any classes; only the 4 MC ones are read)
 * @returns Percentages summing to exactly 100, or null when the 4 MC classes hold no value
 */
export function deriveMonteCarloAllocation(byAssetClass: {
  [assetClass: string]: number;
}): MonteCarloAllocationPercentages | null {
  const equity = byAssetClass['equity'] || 0;
  const bonds = byAssetClass['bonds'] || 0;
  const realEstate = byAssetClass['realestate'] || 0;
  const commodities = byAssetClass['commodity'] || 0;
  const total = equity + bonds + realEstate + commodities;

  if (total <= 0) return null;

  // Sort descending so the rounding residual goes to the smallest class.
  const classes = [
    { key: 'equityPercentage' as const, value: equity },
    { key: 'bondsPercentage' as const, value: bonds },
    { key: 'realEstatePercentage' as const, value: realEstate },
    { key: 'commoditiesPercentage' as const, value: commodities },
  ].sort((a, b) => b.value - a.value);

  const result: MonteCarloAllocationPercentages = {
    equityPercentage: 0,
    bondsPercentage: 0,
    realEstatePercentage: 0,
    commoditiesPercentage: 0,
  };

  let allocated = 0;
  for (let i = 0; i < classes.length - 1; i++) {
    const pct = Math.round((classes[i].value / total) * 100);
    result[classes[i].key] = pct;
    allocated += pct;
  }
  result[classes[classes.length - 1].key] = 100 - allocated;

  return result;
}
