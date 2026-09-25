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
import { estimateSaleTax } from '@/lib/utils/saleTax';

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
  /** Neither allocated value nor a target — see `isDormantClass`. */
  dormant: boolean;
}

/** Below this, a euro figure is a rounding artefact rather than an allocation. */
const DORMANT_VALUE_EUR = 0.5;
/** Below this, a target percentage is «none declared» rather than a real instruction. */
const DORMANT_TARGET_PCT = 0.05;

/**
 * A class that holds nothing inside the allocated total AND targets nothing.
 *
 * It exists in `byAssetClass` only because the target document carries a 0% entry for it, and it
 * cannot be off target by construction — so an `OK` chip on it is a verdict on a void. The owner's
 * real estate is the case that made this necessary: the house is `excluded`, so Per classe printed
 * «Immobili · OK · 0,0% · 0% · 0 €» while the Previdenza tile, two tiles below on the same screen,
 * printed «Immobili 60.000 € · 20%». The row stays — a target entry the reader configured must
 * not vanish — but it drops the verdict, leaves the «N classi su M» denominator and is never named
 * among the classes «in linea».
 *
 * This is NOT the orphaned target (`findOrphanedTargets`), which is a POSITIVE target stranded
 * behind excluded value: that one is a setting to fix and gets a warning. A dormant class asks for
 * nothing.
 */
export function isDormantClass(data: Pick<AllocationData, 'currentValue' | 'targetPercentage'>): boolean {
  return Math.abs(data.currentValue) < DORMANT_VALUE_EUR && Math.abs(data.targetPercentage) < DORMANT_TARGET_PCT;
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
      dormant: isDormantClass(data),
    }))
    .sort((a, b) => assetClassSequenceIndex(a.assetClass) - assetClassSequenceIndex(b.assetClass));
}

/**
 * The classes a verdict may speak about: everything the reader has money in or a plan for.
 *
 * The page counts, ranks and names classes through this, never through the raw `summarizeClassGaps`
 * — «4 classi su 8» counted two classes that can never be off target, which made the page report
 * 50% where the honest reading is 4 of 6 funded classes.
 */
export function activeClassGaps(gaps: ClassGap[]): ClassGap[] {
  return gaps.filter((gap) => !gap.dormant);
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
 * the score's Σdrift reads them as a negative «leverage gap» (doc/guide/allocazione.md). The page
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
      /** What the reader asked to RECEIVE. «Prelevare 1000 €» means 1000 € in hand. */
      amount: number;
      /**
       * What the plan actually sells so that `amount` reaches the account — the requested figure
       * grossed up by the withholding. Equals `amount` when the tax is not estimable or is zero.
       */
      grossAmount: number;
      /** Whether `grossAmount` is a grossed-up figure, i.e. worth naming beside the request. */
      grossedUp: boolean;
      nodes: PlanNode[];
      trades: InstrumentTrade[] | null;
      /** Everything a withdrawal may sell (the tradable slice, never the frozen one). */
      tradableTotal: number;
      /** True when the GROSS the request needs is more than the tradable total can give. */
      exceedsPortfolio: boolean;
      /** Labels of the classes over target — the ones a withdrawal drains first. */
      overTarget: string[];
    };

const visible = (nodes: PlanNode[]): PlanNode[] => nodes.filter((node) => node.amount >= MIN_VISIBLE_AMOUNT);

/**
 * Drop a level that repeats the one above it.
 *
 * A plan is class → sub-category → instrument, and a sub-category that receives the whole of its
 * class's move and holds exactly ONE instrument prints the same euro figure twice under two
 * different names: «ETF Obbligazionari a Breve Termine +3000 €» over «iShares … (CSBGE3) +3000 €»,
 * «DBMFE +5000 €» over «iMGP DBi Managed Futures (DBMFE) +5000 €», «Bitcoin −2000 €» over
 * «WisdomTree Physical Bitcoin (WBIT) −2000 €». A third of the leg rows were that on a real
 * account, and they made the Piano tile ~1060px tall beside a ~380px neighbour.
 *
 * The CHILD survives, not the parent: the instrument is the row you can act on, and its
 * sub-category is still named in Per classe. A node with two children keeps its level — «All
 * World» over VWCE and SWDA is a real split, not a repetition.
 *
 * It takes the list whose OWN level may disappear, so the caller decides how deep the rule starts:
 * a rebalance hands it `move.children` (the sub-categories may go), the flow plans hand it each
 * class's children and keep the class, which carries the chip, the drift and the action.
 */
export function collapseRepeatedLevels(nodes: PlanNode[]): PlanNode[] {
  return nodes.map((node) => {
    const children = collapseRepeatedLevels(node.children.filter((child) => child.amount >= MIN_VISIBLE_AMOUNT));
    const [only] = children;
    // «Carries the whole move» is measured at the app's own noise floor: below half a euro the two
    // rows print the same figure, whatever the split's residual.
    if (children.length === 1 && Math.abs(only.amount - node.amount) < MIN_VISIBLE_AMOUNT) return { ...only };
    return { ...node, children };
  });
}

function overTargetLabels(byAssetClass: Record<string, AllocationData>, labels: Record<string, string>): string[] {
  return Object.entries(byAssetClass)
    .filter(([, data]) => data.action === 'VENDI')
    .map(([key]) => labels[key] ?? key);
}

/**
 * The withholding is a small fraction of the gross, so the fixed point settles in two or three
 * passes; the cap is there for the case where the tradable total stalls it.
 */
const GROSS_UP_MAX_PASSES = 6;
/** Below a euro the two gross figures print the same, so the loop has converged. */
const GROSS_UP_TOLERANCE = 1;

/**
 * How much a withdrawal must SELL so that `requestedNet` reaches the account.
 *
 * «Prelevare 1000 €» means 1000 € in hand — that is what the word means to a reader, and until
 * 2026-09-21 the plan sold exactly 1000 € and the sentence admitted that 920 € arrived. Grossing
 * up is not a division by (1 − rate): the withholding depends on WHICH instruments the plan
 * drains and on how much gain each of them carries, and which instruments it drains depends on the
 * amount. So it is a fixed point — `gross = requestedNet + tax(plan(gross))` — solved by
 * iteration, which converges because the tax grows far more slowly than the gross.
 *
 * Three honest exits. When the tax is not estimable (a leg without an EUR cost basis or a rate)
 * the plan sells the requested figure unchanged and nothing promises a net. When the gross the
 * request needs exceeds the tradable total, the plan sells everything it can and the caller says
 * the request cannot be met. When nothing being sold carries a gain, gross equals net.
 */
function solveWithdrawalGross(
  requestedNet: number,
  inputs: PlanInputs,
  labels: Record<string, string>,
  tradableTotal: number,
): { grossAmount: number; requiredGross: number; nodes: PlanNode[] } {
  const planFor = (gross: number): PlanNode[] =>
    visible(buildWithdrawalPlan(inputs.byAssetClass, inputs.bySubCategory, inputs.holdings, Math.min(gross, tradableTotal), labels)).map(
      (node) => ({ ...node, children: collapseRepeatedLevels(node.children) }),
    );

  if (requestedNet <= 0) return { grossAmount: 0, requiredGross: 0, nodes: [] };

  let gross = requestedNet;
  let nodes = planFor(gross);
  let tax = estimatePlanSaleTax(nodes, inputs.holdings)?.tax ?? null;
  // Not estimable: sell what was asked, exactly as before the gross-up existed.
  if (tax === null) return { grossAmount: Math.min(requestedNet, tradableTotal), requiredGross: requestedNet, nodes };

  for (let pass = 0; pass < GROSS_UP_MAX_PASSES; pass += 1) {
    const next = requestedNet + tax;
    if (Math.abs(next - gross) < GROSS_UP_TOLERANCE) break;
    gross = next;
    nodes = planFor(gross);
    const estimate = estimatePlanSaleTax(nodes, inputs.holdings)?.tax ?? null;
    if (estimate === null) break;
    tax = estimate;
  }

  return { grossAmount: Math.min(gross, tradableTotal), requiredGross: gross, nodes };
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
      // With the descent every move names the instruments to trade, like Versa and Preleva do: a
      // class-level «vendi 25.000 € di azioni» is not an order anyone can take to a broker.
      moves: buildRebalancePlan(inputs.byAssetClass, inputs.tradableByClass, labels, {
        bySubCategory: inputs.bySubCategory,
        bySpecificAsset: inputs.bySpecificAsset,
        holdings: inputs.holdings,
      }).map((move) => ({ ...move, children: collapseRepeatedLevels(move.children) })),
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
        ? visible(buildContributionPlan(inputs.byAssetClass, inputs.bySubCategory, inputs.bySpecificAsset, inputs.holdings, safeAmount, labels)).map(
            (node) => ({ ...node, children: collapseRepeatedLevels(node.children) }),
          )
        : [];
    const funded = new Set(nodes.map((node) => node.key));
    const overTarget = Object.entries(inputs.byAssetClass)
      .filter(([key, data]) => data.action === 'VENDI' && !funded.has(key))
      .map(([key]) => labels[key] ?? key);
    return { mode, amount: safeAmount, nodes, trades: null, overTarget };
  }

  const tradableTotal = Object.values(inputs.tradableByClass).reduce((sum, value) => sum + value, 0);
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
    // The leveraged engine plans on instruments the tax estimate does not read, so a withdrawal
    // there is still a GROSS one: `grossedUp` false says so rather than implying a net.
    return {
      mode,
      amount: safeAmount,
      grossAmount: safeAmount,
      grossedUp: false,
      nodes: [],
      trades,
      tradableTotal,
      exceedsPortfolio: safeAmount > 0 && safeAmount >= tradableTotal,
      overTarget: [],
    };
  }

  const solved = solveWithdrawalGross(safeAmount, inputs, labels, tradableTotal);
  return {
    mode,
    amount: safeAmount,
    grossAmount: solved.grossAmount,
    grossedUp: solved.grossAmount - safeAmount >= GROSS_UP_TOLERANCE,
    nodes: solved.nodes,
    trades: null,
    tradableTotal,
    exceedsPortfolio: solved.requiredGross > 0 && solved.requiredGross >= tradableTotal,
    overTarget: overTargetLabels(inputs.byAssetClass, labels),
  };
}

// ─── The tax a proposed sale would pay ────────────────────────────────────────

export interface SaleTaxEstimate {
  /** Gross euro the plan sells. */
  gross: number;
  /** What the broker would withhold, or null when a leg cannot be estimated. */
  tax: number | null;
  /** `gross − tax`; null whenever `tax` is. */
  net: number | null;
  /** What is missing, so the reading can say it instead of printing a figure it cannot stand behind. */
  unknownReason: 'cost-basis' | 'rate' | null;
}

/** Every node with no children: on a sell tree these are the instruments, keyed by holding id. */
function planLeaves(nodes: PlanNode[]): PlanNode[] {
  return nodes.flatMap((node) => (node.children.length > 0 ? planLeaves(node.children) : [node]));
}

/**
 * The capital-gains tax a plan's SELL legs would pay, and the net that reaches the account.
 *
 * In regime amministrato the broker withholds on the day of the sale, so «vendi 25.000 €» is a
 * gross figure and the reader receives less — on a product whose defensible claim is Italian
 * fiscal fidelity, quoting only the gross is the one number it declines to finish. The estimate
 * reuses `estimateSaleTax`, the app's ONE tax rule, on the same basis the sale ledger taxes: the
 * price difference of the slice being sold, fees excluded.
 *
 * Selling a fraction f of a position realizes the fraction f of its unrealized gain, so the
 * taxable gain of a leg is `amount × (value − costBasisEur) / value`, floored at zero — a position
 * at a loss pays nothing, and no loss compensation (minusvalenze pregresse) is modelled.
 *
 * Returns `null` when the plan sells nothing. When ANY taxable leg lacks its inputs the tax is
 * `null` WITH a reason, never a silent zero: a missing cost basis would otherwise read as «no gain,
 * no tax», which is the most flattering possible lie.
 */
export function estimatePlanSaleTax(nodes: PlanNode[], holdings: AllocatableHolding[]): SaleTaxEstimate | null {
  const byId = new Map(holdings.map((holding) => [holding.id, holding]));
  const leaves = planLeaves(nodes).filter((leaf) => leaf.amount >= MIN_VISIBLE_AMOUNT);
  const gross = leaves.reduce((sum, leaf) => sum + leaf.amount, 0);
  if (gross < MIN_VISIBLE_AMOUNT) return null;

  let tax = 0;
  let unknownReason: SaleTaxEstimate['unknownReason'] = null;

  for (const leaf of leaves) {
    const holding = byId.get(leaf.key);
    // A leaf that is not a holding cannot be priced; on a sell tree it should not happen, and
    // reporting it as unknown is the honest branch if it ever does.
    if (!holding) {
      unknownReason ??= 'cost-basis';
      continue;
    }
    if (!holding.taxableOnSale || holding.value <= 0) continue;
    if (holding.costBasisEur === undefined) {
      unknownReason ??= 'cost-basis';
      continue;
    }
    if (holding.taxRate === undefined) {
      unknownReason ??= 'rate';
      continue;
    }
    const gainFraction = (holding.value - holding.costBasisEur) / holding.value;
    const taxableGain = leaf.amount * Math.max(0, gainFraction);
    tax += estimateSaleTax(taxableGain, holding.taxRate) ?? 0;
  }

  if (unknownReason) return { gross, tax: null, net: null, unknownReason };
  return { gross, tax, net: gross - tax, unknownReason: null };
}

/** The sell legs of a plan, per mode: a rebalance sells only where it is over target. */
export function planSaleNodes(view: PlanView): PlanNode[] {
  if (view.mode === 'rebalance') return view.moves.filter((move) => move.action === 'VENDI').flatMap((move) => move.children);
  if (view.mode === 'withdraw') return view.nodes;
  return [];
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
