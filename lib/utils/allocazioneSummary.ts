/**
 * Allocazione's numbers: what each tile of the redesigned page reads from the banded
 * `AllocationResult`, the three plans and the exposure payload.
 *
 * The domain rules stay where they are — the band, the roles, the invariant of the plans and the
 * leverage engine live in `allocationUtils.ts` / `leverageAwareAllocationUtils.ts` — and this
 * layer only DERIVES what the page shows: the class gaps a tile ranks, the current-vs-target
 * composition pair, one `PlanView` per mode, the slices of the next 1000 € the verdict names, the
 * ranked exposure rows and the pension look-through. Nothing here is fetched and nothing is
 * formatted: the words are `allocazioneNarrative.ts`'s.
 */

import type { AllocationData, Asset } from '@/types/assets';
import type { ExposureHolding, ExposureIssuer, ExposureSector, PortfolioExposureData } from '@/types/exposure';
import {
  ASSET_CLASS_CHART_INDEX,
  ASSET_CLASS_LABELS,
  assetClassSequenceIndex,
  buildContributionPlan,
  buildRebalancePlan,
  buildWithdrawalPlan,
  resolveAllocationRole,
  type AllocatableHolding,
  type AllocationAction,
  type PlanNode,
  type RebalanceMove,
} from '@/lib/utils/allocationUtils';
import {
  planInstrumentContribution,
  planInstrumentRebalance,
  planInstrumentWithdrawal,
  type InstrumentTrade,
  type LeveragePlanInputs,
} from '@/lib/utils/leverageAwareAllocationUtils';
import { assetClassLegs } from '@/lib/utils/assetDisplayClass';

/** Rows below this amount are noise, not a plan (shared with `PlanRow`). */
export const MIN_VISIBLE_AMOUNT = 0.5;

// ─── Per classe ───────────────────────────────────────────────────────────────

export interface ClassGap {
  assetClass: string;
  label: string;
  currentPercentage: number;
  targetPercentage: number;
  /** Signed drift in points: positive = over target. */
  differencePp: number;
  /** Signed drift in euro: positive = over target. */
  differenceValue: number;
  currentValue: number;
  action: AllocationAction;
}

/** One row per class, in the app-wide class order, so a class sits where Storico puts it. */
export function summarizeClassGaps(
  byAssetClass: Record<string, AllocationData>,
  labels: Record<string, string> = ASSET_CLASS_LABELS,
): ClassGap[] {
  return Object.entries(byAssetClass)
    .map(([assetClass, data]) => ({
      assetClass,
      label: labels[assetClass] ?? assetClass,
      currentPercentage: data.currentPercentage,
      targetPercentage: data.targetPercentage,
      differencePp: data.difference,
      differenceValue: data.differenceValue,
      currentValue: data.currentValue,
      action: data.action,
    }))
    .sort((a, b) => assetClassSequenceIndex(a.assetClass) - assetClassSequenceIndex(b.assetClass));
}

/** The class farthest from its target in EURO — what the Per classe reading names. */
export function largestGapByValue(gaps: ClassGap[]): ClassGap | null {
  if (gaps.length === 0) return null;
  return gaps.reduce((best, gap) => (Math.abs(gap.differenceValue) > Math.abs(best.differenceValue) ? gap : best));
}

/** The classes the band classifies as off target, farthest in POINTS first — the verdict's list. */
export function offTargetGaps(gaps: ClassGap[]): ClassGap[] {
  return gaps.filter((gap) => gap.action !== 'OK').sort((a, b) => Math.abs(b.differencePp) - Math.abs(a.differencePp));
}

/**
 * The classes the account HOLDS but the targets do not name: they never enter `byAssetClass`, so
 * the score's Σdrift reads them as a negative «leverage gap» (CLAUDE.md → Known Issues). The page
 * names them instead of calling a house «esposizione sotto il target di leva».
 */
export function untargetedClassLabels(
  holdings: AllocatableHolding[],
  byAssetClass: Record<string, AllocationData>,
  labels: Record<string, string> = ASSET_CLASS_LABELS,
): string[] {
  const seen = new Set<string>();
  for (const holding of holdings) {
    if (holding.value > 0 && !(holding.assetClass in byAssetClass)) seen.add(holding.assetClass);
  }
  return Array.from(seen)
    .sort((a, b) => assetClassSequenceIndex(a) - assetClassSequenceIndex(b))
    .map((key) => labels[key] ?? key);
}

// ─── Bilanciamento: current vs target ─────────────────────────────────────────

export interface CompositionSegment {
  key: string;
  label: string;
  /** Segment WIDTH, 0-100; the segments of one bar sum to 100. */
  pct: number;
  /** The figure the legend prints when it differs from the width (the leveraged %). */
  displayPct?: number;
  /** The class's chart slot (`ASSET_CLASS_CHART_INDEX`), the same hue on Storico. */
  chartIndex: number;
}

export interface CompositionPair {
  current: CompositionSegment[];
  target: CompositionSegment[];
}

/**
 * The two stacked bars of the Bilanciamento tile: the current mix on the NOTIONAL total (the
 * shares fill the bar even under leverage, where the leveraged % is the label) and the target
 * mix on the comparison's EFFECTIVE `targetPercentage` (normalised, since a leveraged target
 * sums above 100) — never the raw Settings, where a fixed-amount cash target keeps a stale
 * percentage beside it.
 */
export function buildCompositionPair(
  byAssetClass: Record<string, AllocationData>,
  notionalValue: number,
  hasLeveragedExposure: boolean,
  labels: Record<string, string> = ASSET_CLASS_LABELS,
): CompositionPair {
  const segment = (key: string, pct: number, displayPct?: number): CompositionSegment => ({
    key,
    label: labels[key] ?? key,
    pct,
    ...(displayPct !== undefined ? { displayPct } : {}),
    chartIndex: ASSET_CLASS_CHART_INDEX[key] ?? 0,
  });

  const current =
    notionalValue > 0
      ? Object.entries(byAssetClass)
          .map(([key, data]) =>
            segment(key, (data.currentValue / notionalValue) * 100, hasLeveragedExposure ? data.currentPercentage : undefined),
          )
          .filter((seg) => seg.pct > 0)
          .sort((a, b) => b.pct - a.pct)
      : [];

  const targetEntries = Object.entries(byAssetClass).filter(([, data]) => data.targetPercentage > 0);
  const targetSum = targetEntries.reduce((sum, [, target]) => sum + target.targetPercentage, 0);
  const target =
    targetSum > 0
      ? targetEntries
          .map(([key, t]) =>
            segment(key, (t.targetPercentage * 100) / targetSum, hasLeveragedExposure ? t.targetPercentage : undefined),
          )
          .sort((a, b) => b.pct - a.pct)
      : [];

  return { current, target };
}

export interface CompositionLegendEntry {
  key: string;
  label: string;
  chartIndex: number;
  /** The printed figure on each side; null where the class is missing from that bar. */
  current: number | null;
  target: number | null;
}

/**
 * ONE legend for the two bars, in the current bar's order (largest first) with the target-only
 * classes appended: a class held with no target, or targeted but not held, still gets its row,
 * with a gap on the side it is missing from — the legend never hides a mismatch.
 */
export function buildCompositionLegend(pair: CompositionPair): CompositionLegendEntry[] {
  const printed = (segment: CompositionSegment): number => segment.displayPct ?? segment.pct;
  const targetByKey = new Map(pair.target.map((segment) => [segment.key, segment]));
  const entries: CompositionLegendEntry[] = pair.current.map((segment) => {
    const target = targetByKey.get(segment.key);
    return { key: segment.key, label: segment.label, chartIndex: segment.chartIndex, current: printed(segment), target: target ? printed(target) : null };
  });
  const held = new Set(pair.current.map((segment) => segment.key));
  for (const segment of pair.target) {
    if (held.has(segment.key)) continue;
    entries.push({ key: segment.key, label: segment.label, chartIndex: segment.chartIndex, current: null, target: printed(segment) });
  }
  return entries;
}

// ─── Piano ────────────────────────────────────────────────────────────────────

export type PlanMode = 'rebalance' | 'contribute' | 'withdraw';

export interface PlanInputs {
  /** Banded by-class result. */
  byAssetClass: Record<string, AllocationData>;
  /** MUST already have orphaned sub-targets stripped (`stripOrphanedSubTargets`). */
  bySubCategory: Record<string, AllocationData>;
  bySpecificAsset: Record<string, AllocationData>;
  holdings: AllocatableHolding[];
  /** Euro a plan may actually sell per class (`sumTradableByClass`). */
  tradableByClass: Record<string, number>;
  /** Present only when the portfolio has leveraged exposure: the instrument engine takes over. */
  leverage?: LeveragePlanInputs;
  labels?: Record<string, string>;
}

export type PlanView =
  | {
      mode: 'rebalance';
      moves: RebalanceMove[];
      /** The instrument trades under leverage; null on the class-level plan. */
      trades: InstrumentTrade[] | null;
      resultingLeverageRatio: number | null;
    }
  | {
      mode: 'contribute';
      amount: number;
      nodes: PlanNode[];
      trades: InstrumentTrade[] | null;
      /** Labels of the classes over target that receive nothing. */
      overTarget: string[];
    }
  | {
      mode: 'withdraw';
      amount: number;
      nodes: PlanNode[];
      trades: InstrumentTrade[] | null;
      /** Everything a withdrawal may sell (the tradable slice, never the frozen one). */
      tradableTotal: number;
      exceedsPortfolio: boolean;
      /** Labels of the classes over target — the ones a withdrawal drains first. */
      overTarget: string[];
    };

const visible = (nodes: PlanNode[]): PlanNode[] => nodes.filter((node) => node.amount >= MIN_VISIBLE_AMOUNT);

function overTargetLabels(byAssetClass: Record<string, AllocationData>, labels: Record<string, string>): string[] {
  return Object.entries(byAssetClass)
    .filter(([, data]) => data.action === 'VENDI')
    .map(([key]) => labels[key] ?? key);
}

/** The plan the Piano tile shows for a mode and an amount, from the same inputs the page holds. */
export function buildPlanView(mode: PlanMode, amount: number, inputs: PlanInputs): PlanView {
  const labels = inputs.labels ?? ASSET_CLASS_LABELS;
  const { leverage } = inputs;
  const safeAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;

  if (mode === 'rebalance') {
    if (leverage) {
      const plan = planInstrumentRebalance(
        leverage.tradableAssets,
        leverage.currentNotionalByAssetClass,
        leverage.currentNotionalTotal,
        leverage.currentMarketTotal,
        leverage.targetPercentageByAssetClass,
        leverage.targetLeverageRatio,
      );
      return { mode, moves: [], trades: plan.trades, resultingLeverageRatio: plan.resultingLeverageRatio };
    }
    return {
      mode,
      moves: buildRebalancePlan(inputs.byAssetClass, inputs.tradableByClass, labels),
      trades: null,
      resultingLeverageRatio: null,
    };
  }

  if (mode === 'contribute') {
    if (leverage) {
      const trades =
        safeAmount > 0
          ? planInstrumentContribution(
              leverage.tradableAssets,
              leverage.currentNotionalByAssetClass,
              leverage.currentNotionalTotal,
              leverage.currentMarketTotal,
              leverage.targetPercentageByAssetClass,
              safeAmount,
              leverage.targetLeverageRatio,
            ).trades
          : [];
      return { mode, amount: safeAmount, nodes: [], trades, overTarget: [] };
    }
    const nodes =
      safeAmount > 0
        ? visible(buildContributionPlan(inputs.byAssetClass, inputs.bySubCategory, inputs.bySpecificAsset, inputs.holdings, safeAmount, labels))
        : [];
    const funded = new Set(nodes.map((node) => node.key));
    const overTarget = Object.entries(inputs.byAssetClass)
      .filter(([key, data]) => data.action === 'VENDI' && !funded.has(key))
      .map(([key]) => labels[key] ?? key);
    return { mode, amount: safeAmount, nodes, trades: null, overTarget };
  }

  const tradableTotal = Object.values(inputs.tradableByClass).reduce((sum, value) => sum + value, 0);
  const exceedsPortfolio = safeAmount > 0 && safeAmount >= tradableTotal;
  if (leverage) {
    const trades =
      safeAmount > 0
        ? planInstrumentWithdrawal(
            leverage.tradableAssets,
            leverage.currentNotionalByAssetClass,
            leverage.currentNotionalTotal,
            leverage.currentMarketTotal,
            leverage.targetPercentageByAssetClass,
            safeAmount,
            leverage.targetLeverageRatio,
          ).trades
        : [];
    return { mode, amount: safeAmount, nodes: [], trades, tradableTotal, exceedsPortfolio, overTarget: [] };
  }
  const nodes =
    safeAmount > 0 ? visible(buildWithdrawalPlan(inputs.byAssetClass, inputs.bySubCategory, inputs.holdings, safeAmount, labels)) : [];
  return {
    mode,
    amount: safeAmount,
    nodes,
    trades: null,
    tradableTotal,
    exceedsPortfolio,
    overTarget: overTargetLabels(inputs.byAssetClass, labels),
  };
}

export interface MoneySlice {
  key: string;
  label: string;
  amount: number;
  /** A class of the pro-rata plan, or a real instrument of the leverage engine. */
  kind: 'class' | 'instrument';
}

export interface NextMoney {
  amount: number;
  /** Where the money goes, largest slice first; empty when nothing would be bought. */
  slices: MoneySlice[];
}

/** The verdict's «con 1000 € in più compreresti…»: the Versa answer at the plan's amount. */
export function summarizeNextMoney(inputs: PlanInputs, amount: number): NextMoney {
  const view = buildPlanView('contribute', amount, inputs);
  if (view.mode !== 'contribute') return { amount: 0, slices: [] };
  if (view.trades) {
    return {
      amount: view.amount,
      slices: view.trades
        .filter((trade) => trade.amount >= MIN_VISIBLE_AMOUNT)
        .map((trade) => ({ key: trade.assetId, label: trade.displayTicker || trade.ticker, amount: trade.amount, kind: 'instrument' as const }))
        .sort((a, b) => b.amount - a.amount),
    };
  }
  return {
    amount: view.amount,
    slices: view.nodes
      .map((node) => ({ key: node.key, label: node.label, amount: node.amount, kind: 'class' as const }))
      .sort((a, b) => b.amount - a.amount),
  };
}

// ─── Non negoziabili · Esclusi ────────────────────────────────────────────────

export interface HoldingsGroup {
  count: number;
  total: number;
  /** Largest first. */
  holdings: AllocatableHolding[];
  /** The same holdings with each one's share of the GROUP's total, 0-100 (null when the total is 0). */
  rows: Array<{ holding: AllocatableHolding; sharePct: number | null }>;
}

/**
 * `count` is the number of ASSETS, not of rows: a composite asset (a 70/30 pension fund) is one
 * holding per component in `buildHoldings` (`id` = `{assetId}:{index}`), and «2 asset» for one
 * fund would be a lie the reader cannot decode.
 */
export function summarizeHoldings(holdings: AllocatableHolding[]): HoldingsGroup {
  const sorted = [...holdings].sort((a, b) => b.value - a.value);
  const assetIds = new Set(sorted.map((holding) => holding.id.replace(/:\d+$/, '')));
  const total = sorted.reduce((sum, holding) => sum + holding.value, 0);
  const rows = sorted.map((holding) => ({ holding, sharePct: total > 0 ? (holding.value / total) * 100 : null }));
  return { count: assetIds.size, total, holdings: sorted, rows };
}

// ─── Esposizione ──────────────────────────────────────────────────────────────

export type ExposureViewKey = 'holdings' | 'sectors' | 'issuers';

export interface ExposureRowSource {
  ticker: string;
  name: string;
  amount: number;
  /** The holding's / sector's weight inside the source (0-1) and the source's value, when known — «5% di 120.000 € = 6000 €». */
  weight?: number;
  baseValue?: number;
}

export interface ExposureRow {
  key: string;
  label: string;
  caption?: string;
  amount: number;
  /** Share of the WHOLE portfolio, one decimal. */
  percentage: number;
  sources: ExposureRowSource[];
}

export interface ExposureView {
  rows: ExposureRow[];
  /** What the rows do not cover, so the shares add up to the portfolio; null when they do. */
  remainder: { label: string; amount: number; percentage: number } | null;
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

function holdingRow(holding: ExposureHolding): ExposureRow {
  return {
    key: holding.symbol,
    label: holding.name,
    caption: holding.symbol,
    amount: holding.exposureEur,
    percentage: round1(holding.exposurePct * 100),
    sources: holding.sources.map((source) => ({
      ticker: source.ticker,
      name: source.assetName,
      amount: source.contributionEur,
      weight: source.holdingPct,
      baseValue: source.assetValueEur,
    })),
  };
}

function sectorRow(sector: ExposureSector): ExposureRow {
  return {
    key: sector.key,
    label: sector.label,
    amount: sector.exposureEur,
    percentage: round1(sector.exposurePct * 100),
    sources: sector.sources.map((source) => ({
      ticker: source.ticker,
      name: source.assetName,
      amount: source.contributionEur,
      weight: source.sectorWeight,
      baseValue: source.assetValueEur,
    })),
  };
}

function issuerRow(issuer: ExposureIssuer): ExposureRow {
  return {
    key: issuer.family,
    label: issuer.family,
    amount: issuer.exposureEur,
    percentage: round1(issuer.exposurePct * 100),
    sources: issuer.assets.map((asset) => ({ ticker: asset.ticker, name: asset.name, amount: asset.valueEur })),
  };
}

/** One label for every view: what the rows leave out is the rest of the portfolio, analysed or not. */
const REMAINDER_LABEL = 'Resto del portafoglio';

/** The rows of one exposure view, the largest `limit` of them, closed by the residual of the portfolio. */
export function summarizeExposure(exposure: PortfolioExposureData, view: ExposureViewKey, limit: number): ExposureView {
  const all =
    view === 'holdings'
      ? exposure.topHoldings.map(holdingRow)
      : view === 'sectors'
        ? exposure.sectors.map(sectorRow)
        : exposure.issuers.map(issuerRow);
  const rows = [...all].sort((a, b) => b.amount - a.amount).slice(0, Math.max(0, limit));
  const shown = rows.reduce((sum, row) => sum + row.amount, 0);
  const shownPct = rows.reduce((sum, row) => sum + row.percentage, 0);
  const restAmount = exposure.totalPortfolioValue - shown;
  const restPct = round1(100 - shownPct);
  const remainder = restAmount > 0.5 && restPct > 0 ? { label: REMAINDER_LABEL, amount: restAmount, percentage: restPct } : null;
  return { rows, remainder };
}

export interface ExposureHighlights {
  topHolding: { name: string; pct: number; sourceCount: number } | null;
  topSector: { label: string; pct: number } | null;
  /** The biggest issuer and its share of the ETFs (its exposure over every issuer's). */
  topIssuer: { family: string; etfShare: number } | null;
}

/** What the Esposizione reading names: the heaviest holding, the first sector, the biggest issuer. */
export function summarizeExposureHighlights(exposure: PortfolioExposureData): ExposureHighlights {
  const holding = [...exposure.topHoldings].sort((a, b) => b.exposureEur - a.exposureEur)[0] ?? null;
  const sector = [...exposure.sectors].sort((a, b) => b.exposureEur - a.exposureEur)[0] ?? null;
  const issuers = [...exposure.issuers].sort((a, b) => b.exposureEur - a.exposureEur);
  const issuerTotal = issuers.reduce((sum, issuer) => sum + issuer.exposurePct, 0);
  const issuer = issuers[0] ?? null;
  return {
    topHolding: holding ? { name: holding.name, pct: round1(holding.exposurePct * 100), sourceCount: holding.sources.length } : null,
    topSector: sector ? { label: sector.label, pct: round1(sector.exposurePct * 100) } : null,
    topIssuer: issuer && issuerTotal > 0 ? { family: issuer.family, etfShare: Math.round((issuer.exposurePct / issuerTotal) * 100) } : null,
  };
}

// ─── Previdenza ───────────────────────────────────────────────────────────────

export interface ClassSlice {
  assetClass: string;
  label: string;
  value: number;
  percentage: number;
}

export interface PensionLookThrough {
  fundCount: number;
  fundValue: number;
  /** The funds' own mix, through their `composition`, largest first. */
  fundSlices: ClassSlice[];
  /** Every asset of the account by class — tradable, frozen AND excluded — largest first. */
  combinedSlices: ClassSlice[];
  combinedTotal: number;
  /** Whether the combined mix holds wealth the allocation excludes (the reading says «esclusi compresi»). */
  hasExcluded: boolean;
  /** Whether every fund is `frozen` — i.e. already inside the allocated total. */
  allFrozen: boolean;
}

function toClassSlices(assets: Asset[], valueOf: (asset: Asset) => number, labels: Record<string, string>): ClassSlice[] {
  const byClass = new Map<string, number>();
  for (const asset of assets) {
    const value = valueOf(asset);
    if (value <= 0) continue;
    for (const leg of assetClassLegs(asset, value)) {
      if (leg.weight <= 0) continue;
      byClass.set(leg.assetClass, (byClass.get(leg.assetClass) ?? 0) + leg.weight);
    }
  }
  const total = Array.from(byClass.values()).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return [];
  return Array.from(byClass.entries())
    .map(([assetClass, value]) => ({ assetClass, label: labels[assetClass] ?? assetClass, value, percentage: (value / total) * 100 }))
    .sort((a, b) => b.value - a.value);
}

/**
 * The Previdenza tile: the pension funds' own mix beside the whole account's — including the
 * excluded wealth, which is the ONE place on the page that shows it as part of the picture. Null
 * without a fund. The value function is injected so the module stays SDK-free.
 */
export function buildPensionLookThrough(
  assets: Asset[],
  valueOf: (asset: Asset) => number,
  labels: Record<string, string> = ASSET_CLASS_LABELS,
): PensionLookThrough | null {
  const funds = assets.filter((asset) => asset.type === 'pensionFund');
  if (funds.length === 0) return null;
  const combinedSlices = toClassSlices(assets, valueOf, labels);
  return {
    fundCount: funds.length,
    fundValue: funds.reduce((sum, fund) => sum + Math.max(0, valueOf(fund)), 0),
    fundSlices: toClassSlices(funds, valueOf, labels),
    combinedSlices,
    combinedTotal: combinedSlices.reduce((sum, slice) => sum + slice.value, 0),
    hasExcluded: assets.some((asset) => resolveAllocationRole(asset) === 'excluded' && valueOf(asset) > 0),
    allFrozen: funds.every((fund) => resolveAllocationRole(fund) === 'frozen'),
  };
}
