/**
 * What «Applica» writes, computed as pure plans before anything is written (2026-10-20):
 * the targets document from the proposal's classes, the role changes the proposal asks for,
 * the goal document with the goals and quotas it proposes. Each plan is a value the report
 * page shows beside its checkbox — a reader sees exactly what will change before confirming —
 * and the writes themselves happen in the page through the app's own services (`setSettings`,
 * `updateAssetAllocationRole`, `saveGoalData`).
 *
 * Names are the agents' handle on the data: a proposal names an instrument by its EXACT name
 * from the STRUMENTI block. A name that matches nothing is dropped and reported, never guessed.
 */

import type { Asset, AssetAllocationTarget, AllocationRole } from '@/types/assets';
import type { GoalAssetAssignment, GoalBasedInvestingData, InvestmentGoal } from '@/types/goals';
import type { AllocationAdviceProposal } from '@/lib/utils/allocationAdviceProposal';
import { buildHoldings, partitionByAllocationRole, resolveAllocationRoleWithin } from '@/lib/utils/allocationUtils';
import { pickNextGoalColor } from '@/lib/utils/goalMath';

function roundPct(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A quota as a percent of its asset, whichever form it was stored in (units through the asset's quantity). */
function assignmentPercent(assignment: GoalAssetAssignment, assets: readonly Asset[]): number {
  if ('percentage' in assignment) return assignment.percentage;
  const asset = assets.find((candidate) => candidate.id === assignment.assetId);
  return asset && asset.quantity > 0 ? (assignment.units / asset.quantity) * 100 : 0;
}

/** An asset by its name, case- and space-insensitively; null when nothing matches. */
export function findAssetByName(assets: readonly Asset[], name: string): Asset | null {
  const wanted = name.trim().toLowerCase();
  if (wanted === '') return null;
  const byName = assets.find((asset) => asset.name.trim().toLowerCase() === wanted);
  if (byName) return byName;
  // The prompt prints every instrument as «name (TICKER)», and the model copies it that way —
  // and shortens «SWDA.MI» to «SWDA» (the owner's run, 2026-10-20: a goal's quota went
  // unmatched). Accept the printed form, and the ticker alone, with or without its exchange.
  // The prompt prints the `displayTicker` alias when there is one (`getAssetDisplayTicker`): an
  // ETC whose ticker is «ISIN.SG» reaches the model by its alias, so the alias names it too (the
  // owner's run, 2026-10-23: two quotas went unmatched).
  const tickersOf = (asset: Asset) => [asset.ticker, asset.displayTicker].map((t) => (t ?? '').trim().toLowerCase()).filter((t) => t !== '');
  const bare = (ticker: string) => ticker.split('.')[0];
  const named = (asset: Asset, ticker: string) => tickersOf(asset).some((t) => t === ticker || bare(t) === bare(ticker));
  const printed = /^(.*)\s\(([^()]+)\)$/.exec(wanted);
  if (printed) {
    const [, head, tail] = printed;
    const byPrinted = assets.find((asset) => asset.name.trim().toLowerCase() === head.trim() && named(asset, tail.trim()));
    if (byPrinted) return byPrinted;
  }
  const byTicker = assets.filter((asset) => named(asset, wanted));
  return byTicker.length === 1 ? byTicker[0] : null;
}

// ─── Targets ──────────────────────────────────────────────────────────────────

/**
 * The targets document the proposal describes. A class the proposal leaves out drops to 0 (a
 * class absent from the document is a class the page never measures — `AllocationRow` for a
 * held class with no target, doc/guide/allocazione.md § Per-page blind spots), so every class
 * the user holds should be in the proposal; `subCategoryConfig.enabled` follows whether the
 * class has sleeves. A fixed cash amount keeps the page's shape (`useFixedAmount`, a 0
 * percentage beside it).
 */
export function buildTargetsFromProposal(proposal: AllocationAdviceProposal): AssetAllocationTarget {
  const targets: AssetAllocationTarget = {};
  for (const cls of proposal.classes) {
    const hasSleeves = cls.subTargets.length > 0;
    const subTargets: Record<string, number> = {};
    for (const sub of cls.subTargets) subTargets[sub.name] = roundPct(sub.targetPercentage);
    targets[cls.assetClass] = {
      targetPercentage: cls.fixedAmount !== undefined ? 0 : roundPct(cls.targetPercentage),
      ...(cls.fixedAmount !== undefined ? { useFixedAmount: true, fixedAmount: Math.round(cls.fixedAmount) } : {}),
      subCategoryConfig: { enabled: hasSleeves, categories: cls.subTargets.map((sub) => sub.name) },
      ...(hasSleeves ? { subTargets } : {}),
    };
  }
  return targets;
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export interface RoleChange {
  assetId: string;
  assetName: string;
  from: AllocationRole;
  to: AllocationRole;
  reason: string;
}

/** The role changes the proposal asks for that actually change something; a loan is skipped (its role is derived). */
export function planRoleChanges(
  proposal: AllocationAdviceProposal,
  assets: readonly Asset[]
): { changes: RoleChange[]; unmatched: string[] } {
  const changes: RoleChange[] = [];
  const unmatched: string[] = [];
  for (const entry of proposal.assetRoles) {
    const asset = findAssetByName(assets, entry.assetName);
    if (!asset) {
      unmatched.push(entry.assetName);
      continue;
    }
    if (asset.type === 'loan') continue;
    const from = resolveAllocationRoleWithin(asset, assets);
    if (from === entry.role) continue;
    changes.push({ assetId: asset.id, assetName: asset.name, from, to: entry.role, reason: entry.reason });
  }
  return { changes, unmatched };
}

// ─── Goals ────────────────────────────────────────────────────────────────────

export interface GoalPlan {
  /** The whole document to save, `null` when the proposal names no goal. */
  document: GoalBasedInvestingData | null;
  created: string[];
  updated: string[];
  /** Existing goals the user marked «da eliminare» in the answers and the proposal left out. */
  removed: string[];
  /** Instruments a quota named that no asset matches, dropped. */
  unmatched: string[];
  /** Assets whose quotas across goals would pass 100%: the excess is scaled down. */
  rescaled: string[];
}

/**
 * The goal document after the proposal: existing goals kept or updated by id, new ones
 * appended with a colour, the quotas rebuilt for every goal the proposal touched (percent of
 * the instrument, the only form an agent writes). A goal the proposal does not mention is kept
 * with its quotas, unless `removedGoalIds` names it. The fractions of one asset across the
 * goals are capped at 100 by scaling the proposal's quotas, never rescaled in silence: the
 * plan says which assets were.
 */
export function planGoalDocument(
  proposal: AllocationAdviceProposal,
  existing: GoalBasedInvestingData | null,
  assets: readonly Asset[],
  removedGoalIds: readonly string[],
  now: Date
): GoalPlan {
  if (proposal.goals.length === 0 && removedGoalIds.length === 0) {
    return { document: null, created: [], updated: [], removed: [], unmatched: [], rescaled: [] };
  }
  const existingGoals = existing?.goals ?? [];
  const existingAssignments = existing?.assignments ?? [];
  const removed = new Set(removedGoalIds);
  const goals: InvestmentGoal[] = existingGoals.filter((goal) => !removed.has(goal.id));
  const touched = new Set<string>();
  const created: string[] = [];
  const updated: string[] = [];
  const unmatched: string[] = [];

  for (const proposed of proposal.goals) {
    const current = proposed.goalId ? goals.find((goal) => goal.id === proposed.goalId) : undefined;
    const fields: Partial<InvestmentGoal> = {
      name: proposed.name,
      priority: proposed.priority,
      ...(proposed.targetAmount !== undefined ? { targetAmount: proposed.targetAmount } : {}),
      ...(proposed.targetDateIso !== undefined ? { targetDate: proposed.targetDateIso } : {}),
      ...(proposed.monthlyContribution !== undefined ? { monthlyContribution: proposed.monthlyContribution } : {}),
      ...(proposed.recommendedAllocation !== undefined ? { recommendedAllocation: proposed.recommendedAllocation } : {}),
      ...(proposed.rationale ? { notes: proposed.rationale.slice(0, 500) } : {}),
    };
    if (current) {
      Object.assign(current, fields, { updatedAt: now });
      touched.add(current.id);
      updated.push(current.name);
    } else {
      const goal: InvestmentGoal = {
        id: crypto.randomUUID(),
        name: proposed.name,
        priority: proposed.priority,
        color: pickNextGoalColor(goals),
        createdAt: now,
        updatedAt: now,
        ...fields,
      };
      goals.push(goal);
      touched.add(goal.id);
      created.push(goal.name);
    }
  }

  // The quotas: those of the untouched goals stay; a touched goal's are the proposal's.
  const assignments: GoalAssetAssignment[] = existingAssignments.filter(
    (assignment) => !touched.has(assignment.goalId) && !removed.has(assignment.goalId)
  );
  for (const proposed of proposal.goals) {
    const goal = proposed.goalId ? goals.find((g) => g.id === proposed.goalId) : goals.find((g) => g.name === proposed.name && created.includes(g.name));
    if (!goal) continue;
    for (const quota of proposed.assignments) {
      const asset = findAssetByName(assets, quota.assetName);
      if (!asset) {
        if (!unmatched.includes(quota.assetName)) unmatched.push(quota.assetName);
        continue;
      }
      assignments.push({ goalId: goal.id, assetId: asset.id, percentage: roundPct(quota.percentage) });
    }
  }

  // Cap every asset at 100% across goals by scaling the PROPOSED quotas down into what the
  // untouched goals leave free: a quota the user set on a goal the proposal never named is
  // never moved.
  const rescaled: string[] = [];
  const kept = new Map<string, number>();
  const proposed = new Map<string, number>();
  for (const assignment of assignments) {
    const fraction = assignmentPercent(assignment, assets);
    const bucket = touched.has(assignment.goalId) ? proposed : kept;
    bucket.set(assignment.assetId, (bucket.get(assignment.assetId) ?? 0) + fraction);
  }
  for (const [assetId, proposedTotal] of proposed) {
    const keptTotal = kept.get(assetId) ?? 0;
    if (keptTotal + proposedTotal <= 100.0001) continue;
    const factor = Math.max(0, 100 - keptTotal) / proposedTotal;
    for (const assignment of assignments) {
      if (assignment.assetId === assetId && 'percentage' in assignment && touched.has(assignment.goalId)) {
        assignment.percentage = roundPct(assignment.percentage * factor);
      }
    }
    rescaled.push(assets.find((asset) => asset.id === assetId)?.name ?? assetId);
  }

  return {
    document: { goals, assignments },
    created,
    updated,
    removed: existingGoals.filter((goal) => removed.has(goal.id)).map((goal) => goal.name),
    unmatched,
    rescaled,
  };
}

// ─── Today's allocation, for the report's rows and the loss scenario ──────────

/**
 * The share of each class on the Allocazione page's base (tradable + frozen, net of debts) and
 * the base itself — the same partition the assistant's portfolio block uses.
 */
export function currentAllocationOnBase(
  assets: readonly Asset[],
  assetValueOf: (asset: Asset) => number
): { baseTotal: number; pctByClass: Record<string, number> } {
  const { tradable, frozen } = partitionByAllocationRole([...assets]);
  const holdings = buildHoldings([...tradable, ...frozen], assetValueOf, { includeDebts: true });
  const baseTotal = holdings.reduce((sum, holding) => sum + holding.value, 0);
  const pctByClass: Record<string, number> = {};
  for (const holding of holdings) {
    pctByClass[holding.assetClass] = (pctByClass[holding.assetClass] ?? 0) + (baseTotal > 0 ? (holding.value / baseTotal) * 100 : 0);
  }
  return { baseTotal, pctByClass };
}

// ─── The loss scenario of step 2 ──────────────────────────────────────────────

/** What −10%, −25% and −40% of the base are in euro: a tolerance question asked on the reader's own money. */
export function lossScenarios(baseTotal: number): { pct: number; eur: number }[] {
  return [10, 25, 40].map((pct) => ({ pct, eur: Math.round((baseTotal * pct) / 100) }));
}
