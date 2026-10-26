/**
 * accumulationPlanMatching — proposes ledger matches for a plan's installment lines and disposals,
 * and derives the confirmation state the tile renders (doc/pac-ate.md §9, D10).
 *
 * Pure: no Firebase import, `today` arrives as a parameter (mirrors `accumulationPlanUtils.ts`'s
 * discipline). A candidate is a trade the ledger already carries; confirming a match writes its
 * `transactionIds` onto the plan's own line/disposal (`accumulationPlanService.ts`), which is what
 * excludes it from future matching (rule 3) — this module never persists anything itself.
 */
import type { AccumulationPlan } from '@/types/accumulationPlan';
import type { AssetTransaction } from '@/types/assetTransactions';
import { monthIndexOf, toMonthKey } from './accumulationPlanUtils';

export type MatchConfidence = 'high' | 'medium';

export interface LineMatch {
  kind: 'installment' | 'disposal';
  index?: number; // installment index
  positionId?: string;
  assetId: string;
  transactionIds: string[];
  quantity: number; // Σ quantity
  amountEur: number; // Σ quantity × priceEur
  confidence: MatchConfidence;
}

export type LineUiState = 'todo' | 'toConfirm' | 'executed' | 'late' | 'skipped' | 'lostLink';

/** `${index}:${positionId}` for an installment line, `disposal:${assetId}` for a disposal. */
export function installmentLineKey(index: number, positionId: string): string {
  return `${index}:${positionId}`;
}

export function disposalLineKey(assetId: string): string {
  return `disposal:${assetId}`;
}

/** Ids already recorded on ANY line or disposal of the plan — no longer a candidate (rule 3). */
function collectLinkedIds(plan: AccumulationPlan): Set<string> {
  const linked = new Set<string>();
  for (const installment of plan.installments) {
    for (const line of installment.lines) {
      for (const id of line.transactionIds ?? []) linked.add(id);
    }
  }
  for (const disposal of plan.disposals) {
    for (const id of disposal.transactionIds ?? []) linked.add(id);
  }
  return linked;
}

function sumMatch(
  kind: LineMatch['kind'],
  assetId: string,
  candidates: AssetTransaction[],
  confidence: MatchConfidence,
  index?: number,
  positionId?: string
): LineMatch {
  return {
    kind,
    index,
    positionId,
    assetId,
    transactionIds: candidates.map((t) => t.id),
    quantity: candidates.reduce((sum, t) => sum + t.quantity, 0),
    amountEur: candidates.reduce((sum, t) => sum + t.quantity * t.priceEur, 0),
    confidence,
  };
}

export function matchPlanExecutions(
  plan: AccumulationPlan,
  transactions: AssetTransaction[],
  today: Date,
  // While the ledger query is still in flight, `transactions` reads as `[]` like "genuinely no
  // trades" — without this flag every already-`executed` line/disposal misreads as `lostLink` for
  // one frame (PR #4 review, rilievo 5). Defaults to false: every existing caller (the tests, and
  // a caller that already has its data) is unaffected.
  transactionsLoading = false
): { matches: LineMatch[]; lineStates: Record<string, LineUiState> } {
  const existingIds = new Set(transactions.map((t) => t.id));
  const sourceCashIds = new Set(plan.liquidity.sourceCashAssetIds);
  const linkedElsewhere = collectLinkedIds(plan);
  const currentIndex = monthIndexOf(plan, toMonthKey(today));

  const matches: LineMatch[] = [];
  const lineStates: Record<string, LineUiState> = {};

  for (const installment of plan.installments) {
    for (const line of installment.lines) {
      const key = installmentLineKey(installment.index, line.positionId);

      if (line.status === 'skipped') {
        lineStates[key] = 'skipped';
        continue;
      }
      if (line.status === 'executed') {
        const ids = line.transactionIds ?? [];
        lineStates[key] = transactionsLoading || ids.every((id) => existingIds.has(id)) ? 'executed' : 'lostLink';
        continue;
      }

      // planned — rule 1: same asset, same month, a real buy, not already linked elsewhere.
      const candidates = transactions.filter((t) => {
        if (t.type !== 'buy' || t.isBaseline) return false;
        if (t.assetId !== line.assetId) return false;
        if (toMonthKey(t.date) !== installment.month) return false;
        if (linkedElsewhere.has(t.id)) return false;
        if (t.linkedCashAssetId && !sourceCashIds.has(t.linkedCashAssetId)) return false;
        return true;
      });

      if (candidates.length > 0) {
        const allHighConfidence = candidates.every(
          (t) => !!t.linkedCashAssetId && sourceCashIds.has(t.linkedCashAssetId)
        );
        const match = sumMatch(
          'installment',
          line.assetId,
          candidates,
          allHighConfidence ? 'high' : 'medium',
          installment.index,
          line.positionId
        );
        matches.push(match);
        lineStates[key] = 'toConfirm';
      } else {
        lineStates[key] = installment.index < currentIndex ? 'late' : 'todo';
      }
    }
  }

  // D5: a disposal is sold at month 1 of the plan — that is its own "current month" for lateness.
  const DISPOSAL_MONTH_INDEX = 1;

  for (const disposal of plan.disposals) {
    const key = disposalLineKey(disposal.assetId);

    if (disposal.status === 'skipped') {
      lineStates[key] = 'skipped';
      continue;
    }
    if (disposal.status === 'executed') {
      const ids = disposal.transactionIds ?? [];
      lineStates[key] = transactionsLoading || ids.every((id) => existingIds.has(id)) ? 'executed' : 'lostLink';
      continue;
    }

    // planned — rule 2: same asset, a real sell dated on/after activation, not already linked elsewhere.
    const activatedAt = plan.activatedAt;
    const candidates = activatedAt
      ? transactions.filter((t) => {
          if (t.type !== 'sell') return false;
          if (t.assetId !== disposal.assetId) return false;
          if (t.date.getTime() < activatedAt.getTime()) return false;
          if (linkedElsewhere.has(t.id)) return false;
          return true;
        })
      : [];

    if (candidates.length > 0) {
      matches.push(sumMatch('disposal', disposal.assetId, candidates, 'high'));
      lineStates[key] = 'toConfirm';
    } else {
      lineStates[key] = currentIndex > DISPOSAL_MONTH_INDEX ? 'late' : 'todo';
    }
  }

  return { matches, lineStates };
}
